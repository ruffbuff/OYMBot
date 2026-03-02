import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils/logger';
import { MemoryManager } from '../memory/MemoryManager';

const execPromise = promisify(exec);

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: any, agentId?: string) => Promise<string>;
}

export class ToolManager {
  private tools: Map<string, Tool> = new Map();
  private memoryManager: MemoryManager;

  constructor(memoryManager: MemoryManager) {
    this.memoryManager = memoryManager;
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    // File System Tools
    this.registerTool({
      name: 'read_file',
      description: 'Read contents of a file',
      parameters: {
        path: 'string - relative or absolute file path',
      },
      execute: async (params: { path: string }) => {
        try {
          const content = await fs.readFile(params.path, 'utf-8');
          return `File content:\n\n${content}`;
        } catch (error) {
          return `Error reading file: ${error}`;
        }
      },
    });

    this.registerTool({
      name: 'list_directory',
      description: 'List files and directories in a path',
      parameters: {
        path: 'string - directory path (default: current directory)',
      },
      execute: async (params: { path?: string }) => {
        try {
          const dirPath = params.path || '.';
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
      description: 'Write content to a file (PROTECTED: Cannot overwrite configuration files)',
      parameters: {
        path: 'string - file path',
        content: 'string - content to write',
      },
      execute: async (params: { path: string; content: string }) => {
        try {
          // PROTECTED FILENAMES: Prevent agent from overwriting its core files via write_file
          const forbiddenFiles = ['AGENT.md', 'MEMORY.md', 'CONTEXT.md', '.env'];
          const filename = path.basename(params.path);
          
          if (forbiddenFiles.includes(filename)) {
            return `Error: Writing directly to ${filename} is forbidden for security. Use 'remember_fact' or 'update_skills' tools instead.`;
          }

          await fs.writeFile(params.path, params.content, 'utf-8');
          return `Successfully wrote to ${params.path}`;
        } catch (error) {
          return `Error writing file: ${error}`;
        }
      },
    });

    // Agent Self-Improvement & Memory Tools
    this.registerTool({
      name: 'remember_fact',
      description: 'Save an important fact or observation to your long-term memory (MEMORY.md) for future sessions.',
      parameters: {
        fact: 'string - the fact or learning to remember permanently',
      },
      execute: async (params: { fact: string }, agentId?: string) => {
        if (!agentId) return 'Error: agentId is missing. Could not save to memory.';
        try {
          await this.memoryManager.addLongTermMemory(agentId, params.fact);
          return `✅ Fact remembered: "${params.fact}"`;
        } catch (error) {
          return `Error saving to memory: ${error}`;
        }
      },
    });

    this.registerTool({
      name: 'update_skills',
      description: 'Add new skills or technologies you have learned to your profile (AGENT.md).',
      parameters: {
        skills: 'array of strings - list of new skills to add',
      },
      execute: async (params: { skills: string[] }, agentId?: string) => {
        if (!agentId) return 'Error: agentId is missing. Could not update skills.';
        try {
          await this.memoryManager.updateAgentSkills(agentId, params.skills);
          return `✅ Skills updated: ${params.skills.join(', ')}`;
        } catch (error) {
          return `Error updating skills: ${error}`;
        }
      },
    });

    // Shell Execution Tool
    this.registerTool({
      name: 'shell_exec',
      description: 'Execute a shell command in the terminal',
      parameters: {
        command: 'string - the command to execute (e.g., "npm test", "ls -la")',
      },
      execute: async (params: { command: string }) => {
        try {
          logger.info(`Executing shell command: ${params.command}`);
          const { stdout, stderr } = await execPromise(params.command);
          
          let result = '';
          if (stdout) result += `STDOUT:\n${stdout}\n`;
          if (stderr) result += `STDERR:\n${stderr}\n`;
          
          return result || 'Command executed successfully (no output)';
        } catch (error: any) {
          logger.error(`Shell execution error: ${error.message}`);
          return `Error executing command: ${error.message}\n${error.stderr || ''}`;
        }
      },
    });

    // Environment Context Tool
    this.registerTool({
      name: 'get_working_directory',
      description: 'Get the current working directory of the process',
      parameters: {},
      execute: async () => {
        return `Current working directory: ${process.cwd()}`;
      },
    });

    // Web Search Tool (enhanced)
    this.registerTool({
      name: 'search_web',
      description: 'Search the internet for information using DuckDuckGo',
      parameters: {
        query: 'string - the search query',
      },
      execute: async (params: { query: string }) => {
        try {
          logger.info(`Searching web for: ${params.query}`);
          // Using DuckDuckGo html search (simple, no API key needed)
          const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(params.query)}`;
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
          });

          if (!response.ok) return `Error: Could not reach search engine (HTTP ${response.status})`;

          const html = await response.text();
          // Extract results using simple regex (since we don't want heavy dependencies yet)
          const results: string[] = [];
          const resultRegex = /<a class="result__a" rel="noopener" href="([^"]+)">([^<]+)<\/a>/g;
          let match;
          let count = 0;
          
          while ((match = resultRegex.exec(html)) !== null && count < 5) {
            results.push(`${count + 1}. ${match[2]}\n   URL: ${match[1]}`);
            count++;
          }

          if (results.length === 0) {
            return `No results found for "${params.query}". Try a different query.`;
          }

          return `Search results for "${params.query}":\n\n${results.join('\n\n')}\n\nTip: You can use 'web_search' with a URL from these results to read more details.`;
        } catch (error: any) {
          logger.error('Search error:', error);
          return `Error performing search: ${error.message}`;
        }
      },
    });

    // Web Search Tool (simple fetch)
    this.registerTool({
      name: 'web_search',
      description: 'Fetch content from a URL or search the web',
      parameters: {
        query: 'string - URL to fetch (must start with http:// or https://)',
      },
      execute: async (params: { query: string }) => {
        try {
          // Check if it's a URL
          if (!params.query.startsWith('http://') && !params.query.startsWith('https://')) {
            return 'Error: Please provide a valid URL starting with http:// or https://';
          }

          logger.info(`Fetching URL: ${params.query}`);
          
          const response = await fetch(params.query, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; AI-Office-Bot/1.0)',
            },
          });

          if (!response.ok) {
            return `Error: HTTP ${response.status} - ${response.statusText}`;
          }

          const contentType = response.headers.get('content-type') || '';
          
          // Handle HTML content
          if (contentType.includes('text/html')) {
            const html = await response.text();
            // Simple text extraction - remove HTML tags
            const text = html
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            
            // Limit response size
            const limitedText = text.slice(0, 8000);
            return `Content from ${params.query}:\n\n${limitedText}${text.length > 8000 ? '\n\n[Content truncated...]' : ''}`;
          }
          
          // Handle plain text
          if (contentType.includes('text/plain')) {
            const text = await response.text();
            const limitedText = text.slice(0, 8000);
            return `Content from ${params.query}:\n\n${limitedText}${text.length > 8000 ? '\n\n[Content truncated...]' : ''}`;
          }

          return `Error: Unsupported content type: ${contentType}`;
        } catch (error) {
          logger.error('Web search error:', error);
          return `Error fetching URL: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    });

    logger.info(`Registered ${this.tools.size} tools`);
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
    
    if (tools.length === 0) {
      return 'No tools available';
    }
    
    return tools
      .map((tool) => {
        const params = Object.entries(tool.parameters)
          .map(([key, desc]) => `  - ${key}: ${desc}`)
          .join('\n');
        return `${tool.name}:\n  ${tool.description}\n  Parameters:\n${params}`;
      })
      .join('\n\n');
  }

  async executeTool(name: string, params: any): Promise<string> {
    const tool = this.getTool(name);
    if (!tool) {
      return `Tool "${name}" not found`;
    }

    try {
      return await tool.execute(params);
    } catch (error) {
      logger.error(`Tool execution error (${name}):`, error);
      return `Error executing tool: ${error}`;
    }
  }
}
