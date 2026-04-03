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
      label: ' {bold}CONVERSATION{/bold} ',
      border: { type: 'line' },
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      vi: true,
      padding: {
        left: 1,
        right: 3, // Space for scrollbar
        top: 0,
        bottom: 0,
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

      this.logMessage(`{blue-fg}{bold}You:{/bold}{/blue-fg} ${this.wrapText(text, (this.screen.width as number) - 8)}`);
      this.socket.emit('task:create', {
        agentId: this.currentAgent.id,
        description: text,
        sessionKey: this.sessionKey,
      });
    } else {
      this.logMessage('{red-fg}Error:{/red-fg} Not connected or no agent selected.');
    }
  }

  private wrapText(text: string, maxWidth: number): string {
    if (text.length <= maxWidth) return text;
    
    const words = text.split(' ');
    let result = '';
    let currentLine = '';
    
    for (const word of words) {
      if ((currentLine + ' ' + word).length > maxWidth) {
        if (currentLine) {
          result += (result ? '\n  ' : '') + currentLine;
          currentLine = word;
        } else {
          // Word is too long, truncate it
          result += (result ? '\n  ' : '') + word.slice(0, maxWidth - 3) + '...';
          currentLine = '';
        }
      } else {
        currentLine = currentLine ? currentLine + ' ' + word : word;
      }
    }
    if (currentLine) {
      result += (result ? '\n  ' : '') + currentLine;
    }
    
    return result;
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
          if (data.params) {
            const paramsStr = JSON.stringify(data.params);
            const maxWidth = (this.screen.width as number) - 8; // Account for borders and padding
            const truncatedParams = paramsStr.length > maxWidth ? 
              paramsStr.slice(0, maxWidth - 3) + '...' : paramsStr;
            this.logMessage(`    {gray-fg}Params: ${truncatedParams}{/gray-fg}`);
          }
        }
        // Remove thought display here - we'll only show the final result
        
        if (data.result) {
          const maxWidth = (this.screen.width as number) - 8;
          const cleanResult = data.result.replace(/\n/g, ' ').trim();
          const truncatedResult = cleanResult.length > maxWidth ? 
            cleanResult.slice(0, maxWidth - 3) + '...' : cleanResult;
          this.logMessage(`    {green-fg}✅ Result: ${truncatedResult}{/green-fg}`);
        }
      }
    });

    this.socket.on('task:result', (data: { result: string }) => {
      const maxWidth = (this.screen.width as number) - 8; // Account for borders and padding
      const agentPrefix = `🤖 ${this.currentAgent?.name || 'Agent'}: `;
      const prefixLength = agentPrefix.length;
      
      // Clean the result text
      const cleanResult = data.result.replace(/\n/g, ' ').trim();
      
      // Split into words
      const words = cleanResult.split(' ');
      let lines = [];
      let currentLine = '';
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const testLine = currentLine ? currentLine + ' ' + word : word;
        const lineWidth = i === 0 ? prefixLength + testLine.length : testLine.length + 2; // +2 for indent
        
        if (lineWidth > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      
      if (currentLine) {
        lines.push(currentLine);
      }
      
      // Display the lines
      if (lines.length > 0) {
        this.logMessage(`{magenta-fg}{bold}${agentPrefix}{/bold}{/magenta-fg}${lines[0]}`);
        for (let i = 1; i < lines.length && i < 8; i++) { // Show up to 8 lines
          this.logMessage(`  ${lines[i]}`);
        }
        if (lines.length > 8) {
          this.logMessage(`  {gray-fg}... (${lines.length - 8} more lines){/gray-fg}`);
        }
      }
      
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
