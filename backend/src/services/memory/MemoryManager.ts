import fs from 'fs/promises';
import { watch } from 'fs';
import path from 'path';
import matter from 'gray-matter';
import Database from 'better-sqlite3';
import { AgentConfig } from '../../types/agent.js';
import { logger } from '../../utils/logger.js';

export class MemoryManager {
  private agentsDir: string;
  private db: Database.Database;

  constructor(agentsDir: string = './agents') {
    this.agentsDir = agentsDir;

    // Auto-create agents dir
    import('fs').then(fsSync => {
      if (!fsSync.existsSync(agentsDir)) {
        fsSync.mkdirSync(agentsDir, { recursive: true });
      }
    });

    const dbPath = path.join(agentsDir, 'oym-database.sqlite');
    this.db = new Database(dbPath);
    this.initSchema();

    // Run memory compaction / pruning every 24 hours
    setInterval(() => {
      this.pruneOldLogs(30);
    }, 24 * 60 * 60 * 1000);

    // Also run once shortly after startup
    setTimeout(() => this.pruneOldLogs(30), 10000);
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS search_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        type TEXT NOT NULL, -- 'fact' or 'daily_log'
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS transcripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cron_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        description TEXT NOT NULL,
        interval_ms INTEGER NOT NULL,
        last_run INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  watchAgents(callback: (agentId: string) => void): void {
    try {
      this.loadAllAgents().then(agents => {
        for (const agent of agents) {
          const agentMdPath = path.join(this.agentsDir, agent.id, 'AGENT.md');
          watch(agentMdPath, (eventType) => {
            if (eventType === 'change') {
              logger.info(`Detected change in AGENT.md for agent: ${agent.id}`);
              callback(agent.id);
            }
          });
        }
      });
      logger.info('Started watching agents directory for changes');
    } catch (error) {
      logger.error('Failed to start watching agents directory:', error);
    }
  }

  async loadAgent(agentId: string): Promise<AgentConfig> {
    const agentPath = path.join(this.agentsDir, agentId, 'AGENT.md');
    try {
      const content = await fs.readFile(agentPath, 'utf-8');
      const { data, content: body } = (matter as any)(content);
      return {
        id: data.id || agentId,
        name: data.name,
        type: data.type || 'api-assistant',
        status: data.status || 'idle',
        energy: data.energy || 100,
        llm: data.llm,
        skills: data.skills || [],
        personality: body,
        tools: data.tools,
        telegram: data.telegram,
        whatsapp: data.whatsapp,
        discord: data.discord,
      };
    } catch (error) {
      throw new Error(`Agent ${agentId} not found`);
    }
  }

  async loadAllAgents(): Promise<AgentConfig[]> {
    try {
      await fs.access(this.agentsDir);
      const dirs = await fs.readdir(this.agentsDir);
      const agents: AgentConfig[] = [];
      for (const dir of dirs) {
        const agentPath = path.join(this.agentsDir, dir);
        const stat = await fs.stat(agentPath);
        if (stat.isDirectory()) {
          try {
            const agent = await this.loadAgent(dir);
            agents.push(agent);
            logger.info(`✅ Loaded agent: ${agent.name} (${agent.id})`);
          } catch (e) {
            // Not an agent folder
          }
        }
      }
      return agents;
    } catch (error: any) {
      return [];
    }
  }

  async updateAgentStatus(agentId: string, status: AgentConfig['status']): Promise<void> {
    const agentPath = path.join(this.agentsDir, agentId, 'AGENT.md');
    try {
      const content = await fs.readFile(agentPath, 'utf-8');
      const parsed = (matter as any)(content);
      parsed.data.status = status;
      parsed.data.updatedAt = new Date().toISOString();
      const updated = (matter as any).stringify(parsed.content, parsed.data);
      await fs.writeFile(agentPath, updated, 'utf-8');
    } catch (error) { }
  }

  async addLongTermMemory(agentId: string, fact: string): Promise<void> {
    const memoryPath = path.join(this.agentsDir, agentId, 'MEMORY.md');
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const entry = `\n- [${timestamp}] ${fact}\n`;
      await fs.appendFile(memoryPath, entry, 'utf-8');

      // Also write to DB for fast searching
      this.db.prepare('INSERT INTO search_memory (agent_id, type, content) VALUES (?, ?, ?)').run(agentId, 'fact', fact);
    } catch (error) { }
  }

  async addDailyLog(agentId: string, entry: string): Promise<void> {
    const memoryDir = path.join(this.agentsDir, agentId, 'memory');
    const today = new Date().toISOString().split('T')[0];
    const dailyLogPath = path.join(memoryDir, `${today}.md`);

    try {
      await fs.mkdir(memoryDir, { recursive: true });
      try {
        await fs.access(dailyLogPath);
      } catch {
        const header = `# Daily Log - ${today}\n\n`;
        await fs.writeFile(dailyLogPath, header, 'utf-8');
      }

      const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
      const logEntry = `\n[${timestamp}] ${entry}\n`;
      await fs.appendFile(dailyLogPath, logEntry, 'utf-8');

      // Also write to DB
      this.db.prepare('INSERT INTO search_memory (agent_id, type, content) VALUES (?, ?, ?)').run(agentId, 'daily_log', `[${today}] ${entry}`);
    } catch (error) { }
  }

  async searchMemory(agentId: string, query: string): Promise<string> {
    // Advanced SQLite search
    try {
      const q = `%${query}%`;
      const rows = this.db.prepare('SELECT type, content, created_at FROM search_memory WHERE agent_id = ? AND content LIKE ? ORDER BY created_at DESC LIMIT 20').all(agentId, q) as any[];

      if (rows.length === 0) {
        return `No results found for query: "${query}"`;
      }

      const facts = rows.filter(r => r.type === 'fact');
      const logs = rows.filter(r => r.type === 'daily_log');

      const results: string[] = [];
      if (facts.length > 0) {
        results.push('## From Long-term Memory:');
        results.push(...facts.map(r => r.content));
      }
      if (logs.length > 0) {
        results.push('\n## From Daily Logs:');
        results.push(...logs.map(r => `[${r.created_at.split(' ')[0]}] ${r.content}`));
      }

      return results.join('\n');
    } catch (error) {
      return `Error searching memory: ${error}`;
    }
  }

  async searchSessions(agentId: string, query: string, sessionKey?: string): Promise<string> {
    try {
      const q = `%${query}%`;
      const rows = this.db.prepare('SELECT role, content, timestamp FROM transcripts WHERE agent_id = ? AND content LIKE ? ORDER BY timestamp DESC LIMIT 10').all(agentId, q) as any[];

      if (rows.length === 0) {
        return `No results found in past sessions for: "${query}"`;
      }

      const results = rows.map(r => `[${r.timestamp}] ${r.role}: ${r.content.substring(0, 200)}...`);
      return `## Found in past conversations:\n\n` + results.join('\n\n');
    } catch (error) {
      return `Error searching sessions: ${error}`;
    }
  }

  async getRecentMemory(agentId: string, days: number = 7): Promise<string> {
    try {
      const memoryDir = path.join(this.agentsDir, agentId, 'memory');
      const files = await fs.readdir(memoryDir);

      const today = new Date();
      const recentFiles: string[] = [];

      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          const fileDate = new Date(dateMatch[1]);
          const daysDiff = Math.floor((today.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysDiff <= days) {
            recentFiles.push(file);
          }
        }
      }

      recentFiles.sort().reverse();

      let content = `# Recent Activity (last ${days} days)\n\n`;

      for (const file of recentFiles.slice(0, 7)) {
        const fileContent = await fs.readFile(path.join(memoryDir, file), 'utf-8');
        content += `\n## ${file}\n${fileContent}\n`;
      }

      return content;
    } catch (error) {
      return '';
    }
  }

  async updateAgentSkills(agentId: string, skills: string[]): Promise<void> {
    const agentPath = path.join(this.agentsDir, agentId, 'AGENT.md');
    try {
      const content = await fs.readFile(agentPath, 'utf-8');
      const parsed = (matter as any)(content);
      const currentSkills = parsed.data.skills || [];
      const newSkills = [...new Set([...currentSkills, ...skills])];
      parsed.data.skills = newSkills;
      const updated = (matter as any).stringify(parsed.content, parsed.data);
      await fs.writeFile(agentPath, updated, 'utf-8');
    } catch (error) { }
  }

  async loadMemory(agentId: string): Promise<string> {
    const memoryPath = path.join(this.agentsDir, agentId, 'MEMORY.md');
    try {
      return await fs.readFile(memoryPath, 'utf-8');
    } catch (error) {
      return '';
    }
  }

  async loadSoul(agentId: string): Promise<string> {
    const soulPath = path.join(this.agentsDir, agentId, 'SOUL.md');
    try {
      return await fs.readFile(soulPath, 'utf-8');
    } catch (error) {
      return '';
    }
  }

  async loadBootstrap(agentId: string): Promise<string> {
    const bootstrapPath = path.join(this.agentsDir, agentId, 'BOOTSTRAP.md');
    try {
      const content = await fs.readFile(bootstrapPath, 'utf-8');
      return content.trim();
    } catch {
      return '';
    }
  }

  async deleteBootstrap(agentId: string): Promise<void> {
    const bootstrapPath = path.join(this.agentsDir, agentId, 'BOOTSTRAP.md');
    try {
      await fs.unlink(bootstrapPath);
      logger.info(`🗑️ BOOTSTRAP.md deleted for agent ${agentId} — ritual complete`);
    } catch { /* already gone */ }
  }

  async loadUserProfile(agentId: string): Promise<string> {
    const userPath = path.join(this.agentsDir, agentId, 'USER.md');
    try {
      return await fs.readFile(userPath, 'utf-8');
    } catch {
      return '';
    }
  }

  async saveUserProfile(agentId: string, content: string): Promise<void> {
    const userPath = path.join(this.agentsDir, agentId, 'USER.md');
    try {
      await fs.writeFile(userPath, content, 'utf-8');
      logger.info(`💾 USER.md updated for agent ${agentId}`);
    } catch (error) {
      logger.error(`Failed to save USER.md for ${agentId}:`, error);
    }
  }

  async loadContext(agentId: string, sessionKey?: string): Promise<string> {
    if (!sessionKey) return '';
    // Build conversation history from the canonical .jsonl transcript
    return this.buildContextFromTranscript(agentId, sessionKey);
  }

  /**
   * Reads the .jsonl transcript for this session and returns it as
   * "User: ...\nAssistant: ..." text ready to be injected into the prompt.
   * Falls back to the summary file if one exists (written during memory flush).
   */
  async buildContextFromTranscript(agentId: string, sessionKey: string, maxMessages = 40): Promise<string> {
    const sessionsDir = path.join(this.agentsDir, agentId, 'sessions');
    const safeKey = sessionKey.replace(/[/:]/g, '-');

    // Load optional summary (written during memory flush)
    let summary = '';
    const summaryPath = path.join(sessionsDir, `${safeKey}-summary.md`);
    try { summary = await fs.readFile(summaryPath, 'utf-8'); } catch { /* no summary yet */ }

    // Collect all .jsonl files for this session key, sorted by date
    let lines: { timestamp: string; role: string; content: string }[] = [];
    try {
      const files = (await fs.readdir(sessionsDir))
        .filter(f => f.startsWith(safeKey) && f.endsWith('.jsonl'))
        .sort();

      for (const file of files) {
        const raw = await fs.readFile(path.join(sessionsDir, file), 'utf-8');
        for (const line of raw.split('\n').filter(Boolean)) {
          try { lines.push(JSON.parse(line)); } catch { /* skip malformed */ }
        }
      }
    } catch { /* no transcript yet */ }

    // Keep only the last N messages to stay within token budget
    const recent = lines.slice(-maxMessages);

    const history = recent
      .map(e => `${e.role === 'user' ? 'User' : 'Assistant'}: ${e.content}`)
      .join('\n\n');

    if (!summary && !history) return '';

    return [
      summary ? `[Previous session summary]\n${summary}` : '',
      history,
    ].filter(Boolean).join('\n\n---\n\n');
  }

  /** @deprecated use buildContextFromTranscript — kept for memory-flush path only */
  async updateContext(agentId: string, content: string, sessionKey?: string): Promise<void> {
    // Only used now to write the summary file during memory flush
    if (!sessionKey) return;
    const sessionsDir = path.join(this.agentsDir, agentId, 'sessions');
    const safeKey = sessionKey.replace(/[/:]/g, '-');
    const summaryPath = path.join(sessionsDir, `${safeKey}-summary.md`);
    try {
      await fs.mkdir(sessionsDir, { recursive: true });
      await fs.writeFile(summaryPath, content, 'utf-8');
    } catch { }
  }

  private getSessionContextPath(agentId: string, sessionKey: string): string {
    // Kept for backward compat — points to old context.md (no longer written)
    const sessionsDir = path.join(this.agentsDir, agentId, 'sessions');
    const safeSessionKey = sessionKey.replace(/[/:]/g, '-');
    return path.join(sessionsDir, `${safeSessionKey}-context.md`);
  }

  async saveMessageToTranscript(agentId: string, role: string, content: string, sessionKey?: string): Promise<void> {
    const sessionsDir = path.join(this.agentsDir, agentId, 'sessions');
    const safeSessionKey = (sessionKey || 'legacy').replace(/[/:]/g, '-');
    const today = new Date().toISOString().split('T')[0];
    const transcriptPath = path.join(sessionsDir, `${safeSessionKey}-${today}.jsonl`);
    try {
      await fs.mkdir(sessionsDir, { recursive: true });
      const entry = { timestamp: new Date().toISOString(), role, content };

      // Append to .jsonl transcript (one JSON object per line)
      await fs.appendFile(transcriptPath, JSON.stringify(entry) + '\n', 'utf-8');

      // Write to SQLite DB for fast searching
      this.db.prepare('INSERT INTO transcripts (session_id, agent_id, role, content) VALUES (?, ?, ?, ?)').run(safeSessionKey, agentId, role, content);
    } catch (error) { }
  }

  async createAgent(config: AgentConfig): Promise<void> {
    const agentDir = path.join(this.agentsDir, config.id);
    await fs.mkdir(agentDir, { recursive: true });
    await fs.mkdir(path.join(agentDir, 'memory'), { recursive: true });
    await fs.mkdir(path.join(agentDir, 'sessions'), { recursive: true });
    const agentMd = (matter as any).stringify(config.personality || '', config);
    await fs.writeFile(path.join(agentDir, 'AGENT.md'), agentMd, 'utf-8');
  }

  public async pruneOldLogs(days: number = 30): Promise<number> {
    try {
      // 1. Delete from SQLite
      const stmt = this.db.prepare(`
          DELETE FROM search_memory 
          WHERE type = 'daily_log' AND created_at < datetime('now', '-' || ? || ' days')
      `);
      const info = stmt.run(days.toString());
      let deletedCount = info.changes;

      // 2. Delete MD files
      try {
        const dirs = await fs.readdir(this.agentsDir);
        for (const dir of dirs) {
          const memoryDir = path.join(this.agentsDir, dir, 'memory');
          try {
            const files = await fs.readdir(memoryDir);
            for (const file of files) {
              if (file.endsWith('.md')) {
                // Determine file age
                const filePath = path.join(memoryDir, file);
                const stat = await fs.stat(filePath);
                if (Date.now() - stat.mtimeMs > days * 24 * 60 * 60 * 1000) {
                  await fs.unlink(filePath);
                  deletedCount++;
                }
              }
            }
          } catch { /* Memory dir might not exist for some agents */ }
        }
      } catch { }

      if (deletedCount > 0) {
        logger.info(`🧹 Compaction: pruned ${deletedCount} daily logs/files older than ${days} days.`);
      }
      return deletedCount;
    } catch (error) {
      logger.error('Failed to prune old logs:', error);
      return 0;
    }
  }

  public async scheduleCronJob(agentId: string, description: string, intervalMinutes: number): Promise<void> {
    const stmt = this.db.prepare(`INSERT INTO cron_jobs (agent_id, description, interval_ms, last_run) VALUES (?, ?, ?, ?)`);
    stmt.run(agentId, description, intervalMinutes * 60 * 1000, 0);
    logger.info(`⏰ Cron job scheduled for agent ${agentId}: ${description} every ${intervalMinutes}min`);
  }

  public async getPendingCronJobs(): Promise<any[]> {
    const nowMs = new Date().getTime();
    const rows = this.db.prepare(`
          SELECT id, agent_id, description, interval_ms, last_run 
          FROM cron_jobs 
          WHERE (? - last_run) >= interval_ms
      `).all(nowMs);
    return rows as any[];
  }

  public async markCronJobRun(jobId: number): Promise<void> {
    const nowMs = new Date().getTime();
    const stmt = this.db.prepare(`UPDATE cron_jobs SET last_run = ? WHERE id = ?`);
    stmt.run(nowMs, jobId);
  }

  public getAllCronJobs(): any[] {
    return this.db.prepare(`SELECT id, agent_id, description, interval_ms, last_run, created_at FROM cron_jobs ORDER BY created_at DESC`).all() as any[];
  }

  public deleteCronJob(jobId: number): void {
    this.db.prepare(`DELETE FROM cron_jobs WHERE id = ?`).run(jobId);
    logger.info(`🗑️ Cron job ${jobId} deleted`);
  }
}
