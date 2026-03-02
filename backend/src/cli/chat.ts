#!/usr/bin/env node
import readline from 'readline';
import io from 'socket.io-client';
import chalk from 'chalk';
import { logger } from '../utils/logger';

interface Agent {
  id: string;
  name: string;
  status: string;
}

interface Session {
  sessionKey: string;
  channel: string;
  userId: string;
  agentId: string;
  lastActivity: Date;
  messageCount: number;
}

class ChatCLI {
  private socket: any;
  private rl: readline.Interface;
  private currentAgent: Agent | null = null;
  private currentSession: Session | null = null;
  private agents: Agent[] = [];
  private sessions: Session[] = [];
  private connected: boolean = false;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('> '),
    });

    this.setupReadline();
  }

  async connect(wsUrl: string = 'http://localhost:4001'): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(chalk.blue(`\n🔌 Connecting to gateway at ${wsUrl}...\n`));

      this.socket = io(wsUrl);

      this.socket.on('connect', () => {
        this.connected = true;
        console.log(chalk.green('✅ Connected to gateway\n'));
        resolve();
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
        console.log(chalk.red('\n❌ Disconnected from gateway'));
      });

      this.socket.on('connect_error', (error: Error) => {
        console.log(chalk.red(`\n❌ Connection error: ${error.message}`));
        reject(error);
      });

      this.socket.on('agents:list', (data: { agents: Agent[] }) => {
        this.agents = data.agents;
        console.log(chalk.blue(`📋 Loaded ${this.agents.length} agent(s)\n`));
        
        // Auto-select if only one agent
        if (this.agents.length === 1 && !this.currentAgent) {
          this.autoSelectAgent(this.agents[0]);
        } else if (this.agents.length > 1 && !this.currentAgent) {
          this.showAgents();
          console.log(chalk.yellow('💡 Multiple agents available. Type /agent <id> to select one.\n'));
        } else {
          this.showAgents();
        }
      });

      this.socket.on('sessions:list', (data: { sessions: Session[] }) => {
        this.sessions = data.sessions;
        if (this.sessions.length > 0) {
          console.log(chalk.blue(`\n📋 Active sessions: ${this.sessions.length}`));
          this.showSessions();
        }
      });

      this.socket.on('task:result', (data: { agentId: string; sessionKey: string; result: string }) => {
        console.log(chalk.green(`\n🤖 ${this.currentAgent?.name || 'Agent'}:`));
        console.log(chalk.white(data.result));
        console.log('');
        this.rl.prompt();
      });

      this.socket.on('task:error', (data: { agentId: string; error: string }) => {
        console.log(chalk.red(`\n❌ Error: ${data.error}\n`));
        this.rl.prompt();
      });

      this.socket.on('agent:status', (data: { agentId: string; status: string; sessionKey?: string }) => {
        if (data.agentId === this.currentAgent?.id) {
          if (data.status === 'thinking') {
            process.stdout.write(chalk.yellow('🤔 Thinking...'));
          } else if (data.status === 'working') {
            process.stdout.write(chalk.yellow('\r🔧 Working...'));
          }
        }
      });
    });
  }

  private setupReadline(): void {
    this.rl.on('line', async (line: string) => {
      const input = line.trim();

      if (!input) {
        this.rl.prompt();
        return;
      }

      // Handle commands
      if (input.startsWith('/')) {
        await this.handleCommand(input);
        return;
      }

      // Send message to agent
      if (!this.currentAgent) {
        console.log(chalk.yellow('⚠️  Please select an agent first with /agent <id>'));
        this.rl.prompt();
        return;
      }

      if (!this.currentSession) {
        console.log(chalk.yellow('⚠️  No session selected. Creating CLI session...'));
        // Create CLI session
        this.currentSession = {
          sessionKey: `cli:local:${this.currentAgent.id}`,
          channel: 'cli',
          userId: 'local',
          agentId: this.currentAgent.id,
          lastActivity: new Date(),
          messageCount: 0,
        };
      }

      this.socket.emit('task:create', {
        agentId: this.currentAgent.id,
        description: input,
        sessionKey: this.currentSession.sessionKey,
      });
    });

    this.rl.on('close', () => {
      console.log(chalk.blue('\n👋 Goodbye!'));
      process.exit(0);
    });
  }

  private async handleCommand(command: string): Promise<void> {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case '/help':
        this.showHelp();
        break;

      case '/agents':
        this.showAgents();
        break;

      case '/agent':
        if (args.length === 0) {
          console.log(chalk.yellow('Usage: /agent <agent-id>'));
        } else {
          this.selectAgent(args[0]);
        }
        break;

      case '/sessions':
        this.showSessions();
        break;

      case '/session':
        if (args.length === 0) {
          console.log(chalk.yellow('Usage: /session <session-key>'));
        } else {
          this.selectSession(args.join(' '));
        }
        break;

      case '/new':
        this.createNewSession();
        break;

      case '/status':
        this.showStatus();
        break;

      case '/clear':
        console.clear();
        this.showWelcome();
        break;

      case '/exit':
      case '/quit':
        this.rl.close();
        break;

      default:
        console.log(chalk.red(`Unknown command: ${cmd}`));
        console.log(chalk.yellow('Type /help for available commands'));
    }

    this.rl.prompt();
  }

  private showWelcome(): void {
    console.log(chalk.cyan(`
╔═══════════════════════════════════════╗
║     🤖 AI Agent Platform - CLI        ║
╚═══════════════════════════════════════╝

Welcome to the AI Agent CLI!

Type /help to see available commands.
Type /agents to see available agents.
Type /sessions to see active sessions.
    `));
  }

  private showHelp(): void {
    console.log(chalk.cyan(`
📚 Available Commands:

Agent Management:
  /agents              - List all agents
  /agent <id>          - Select an agent
  /status              - Show current status

Session Management:
  /sessions            - List all active sessions
  /session <key>       - Switch to a session (CLI or Telegram)
  /new                 - Create new CLI session

Utility:
  /help                - Show this help
  /clear               - Clear screen
  /exit, /quit         - Exit CLI

Chat:
  Just type your message to chat with the selected agent!
    `));
  }

  private showAgents(): void {
    if (this.agents.length === 0) {
      console.log(chalk.yellow('No agents available'));
      return;
    }

    console.log(chalk.cyan('\n📋 Available Agents:\n'));
    this.agents.forEach((agent) => {
      const selected = this.currentAgent?.id === agent.id ? chalk.green('→ ') : '  ';
      const statusEmoji = agent.status === 'idle' ? '🟢' : agent.status === 'thinking' ? '🔵' : '🟡';
      console.log(`${selected}${statusEmoji} ${chalk.bold(agent.name)} (ID: ${chalk.dim(agent.id)}) - ${agent.status}`);
    });
    console.log('');
  }

  private showSessions(): void {
    if (this.sessions.length === 0) {
      console.log(chalk.yellow('\nNo active sessions. Type /new to create a CLI session.\n'));
      return;
    }

    console.log(chalk.cyan('\n📋 Active Sessions:\n'));
    this.sessions.forEach((session) => {
      const selected = this.currentSession?.sessionKey === session.sessionKey ? chalk.green('→ ') : '  ';
      const channelEmoji = session.channel === 'cli' ? '💻' : session.channel === 'telegram' ? '📱' : '🌐';
      console.log(`${selected}${channelEmoji} ${chalk.bold(session.sessionKey)}`);
      console.log(`   Messages: ${session.messageCount}, Last: ${new Date(session.lastActivity).toLocaleString()}`);
    });
    console.log('');
  }

  private autoSelectAgent(agent: Agent): void {
    this.currentAgent = agent;
    console.log(chalk.green(`✅ Auto-selected agent: ${chalk.bold(agent.name)}`));

    // Auto-create CLI session
    this.currentSession = {
      sessionKey: `cli:local:${agent.id}`,
      channel: 'cli',
      userId: 'local',
      agentId: agent.id,
      lastActivity: new Date(),
      messageCount: 0,
    };

    console.log(chalk.blue(`📝 Created CLI session\n`));
    console.log(chalk.cyan(`💬 You can start chatting now! Type your message or /help for commands.\n`));
  }

  private selectAgent(agentId: string): void {
    const agent = this.agents.find((a) => a.id === agentId);
    if (!agent) {
      console.log(chalk.red(`Agent ${agentId} not found`));
      return;
    }

    this.currentAgent = agent;
    console.log(chalk.green(`✅ Selected agent: ${agent.name}`));

    // Check if there's a CLI session for this agent
    const cliSession = this.sessions.find(
      (s) => s.channel === 'cli' && s.agentId === agentId
    );

    if (cliSession) {
      this.currentSession = cliSession;
      console.log(chalk.blue(`📝 Using existing CLI session: ${cliSession.sessionKey}`));
    } else {
      console.log(chalk.yellow('💡 No CLI session found. Type /new to create one, or /session to select a Telegram session.'));
    }
  }

  private selectSession(sessionKey: string): void {
    const session = this.sessions.find((s) => s.sessionKey === sessionKey);
    if (!session) {
      console.log(chalk.red(`Session ${sessionKey} not found`));
      return;
    }

    this.currentSession = session;
    
    // Also select the agent if not already selected
    if (!this.currentAgent || this.currentAgent.id !== session.agentId) {
      const agent = this.agents.find((a) => a.id === session.agentId);
      if (agent) {
        this.currentAgent = agent;
      }
    }

    const channelName = session.channel === 'cli' ? 'CLI' : session.channel === 'telegram' ? 'Telegram' : 'Web';
    console.log(chalk.green(`✅ Switched to ${channelName} session: ${sessionKey}`));
    console.log(chalk.blue(`📝 You can now continue the conversation from ${channelName}`));
  }

  private createNewSession(): void {
    if (!this.currentAgent) {
      console.log(chalk.yellow('⚠️  Please select an agent first with /agent <id>'));
      return;
    }

    this.currentSession = {
      sessionKey: `cli:local:${this.currentAgent.id}`,
      channel: 'cli',
      userId: 'local',
      agentId: this.currentAgent.id,
      lastActivity: new Date(),
      messageCount: 0,
    };

    console.log(chalk.green(`✅ Created new CLI session: ${this.currentSession.sessionKey}`));
  }

  private showStatus(): void {
    console.log(chalk.cyan('\n📊 Current Status:\n'));
    console.log(`Connected: ${this.connected ? chalk.green('Yes') : chalk.red('No')}`);
    console.log(`Agent: ${this.currentAgent ? chalk.green(this.currentAgent.name) : chalk.yellow('None')}`);
    console.log(`Session: ${this.currentSession ? chalk.green(this.currentSession.sessionKey) : chalk.yellow('None')}`);
    console.log('');
  }

  async start(): Promise<void> {
    try {
      await this.connect();
      this.showWelcome();
      this.rl.prompt();
    } catch (error) {
      console.error(chalk.red('Failed to connect to gateway:'), error);
      console.log(chalk.yellow('\nMake sure the gateway is running: npm run gateway'));
      process.exit(1);
    }
  }
}

// Run chat if called directly
if (require.main === module) {
  const chat = new ChatCLI();
  chat.start();
}

export { ChatCLI };
