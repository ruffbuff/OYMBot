import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger';

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: any) => Promise<string>;
}

export class ToolManager {
  private tools: Map<string, Tool> = new Map();

  constructor() {
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
      description: 'Write content to a file',
      parameters: {
        path: 'string - file path',
        content: 'string - content to write',
      },
      execute: async (params: { path: string; content: string }) => {
        try {
          await fs.writeFile(params.path, params.content, 'utf-8');
          return `Successfully wrote to ${params.path}`;
        } catch (error) {
          return `Error writing file: ${error}`;
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
