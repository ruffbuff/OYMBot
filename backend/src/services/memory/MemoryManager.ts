import fs from 'fs/promises';
import { watch } from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { AgentConfig } from '../../types/agent';
import { logger } from '../../utils/logger';

export class MemoryManager {
  private agentsDir: string;

  constructor(agentsDir: string = './agents') {
    this.agentsDir = agentsDir;
  }

  /**
   * Watch for changes in agent directories to trigger hot-reloads
   */
  watchAgents(callback: (agentId: string) => void): void {
    try {
      // Watch the root agents directory for new/deleted agents
      watch(this.agentsDir, (eventType, filename) => {
        if (filename && eventType === 'rename') {
          // New agent directory created or old one deleted
          logger.info(`Agent structure changed: ${filename}`);
        }
      });

      // We'll also need to watch individual agent directories for AGENT.md changes
      // This is done recursively or on-demand in a real-world scenario, 
      // but for now let's set up a simpler watcher for known agents.
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

  // Load agent configuration from AGENT.md
  async loadAgent(agentId: string): Promise<AgentConfig> {
    const agentPath = path.join(this.agentsDir, agentId, 'AGENT.md');
    
    try {
      const content = await fs.readFile(agentPath, 'utf-8');
      const { data, content: body } = matter(content);
      
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
      logger.error(`Failed to load agent ${agentId}:`, error);
      throw new Error(`Agent ${agentId} not found`);
    }
  }

  // Load all agents
  async loadAllAgents(): Promise<AgentConfig[]> {
    try {
      const dirs = await fs.readdir(this.agentsDir);
      const agents: AgentConfig[] = [];

      for (const dir of dirs) {
        const agentPath = path.join(this.agentsDir, dir);
        const stat = await fs.stat(agentPath);
        
        if (stat.isDirectory()) {
          try {
            const agent = await this.loadAgent(dir);
            agents.push(agent);
          } catch (error) {
            logger.warn(`Skipping invalid agent directory: ${dir}`);
          }
        }
      }

      return agents;
    } catch (error) {
      logger.error('Failed to load agents:', error);
      return [];
    }
  }

  // Update agent status safely
  async updateAgentStatus(agentId: string, status: AgentConfig['status']): Promise<void> {
    const agentPath = path.join(this.agentsDir, agentId, 'AGENT.md');
    
    try {
      const content = await fs.readFile(agentPath, 'utf-8');
      const parsed = matter(content);
      
      parsed.data.status = status;
      parsed.data.updatedAt = new Date().toISOString();
      
      const updated = matter.stringify(parsed.content, parsed.data);
      // Atomic-like write: write to temp then rename
      const tempPath = `${agentPath}.tmp`;
      await fs.writeFile(tempPath, updated, 'utf-8');
      await fs.rename(tempPath, agentPath);
      
      logger.info(`Updated agent ${agentId} status to ${status}`);
    } catch (error) {
      logger.error(`Failed to update agent ${agentId} status:`, error);
    }
  }

  // Append a permanent fact to MEMORY.md
  async addLongTermMemory(agentId: string, fact: string): Promise<void> {
    const memoryPath = path.join(this.agentsDir, agentId, 'MEMORY.md');
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const entry = `\n- [${timestamp}] ${fact}\n`;
      await fs.appendFile(memoryPath, entry, 'utf-8');
      logger.info(`✅ Added long-term memory for ${agentId}`);
    } catch (error) {
      logger.error(`Failed to add memory for ${agentId}:`, error);
    }
  }

  // Update agent skills safely
  async updateAgentSkills(agentId: string, skills: string[]): Promise<void> {
    const agentPath = path.join(this.agentsDir, agentId, 'AGENT.md');
    try {
      const content = await fs.readFile(agentPath, 'utf-8');
      const parsed = matter(content);
      
      // Merge unique skills
      const currentSkills = parsed.data.skills || [];
      const newSkills = [...new Set([...currentSkills, ...skills])];
      
      parsed.data.skills = newSkills;
      parsed.data.updatedAt = new Date().toISOString();
      
      const updated = matter.stringify(parsed.content, parsed.data);
      await fs.writeFile(agentPath, updated, 'utf-8');
      
      logger.info(`✅ Updated skills for agent ${agentId}: ${newSkills.join(', ')}`);
    } catch (error) {
      logger.error(`Failed to update skills for agent ${agentId}:`, error);
    }
  }

  // Load memory
  async loadMemory(agentId: string): Promise<string> {
    const memoryPath = path.join(this.agentsDir, agentId, 'MEMORY.md');
    
    try {
      return await fs.readFile(memoryPath, 'utf-8');
    } catch (error) {
      logger.warn(`No memory file for agent ${agentId}`);
      return '';
    }
  }

  // Update memory
  async updateMemory(agentId: string, content: string): Promise<void> {
    const memoryPath = path.join(this.agentsDir, agentId, 'MEMORY.md');
    
    try {
      await fs.writeFile(memoryPath, content, 'utf-8');
      logger.info(`Updated memory for agent ${agentId}`);
    } catch (error) {
      logger.error(`Failed to update memory for agent ${agentId}:`, error);
      throw error;
    }
  }

  // Load context for a specific session
  async loadContext(agentId: string, sessionKey?: string): Promise<string> {
    // If no session key, use legacy CONTEXT.md (backward compatibility)
    if (!sessionKey) {
      const contextPath = path.join(this.agentsDir, agentId, 'CONTEXT.md');
      try {
        return await fs.readFile(contextPath, 'utf-8');
      } catch (error) {
        return '';
      }
    }

    // Use session-specific context file
    const sessionContextPath = this.getSessionContextPath(agentId, sessionKey);
    try {
      return await fs.readFile(sessionContextPath, 'utf-8');
    } catch (error) {
      // Initialize empty context for new session
      return '# Session Context\n\n';
    }
  }

  // Update context with rotation (session-aware)
  async updateContext(agentId: string, content: string, sessionKey?: string): Promise<void> {
    const MAX_CONTEXT_SIZE = 50000; // 50KB limit
    
    // If no session key, use legacy CONTEXT.md (backward compatibility)
    if (!sessionKey) {
      const contextPath = path.join(this.agentsDir, agentId, 'CONTEXT.md');
      try {
        if (content.length > MAX_CONTEXT_SIZE) {
          logger.info(`Context too large (${content.length} bytes), rotating...`);
          await this.saveToSession(agentId, content);
          const messages = content.split('\n\n').filter(line => 
            line.startsWith('User:') || line.startsWith('Assistant:')
          );
          const recentMessages = messages.slice(-10);
          content = `# Current Session Context\n\n${recentMessages.join('\n\n')}\n`;
          logger.info(`Rotated context, new size: ${content.length} bytes`);
        }
        await fs.writeFile(contextPath, content, 'utf-8');
        logger.info(`✅ Updated context for agent ${agentId}, size: ${content.length} bytes`);
      } catch (error) {
        logger.error(`Failed to update context for agent ${agentId}:`, error);
        throw error;
      }
      return;
    }

    // Session-specific context
    const sessionContextPath = this.getSessionContextPath(agentId, sessionKey);
    
    try {
      // If context is too large, rotate it
      if (content.length > MAX_CONTEXT_SIZE) {
        logger.info(`Session ${sessionKey} context too large (${content.length} bytes), rotating...`);
        
        // Save full context to session transcript
        await this.saveSessionSnapshot(agentId, sessionKey, content);
        
        // Keep only last 10 messages
        const messages = content.split('\n\n').filter(line => 
          line.startsWith('User:') || line.startsWith('Assistant:')
        );
        const recentMessages = messages.slice(-10);
        content = `# Session Context\n\n${recentMessages.join('\n\n')}\n`;
        
        logger.info(`Rotated session context, new size: ${content.length} bytes`);
      }
      
      await fs.writeFile(sessionContextPath, content, 'utf-8');
      logger.info(`✅ Updated context for session ${sessionKey}, size: ${content.length} bytes`);
    } catch (error) {
      logger.error(`Failed to update context for session ${sessionKey}:`, error);
      throw error;
    }
  }

  // Get session context file path
  private getSessionContextPath(agentId: string, sessionKey: string): string {
    const sessionsDir = path.join(this.agentsDir, agentId, 'sessions');
    const safeSessionKey = sessionKey.replace(/[/:]/g, '-');
    return path.join(sessionsDir, `${safeSessionKey}-context.md`);
  }

  // Save message to session transcript (JSONL format like OpenClaw)
  async saveMessageToTranscript(
    agentId: string, 
    role: 'user' | 'assistant', 
    content: string,
    sessionKey?: string
  ): Promise<void> {
    const sessionsDir = path.join(this.agentsDir, agentId, 'sessions');
    
    // Generate filename based on session key or use legacy format
    let transcriptPath: string;
    if (sessionKey) {
      const safeSessionKey = sessionKey.replace(/[/:]/g, '-');
      const today = new Date().toISOString().split('T')[0];
      transcriptPath = path.join(sessionsDir, `${safeSessionKey}-${today}.jsonl`);
    } else {
      // Legacy format for backward compatibility
      const today = new Date().toISOString().split('T')[0];
      transcriptPath = path.join(sessionsDir, `transcript-${today}.jsonl`);
    }
    
    try {
      await fs.mkdir(sessionsDir, { recursive: true });
      
      const entry = {
        type: 'message',
        timestamp: new Date().toISOString(),
        sessionKey: sessionKey || 'legacy',
        message: {
          role,
          content,
        },
      };
      
      const line = JSON.stringify(entry) + '\n';
      await fs.appendFile(transcriptPath, line, 'utf-8');
      logger.info(`✅ Saved ${role} message to transcript for ${sessionKey || 'legacy session'}`);
    } catch (error) {
      logger.error(`Failed to save message to transcript for agent ${agentId}:`, error);
    }
  }

  // Save session snapshot when rotating
  private async saveSessionSnapshot(agentId: string, sessionKey: string, content: string): Promise<void> {
    const sessionsDir = path.join(this.agentsDir, agentId, 'sessions');
    const safeSessionKey = sessionKey.replace(/[/:]/g, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotPath = path.join(sessionsDir, `${safeSessionKey}-snapshot-${timestamp}.md`);
    
    try {
      await fs.mkdir(sessionsDir, { recursive: true });
      await fs.writeFile(snapshotPath, content, 'utf-8');
      logger.info(`✅ Saved session snapshot to ${snapshotPath}`);
    } catch (error) {
      logger.error(`Failed to save session snapshot for ${sessionKey}:`, error);
    }
  }

  // Save context to session file (when rotating)
  private async saveToSession(agentId: string, content: string): Promise<void> {
    const sessionsDir = path.join(this.agentsDir, agentId, 'sessions');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sessionPath = path.join(sessionsDir, `rotated-${timestamp}.md`);
    
    try {
      await fs.mkdir(sessionsDir, { recursive: true });
      await fs.writeFile(sessionPath, content, 'utf-8');
      logger.info(`✅ Saved rotated session to ${sessionPath}`);
    } catch (error) {
      logger.error(`Failed to save session for agent ${agentId}:`, error);
    }
  }

  // Append to memory (for important facts)
  async appendToMemory(agentId: string, fact: string): Promise<void> {
    const memoryPath = path.join(this.agentsDir, agentId, 'MEMORY.md');
    
    try {
      const currentMemory = await this.loadMemory(agentId);
      const timestamp = new Date().toISOString();
      const entry = `\n## ${timestamp}\n${fact}\n`;
      
      await fs.writeFile(memoryPath, currentMemory + entry, 'utf-8');
      logger.info(`Appended to memory for agent ${agentId}`);
    } catch (error) {
      logger.error(`Failed to append to memory for agent ${agentId}:`, error);
      throw error;
    }
  }

  // Create new agent
  async createAgent(config: AgentConfig): Promise<void> {
    const agentDir = path.join(this.agentsDir, config.id);
    
    try {
      // Create agent directory
      await fs.mkdir(agentDir, { recursive: true });
      await fs.mkdir(path.join(agentDir, 'memory'), { recursive: true });
      await fs.mkdir(path.join(agentDir, 'sessions'), { recursive: true });
      
      // Create AGENT.md
      const agentMd = matter.stringify(config.personality || '', {
        id: config.id,
        name: config.name,
        type: config.type,
        status: config.status,
        energy: config.energy,
        llm: config.llm,
        skills: config.skills,
        createdAt: new Date().toISOString(),
      });
      
      await fs.writeFile(path.join(agentDir, 'AGENT.md'), agentMd, 'utf-8');
      
      // Create empty MEMORY.md
      await fs.writeFile(
        path.join(agentDir, 'MEMORY.md'),
        '# Long-term Memory\n\n',
        'utf-8'
      );
      
      // Create empty CONTEXT.md
      await fs.writeFile(
        path.join(agentDir, 'CONTEXT.md'),
        '# Current Session Context\n\n',
        'utf-8'
      );
      
      logger.info(`Created agent ${config.id}`);
    } catch (error) {
      logger.error(`Failed to create agent ${config.id}:`, error);
      throw error;
    }
  }
}
