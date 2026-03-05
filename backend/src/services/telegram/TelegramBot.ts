import TelegramBot from 'node-telegram-bot-api';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../../utils/logger.js';
import { AgentRuntime } from '../../agents/AgentRuntime.js';
import { SessionManager } from '../session/SessionManager.js';

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
      const token = agent.telegram?.token || process.env[`TELEGRAM_BOT_TOKEN_${agent.id.toUpperCase()}`];
      
      if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
        logger.info(`No Telegram token for agent ${agent.id}, skipping`);
        continue;
      }

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

    bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const message = `👋 Hello! I'm ${agent.name}\n\n**Status:** ${agent.status}\n**Model:** ${agent.llm.provider}/${agent.llm.model}\n\nI'm your personal AI assistant. Just send me a message to start chatting!`;
      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    });

    bot.on('message', async (msg) => {
      if (msg.text?.startsWith('/')) return;

      const chatId = msg.chat.id;
      const userId = msg.from?.id.toString();
      const text = msg.text;
      if (!text) return;

      // SECURITY: Check Whitelist
      if (agent.telegram?.allowedUsers && agent.telegram.allowedUsers.length > 0) {
        if (!userId || !agent.telegram.allowedUsers.includes(userId)) {
          logger.warn(`Unauthorized access attempt to agent ${agentId} from User ID: ${userId}`);
          await bot.sendMessage(chatId, `🚫 Access Denied. Your User ID (${userId}) is not authorized.`);
          return;
        }
      }

      try {
        await bot.sendChatAction(chatId, 'typing');
        const session = this.sessionManager.getOrCreateSession('telegram', chatId.toString(), agentId);
        
        this.io.emit('agent:status', { agentId, status: 'thinking', sessionKey: session.sessionKey });

        const result = await this.agentRuntime.executeTask(agentId, {
          id: Date.now().toString(),
          agentId,
          userId: chatId.toString(),
          description: text,
          status: 'pending',
          createdAt: new Date(),
        }, session.sessionKey);

        this.sessionManager.updateSessionActivity(session.sessionKey);

        this.io.emit('agent:status', { 
          agentId, 
          status: this.agentRuntime.getAgent(agentId)?.status || 'idle',
          sessionKey: session.sessionKey
        });

        await bot.sendMessage(chatId, result, { parse_mode: 'Markdown' });
      } catch (error) {
        logger.error(`Telegram message error for agent ${agentId}:`, error);
        this.io.emit('agent:status', { agentId, status: 'error', sessionKey: `telegram:${chatId}:${agentId}` });
        await bot.sendMessage(chatId, '❌ Error processing your message');
      }
    });
  }

  stop(): void {
    for (const [agentId, bot] of this.bots) {
      bot.stopPolling();
      logger.info(`Telegram bot stopped for agent ${agentId}`);
    }
    this.bots.clear();
  }
}
