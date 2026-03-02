import { AgentConfig } from '../../types/agent';
import { MemoryManager } from '../memory/MemoryManager';
import { logger } from '../../utils/logger';

export interface Command {
  name: string;
  description: string;
  aliases?: string[];
  execute: (args: string[], context: CommandContext) => Promise<string>;
  requiresAuth?: boolean;
}

export interface CommandContext {
  agentId: string;
  userId: string;
  chatId: string;
  agent: AgentConfig;
  memoryManager: MemoryManager;
}

export class CommandManager {
  private commands: Map<string, Command> = new Map();

  constructor() {
    this.registerDefaultCommands();
  }

  private registerDefaultCommands(): void {
    // Status commands
    this.registerCommand({
      name: 'status',
      description: 'Show agent status and configuration',
      aliases: ['/status'],
      execute: async (args, ctx) => {
        const { agent } = ctx;
        const context = await ctx.memoryManager.loadContext(agent.id);
        const contextSize = context.length;
        const maxSize = 50000;
        const percentage = Math.round((contextSize / maxSize) * 100);

        return `📊 Agent Status

**Name:** ${agent.name}
**Status:** ${agent.status}
**Energy:** ${agent.energy}%
**Model:** ${agent.llm.provider}/${agent.llm.model}

**Context:**
- Size: ${contextSize} / ${maxSize} bytes (${percentage}%)
- Remaining: ${maxSize - contextSize} bytes

**Skills:** ${agent.skills.length > 0 ? agent.skills.join(', ') : 'None'}`;
      },
    });

    // Context commands
    this.registerCommand({
      name: 'context',
      description: 'Show current context size and usage',
      aliases: ['/context'],
      execute: async (args, ctx) => {
        const context = await ctx.memoryManager.loadContext(ctx.agentId);
        const lines = context.split('\n').filter(line => 
          line.startsWith('User:') || line.startsWith('Assistant:')
        );
        const messageCount = lines.length;
        const maxSize = 50000;
        const percentage = Math.round((context.length / maxSize) * 100);

        return `💬 Context Information

**Size:** ${context.length} / ${maxSize} bytes (${percentage}%)
**Messages:** ${messageCount}
**Remaining:** ${maxSize - context.length} bytes

Use \`/clear\` to reset context when it gets too large.`;
      },
    });

    this.registerCommand({
      name: 'clear',
      description: 'Clear current context (start fresh conversation)',
      aliases: ['/clear', '/reset'],
      execute: async (args, ctx) => {
        await ctx.memoryManager.updateContext(ctx.agentId, '# Current Session Context\n\n');
        return '✅ Context cleared! Starting fresh conversation.';
      },
    });

    // Model commands
    this.registerCommand({
      name: 'model',
      description: 'Show or change AI model and provider',
      aliases: ['/model'],
      execute: async (args, ctx) => {
        if (args.length === 0) {
          // Show current model
          const { agent } = ctx;
          return `🤖 Current Model

**Provider:** ${agent.llm.provider}
**Model:** ${agent.llm.model}
**Temperature:** ${agent.llm.temperature}
**Max Tokens:** ${agent.llm.maxTokens}

**Available Providers:**
• openai - OpenAI API
• openrouter - OpenRouter (free tier available)
• ollama - Local Ollama
• anthropic - Anthropic Claude

To change model and provider: \`/model <provider>/<model>\`
Examples:
• \`/model openrouter/anthropic/claude-3-haiku\`
• \`/model openai/gpt-4\`
• \`/model ollama/llama2\``;
        }

        // Change model
        const modelRef = args[0];
        const parts = modelRef.split('/');
        
        if (parts.length < 2) {
          return '❌ Invalid format. Use: `/model <provider>/<model>`\nExample: `/model openrouter/openai/gpt-4`';
        }

        const provider = parts[0];
        const model = parts.slice(1).join('/');

        // Validate provider
        const validProviders = ['openai', 'openrouter', 'ollama', 'anthropic'];
        if (!validProviders.includes(provider)) {
          return `❌ Invalid provider. Choose from: ${validProviders.join(', ')}`;
        }

        // Update agent config
        const agent = await ctx.memoryManager.loadAgent(ctx.agentId);
        agent.llm.provider = provider as any;
        agent.llm.model = model;

        // Save updated config
        await ctx.memoryManager.createAgent(agent); // This updates AGENT.md

        return `✅ Model and provider changed to ${provider}/${model}`;
      },
    });

    // Memory commands
    this.registerCommand({
      name: 'memory',
      description: 'Show long-term memory',
      aliases: ['/memory'],
      execute: async (args, ctx) => {
        const memory = await ctx.memoryManager.loadMemory(ctx.agentId);
        
        if (!memory || memory.trim() === '# Long-term Memory') {
          return '📝 Memory is empty. Important facts will be saved here automatically.';
        }

        const preview = memory.slice(0, 1000);
        const hasMore = memory.length > 1000;

        return `📝 Long-term Memory

${preview}${hasMore ? '\n\n... (truncated)' : ''}

**Total size:** ${memory.length} bytes`;
      },
    });

    // Help command
    this.registerCommand({
      name: 'help',
      description: 'Show available commands',
      aliases: ['/help', '/commands'],
      execute: async (args, ctx) => {
        const commands = this.listCommands(); // Fix: Use listCommands() to avoid duplicates
        const grouped = new Map<string, Command[]>();

        // Group by category (simple grouping)
        for (const cmd of commands) {
          const category = this.getCategoryForCommand(cmd.name);
          if (!grouped.has(category)) {
            grouped.set(category, []);
          }
          grouped.get(category)!.push(cmd);
        }

        let help = '📚 Available Commands\n\n';

        for (const [category, cmds] of grouped) {
          help += `**${category}**\n`;
          for (const cmd of cmds) {
            const aliases = cmd.aliases ? ` (${cmd.aliases.join(', ')})` : '';
            help += `• \`/${cmd.name}\`${aliases} - ${cmd.description}\n`;
          }
          help += '\n';
        }

        return help;
      },
    });

    // Skills command
    this.registerCommand({
      name: 'skills',
      description: 'List available skills/tools',
      aliases: ['/skills', '/tools'],
      execute: async (args, ctx) => {
        const { agent } = ctx;
        
        const tools = [
          { name: 'read_file', description: 'Read contents of a file' },
          { name: 'list_directory', description: 'List files in a directory' },
          { name: 'write_file', description: 'Write content to a file' },
          { name: 'web_search', description: 'Fetch content from a URL' },
        ];

        let response = '🛠 Available Tools\n\n';
        
        for (const tool of tools) {
          const enabled = !agent.tools?.disabled?.includes(tool.name);
          const status = enabled ? '✅' : '❌';
          response += `${status} **${tool.name}** - ${tool.description}\n`;
        }

        if (agent.skills.length > 0) {
          response += '\n**Agent Skills:**\n';
          for (const skill of agent.skills) {
            response += `• ${skill}\n`;
          }
        }

        response += '\n**Commands:**\n';
        response += '• `/enable <tool>` - Enable a tool\n';
        response += '• `/disable <tool>` - Disable a tool\n';

        return response;
      },
    });

    // Enable tool command
    this.registerCommand({
      name: 'enable',
      description: 'Enable a tool',
      aliases: ['/enable'],
      execute: async (args, ctx) => {
        if (args.length === 0) {
          return '❌ Usage: `/enable <tool_name>`\nExample: `/enable web_search`';
        }

        const toolName = args[0];
        const agent = await ctx.memoryManager.loadAgent(ctx.agentId);
        
        if (!agent.tools) {
          agent.tools = { enabled: [], disabled: [] };
        }

        // Remove from disabled list
        agent.tools.disabled = agent.tools.disabled.filter(t => t !== toolName);
        
        // Add to enabled list if not already there
        if (!agent.tools.enabled.includes(toolName)) {
          agent.tools.enabled.push(toolName);
        }

        await ctx.memoryManager.createAgent(agent);
        return `✅ Tool \`${toolName}\` enabled`;
      },
    });

    // Disable tool command
    this.registerCommand({
      name: 'disable',
      description: 'Disable a tool',
      aliases: ['/disable'],
      execute: async (args, ctx) => {
        if (args.length === 0) {
          return '❌ Usage: `/disable <tool_name>`\nExample: `/disable web_search`';
        }

        const toolName = args[0];
        const agent = await ctx.memoryManager.loadAgent(ctx.agentId);
        
        if (!agent.tools) {
          agent.tools = { enabled: [], disabled: [] };
        }

        // Remove from enabled list
        agent.tools.enabled = agent.tools.enabled.filter(t => t !== toolName);
        
        // Add to disabled list if not already there
        if (!agent.tools.disabled.includes(toolName)) {
          agent.tools.disabled.push(toolName);
        }

        await ctx.memoryManager.createAgent(agent);
        return `✅ Tool \`${toolName}\` disabled`;
      },
    });

    logger.info(`Registered ${this.commands.size} commands`);
  }

  private getCategoryForCommand(name: string): string {
    const categories: Record<string, string[]> = {
      'Status': ['status', 'context', 'memory'],
      'Control': ['clear', 'model'],
      'Tools': ['skills', 'enable', 'disable'],
      'Help': ['help'],
    };

    for (const [category, commands] of Object.entries(categories)) {
      if (commands.includes(name)) {
        return category;
      }
    }

    return 'Other';
  }

  registerCommand(command: Command): void {
    this.commands.set(command.name, command);
    
    // Register aliases
    if (command.aliases) {
      for (const alias of command.aliases) {
        const cleanAlias = alias.startsWith('/') ? alias.slice(1) : alias;
        this.commands.set(cleanAlias, command);
      }
    }
  }

  async executeCommand(
    commandText: string,
    context: CommandContext
  ): Promise<string | null> {
    // Parse command
    const parts = commandText.trim().split(/\s+/);
    const commandName = parts[0].startsWith('/') ? parts[0].slice(1) : parts[0];
    const args = parts.slice(1);

    // Find command
    const command = this.commands.get(commandName);
    if (!command) {
      return null; // Not a command
    }

    try {
      logger.info(`Executing command: ${commandName} with args: ${args.join(' ')}`);
      const result = await command.execute(args, context);
      return result;
    } catch (error) {
      logger.error(`Command execution failed: ${commandName}`, error);
      return `❌ Error executing command: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  isCommand(text: string): boolean {
    const commandName = text.trim().split(/\s+/)[0];
    const cleanName = commandName.startsWith('/') ? commandName.slice(1) : commandName;
    return this.commands.has(cleanName);
  }

  listCommands(): Command[] {
    const seen = new Set<string>();
    const commands: Command[] = [];

    for (const [key, command] of this.commands) {
      if (!seen.has(command.name)) {
        seen.add(command.name);
        commands.push(command);
      }
    }

    return commands;
  }
}
