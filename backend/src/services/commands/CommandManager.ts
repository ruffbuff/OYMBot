import { AgentConfig } from '../../types/agent.js';
import { MemoryManager } from '../memory/MemoryManager.js';
import { ToolManager } from '../tools/ToolManager.js';
import { logger } from '../../utils/logger.js';

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
  sessionKey: string; // Added sessionKey
  agent: AgentConfig;
  memoryManager: MemoryManager;
  toolManager: ToolManager;
}

export class CommandManager {
  private commands: Map<string, Command> = new Map();

  constructor() {
    this.registerDefaultCommands();
  }

  private registerDefaultCommands(): void {
    // Approve command for dangerous tools
    this.registerCommand({
      name: 'approve',
      description: 'Approve a dangerous action',
      aliases: ['/approve'],
      execute: async (args, ctx) => {
        if (args.length === 0) {
          return '❌ Please provide the action hash to approve: /approve <hash>';
        }
        const hash = args[0];

        ctx.toolManager.approveAction(hash);
        return `✅ Action approved! The agent will now execute it on its next attempt. You can ask it to proceed.`;
      },
    });

    // Status commands
    this.registerCommand({
      name: 'status',
      description: 'Show agent status and configuration',
      aliases: ['/status'],
      execute: async (args, ctx) => {
        const { agent } = ctx;
        // Load context for THIS specific session
        const context = await ctx.memoryManager.loadContext(agent.id, ctx.sessionKey);
        const contextSize = context.length;
        const maxSize = 50000;
        const percentage = Math.round((contextSize / maxSize) * 100);

        return `📊 Agent Status

**Name:** ${agent.name}
**Status:** ${agent.status}
**Session:** ${ctx.sessionKey}
**Model:** ${agent.llm.provider}/${agent.llm.model}

**Context Usage:**
- Size: ${contextSize} / ${maxSize} bytes (${percentage}%)
- Remaining: ${maxSize - contextSize} bytes`;
      },
    });

    this.registerCommand({
      name: 'help',
      description: 'Show available commands',
      aliases: ['/help'],
      execute: async () => {
        return `📚 Available Commands: /status, /clear, /model, /configure, /help`;
      },
    });

    this.registerCommand({
      name: 'clear',
      description: 'Clear context',
      aliases: ['/clear'],
      execute: async (args, ctx) => {
        // Clear ONLY the current session context
        await ctx.memoryManager.updateContext(ctx.agentId, '# Session Context\n\n', ctx.sessionKey);
        return `✅ Context cleared for session: ${ctx.sessionKey}`;
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
          return `🤖 Current Model\n**Provider:** ${agent.llm.provider}\n**Model:** ${agent.llm.model}`;
        }

        const modelRef = args[0];
        const parts = modelRef.split('/');

        if (parts.length < 2) {
          return '❌ Invalid format. Use: `/model <provider>/<model>`';
        }

        const provider = parts[0];
        const model = parts.slice(1).join('/');

        const validProviders = ['openai', 'openrouter', 'ollama', 'anthropic'];
        if (!validProviders.includes(provider)) {
          return `❌ Invalid provider. Choose from: ${validProviders.join(', ')}`;
        }

        const agent = await ctx.memoryManager.loadAgent(ctx.agentId);
        agent.llm.provider = provider as any;
        agent.llm.model = model;

        await ctx.memoryManager.createAgent(agent);

        return `✅ Model changed to ${provider}/${model}`;
      },
    });

    // Configure integrations (Firecrawl, etc.)
    this.registerCommand({
      name: 'configure',
      description: 'Configure integrations. Usage: /configure firecrawl <api_key> | /configure show',
      aliases: ['/configure'],
      execute: async (args, _ctx) => {
        if (args.length === 0 || args[0] === 'show') {
          const firecrawlSet = !!process.env.FIRECRAWL_API_KEY;
          const openaiSet = !!process.env.OPENAI_API_KEY;
          const openrouterSet = !!process.env.OPENROUTER_API_KEY;
          const anthropicSet = !!process.env.ANTHROPIC_API_KEY;
          return `⚙️ Integration Status\n\n` +
            `🔥 Firecrawl: ${firecrawlSet ? '✅ Configured' : '❌ Not set — /configure firecrawl <key>'}\n` +
            `🤖 OpenAI: ${openaiSet ? '✅ Configured' : '❌ Not set'}\n` +
            `🔀 OpenRouter: ${openrouterSet ? '✅ Configured' : '❌ Not set'}\n` +
            `🧠 Anthropic: ${anthropicSet ? '✅ Configured' : '❌ Not set'}\n\n` +
            `Get Firecrawl key: https://firecrawl.dev`;
        }

        const integration = args[0].toLowerCase();
        const value = args[1];

        if (!value) return `❌ Usage: /configure ${integration} <value>`;

        if (integration === 'firecrawl') {
          // Write to .env file
          const envPath = new URL('../../../../.env', import.meta.url).pathname;
          try {
            const { readFileSync, writeFileSync } = await import('fs');
            let envContent = '';
            try { envContent = readFileSync(envPath, 'utf-8'); } catch { /* new file */ }

            if (envContent.includes('FIRECRAWL_API_KEY=')) {
              envContent = envContent.replace(/FIRECRAWL_API_KEY=.*/g, `FIRECRAWL_API_KEY=${value}`);
            } else {
              envContent += `\n# Firecrawl\nFIRECRAWL_API_KEY=${value}\n`;
            }
            writeFileSync(envPath, envContent, 'utf-8');
            process.env.FIRECRAWL_API_KEY = value;
            return `✅ Firecrawl API key saved. Tools firecrawl_scrape and firecrawl_crawl are now available.`;
          } catch (e: any) {
            // Fallback: just set in process.env for this session
            process.env.FIRECRAWL_API_KEY = value;
            return `✅ Firecrawl key set for this session (could not write to .env: ${e.message}). Restart gateway to persist.`;
          }
        }

        return `❌ Unknown integration: ${integration}. Available: firecrawl`;
      },
    });

    logger.info(`Registered ${this.commands.size} commands`);
  }

  registerCommand(command: Command): void {
    this.commands.set(command.name, command);
    if (command.aliases) {
      for (const alias of command.aliases) {
        const cleanAlias = alias.startsWith('/') ? alias.slice(1) : alias;
        this.commands.set(cleanAlias, command);
      }
    }
  }

  async executeCommand(commandText: string, context: CommandContext): Promise<string | null> {
    const parts = commandText.trim().split(/\s+/);
    const commandName = parts[0].startsWith('/') ? parts[0].slice(1) : parts[0];
    const args = parts.slice(1);
    const command = this.commands.get(commandName);
    if (!command) return null;
    try {
      return await command.execute(args, context);
    } catch (error) {
      return `❌ Error: ${error}`;
    }
  }

  isCommand(text: string): boolean {
    const name = text.trim().split(/\s+/)[0];
    const clean = name.startsWith('/') ? name.slice(1) : name;
    return this.commands.has(clean);
  }
}
