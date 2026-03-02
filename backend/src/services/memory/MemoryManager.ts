import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { AgentConfig } from '../../types/agent';
import { logger } from '../../utils/logger';

export class MemoryManager {
  private agentsDir: string;

  constructor(agentsDir: string = './agents') {
    this.agentsDir = agentsDir;
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

  // Update agent status
  async updateAgentStatus(agentId: string, status: AgentConfig['status']): Promise<void> {
    const agentPath = path.join(this.agentsDir, agentId, 'AGENT.md');
    
    try {
      const content = await fs.readFile(agentPath, 'utf-8');
      const { data, content: body } = matter(content);
      
      data.status = status;
      data.updatedAt = new Date().toISOString();
      
      const updated = matter.stringify(body, data);
      await fs.writeFile(agentPath, updated, 'utf-8');
      
      logger.info(`Updated agent ${agentId} status to ${status}`);
    } catch (error) {
      logger.error(`Failed to update agent ${agentId} status:`, error);
      throw error;
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

  // Load context
  async loadContext(agentId: string): Promise<string> {
    const contextPath = path.join(this.agentsDir, agentId, 'CONTEXT.md');
    
    try {
      return await fs.readFile(contextPath, 'utf-8');
    } catch (error) {
      return '';
    }
  }

  // Update context with rotation (saves to CONTEXT.md as markdown)
  async updateContext(agentId: string, content: string): Promise<void> {
    const contextPath = path.join(this.agentsDir, agentId, 'CONTEXT.md');
    const MAX_CONTEXT_SIZE = 50000; // 50KB limit
    
    try {
      // If context is too large, rotate it
      if (content.length > MAX_CONTEXT_SIZE) {
        logger.info(`Context too large (${content.length} bytes), rotating...`);
        
        // Save full context to sessions
        await this.saveToSession(agentId, content);
        
        // Keep only last 10 messages
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
  }

  // Save message to session transcript (JSONL format like OpenClaw)
  async saveMessageToTranscript(
    agentId: string, 
    role: 'user' | 'assistant', 
    content: string
  ): Promise<void> {
    const sessionsDir = path.join(this.agentsDir, agentId, 'sessions');
    const today = new Date().toISOString().split('T')[0];
    const transcriptPath = path.join(sessionsDir, `transcript-${today}.jsonl`);
    
    try {
      await fs.mkdir(sessionsDir, { recursive: true });
      
      const entry = {
        type: 'message',
        timestamp: new Date().toISOString(),
        message: {
          role,
          content,
        },
      };
      
      const line = JSON.stringify(entry) + '\n';
      await fs.appendFile(transcriptPath, line, 'utf-8');
      logger.info(`✅ Saved ${role} message to transcript for agent ${agentId}`);
    } catch (error) {
      logger.error(`Failed to save message to transcript for agent ${agentId}:`, error);
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
