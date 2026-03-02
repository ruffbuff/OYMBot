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
      description: 'Search the web or fetch a URL',
      parameters: {
        query: 'string - search query or URL',
      },
      execute: async (params: { query: string }) => {
        try {
          // Simple URL fetch for now
          if (params.query.startsWith('http')) {
            const response = await fetch(params.query);
            const text = await response.text();
            // Limit response size
            return text.slice(0, 5000);
          }
          return 'Web search not yet implemented. Use a URL starting with http:// or https://';
        } catch (error) {
          return `Error fetching URL: ${error}`;
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

  getToolsDescription(): string {
    const tools = this.getAllTools();
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
