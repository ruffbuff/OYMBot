export type AgentStatus = 'idle' | 'thinking' | 'working' | 'error' | 'offline';
export type AgentType = 'api-assistant' | 'autonomous-agent';
export type LLMProvider = 'openai' | 'ollama' | 'anthropic' | 'openrouter';

export interface AgentConfig {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  energy: number;
  llm: {
    provider: LLMProvider;
    model: string;
    apiKey?: string;
    endpoint?: string;
    temperature: number;
    maxTokens: number;
  };
  skills: string[];
  personality?: string;
  capabilities?: string[];
  tools?: {
    enabled: string[]; // List of enabled tool names
    disabled: string[]; // List of disabled tool names
  };
  telegram?: {
    token: string;
    enabled: boolean;
    allowedUsers?: string[]; // List of user IDs or usernames
  };
  whatsapp?: {
    enabled: boolean;
  };
  discord?: {
    token: string;
    enabled: boolean;
  };
}

export interface Message {
  id: string;
  agentId: string;
  userId: string;
  platform: 'telegram' | 'whatsapp' | 'web';
  direction: 'incoming' | 'outgoing';
  content: string;
  timestamp: Date;
}

export interface Task {
  id: string;
  agentId: string;
  userId: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  createdAt: Date;
  completedAt?: Date;
}

// Planner types for autonomous task execution
export interface AgentStep {
  id: number;
  action: string; // tool name: shell_exec, write_file, read_file, etc.
  params: Record<string, any>;
  description: string; // human-readable description
  validation?: string; // how to verify success
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: string;
  error?: string;
}

export interface AgentPlan {
  id: string;
  taskDescription: string;
  steps: AgentStep[];
  currentStepIndex: number;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}
