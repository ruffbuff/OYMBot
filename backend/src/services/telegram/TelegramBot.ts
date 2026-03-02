import TelegramBot from 'node-telegram-bot-api';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../../utils/logger';
import { AgentRuntime } from '../../agents/AgentRuntime';

export class TelegramBotService {
  private bot: TelegramBot | null = null;
  private agentRuntime: AgentRuntime;
  private io: SocketIOServer;
  private enabled: boolean;

  constructor(agentRuntime: AgentRuntime, io: SocketIOServer) {
    this.agentRuntime = agentRuntime;
    this.io = io;
    this.enabled = process.env.TELEGRAM_ENABLED === 'true';

    if (this.enabled && process.env.TELEGRAM_BOT_TOKEN) {
      this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
      this.setupHandlers();
      logger.info('Telegram bot initialized');
    } else {
      logger.info('Telegram bot disabled');
    }
  }

  private setupHandlers(): void {
    if (!this.bot) return;

    // Start command
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const agents = this.agentRuntime.getAllAgents();
      
      let message = '🏢 AI Office Platform\n\n';
      message += 'Available agents:\n';
      agents.forEach((agent, idx) => {
        message += `${idx + 1}. ${agent.name} (${agent.status})\n`;
      });
      message += '\nUse /chat <agent-id> <message> to talk to an agent';

      await this.bot!.sendMessage(chatId, message);
    });

    // List agents
    this.bot.onText(/\/agents/, async (msg) => {
      const chatId = msg.chat.id;
      const agents = this.agentRuntime.getAllAgents();

      if (agents.length === 0) {
        await this.bot!.sendMessage(chatId, 'No agents available');
        return;
      }

      let message = '🤖 Active Agents:\n\n';
      agents.forEach((agent) => {
        const statusEmoji = this.getStatusEmoji(agent.status);
        message += `${statusEmoji} ${agent.name}\n`;
        message += `   ID: \`${agent.id}\`\n`;
        message += `   Status: ${agent.status}\n`;
        message += `   Energy: ${agent.energy}%\n\n`;
      });

      await this.bot!.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    });

    // Chat with agent
    this.bot.onText(/\/chat (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const text = match?.[1];

      if (!text) {
        await this.bot!.sendMessage(chatId, 'Usage: /chat <agent-id> <message>');
        return;
      }

      // Parse agent-id and message
      const parts = text.split(' ');
      const agentId = parts[0];
      const message = parts.slice(1).join(' ');

      if (!message) {
        await this.bot!.sendMessage(chatId, 'Please provide a message');
        return;
      }

      const agent = this.agentRuntime.getAgent(agentId);
      if (!agent) {
        await this.bot!.sendMessage(chatId, `Agent "${agentId}" not found`);
        return;
      }

      try {
        // Send "typing" action
        await this.bot!.sendChatAction(chatId, 'typing');

        // Broadcast status to frontend
        this.io.emit('agent:status', { agentId, status: 'thinking' });

        // Execute task
        const result = await this.agentRuntime.executeTask(agentId, {
          id: Date.now().toString(),
          agentId,
          userId: chatId.toString(),
          description: message,
          status: 'pending',
          createdAt: new Date(),
        });

        // Broadcast status to frontend
        this.io.emit('agent:status', { 
          agentId, 
          status: this.agentRuntime.getAgent(agentId)?.status || 'idle'
        });

        // Send response
        await this.bot!.sendMessage(chatId, `🤖 ${agent.name}:\n\n${result}`);
      } catch (error) {
        logger.error('Telegram chat error:', error);
        await this.bot!.sendMessage(chatId, '❌ Error processing your request');
      }
    });

    // Handle regular messages (default to first agent)
    this.bot.on('message', async (msg) => {
      // Skip if it's a command
      if (msg.text?.startsWith('/')) return;

      const chatId = msg.chat.id;
      const text = msg.text;

      if (!text) return;

      const agents = this.agentRuntime.getAllAgents();
      if (agents.length === 0) {
        await this.bot!.sendMessage(chatId, 'No agents available. Use /start to see commands.');
        return;
      }

      // Use first agent by default
      const agent = agents[0];

      try {
        await this.bot!.sendChatAction(chatId, 'typing');

        // Broadcast status to frontend
        this.io.emit('agent:status', { agentId: agent.id, status: 'thinking' });

        const result = await this.agentRuntime.executeTask(agent.id, {
          id: Date.now().toString(),
          agentId: agent.id,
          userId: chatId.toString(),
          description: text,
          status: 'pending',
          createdAt: new Date(),
        });

        // Broadcast status to frontend
        this.io.emit('agent:status', { 
          agentId: agent.id, 
          status: this.agentRuntime.getAgent(agent.id)?.status || 'idle'
        });

        await this.bot!.sendMessage(chatId, result);
      } catch (error) {
        logger.error('Telegram message error:', error);
        await this.bot!.sendMessage(chatId, '❌ Error processing your message');
      }
    });

    logger.info('Telegram bot handlers setup complete');
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
    if (this.bot) {
      this.bot.stopPolling();
      logger.info('Telegram bot stopped');
    }
  }
}
