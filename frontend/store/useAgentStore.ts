import { create } from 'zustand';
import { Agent, AgentStatus, AgentStep } from '@/types/agent';
import { wsClient } from '@/lib/websocket';

interface Session {
  sessionKey: string;
  channel: 'cli' | 'telegram' | 'web' | 'whatsapp' | 'discord';
  userId: string;
  agentId: string;
  lastActivity: Date;
  messageCount: number;
}

interface AgentStore {
  agents: Agent[];
  sessions: Session[];
  selectedAgentId: string | null;
  selectedSessionKey: string | null;
  systemStatus: 'normal' | 'high-load' | 'error';
  panicMode: boolean;
  connected: boolean;
  // Live steps per agent (cleared on task:result)
  agentSteps: Record<string, AgentStep[]>;
  
  // Actions
  setAgents: (agents: Agent[]) => void;
  setSessions: (sessions: Session[]) => void;
  setAgentStatus: (id: string, status: AgentStatus, task?: string) => void;
  setAgentEnergy: (id: string, energy: number) => void;
  selectAgent: (id: string | null) => void;
  selectSession: (sessionKey: string | null) => void;
  setSystemStatus: (status: 'normal' | 'high-load' | 'error') => void;
  setPanicMode: (panic: boolean) => void;
  setConnected: (connected: boolean) => void;
  addAgentStep: (step: AgentStep) => void;
  clearAgentSteps: (agentId: string) => void;
  
  // WebSocket actions
  connectWebSocket: () => void;
  sendTask: (agentId: string, description: string, sessionKey: string) => void;
  
  // Simulations (for testing)
  simulateRequest: () => void;
  simulateLoadSpike: () => void;
  simulateError: () => void;
  triggerPanic: () => void;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  sessions: [],
  selectedAgentId: null,
  selectedSessionKey: null,
  systemStatus: 'normal',
  panicMode: false,
  connected: false,
  agentSteps: {},

  setAgents: (agents) => set({ agents }),

  setSessions: (sessions) => set({ sessions }),

  setAgentStatus: (id, status, task) =>
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === id ? { ...agent, status, currentTask: task } : agent
      ),
    })),

  setAgentEnergy: (id, energy) =>
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === id ? { ...agent, energy: Math.max(0, Math.min(100, energy)) } : agent
      ),
    })),

  selectAgent: (id) => set({ selectedAgentId: id }),

  selectSession: (sessionKey) => set({ selectedSessionKey: sessionKey }),

  setSystemStatus: (status) => set({ systemStatus: status }),

  setPanicMode: (panic) => set({ panicMode: panic }),

  setConnected: (connected) => set({ connected }),

  addAgentStep: (step) =>
    set((state) => ({
      agentSteps: {
        ...state.agentSteps,
        [step.agentId]: [...(state.agentSteps[step.agentId] || []), step],
      },
    })),

  clearAgentSteps: (agentId) =>
    set((state) => ({
      agentSteps: { ...state.agentSteps, [agentId]: [] },
    })),

  connectWebSocket: () => {
    const socket = wsClient.connect();

    socket.on('connect', () => {
      get().setConnected(true);
    });

    socket.on('disconnect', () => {
      get().setConnected(false);
    });

    // Receive agents list
    socket.on('agents:list', (data: { agents: Agent[] }) => {
      console.log('Received agents:', data.agents);
      get().setAgents(data.agents);
    });

    // Receive sessions list
    socket.on('sessions:list', (data: { sessions: Session[] }) => {
      console.log('Received sessions:', data.sessions);
      get().setSessions(data.sessions);
    });

    // Agent status updates
    socket.on('agent:status', (data: { agentId: string; status: AgentStatus; sessionKey?: string }) => {
      console.log('Agent status update:', data);
      get().setAgentStatus(data.agentId, data.status);
    });

    // Task result
    socket.on('task:result', (data: { agentId: string; sessionKey: string; result: string }) => {
      console.log('Task result:', data);
      get().clearAgentSteps(data.agentId);
      // Emit event for chat component
      window.dispatchEvent(new CustomEvent('agent-response', { 
        detail: { agentId: data.agentId, sessionKey: data.sessionKey, message: data.result } 
      }));
    });

    // Task error
    socket.on('task:error', (data: { agentId: string; error: string }) => {
      console.error('Task error:', data);
      get().clearAgentSteps(data.agentId);
      get().setAgentStatus(data.agentId, 'error');
    });

    // Agent step (real-time thoughts/tool calls)
    socket.on('agent:step', (data: AgentStep) => {
      get().addAgentStep(data);
      // Also update agent status to 'working' while steps are coming in
      get().setAgentStatus(data.agentId, 'working');
    });
  },

  sendTask: (agentId, description, sessionKey) => {
    const socket = wsClient.getSocket();
    if (socket?.connected) {
      socket.emit('task:create', { agentId, description, sessionKey });
    } else {
      console.error('WebSocket not connected');
    }
  },

  simulateRequest: () => {
    const { agents, sessions, sendTask } = get();
    const availableAgents = agents.filter((a) => a.status === 'idle' && a.energy > 10);
    if (availableAgents.length === 0 || sessions.length === 0) return;

    const agent = availableAgents[Math.floor(Math.random() * availableAgents.length)];
    const session = sessions[0]; // Use first session
    sendTask(agent.id, 'Process this request', session.sessionKey);
  },

  simulateLoadSpike: () => {
    const { agents, sessions, sendTask, setSystemStatus } = get();
    const availableAgents = agents.filter((a) => a.status === 'idle' && a.energy > 10);
    if (sessions.length === 0) return;

    const session = sessions[0];
    availableAgents.slice(0, 3).forEach((agent) => {
      sendTask(agent.id, 'Handle load spike', session.sessionKey);
    });

    setSystemStatus('high-load');
    setTimeout(() => get().setSystemStatus('normal'), 5000);
  },

  simulateError: () => {
    const { agents, setAgentStatus, setSystemStatus } = get();
    const workingAgents = agents.filter((a) => a.status !== 'offline');
    if (workingAgents.length === 0) return;

    const agent = workingAgents[Math.floor(Math.random() * workingAgents.length)];
    setAgentStatus(agent.id, 'error', 'System error occurred');
    setSystemStatus('error');

    setTimeout(() => {
      setAgentStatus(agent.id, 'idle');
      get().setSystemStatus('normal');
    }, 3000);
  },

  triggerPanic: () => {
    const { setPanicMode, setSystemStatus } = get();
    setPanicMode(true);
    setSystemStatus('error');

    setTimeout(() => {
      setPanicMode(false);
      setSystemStatus('normal');
    }, 5000);
  },
}));

