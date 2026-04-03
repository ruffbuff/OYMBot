import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils/logger.js';
import { MemoryManager } from '../memory/MemoryManager.js';
import { AgentConfig, ToolPolicy } from '../../types/agent.js';

const execPromise = promisify(exec);

export interface Tool {
  name: string;
  description: string;
  group: 'fs' | 'shell' | 'network' | 'memory' | 'other';
  isDangerous?: boolean;
  parameters: Record<string, any>;
  execute: (params: any, agentId?: string, config?: AgentConfig) => Promise<string>;
}

export class ToolManager {
  private tools: Map<string, Tool> = new Map();
  private memoryManager: MemoryManager;
  private approvedActions: Set<string> = new Set();

  constructor(memoryManager: MemoryManager) {
    this.memoryManager = memoryManager;
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    // File System Tools
    this.registerTool({
      name: 'read_file',
      description: 'Read contents of a file (supports absolute paths, relative paths, and ~ for home)',
      group: 'fs',
      parameters: {
        path: 'string - file path (absolute: /path/to/file, relative: ./file, home: ~/file)',
      },
      execute: async (params: { path: string }, agentId?: string, config?: AgentConfig) => {
        try {
          // Resolve and sandbox check
          const filePath = this.resolvePath(params.path, config);
          if (!this.isPathAllowed(filePath, config)) {
            return `Error: Access to ${params.path} is denied by sandbox policy.`;
          }

          const content = await fs.readFile(filePath, 'utf-8');
          return `File content:\n\n${content}`;
        } catch (error) {
          return `Error reading file: ${error}`;
        }
      },
    });

    this.registerTool({
      name: 'list_directory',
      description: 'List files and directories in a path (supports absolute, relative, and ~ paths)',
      group: 'fs',
      parameters: {
        path: 'string - directory path (absolute: /path, relative: ./path, home: ~/path, default: current)',
      },
      execute: async (params: { path?: string }, agentId?: string, config?: AgentConfig) => {
        try {
          const dirPath = this.resolvePath(params.path || '.', config);
          if (!this.isPathAllowed(dirPath, config)) {
            return `Error: Access to ${params.path || '.'} is denied by sandbox policy.`;
          }

          const items = await fs.readdir(dirPath, { withFileTypes: true });
          const list = items.map((item) => {
            const type = item.isDirectory() ? '[DIR]' : '[FILE]';
            return `${type} ${item.name}`;
          });
          return `Directory listing for ${dirPath}:\n\n${list.join('\n')}`;
        } catch (error) {
          return `Error listing directory: ${error}`;
        }
      },
    });

    this.registerTool({
      name: 'write_file',
      description: 'Write content to a file (supports absolute, relative, and ~ paths). PROTECTED: Cannot overwrite agent config files.',
      group: 'fs',
      isDangerous: true,
      parameters: {
        path: 'string - file path (absolute: /path/to/file, relative: ./file, home: ~/file)',
        content: 'string - content to write',
      },
      execute: async (params: { path: string; content: string }, agentId?: string, config?: AgentConfig) => {
        try {
          const forbiddenFiles = ['AGENT.md', 'MEMORY.md', 'CONTEXT.md', '.env'];
          const filename = path.basename(params.path);

          if (forbiddenFiles.includes(filename)) {
            return `Error: Writing directly to ${filename} is forbidden for security. Use 'remember_fact' or 'update_skills' tools instead.`;
          }

          const filePath = this.resolvePath(params.path, config);
          if (!this.isPathAllowed(filePath, config)) {
            return `Error: Access to ${params.path} is denied by sandbox policy.`;
          }

          // Create directory if it doesn't exist
          const dir = path.dirname(filePath);
          await fs.mkdir(dir, { recursive: true });

          await fs.writeFile(filePath, params.content, 'utf-8');
          return `Successfully wrote to ${filePath}`;
        } catch (error) {
          return `Error writing file: ${error}`;
        }
      },
    });

    // Agent Self-Improvement & Memory Tools
    this.registerTool({
      name: 'remember_fact',
      description: 'Save an important fact to long-term MEMORY.md (use for information that will be relevant weeks/months later)',
      group: 'memory',
      parameters: {
        fact: 'string - fact to remember',
      },
      execute: async (params: { fact: string }, agentId?: string) => {
        if (!agentId) return 'Error: agentId missing';
        try {
          await this.memoryManager.addLongTermMemory(agentId, params.fact);
          return `✅ Fact remembered in long-term memory: "${params.fact}"`;
        } catch (error) {
          return `Error: ${error}`;
        }
      },
    });

    this.registerTool({
      name: 'log_daily',
      description: 'Log information to today\'s daily log (use for actions, decisions, and context relevant for today/this week)',
      group: 'memory',
      parameters: {
        entry: 'string - what to log',
      },
      execute: async (params: { entry: string }, agentId?: string) => {
        if (!agentId) return 'Error: agentId missing';
        try {
          await this.memoryManager.addDailyLog(agentId, params.entry);
          return `✅ Logged to daily log: "${params.entry}"`;
        } catch (error) {
          return `Error: ${error}`;
        }
      },
    });

    this.registerTool({
      name: 'search_memory',
      description: 'Search through long-term memory (MEMORY.md) and daily logs for specific information',
      group: 'memory',
      parameters: {
        query: 'string - what to search for',
      },
      execute: async (params: { query: string }, agentId?: string) => {
        if (!agentId) return 'Error: agentId missing';
        try {
          const results = await this.memoryManager.searchMemory(agentId, params.query);
          return results;
        } catch (error) {
          return `Error: ${error}`;
        }
      },
    });

    this.registerTool({
      name: 'search_sessions',
      description: 'Search through past conversation sessions to find what was discussed before',
      group: 'memory',
      parameters: {
        query: 'string - what to search for in past conversations',
      },
      execute: async (params: { query: string }, agentId?: string) => {
        if (!agentId) return 'Error: agentId missing';
        try {
          const results = await this.memoryManager.searchSessions(agentId, params.query);
          return results;
        } catch (error) {
          return `Error: ${error}`;
        }
      },
    });

    this.registerTool({
      name: 'get_recent_activity',
      description: 'Get summary of recent activity from daily logs (last N days)',
      group: 'memory',
      parameters: {
        days: 'number - how many days back to look (default: 7)',
      },
      execute: async (params: { days?: number }, agentId?: string) => {
        if (!agentId) return 'Error: agentId missing';
        try {
          const days = params.days || 7;
          const activity = await this.memoryManager.getRecentMemory(agentId, days);
          return activity || 'No recent activity found';
        } catch (error) {
          return `Error: ${error}`;
        }
      },
    });

    this.registerTool({
      name: 'update_skills',
      description: 'Add new skills to AGENT.md',
      group: 'memory',
      parameters: {
        skills: 'array of strings - new skills',
      },
      execute: async (params: { skills: string[] }, agentId?: string) => {
        if (!agentId) return 'Error: agentId missing';
        try {
          await this.memoryManager.updateAgentSkills(agentId, params.skills);
          return `✅ Skills updated: ${params.skills.join(', ')}`;
        } catch (error) {
          return `Error: ${error}`;
        }
      },
    });

    // Shell Execution Tool
    this.registerTool({
      name: 'shell_exec',
      description: 'Execute a shell command',
      group: 'shell',
      isDangerous: true,
      parameters: {
        command: 'string - command to execute',
      },
      execute: async (params: { command: string }, agentId?: string, config?: AgentConfig) => {
        try {
          logger.info(`Executing shell command: ${params.command}`);
          const options: any = {};
          if (config?.tools?.sandboxRoot) {
            options.cwd = path.resolve(config.tools.sandboxRoot);
          }
          const { stdout, stderr } = await execPromise(params.command, options);
          let result = '';
          if (stdout) result += `STDOUT:\n${stdout}\n`;
          if (stderr) result += `STDERR:\n${stderr}\n`;
          return result || 'Command executed successfully';
        } catch (error: any) {
          return `Error: ${error.message}\n${error.stderr || ''}`;
        }
      },
    });

    // File Search Tool (Grep-like)
    this.registerTool({
      name: 'search_files',
      description: 'Search for a text pattern or keyword inside files in the project',
      group: 'fs',
      parameters: {
        pattern: 'string - text to search for',
        directory: 'string - directory to search in (default: current)',
      },
      execute: async (params: { pattern: string; directory?: string }, agentId?: string, config?: AgentConfig) => {
        try {
          const dir = this.resolvePath(params.directory || '.', config);
          if (!this.isPathAllowed(dir, config)) {
            return `Error: Access to ${params.directory || '.'} is denied by sandbox policy.`;
          }
          // Using native grep for speed
          const { stdout } = await execPromise(`grep -rni "${params.pattern}" ${dir} --exclude-dir=node_modules --exclude-dir=.next --max-count=20`);
          return stdout || `No matches found for "${params.pattern}"`;
        } catch (error: any) {
          return `No matches found or error: ${error.message}`;
        }
      },
    });

    // Advanced codebase search (for planner)
    this.registerTool({
      name: 'search_codebase',
      group: 'fs',
      description: 'Search for patterns in codebase using grep (excludes node_modules, .git, etc.)',
      parameters: {
        pattern: 'string - regex pattern to search',
        filePattern: 'string - file pattern (e.g., "*.ts", "*.js") - optional',
      },
      execute: async (params: { pattern: string; filePattern?: string }, agentId?: string, config?: AgentConfig) => {
        try {
          const sandbox = config?.tools?.sandboxRoot || process.cwd();
          let command = `grep -rni "${params.pattern}" ${sandbox} --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=dist --max-count=30`;

          if (params.filePattern) {
            command += ` --include="${params.filePattern}"`;
          }

          const { stdout } = await execPromise(command);
          return stdout || `No matches found for pattern "${params.pattern}"`;
        } catch (error: any) {
          if (error.code === 1) {
            return `No matches found for pattern "${params.pattern}"`;
          }
          return `Search error: ${error.message}`;
        }
      },
    });

    // Get file tree (for planner to understand project structure)
    this.registerTool({
      name: 'get_file_tree',
      group: 'fs',
      description: 'Get recursive directory structure (tree view)',
      parameters: {
        path: 'string - directory path (default: current)',
        maxDepth: 'number - maximum depth (default: 3)',
      },
      execute: async (params: { path?: string; maxDepth?: number }, agentId?: string, config?: AgentConfig) => {
        try {
          const dirPath = this.resolvePath(params.path || '.', config);
          if (!this.isPathAllowed(dirPath, config)) {
            return `Error: Access to ${params.path || '.'} is denied by sandbox policy.`;
          }
          const maxDepth = params.maxDepth || 3;

          // Use tree command if available, otherwise use find
          try {
            const { stdout } = await execPromise(`tree -L ${maxDepth} -I 'node_modules|.git|.next|dist' ${dirPath}`);
            return `File tree:\n\n${stdout}`;
          } catch {
            // Fallback to find if tree is not available
            const { stdout } = await execPromise(`find ${dirPath} -maxdepth ${maxDepth} -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*' | head -100`);
            return `File structure:\n\n${stdout}`;
          }
        } catch (error: any) {
          return `Error getting file tree: ${error.message}`;
        }
      },
    });

    // Advanced Web Scraper
    this.registerTool({
      name: 'scrape_website',
      group: 'network',
      description: 'Deeply scrape a website to get its full text content, useful for reading documentation',
      parameters: {
        url: 'string - valid URL starting with http/https',
      },
      execute: async (params: { url: string }) => {
        try {
          if (!params.url.startsWith('http')) return 'Error: Invalid URL';
          logger.info(`Scraping website: ${params.url}`);

          const response = await fetch(params.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
          });

          if (!response.ok) return `Error: HTTP ${response.status}`;
          const html = await response.text();

          // Better extraction: remove scripts, styles, and junk
          const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          return `Content from ${params.url} (first 8000 chars):\n\n${text.slice(0, 8000)}...`;
        } catch (error: any) {
          return `Scrape error: ${error.message}`;
        }
      },
    });

    // Environment Context Tool
    this.registerTool({
      name: 'get_working_directory',
      group: 'fs',
      description: 'Get current directory',
      parameters: {},
      execute: async () => {
        return `Current directory: ${process.cwd()}`;
      },
    });

    // Web Search Tools
    this.registerTool({
      name: 'search_web',
      group: 'network',
      description: 'Search internet using DuckDuckGo',
      parameters: { query: 'string - search query' },
      execute: async (params: { query: string }) => {
        try {
          const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(params.query)}`;
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          if (!response.ok) return 'Error reaching search engine';
          const html = await response.text();

          // More robust regex for DDG HTML
          const results: string[] = [];
          const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
          let match;
          let count = 0;
          while ((match = resultRegex.exec(html)) !== null && count < 5) {
            const title = match[2].replace(/<[^>]+>/g, '').trim();
            const link = match[1];
            if (link.startsWith('http')) {
              results.push(`${count + 1}. ${title}\n   URL: ${link}`);
              count++;
            }
          }
          return results.length > 0 ? results.join('\n\n') : 'No results found. Try a different query.';
        } catch (error: any) { return `Error: ${error.message}`; }
      },
    });

    this.registerTool({
      name: 'web_search',
      group: 'network',
      description: 'Fetch content from URL',
      parameters: { query: 'string - URL' },
      execute: async (params: { query: string }) => {
        try {
          if (!params.query.startsWith('http')) return 'Error: Invalid URL';
          const response = await fetch(params.query);
          if (!response.ok) return `Error: ${response.status}`;
          const text = (await response.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          return text.slice(0, 5000);
        } catch (error: any) { return `Error: ${error.message}`; }
      },
    });

    logger.info(`Registered ${this.tools.size} tools`);
  }

  private resolvePath(filePath: string, config?: AgentConfig): string {
    let resolvedPath = filePath;

    // Expand ~ to home directory
    if (resolvedPath.startsWith('~/')) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      resolvedPath = path.join(homeDir, resolvedPath.slice(2));
    } else if (!path.isAbsolute(resolvedPath)) {
      // If relative, resolve from sandboxRoot or current working directory
      const base = config?.tools?.sandboxRoot || process.cwd();
      resolvedPath = path.resolve(base, resolvedPath);
    }

    return resolvedPath;
  }

  private isPathAllowed(filePath: string, config?: AgentConfig): boolean {
    if (!config?.tools?.sandboxRoot) return true; // No sandbox restricted

    const sandboxRoot = path.resolve(config.tools.sandboxRoot);
    const absolutePath = path.resolve(filePath);

    return absolutePath.startsWith(sandboxRoot);
  }

  public canExecute(agent: AgentConfig, toolName: string): { allowed: boolean; reason?: string; action?: 'allow' | 'deny' | 'ask' } {
    const tool = this.getTool(toolName);
    if (!tool) return { allowed: false, reason: `Tool "${toolName}" not found` };

    // Check specific tool policy
    const policies = agent.tools?.policies || [];

    // 1. Check direct tool policy
    const toolPolicy = policies.find((p: ToolPolicy) => p.name === toolName);
    if (toolPolicy) {
      if (toolPolicy.action === 'deny') return { allowed: false, reason: `Policy: tool "${toolName}" is denied`, action: 'deny' };
      if (toolPolicy.action === 'ask') return { allowed: true, action: 'ask' };
      if (toolPolicy.action === 'allow') return { allowed: true, action: 'allow' };
    }

    // 2. Check group policy
    const groupPolicy = policies.find((p: ToolPolicy) => p.name === `group:${tool.group}`);
    if (groupPolicy) {
      if (groupPolicy.action === 'deny') return { allowed: false, reason: `Policy: group "${tool.group}" is denied`, action: 'deny' };
      if (groupPolicy.action === 'ask') return { allowed: true, action: 'ask' };
      if (groupPolicy.action === 'allow') return { allowed: true, action: 'allow' };
    }

    // 3. Check legacy disabled list
    if (agent.tools?.disabled?.includes(toolName)) {
      return { allowed: false, reason: `Tool "${toolName}" is explicitly disabled`, action: 'deny' };
    }

    // Default: Dangerous tools should ask if not explicitly allowed
    if (tool.isDangerous) {
      return { allowed: true, action: 'ask' };
    }

    return { allowed: true, action: 'allow' };
  }

  public approveAction(hash: string): void {
    this.approvedActions.add(hash);
    logger.info(`Action ${hash} approved by user.`);

    // 5 minutes TTL to prevent memory leaks with unused hashes
    setTimeout(() => {
      if (this.approvedActions.has(hash)) {
        this.approvedActions.delete(hash);
        logger.info(`Action approval ${hash} expired.`);
      }
    }, 5 * 60 * 1000);
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  getEnabledTools(disabledTools: string[] = []): Tool[] {
    return this.getAllTools().filter(tool => !disabledTools.includes(tool.name));
  }

  getToolsDescription(disabledTools: string[] = []): string {
    const tools = this.getEnabledTools(disabledTools);
    if (tools.length === 0) return 'No tools available';
    return tools.map((t) => `${t.name}: ${t.description}`).join('\n');
  }

  async executeTool(name: string, params: any, agentId?: string, config?: AgentConfig): Promise<string> {
    const tool = this.getTool(name);
    if (!tool) return `Tool "${name}" not found`;

    // Final security check before execution
    if (config) {
      const policy = this.canExecute(config, name);
      if (!policy.allowed) {
        return `Security Error: ${policy.reason}`;
      }
      if (policy.action === 'ask') {
        const actionPayload = JSON.stringify({ name, params, agentId: config.id });
        const hash = Buffer.from(actionPayload).toString('base64');

        if (this.approvedActions.has(hash)) {
          this.approvedActions.delete(hash); // Consume approval
        } else {
          return `SECURITY: Tool "${name}" is dangerous and requires manual confirmation. Pause your task, explain what you are about to do, and ask the user to type: /approve ${hash}`;
        }
      }
    }

    try {
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Tool execution timed out after 60 seconds.')), 60000)
      );

      return await Promise.race([
        tool.execute(params, agentId, config),
        timeoutPromise
      ]);
    } catch (error: any) {
      return `Error executing tool: ${error.message || error}`;
    }
  }
}
