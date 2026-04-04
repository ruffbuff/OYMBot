import express, { Express } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer, Server as HTTPServer } from 'http';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { logger } from '../utils/logger.js';
import { MemoryManager } from '../services/memory/MemoryManager.js';
import { LLMManager } from '../services/llm/LLMManager.js';
import { AgentRuntime } from '../agents/AgentRuntime.js';
import { SessionManager } from '../services/session/SessionManager.js';
import { TelegramBotService } from '../services/telegram/TelegramBot.js';
import { buildControlUiHtml } from './controlUi.js';

interface ServerConfig {
  port: number;
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
        origin: '*', // Allow all origins for simpler development
        methods: ['GET', 'POST'],
      },
    });

    // Initialize services
    const agentsDir = process.env.AGENTS_DIR || path.join(process.cwd(), 'agents');
    this.memoryManager = new MemoryManager(agentsDir);
    this.llmManager = new LLMManager();
    this.sessionManager = new SessionManager(agentsDir);
    this.agentRuntime = new AgentRuntime(this.memoryManager, this.llmManager, this.sessionManager);

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

    // Live sync frontend when new subagents are spawned or configurations change
    this.agentRuntime.onAgentStateChange = () => {
      this.io.emit('agents:list', {
        agents: this.agentRuntime.getAllAgents().map((agent) => ({
          id: agent.id,
          name: agent.name,
          type: agent.type,
          status: agent.status,
          energy: agent.energy,
          llm: agent.llm,
          position: { x: 0, y: 0 },
        })),
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
    // Control UI — served at root
    this.app.get('/', (_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(buildControlUiHtml(this.config.port));
    });

    // Health check
    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Get all agents
    this.app.get('/api/agents', (_req, res) => {
      const agents = this.agentRuntime.getAllAgents().map((agent) => ({
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        energy: agent.energy,
        llm: agent.llm,
        position: { x: 0, y: 0 },
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

    // Route a message to the best available agent
    this.app.post('/api/route', async (req, res) => {
      try {
        const { message, preferredAgentId, channel = 'web', userId = 'api-user' } = req.body;
        if (!message) return res.status(400).json({ error: 'message is required' });

        const agent = this.agentRuntime.routeMessage(message, preferredAgentId);
        if (!agent) return res.status(503).json({ error: 'No agents available' });

        const session = this.sessionManager.getOrCreateSession(channel, userId, agent.id);

        const result = await this.agentRuntime.executeTask(agent.id, {
          id: Date.now().toString(),
          agentId: agent.id,
          userId,
          description: message,
          status: 'pending',
          createdAt: new Date(),
        }, session.sessionKey);

        this.sessionManager.updateSessionActivity(session.sessionKey);
        res.json({ agentId: agent.id, agentName: agent.name, sessionKey: session.sessionKey, result });
      } catch (error) {
        logger.error('Route failed:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Routing failed' });
      }
    });

    // --- Cron Jobs ---
    // List all cron jobs
    this.app.get('/api/cron', async (_req, res) => {
      try {
        const jobs = await (this.memoryManager as any).getAllCronJobs();
        res.json({ jobs });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch cron jobs' });
      }
    });

    // Create a cron job
    this.app.post('/api/cron', async (req, res) => {
      try {
        const { agentId, description, intervalMinutes } = req.body;
        if (!agentId || !description || !intervalMinutes) {
          return res.status(400).json({ error: 'agentId, description, intervalMinutes are required' });
        }
        if (!this.agentRuntime.getAgent(agentId)) {
          return res.status(404).json({ error: 'Agent not found' });
        }
        await this.memoryManager.scheduleCronJob(agentId, description, intervalMinutes);
        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to create cron job:', error);
        res.status(500).json({ error: 'Failed to create cron job' });
      }
    });

    // Delete a cron job
    this.app.delete('/api/cron/:id', async (req, res) => {
      try {
        await (this.memoryManager as any).deleteCronJob(parseInt(req.params.id, 10));
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: 'Failed to delete cron job' });
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
          llm: agent.llm,
          position: { x: 0, y: 0 },
        })),
      });

      // Send active sessions
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

      // Handle task creation
      socket.on('task:create', async (data: { agentId: string; description: string; sessionKey: string }) => {
        try {
          if (!data.sessionKey) {
            socket.emit('task:error', { agentId: data.agentId, error: 'Session key is required.' });
            return;
          }

          const sessionInfo = SessionManager.parseSessionKey(data.sessionKey);
          if (!sessionInfo) {
            socket.emit('task:error', { agentId: data.agentId, error: 'Invalid session key.' });
            return;
          }

          const session = this.sessionManager.getOrCreateSession(
            sessionInfo.channel,
            sessionInfo.userId,
            sessionInfo.agentId
          );

          // Broadcast status update
          this.io.emit('agent:status', {
            agentId: data.agentId,
            status: 'thinking',
            sessionKey: session.sessionKey,
          });

          const result = await this.agentRuntime.executeTask(data.agentId, {
            id: Date.now().toString(),
            agentId: data.agentId,
            userId: session.userId,
            description: data.description,
            status: 'pending',
            createdAt: new Date(),
          }, session.sessionKey);

          this.sessionManager.updateSessionActivity(session.sessionKey);

          socket.emit('task:result', {
            agentId: data.agentId,
            sessionKey: session.sessionKey,
            result,
          });

          this.io.emit('agent:status', {
            agentId: data.agentId,
            status: this.agentRuntime.getAgent(data.agentId)?.status || 'idle',
            sessionKey: session.sessionKey,
          });
        } catch (error) {
          logger.error('Task execution failed:', error);
          this.io.emit('agent:status', { agentId: data.agentId, status: 'error', sessionKey: data.sessionKey });
          socket.emit('task:error', { agentId: data.agentId, error: error instanceof Error ? error.message : 'Task execution failed' });
        }
      });

      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });
  }

  async start(): Promise<void> {
    await this.agentRuntime.initialize();
    this.telegramBot = new TelegramBotService(this.agentRuntime, this.sessionManager, this.io);

    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, () => {
        logger.info(`✅ Gateway server listening on port ${this.config.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.telegramBot) this.telegramBot.stop();
    return new Promise((resolve) => {
      this.io.close(() => {
        this.httpServer.close(() => {
          logger.info('Gateway server stopped');
          resolve();
        });
      });
    });
  }
}
