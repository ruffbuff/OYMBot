import TelegramBot from 'node-telegram-bot-api';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../../utils/logger';
import { AgentRuntime } from '../../agents/AgentRuntime';

export class TelegramBotService {
  private bots: Map<string, TelegramBot> = new Map();
  private agentRuntime: AgentRuntime;
  private io: SocketIOServer;
  private enabled: boolean;

  constructor(agentRuntime: AgentRuntime, io: SocketIOServer) {
    this.agentRuntime = agentRuntime;
    this.io = io;
    this.enabled = process.env.TELEGRAM_ENABLED === 'true';

    if (this.enabled) {
      this.initializeBots();
    } else {
      logger.info('Telegram bot disabled');
    }
  }

  private async initializeBots(): Promise<void> {
    const agents = this.agentRuntime.getAllAgents();
    
    for (const agent of agents) {
      // Each agent should have its own telegram token in AGENT.md
      const token = agent.telegram?.token || process.env[`TELEGRAM_BOT_TOKEN_${agent.id.toUpperCase()}`];
      
      if (!token) {
        logger.warn(`No Telegram token for agent ${agent.id}, skipping`);
        continue;
      }

      try {
        const bot = new TelegramBot(token, { polling: true });
        this.bots.set(agent.id, bot);
        this.setupHandlersForAgent(bot, agent.id);
        logger.info(`Telegram bot initialized for agent ${agent.id}`);
      } catch (error) {
        logger.error(`Failed to initialize Telegram bot for agent ${agent.id}:`, error);
      }
    }

    if (this.bots.size === 0) {
      logger.warn('No Telegram bots initialized');
    }
  }

  private setupHandlersForAgent(bot: TelegramBot, agentId: string): void {
    const agent = this.agentRuntime.getAgent(agentId);
    if (!agent) return;

    // Start command - show agent info
    bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      
      const message = `👋 Hello! I'm ${agent.name}

**Status:** ${agent.status}
**Model:** ${agent.llm.provider}/${agent.llm.model}

I'm your personal AI assistant. Just send me a message to start chatting!

Available commands:
• /help - Show all commands
• /status - Show my current status
• /context - Check conversation context
• /clear - Start a fresh conversation
• /model - View or change AI model

Type /help for more information.`;

      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    });

    // Handle regular messages
    bot.on('message', async (msg) => {
      // Skip if it's a command (will be handled by command handlers)
      if (msg.text?.startsWith('/')) return;

      const chatId = msg.chat.id;
      const text = msg.text;

      if (!text) return;

      try {
        await bot.sendChatAction(chatId, 'typing');

        // Broadcast status to frontend
        this.io.emit('agent:status', { agentId, status: 'thinking' });

        const result = await this.agentRuntime.executeTask(agentId, {
          id: Date.now().toString(),
          agentId,
          userId: chatId.toString(),
          description: text,
          status: 'pending',
          createdAt: new Date(),
        });

        // Broadcast status to frontend
        this.io.emit('agent:status', { 
          agentId, 
          status: this.agentRuntime.getAgent(agentId)?.status || 'idle'
        });

        await bot.sendMessage(chatId, result, {
          parse_mode: 'Markdown',
        });
      } catch (error) {
        logger.error(`Telegram message error for agent ${agentId}:`, error);
        await bot.sendMessage(chatId, '❌ Error processing your message');
      }
    });

    logger.info(`Telegram bot handlers setup complete for agent ${agentId}`);
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'idle': return '🟢';
      case 'thinking': return '🔵';
      case 'working': return '🟡';
      case 'error': return '🔴';
      case 'offline': return '⚫';
      default: return '⚪';
    }
  }

  stop(): void {
    for (const [agentId, bot] of this.bots) {
      try {
        bot.stopPolling();
        logger.info(`Telegram bot stopped for agent ${agentId}`);
      } catch (error) {
        logger.error(`Error stopping bot for agent ${agentId}:`, error);
      }
    }
    this.bots.clear();
  }
}
