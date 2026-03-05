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
      const dirs = await fs.readdir(this.agentsDir);
      const agents: AgentConfig[] = [];
      for (const dir of dirs) {
        const agentPath = path.join(this.agentsDir, dir);
        const stat = await fs.stat(agentPath);
        if (stat.isDirectory()) {
          try {
            const agent = await this.loadAgent(dir);
            agents.push(agent);
          } catch (e) {}
        }
      }
      return agents;
    } catch (error) {
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
- **read_file** - Read contents of any file
- **write_file** - Create or modify files
- **list_directory** - See what files are in a folder
- **shell_exec** - Execute terminal commands
- **search_web** - Search the internet
- **scrape_website** - Read full content from websites
- **search_files** - Find text in project files
- **search_codebase** - Search code with patterns
- **get_file_tree** - See project structure
- **get_working_directory** - Know where I am
- **remember_fact** - Save important information to memory
- **update_skills** - Learn new skills

## How I Work
1. **Chat Mode**: For greetings and questions, I respond naturally
2. **Task Mode**: For actual work, I use my tools
3. **Planner Mode**: For complex tasks (creating projects, apps), I create a detailed plan first

## Session Started
Ready to help! You can:
- Ask me about my capabilities
- Give me a task to complete
- Chat with me about anything

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
