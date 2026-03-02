import TelegramBot from 'node-telegram-bot-api';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../../utils/logger';
import { AgentRuntime } from '../../agents/AgentRuntime';
import { SessionManager } from '../session/SessionManager';

export class TelegramBotService {
  private bots: Map<string, TelegramBot> = new Map();
  private agentRuntime: AgentRuntime;
  private sessionManager: SessionManager;
  private io: SocketIOServer;

  constructor(agentRuntime: AgentRuntime, sessionManager: SessionManager, io: SocketIOServer) {
    this.agentRuntime = agentRuntime;
    this.sessionManager = sessionManager;
    this.io = io;
    this.initializeBots();
  }

  private async initializeBots(): Promise<void> {
    const agents = this.agentRuntime.getAllAgents();
    
    if (agents.length === 0) {
      logger.info('No agents found, skipping Telegram bot initialization');
      return;
    }

    let botsInitialized = 0;
    
    for (const agent of agents) {
      // Each agent should have its own telegram token in AGENT.md
      const token = agent.telegram?.token || process.env[`TELEGRAM_BOT_TOKEN_${agent.id.toUpperCase()}`];
      
      if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
        logger.info(`No Telegram token for agent ${agent.id}, skipping`);
        continue;
      }

      // Check if telegram is enabled for this agent
      if (agent.telegram?.enabled === false) {
        logger.info(`Telegram disabled for agent ${agent.id}, skipping`);
        continue;
      }

      try {
        const bot = new TelegramBot(token, { polling: true });
        this.bots.set(agent.id, bot);
        this.setupHandlersForAgent(bot, agent.id);
        botsInitialized++;
        logger.info(`✅ Telegram bot initialized for agent ${agent.id}`);
      } catch (error) {
        logger.error(`Failed to initialize Telegram bot for agent ${agent.id}:`, error);
      }
    }

    if (botsInitialized === 0) {
      logger.warn('No Telegram bots initialized. Configure tokens in AGENT.md files.');
    } else {
      logger.info(`✅ Initialized ${botsInitialized} Telegram bot(s)`);
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

    // Help command
    bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      await this.handleCommand(chatId, '/help', agentId);
    });

    // Status command
    bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id;
      await this.handleCommand(chatId, '/status', agentId);
    });

    // Context command
    bot.onText(/\/context/, async (msg) => {
      const chatId = msg.chat.id;
      await this.handleCommand(chatId, '/context', agentId);
    });

    // Clear command
    bot.onText(/\/clear/, async (msg) => {
      const chatId = msg.chat.id;
      await this.handleCommand(chatId, '/clear', agentId);
    });

    // Model command
    bot.onText(/\/model(.*)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const args = match?.[1]?.trim() || '';
      await this.handleCommand(chatId, `/model ${args}`, agentId);
    });

    // Provider command
    bot.onText(/\/provider(.*)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const args = match?.[1]?.trim() || '';
      await this.handleCommand(chatId, `/provider ${args}`, agentId);
    });

    // Temperature command
    bot.onText(/\/temperature(.*)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const args = match?.[1]?.trim() || '';
      await this.handleCommand(chatId, `/temperature ${args}`, agentId);
    });

    // Tokens command
    bot.onText(/\/tokens(.*)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const args = match?.[1]?.trim() || '';
      await this.handleCommand(chatId, `/tokens ${args}`, agentId);
    });

    // Memory command
    bot.onText(/\/memory/, async (msg) => {
      const chatId = msg.chat.id;
      await this.handleCommand(chatId, '/memory', agentId);
    });

    // Skills command
    bot.onText(/\/skills/, async (msg) => {
      const chatId = msg.chat.id;
      await this.handleCommand(chatId, '/skills', agentId);
    });

    // Enable command
    bot.onText(/\/enable(.*)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const args = match?.[1]?.trim() || '';
      await this.handleCommand(chatId, `/enable ${args}`, agentId);
    });

    // Disable command
    bot.onText(/\/disable(.*)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const args = match?.[1]?.trim() || '';
      await this.handleCommand(chatId, `/disable ${args}`, agentId);
    });

    // Handle regular messages (non-commands)
    bot.on('message', async (msg) => {
      // Skip if it's a command (already handled by onText)
      if (msg.text?.startsWith('/')) return;

      const chatId = msg.chat.id;
      const text = msg.text;

      if (!text) return;

      try {
        await bot.sendChatAction(chatId, 'typing');

        // Create or get session for this Telegram user
        const session = this.sessionManager.getOrCreateSession('telegram', chatId.toString(), agentId);
        logger.info(`Processing message for session: ${session.sessionKey}`);

        // Broadcast status to frontend
        this.io.emit('agent:status', { agentId, status: 'thinking', sessionKey: session.sessionKey });

        const result = await this.agentRuntime.executeTask(agentId, {
          id: Date.now().toString(),
          agentId,
          userId: chatId.toString(),
          description: text,
          status: 'pending',
          createdAt: new Date(),
        }, session.sessionKey); // Pass session key

        // Update session activity
        this.sessionManager.updateSessionActivity(session.sessionKey);

        // Broadcast status to frontend
        this.io.emit('agent:status', { 
          agentId, 
          status: this.agentRuntime.getAgent(agentId)?.status || 'idle',
          sessionKey: session.sessionKey
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

  private async handleCommand(chatId: number, commandText: string, agentId: string): Promise<void> {
    const bot = this.bots.get(agentId);
    if (!bot) return;

    try {
      const agent = this.agentRuntime.getAgent(agentId);
      if (!agent) {
        await bot.sendMessage(chatId, '❌ Agent not found');
        return;
      }

      // Create or get session for this Telegram user
      const session = this.sessionManager.getOrCreateSession('telegram', chatId.toString(), agentId);

      const result = await this.agentRuntime.executeTask(agentId, {
        id: Date.now().toString(),
        agentId,
        userId: chatId.toString(),
        description: commandText,
        status: 'pending',
        createdAt: new Date(),
      }, session.sessionKey); // Pass session key

      // Update session activity
      this.sessionManager.updateSessionActivity(session.sessionKey);

      await bot.sendMessage(chatId, result, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error(`Command error for agent ${agentId}:`, error);
      await bot.sendMessage(chatId, '❌ Error executing command');
    }
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
