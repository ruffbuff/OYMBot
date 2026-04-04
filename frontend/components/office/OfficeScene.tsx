"use client";

import { useAgentStore } from "@/store/useAgentStore";
import { AgentCharacter } from "@/components/agents/AgentCharacter";

export function OfficeScene() {
  const agents = useAgentStore((state) => state.agents);
  const selectAgent = useAgentStore((state) => state.selectAgent);

  // Manager position (top center - where agents go when they have errors)
  const managerPosition = { x: 50, y: 15 };

  // Desk positions in percentages (6 workstations scattered around the office)
  const deskPositions = [
    { x: 20, y: 35 },
    { x: 50, y: 30 },
    { x: 80, y: 35 },
    { x: 25, y: 70 },
    { x: 60, y: 75 },
    { x: 85, y: 70 },
  ];

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg overflow-hidden"
      onClick={() => selectAgent(null)}
    >
      {/* Office Walls */}
      <div className="absolute inset-0 border-8 border-slate-700 rounded-lg" />

      {/* Floor Grid */}
      <div className="absolute inset-0 opacity-5">
        <div className="grid grid-cols-16 grid-rows-12 h-full w-full">
          {Array.from({ length: 192 }).map((_, i) => (
            <div key={i} className="border border-slate-600" />
          ))}
        </div>
      </div>

      {/* Manager Station (top center) */}
      <div
        className="absolute w-40 h-32 bg-gradient-to-br from-purple-900/50 to-purple-800/40 rounded-lg border-2 border-purple-600/60 shadow-xl"
        style={{
          left: `${managerPosition.x}%`,
          top: `${managerPosition.y}%`,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-lg" />
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 text-purple-200 text-xs font-bold flex items-center gap-1">
          <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
          Manager Station
        </div>
        <div className="absolute bottom-2 left-2 w-10 h-8 bg-slate-700/60 rounded shadow-inner" />
        <div className="absolute bottom-2 right-2 w-16 h-10 bg-purple-800/60 rounded border border-purple-600/50 shadow-inner">
          <div className="absolute inset-1 bg-purple-500/20 rounded" />
        </div>
        {/* Decorative elements */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 border-2 border-purple-500/30 rounded-full" />
      </div>

      {/* Desks */}
      {deskPositions.map((pos, index) => (
        <div
          key={`desk-${index}`}
          className="absolute w-32 h-24 bg-gradient-to-br from-amber-900/50 to-amber-800/40 rounded-lg border-2 border-amber-700/60 shadow-xl"
          style={{
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-lg" />
          {/* Desk details */}
          <div className="absolute top-2 left-2 w-8 h-6 bg-slate-700/60 rounded shadow-inner" />
          <div className="absolute top-2 right-2 w-12 h-8 bg-blue-900/40 rounded border border-blue-700/60 shadow-inner">
            <div className="absolute inset-1 bg-blue-500/20 rounded" />
          </div>
          {/* Keyboard */}
          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-16 h-4 bg-slate-800/60 rounded border border-slate-600/50" />
        </div>
      ))}

      {/* Decorative elements - Plants */}
      <div className="absolute left-[8%] top-[25%]">
        <div className="w-16 h-20 bg-gradient-to-b from-green-600/50 to-green-700/40 rounded-full border-2 border-green-500/60 shadow-lg relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-full" />
          <div className="absolute top-1 left-1/2 transform -translate-x-1/2 w-8 h-8 bg-green-500/30 rounded-full" />
        </div>
      </div>
      <div className="absolute right-[8%] top-[25%]">
        <div className="w-16 h-20 bg-gradient-to-b from-green-600/50 to-green-700/40 rounded-full border-2 border-green-500/60 shadow-lg relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-full" />
          <div className="absolute top-1 left-1/2 transform -translate-x-1/2 w-8 h-8 bg-green-500/30 rounded-full" />
        </div>
      </div>
      <div className="absolute left-[12%] bottom-[8%]">
        <div className="w-20 h-24 bg-gradient-to-b from-green-600/50 to-green-700/40 rounded-full border-2 border-green-500/60 shadow-lg relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-full" />
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-10 h-10 bg-green-500/30 rounded-full" />
        </div>
      </div>
      <div className="absolute right-[10%] bottom-[8%]">
        <div className="w-16 h-20 bg-gradient-to-b from-green-600/50 to-green-700/40 rounded-full border-2 border-green-500/60 shadow-lg relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-full" />
          <div className="absolute top-1 left-1/2 transform -translate-x-1/2 w-8 h-8 bg-green-500/30 rounded-full" />
        </div>
      </div>

      {/* Meeting area */}
      <div className="absolute left-1/2 top-[52%] transform -translate-x-1/2 -translate-y-1/2">
        <div className="w-48 h-32 bg-gradient-to-br from-slate-700/40 to-slate-800/30 rounded-lg border-2 border-slate-600/60 shadow-xl relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-lg" />
          {/* Table surface */}
          <div className="absolute inset-4 bg-slate-600/30 rounded border border-slate-500/40" />
        </div>
      </div>

      {/* Agent Characters */}
      {agents.map((agent, index) => (
        <AgentCharacter 
          key={agent.id} 
          agent={agent} 
          deskPosition={deskPositions[index]}
          managerPosition={managerPosition}
        />
      ))}
    </div>
  );
}
