import { create } from 'zustand';
import { Agent, AgentStatus } from '@/types/agent';
import { wsClient } from '@/lib/websocket';

interface AgentStore {
  agents: Agent[];
  selectedAgentId: string | null;
  systemStatus: 'normal' | 'high-load' | 'error';
  panicMode: boolean;
  connected: boolean;
  
  // Actions
  setAgents: (agents: Agent[]) => void;
  setAgentStatus: (id: string, status: AgentStatus, task?: string) => void;
  setAgentEnergy: (id: string, energy: number) => void;
  selectAgent: (id: string | null) => void;
  setSystemStatus: (status: 'normal' | 'high-load' | 'error') => void;
  setPanicMode: (panic: boolean) => void;
  setConnected: (connected: boolean) => void;
  
  // WebSocket actions
  connectWebSocket: () => void;
  sendTask: (agentId: string, description: string) => void;
  
  // Simulations (for testing)
  simulateRequest: () => void;
  simulateLoadSpike: () => void;
  simulateError: () => void;
  triggerPanic: () => void;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  selectedAgentId: null,
  systemStatus: 'normal',
  panicMode: false,
  connected: false,

  setAgents: (agents) => set({ agents }),

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

  setSystemStatus: (status) => set({ systemStatus: status }),

  setPanicMode: (panic) => set({ panicMode: panic }),

  setConnected: (connected) => set({ connected }),

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

    // Agent status updates
    socket.on('agent:status', (data: { agentId: string; status: AgentStatus }) => {
      console.log('Agent status update:', data);
      get().setAgentStatus(data.agentId, data.status);
    });

    // Task result
    socket.on('task:result', (data: { agentId: string; result: string }) => {
      console.log('Task result:', data);
      // Emit event for chat component
      window.dispatchEvent(new CustomEvent('agent-response', { 
        detail: { agentId: data.agentId, message: data.result } 
      }));
    });

    // Task error
    socket.on('task:error', (data: { agentId: string; error: string }) => {
      console.error('Task error:', data);
      get().setAgentStatus(data.agentId, 'error');
    });
  },

  sendTask: (agentId, description) => {
    const socket = wsClient.getSocket();
    if (socket?.connected) {
      socket.emit('task:create', { agentId, description });
    } else {
      console.error('WebSocket not connected');
    }
  },

  simulateRequest: () => {
    const { agents, sendTask } = get();
    const availableAgents = agents.filter((a) => a.status === 'idle' && a.energy > 10);
    if (availableAgents.length === 0) return;

    const agent = availableAgents[Math.floor(Math.random() * availableAgents.length)];
    sendTask(agent.id, 'Process this request');
  },

  simulateLoadSpike: () => {
    const { agents, sendTask, setSystemStatus } = get();
    const availableAgents = agents.filter((a) => a.status === 'idle' && a.energy > 10);

    availableAgents.slice(0, 3).forEach((agent) => {
      sendTask(agent.id, 'Handle load spike');
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

