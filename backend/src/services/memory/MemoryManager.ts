import fs from 'fs/promises';
import { watch } from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { AgentConfig } from '../../types/agent.js';
import { logger } from '../../utils/logger.js';

export class MemoryManager {
  private agentsDir: string;

  constructor(agentsDir: string = './agents') {
    this.agentsDir = agentsDir;
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
      // Check if agents directory exists
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
            logger.error(`❌ Failed to load agent ${dir}:`, e);
          }
        }
      }
      return agents;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.warn(`Agents directory ${this.agentsDir} does not exist`);
        return [];
      }
      logger.error('Failed to read agents directory:', error);
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
    } catch (error) {
      logger.error(`Failed to update status for ${agentId}:`, error);
    }
  }

  async addLongTermMemory(agentId: string, fact: string): Promise<void> {
    const memoryPath = path.join(this.agentsDir, agentId, 'MEMORY.md');
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const entry = `\n- [${timestamp}] ${fact}\n`;
      await fs.appendFile(memoryPath, entry, 'utf-8');
    } catch (error) {}
  }

  async addDailyLog(agentId: string, entry: string): Promise<void> {
    const memoryDir = path.join(this.agentsDir, agentId, 'memory');
    const today = new Date().toISOString().split('T')[0];
    const dailyLogPath = path.join(memoryDir, `${today}.md`);
    
    try {
      await fs.mkdir(memoryDir, { recursive: true });
      
      // Check if file exists, if not create with header
      try {
        await fs.access(dailyLogPath);
      } catch {
        const header = `# Daily Log - ${today}\n\n`;
        await fs.writeFile(dailyLogPath, header, 'utf-8');
      }
      
      const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
      const logEntry = `\n[${timestamp}] ${entry}\n`;
      await fs.appendFile(dailyLogPath, logEntry, 'utf-8');
    } catch (error) {
      logger.error(`Failed to add daily log for ${agentId}:`, error);
    }
  }

  async searchMemory(agentId: string, query: string): Promise<string> {
    try {
      const memoryPath = path.join(this.agentsDir, agentId, 'MEMORY.md');
      const memoryDir = path.join(this.agentsDir, agentId, 'memory');
      
      let results: string[] = [];
      
      // Search in MEMORY.md
      try {
        const memoryContent = await fs.readFile(memoryPath, 'utf-8');
        const lines = memoryContent.split('\n');
        const matchingLines = lines.filter(line => 
          line.toLowerCase().includes(query.toLowerCase())
        );
        
        if (matchingLines.length > 0) {
          results.push('## From Long-term Memory (MEMORY.md):');
          results.push(...matchingLines.slice(0, 10));
        }
      } catch (error) {}
      
      // Search in daily logs
      try {
        const files = await fs.readdir(memoryDir);
        const mdFiles = files.filter(f => f.endsWith('.md')).sort().reverse();
        
        for (const file of mdFiles.slice(0, 30)) {
          const content = await fs.readFile(path.join(memoryDir, file), 'utf-8');
          const lines = content.split('\n');
          const matchingLines = lines.filter(line => 
            line.toLowerCase().includes(query.toLowerCase())
          );
          
          if (matchingLines.length > 0) {
            results.push(`\n## From ${file}:`);
            results.push(...matchingLines.slice(0, 5));
          }
        }
      } catch (error) {}
      
      if (results.length === 0) {
        return `No results found for query: "${query}"`;
      }
      
      return results.join('\n');
    } catch (error) {
      return `Error searching memory: ${error}`;
    }
  }

  async searchSessions(agentId: string, query: string, sessionKey?: string): Promise<string> {
    try {
      const sessionsDir = path.join(this.agentsDir, agentId, 'sessions');
      const files = await fs.readdir(sessionsDir);
      
      // Filter to only transcript files (.jsonl)
      const transcriptFiles = files
        .filter(f => f.endsWith('.jsonl'))
        .sort()
        .reverse();
      
      let results: string[] = [];
      let filesSearched = 0;
      
      for (const file of transcriptFiles.slice(0, 20)) {
        const content = await fs.readFile(path.join(sessionsDir, file), 'utf-8');
        const lines = content.trim().split('\n');
        
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry.content && entry.content.toLowerCase().includes(query.toLowerCase())) {
              results.push(`[${entry.timestamp}] ${entry.role}: ${entry.content.slice(0, 200)}...`);
              
              if (results.length >= 10) break;
            }
          } catch {}
        }
        
        filesSearched++;
        if (results.length >= 10) break;
      }
      
      if (results.length === 0) {
        return `No results found in past sessions for: "${query}"`;
      }
      
      return `## Found in past conversations (searched ${filesSearched} sessions):\n\n` + results.join('\n\n');
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
    } catch (error) {}
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

  async loadContext(agentId: string, sessionKey?: string): Promise<string> {
    if (!sessionKey) return '';
    const sessionContextPath = this.getSessionContextPath(agentId, sessionKey);
    try {
      return await fs.readFile(sessionContextPath, 'utf-8');
    } catch (error) {
      // Create initial context with agent info
      const initialContext = await this.createInitialContext(agentId);
      await this.updateContext(agentId, initialContext, sessionKey);
      return initialContext;
    }
  }

  private async createInitialContext(agentId: string): Promise<string> {
    const agent = await this.loadAgent(agentId);
    const soul = await this.loadSoul(agentId);
    
    return `# Session Context

## About Me
I am ${agent.name}, an AI agent running on ${agent.llm.provider}/${agent.llm.model}.

${soul ? `## My Personality\n${soul}\n` : ''}

## My Skills
${agent.skills && agent.skills.length > 0 ? agent.skills.map(s => `- ${s}`).join('\n') : '- General assistance\n- Task execution\n- Code analysis'}

## My Tools
I have access to these tools:

### File System
- **read_file** - Read contents of any file
- **write_file** - Create or modify files
- **list_directory** - See what files are in a folder
- **get_file_tree** - See project structure
- **get_working_directory** - Know where I am

### Execution
- **shell_exec** - Execute terminal commands

### Web & Search
- **search_web** - Search the internet
- **scrape_website** - Read full content from websites
- **search_files** - Find text in project files
- **search_codebase** - Search code with patterns

### Memory & Learning (IMPORTANT!)
- **remember_fact** - Save important info to long-term memory (MEMORY.md)
- **log_daily** - Log today's actions and decisions to daily log
- **search_memory** - Search through my memory and daily logs
- **search_sessions** - Search through past conversations
- **get_recent_activity** - See what happened in recent days
- **update_skills** - Learn new skills

## How I Work
1. **Chat Mode**: For greetings and questions, I respond naturally
2. **Task Mode**: For actual work, I use my tools
3. **Planner Mode**: For complex tasks (creating projects, apps), I create a detailed plan first

## Memory System
I maintain two types of memory:
- **Long-term Memory (MEMORY.md)**: Important facts, preferences, decisions
- **Daily Logs (memory/YYYY-MM-DD.md)**: Today's actions, context, notes

I automatically log all requests and completions. For important information, I use remember_fact or log_daily tools.

## Session Started
Ready to help! You can:
- Ask me about my capabilities
- Give me a task to complete
- Chat with me about anything
- Ask me to remember important information

---

`;
  }

  async updateContext(agentId: string, content: string, sessionKey?: string): Promise<void> {
    if (!sessionKey) return;
    const sessionContextPath = this.getSessionContextPath(agentId, sessionKey);
    try {
      await fs.mkdir(path.dirname(sessionContextPath), { recursive: true });
      await fs.writeFile(sessionContextPath, content, 'utf-8');
    } catch (error) {}
  }

  private getSessionContextPath(agentId: string, sessionKey: string): string {
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
      await fs.appendFile(transcriptPath, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (error) {}
  }

  async createAgent(config: AgentConfig): Promise<void> {
    const agentDir = path.join(this.agentsDir, config.id);
    await fs.mkdir(agentDir, { recursive: true });
    await fs.mkdir(path.join(agentDir, 'memory'), { recursive: true });
    await fs.mkdir(path.join(agentDir, 'sessions'), { recursive: true });
    const agentMd = (matter as any).stringify(config.personality || '', config);
    await fs.writeFile(path.join(agentDir, 'AGENT.md'), agentMd, 'utf-8');
  }
}
