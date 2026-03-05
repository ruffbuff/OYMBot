import blessed from 'blessed';
import { io } from 'socket.io-client';

// Simple types for our TUI
interface Agent {
  id: string;
  name: string;
  status: string;
}

interface AgentStep {
  step: number;
  thought?: string;
  tool?: string;
  params?: any;
  result?: string;
}

class BlessedTUI {
  private screen: blessed.Widgets.Screen;
  private chatBox: blessed.Widgets.Log;
  private inputField: blessed.Widgets.TextboxElement;
  private header: blessed.Widgets.BoxElement;
  private infoBar: blessed.Widgets.BoxElement;
  private socket: any;
  private currentAgent: Agent | null = null;
  private sessionKey: string = '';

  constructor() {
    // 1. Create screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: '🤖 AI Agent Platform',
      fullUnicode: true,
      mouse: true,
      dockBorders: true, // Better border rendering
    });

    // 2. Create Header (Top)
    this.header = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: ' {bold}🤖 AI AGENT PLATFORM{/bold} | {yellow-fg}Connecting...{/yellow-fg}',
      tags: true,
      border: { type: 'line' },
      style: {
        fg: 'white',
        border: { fg: 'cyan' },
      },
    });

    // 3. Create Main Chat (Center)
    this.chatBox = blessed.log({
      parent: this.screen,
      top: 2, // Overlap with header border slightly for dockBorders
      left: 0,
      width: '100%',
      height: '100%-8',
      label: ' {bold}CONVERSATION & THOUGHTS{/bold} ',
      border: { type: 'line' },
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      vi: true,
      padding: {
        left: 2,
        right: 2, // Space for scrollbar
      },
      scrollbar: {
        ch: ' ',
        track: { bg: 'cyan' },
        style: { inverse: true },
      },
      style: {
        fg: 'white',
        border: { fg: 'blue' },
      },
    });

    // 4. Create Info Bar (Above Input)
    this.infoBar = blessed.box({
      parent: this.screen,
      bottom: 3,
      left: 0,
      width: '100%',
      height: 3,
      content: ' {bold}SYSTEM INFO:{/bold} Loading...',
      tags: true,
      border: { type: 'line' },
      style: {
        fg: 'white',
        border: { fg: 'gray' },
      },
    });

    // 5. Create Input (Bottom)
    this.inputField = blessed.textbox({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      label: ' {bold}MESSAGE{/bold} ',
      border: { type: 'line' },
      inputOnFocus: true,
      tags: true,
      style: {
        fg: 'white',
        border: { fg: 'cyan' },
      },
    });

    // Handle input
    this.inputField.on('submit', (value: string) => {
      this.handleSubmit(value);
      this.inputField.clearValue();
      this.inputField.focus();
      this.screen.render();
    });

    // Exit on Escape or Ctrl+C
    this.screen.key(['escape', 'C-c'], () => {
      if (this.socket) this.socket.close();
      return process.exit(0);
    });

    this.inputField.focus();
    this.screen.render();
  }

  private handleSubmit(text: string) {
    if (!text.trim()) return;

    if (this.socket && this.currentAgent && this.sessionKey) {
      if (text === '/clear') {
        this.chatBox.setContent('');
        this.logMessage('{cyan-fg}Chat cleared in UI. Sending clear command to agent...{/cyan-fg}');
        this.socket.emit('task:create', {
          agentId: this.currentAgent.id,
          description: '/clear',
          sessionKey: this.sessionKey,
        });
        return;
      }
      
      if (text === '/help') {
        this.logMessage('{yellow-fg}Available Commands:{/yellow-fg}\n/clear - Reset context\n/status - Show agent status\n/help - Show this help');
        return;
      }

      this.logMessage(`{blue-fg}{bold}You:{/bold}{/blue-fg} ${text}`);
      this.socket.emit('task:create', {
        agentId: this.currentAgent.id,
        description: text,
        sessionKey: this.sessionKey,
      });
    } else {
      this.logMessage('{red-fg}Error:{/red-fg} Not connected or no agent selected.');
    }
  }

  private logMessage(msg: string) {
    this.chatBox.log(msg);
    this.screen.render();
  }

  private updateHeader() {
    const status = this.currentAgent?.status || 'connecting';
    const statusColor = status === 'idle' ? 'green' : status === 'error' ? 'red' : 'yellow';
    
    this.header.setContent(
      ` {bold}🤖 AI AGENT PLATFORM{/bold} | Agent: {green-fg}${this.currentAgent?.name || 'N/A'}{/green-fg} | Status: {${statusColor}-fg}${status.toUpperCase()}{/${statusColor}-fg}`
    );

    if (this.currentAgent) {
      const agentAny = this.currentAgent as any;
      const model = agentAny.llm?.model || 'N/A';
      const provider = agentAny.llm?.provider || 'N/A';

      this.infoBar.setContent(
        ` {bold}MODEL:{/bold} {cyan-fg}${model}{/cyan-fg} | {bold}PROVIDER:{/bold} {cyan-fg}${provider}{/cyan-fg} | {bold}SESSION:{/bold} {white-fg}${this.sessionKey}{/white-fg}`
      );
    }
    
    this.screen.render();
  }

  public connect(wsUrl: string = 'http://localhost:4001') {
    this.socket = io(wsUrl);

    this.socket.on('connect', () => {
      this.logMessage('{green-fg}✅ Connected to gateway{/green-fg}');
      this.updateHeader();
    });

    this.socket.on('agents:list', (data: { agents: Agent[] }) => {
      if (data.agents.length > 0 && !this.currentAgent) {
        this.currentAgent = data.agents[0];
        this.sessionKey = `cli:local:${this.currentAgent.id}`;
        this.logMessage(`{cyan-fg}ℹ️ Auto-selected agent: ${this.currentAgent.name}{/cyan-fg}`);
        this.updateHeader();
      }
    });

    this.socket.on('agent:status', (data: { agentId: string; status: string }) => {
      if (this.currentAgent && data.agentId === this.currentAgent.id) {
        this.currentAgent.status = data.status;
        this.updateHeader();
      }
    });

    this.socket.on('agent:step', (data: AgentStep & { agentId: string }) => {
      if (this.currentAgent && data.agentId === this.currentAgent.id) {
        if (data.tool) {
          this.logMessage(`  {yellow-fg}⚙️ Step ${data.step}: Using tool "${data.tool}"{/yellow-fg}`);
          if (data.params) this.logMessage(`    {gray-fg}Params: ${JSON.stringify(data.params)}{/gray-fg}`);
        } else if (data.thought) {
          // Display only the first 100 chars of thought to keep it clean, or full if user wants verbose
          this.logMessage(`  {gray-fg}🧠 Thought: ${data.thought.slice(0, 150).replace(/\n/g, ' ')}...{/gray-fg}`);
        }
        
        if (data.result) {
          this.logMessage(`    {green-fg}✅ Result: ${data.result.slice(0, 300).replace(/\n/g, ' ')}...{/green-fg}`);
        }
      }
    });

    this.socket.on('task:result', (data: { result: string }) => {
      this.logMessage(`{magenta-fg}{bold}🤖 ${this.currentAgent?.name || 'Agent'}:{/bold}{/magenta-fg} ${data.result}`);
      this.screen.render();
    });

    this.socket.on('task:error', (data: { error: string }) => {
      this.logMessage(`{red-fg}❌ Error: ${data.error}{/red-fg}`);
      this.screen.render();
    });

    this.socket.on('disconnect', () => {
      this.logMessage('{red-fg}❌ Disconnected from gateway{/red-fg}');
      this.updateHeader();
    });
  }
}

// Start TUI
const tui = new BlessedTUI();
tui.connect();
