export type AgentStatus = "idle" | "thinking" | "working" | "error" | "offline";
export type AgentType = "api-assistant" | "autonomous-agent";

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  energy: number;
  currentTask?: string;
  position: { x: number; y: number };
}

export interface AgentStep {
  agentId: string;
  step: number;
  thought?: string;
  tool?: string;
  params?: Record<string, unknown>;
  result?: string;
  planProgress?: string;
  timestamp: string;
}
