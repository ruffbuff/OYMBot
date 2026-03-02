"use client";

import { useEffect } from "react";
import { OfficeScene } from "@/components/office/OfficeScene";
import { AgentPanel } from "@/components/agents/AgentPanel";
import { useAgentStore } from "@/store/useAgentStore";

export default function Home() {
  const agents = useAgentStore((state) => state.agents);
  const connectWebSocket = useAgentStore((state) => state.connectWebSocket);
  const setAgentEnergy = useAgentStore((state) => state.setAgentEnergy);
  const setAgentStatus = useAgentStore((state) => state.setAgentStatus);

  // Connect to WebSocket on mount
  useEffect(() => {
    connectWebSocket();
  }, [connectWebSocket]);

  // Energy restoration for idle agents
  useEffect(() => {
    const interval = setInterval(() => {
      agents.forEach((agent) => {
        if (agent.status === "idle" && agent.energy < 100) {
          setAgentEnergy(agent.id, agent.energy + 1);
        }
        if (agent.energy < 10 && agent.status !== "offline") {
          setAgentStatus(agent.id, "offline");
        }
        if (agent.energy >= 10 && agent.status === "offline") {
          setAgentStatus(agent.id, "idle");
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [agents, setAgentEnergy, setAgentStatus]);

  return (
    <div className="h-screen flex overflow-hidden bg-slate-950 gap-4 p-4">
      <div className="flex-[7] bg-slate-950 rounded-lg overflow-hidden">
        <OfficeScene />
      </div>
      <div className="flex-[3] rounded-lg overflow-hidden">
        <AgentPanel />
      </div>
    </div>
  );
}
