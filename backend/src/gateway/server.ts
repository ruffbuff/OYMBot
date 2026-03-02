import express, { Express } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer, Server as HTTPServer } from 'http';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { logger } from '../utils/logger';
import { MemoryManager } from '../services/memory/MemoryManager';
import { LLMManager } from '../services/llm/LLMManager';
import { AgentRuntime } from '../agents/AgentRuntime';
import { SessionManager } from '../services/session/SessionManager';
import { TelegramBotService } from '../services/telegram/TelegramBot';

interface ServerConfig {
  port: number;
  wsPort: number;
}

export class GatewayServer {
  private app: Express;
  private httpServer: HTTPServer;
  private io: SocketIOServer;
  private config: ServerConfig;
  private memoryManager: MemoryManager;
  private llmManager: LLMManager;
  private sessionManager: SessionManager;
  private agentRuntime: AgentRuntime;
  private telegramBot: TelegramBotService | null = null;

  constructor(config: ServerConfig) {
    this.config = config;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
      },
    });

    // Initialize services
    this.memoryManager = new MemoryManager(
      process.env.AGENTS_DIR || path.join(process.cwd(), 'agents')
    );
    this.llmManager = new LLMManager();
    this.sessionManager = new SessionManager(
      process.env.AGENTS_DIR || path.join(process.cwd(), 'agents')
    );
    this.agentRuntime = new AgentRuntime(this.memoryManager, this.llmManager);

    // Setup Agent Step Monitoring (Verbose)
    this.agentRuntime.onStep = (data) => {
      logger.info(`🔄 Agent step detected: ${data.agentId}, step: ${data.step}`);
      // Send thought/action to all connected clients
      this.io.emit('agent:step', {
        agentId: data.agentId,
        step: data.step,
        thought: data.thought,
        tool: data.tool,
        params: data.params,
        result: data.result,
        timestamp: new Date().toISOString()
      });
    };

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(compression());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, _res, next) => {
      logger.info(`${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Get all agents
    this.app.get('/api/agents', (_req, res) => {
      const agents = this.agentRuntime.getAllAgents().map((agent, index) => ({
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        energy: agent.energy,
        position: { x: 0, y: 0 }, // Position handled by frontend
      }));
      res.json({ agents });
    });

    // Get agent by ID
    this.app.get('/api/agents/:id', (req, res) => {
      const agent = this.agentRuntime.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      res.json({ agent });
    });

    // Create agent
    this.app.post('/api/agents', async (req, res) => {
      try {
        await this.agentRuntime.createAgent(req.body);
        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to create agent:', error);
        res.status(500).json({ error: 'Failed to create agent' });
      }
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Send current agents state
      socket.emit('agents:list', {
        agents: this.agentRuntime.getAllAgents().map((agent) => ({
          id: agent.id,
          name: agent.name,
          type: agent.type,
          status: agent.status,
          energy: agent.energy,
          position: { x: 0, y: 0 }, // Position handled by frontend
        })),
      });

      // Send active sessions (CLI + Telegram + other channels)
      socket.emit('sessions:list', {
        sessions: this.sessionManager.getAllSessions().map(session => ({
          sessionKey: session.sessionKey,
          channel: session.channel,
          userId: session.userId,
          agentId: session.agentId,
          lastActivity: session.lastActivity,
          messageCount: session.messageCount,
        })),
      });

      // Handle agent selection
      socket.on('agent:select', (data: { agentId: string }) => {
        logger.info(`Agent selected: ${data.agentId}`);
      });

      // Handle task creation - MUST provide sessionKey (from CLI or Telegram)
      socket.on('task:create', async (data: { agentId: string; description: string; sessionKey: string }) => {
        try {
          // Web MUST select an existing session (CLI or Telegram)
          if (!data.sessionKey) {
            socket.emit('task:error', {
              agentId: data.agentId,
              error: 'Session key is required. Please select a session (CLI or Telegram) first.',
            });
            return;
          }

          const session = this.sessionManager.getSession(data.sessionKey);

          if (!session) {
            socket.emit('task:error', {
              agentId: data.agentId,
              error: `Session ${data.sessionKey} not found. Available sessions: ${this.sessionManager.getAllSessions().map(s => s.sessionKey).join(', ')}`,
            });
            return;
          }

          logger.info(`Web continuing session: ${session.sessionKey} (${session.channel})`);

          // Broadcast status update to all clients
          this.io.emit('agent:status', {
            agentId: data.agentId,
            status: 'thinking',
            sessionKey: session.sessionKey,
          });

          const result = await this.agentRuntime.executeTask(data.agentId, {
            id: Date.now().toString(),
            agentId: data.agentId,
            userId: session.userId, // Use original session userId
            description: data.description,
            status: 'pending',
            createdAt: new Date(),
          }, session.sessionKey); // Continue existing session

          // Update session activity
          this.sessionManager.updateSessionActivity(session.sessionKey);

          socket.emit('task:result', {
            agentId: data.agentId,
            sessionKey: session.sessionKey,
            result,
          });

          // Broadcast final status update to all clients
          this.io.emit('agent:status', {
            agentId: data.agentId,
            status: this.agentRuntime.getAgent(data.agentId)?.status,
            sessionKey: session.sessionKey,
          });

          // Broadcast updated sessions list
          this.io.emit('sessions:list', {
            sessions: this.sessionManager.getAllSessions().map(s => ({
              sessionKey: s.sessionKey,
              channel: s.channel,
              userId: s.userId,
              agentId: s.agentId,
              lastActivity: s.lastActivity,
              messageCount: s.messageCount,
            })),
          });
        } catch (error) {
          logger.error('Task execution failed:', error);
          
          // CRITICAL: Update status to error on frontend
          this.io.emit('agent:status', {
            agentId: data.agentId,
            status: 'error',
            sessionKey: data.sessionKey,
          });

          socket.emit('task:error', {
            agentId: data.agentId,
            error: error instanceof Error ? error.message : 'Task execution failed',
          });
        }
      });

      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });
  }

  async start(): Promise<void> {
    // Initialize agent runtime
    await this.agentRuntime.initialize();

    // Initialize Telegram bot with SessionManager
    this.telegramBot = new TelegramBotService(this.agentRuntime, this.sessionManager, this.io);

    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, () => {
        logger.info(`✅ Gateway server listening on port ${this.config.port}`);
        logger.info(`WebSocket server ready`);
        logger.info(`Loaded ${this.agentRuntime.getAllAgents().length} agents`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // Stop Telegram bot
    if (this.telegramBot) {
      this.telegramBot.stop();
    }

    return new Promise((resolve) => {
      this.io.close(() => {
        this.httpServer.close(() => {
          logger.info('Gateway server stopped');
          resolve();
        });
      });
    });
  }

  getApp(): Express {
    return this.app;
  }

  getIO(): SocketIOServer {
    return this.io;
  }
}
