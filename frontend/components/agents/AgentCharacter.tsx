"use client";

import { motion } from "framer-motion";
import { Agent } from "@/types/agent";
import { useAgentStore } from "@/store/useAgentStore";
import { useState, useEffect } from "react";

interface AgentCharacterProps {
  agent: Agent;
  deskPosition: { x: number; y: number }; // in percentages
  managerPosition: { x: number; y: number }; // in percentages
}

// Movement patterns for idle agents
const idlePatterns = [
  // Pattern 1: Walk around desk area
  (desk: { x: number; y: number }) => [
    { x: desk.x - 8, y: desk.y - 5 },
    { x: desk.x + 8, y: desk.y - 5 },
    { x: desk.x + 8, y: desk.y + 5 },
    { x: desk.x - 8, y: desk.y + 5 },
  ],
  // Pattern 2: Go to random office spots
  () => [
    { x: 30 + Math.random() * 40, y: 30 + Math.random() * 40 },
    { x: 20 + Math.random() * 60, y: 25 + Math.random() * 50 },
  ],
  // Pattern 3: Visit meeting area and return
  (desk: { x: number; y: number }) => [
    { x: 50, y: 52 },
    { x: desk.x, y: desk.y },
  ],
  // Pattern 4: Walk to plants/decorations
  (desk: { x: number; y: number }) => {
    const spots = [
      { x: 8, y: 25 },
      { x: 92, y: 25 },
      { x: 12, y: 92 },
      { x: 90, y: 92 },
    ];
    const randomSpot = spots[Math.floor(Math.random() * spots.length)];
    return [randomSpot, { x: desk.x, y: desk.y }];
  },
];

// Agent dialogue lines
const agentDialogues: Record<string, string[]> = {
  "Clawbot": [
    "Processing request...",
    "Analyzing patterns",
    "Running diagnostics",
    "Optimizing workflow",
    "Task completed!",
  ],
  "Researcher": [
    "Gathering data...",
    "Cross-referencing sources",
    "Compiling findings",
    "Interesting discovery!",
    "Research complete",
  ],
  "SupportAI": [
    "How can I help?",
    "Checking tickets...",
    "Resolving issue",
    "Customer satisfied!",
    "Ready for next task",
  ],
};

export function AgentCharacter({ agent, deskPosition, managerPosition }: AgentCharacterProps) {
  const selectAgent = useAgentStore((state) => state.selectAgent);
  const selectedAgentId = useAgentStore((state) => state.selectedAgentId);
  const panicMode = useAgentStore((state) => state.panicMode);
  const [position, setPosition] = useState(deskPosition);
  const [currentPattern, setCurrentPattern] = useState<{ x: number; y: number }[]>([]);
  const [patternIndex, setPatternIndex] = useState(0);
  const [dialogue, setDialogue] = useState<string | null>(null);

  // Show dialogue occasionally
  useEffect(() => {
    if (agent.status === "working" || agent.status === "thinking") {
      const dialogues = agentDialogues[agent.name] || ["Working...", "Processing..."];
      const randomDialogue = dialogues[Math.floor(Math.random() * dialogues.length)];
      setDialogue(randomDialogue);

      const timeout = setTimeout(() => {
        setDialogue(null);
      }, 3000 + Math.random() * 2000); // Show for 3-5 seconds

      return () => clearTimeout(timeout);
    } else {
      setDialogue(null);
    }
  }, [agent.status, agent.name]);

  // Movement logic based on status
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    // PANIC MODE - everyone runs around frantically
    if (panicMode) {
      const panicPattern = Array.from({ length: 8 }, () => ({
        x: 10 + Math.random() * 80,
        y: 10 + Math.random() * 80,
      }));
      setCurrentPattern(panicPattern);
      setPatternIndex(0);
      setPosition(panicPattern[0]);

      let currentIndex = 0;
      interval = setInterval(() => {
        currentIndex = (currentIndex + 1) % panicPattern.length;
        setPatternIndex(currentIndex);
        setPosition(panicPattern[currentIndex]);
      }, 400 + Math.random() * 300);
      
      return () => {
        if (interval) clearInterval(interval);
      };
    }

    switch (agent.status) {
      case "idle":
        // Pick a random pattern and start walking
        const pattern = idlePatterns[Math.floor(Math.random() * idlePatterns.length)](deskPosition);
        setCurrentPattern(pattern);
        
        // Start at random point in pattern
        const startIndex = Math.floor(Math.random() * pattern.length);
        setPatternIndex(startIndex);
        setPosition(pattern[startIndex]);

        // Move through pattern waypoints with individual timing
        let currentIndex = startIndex;
        const baseDelay = 7000; // 7 seconds base
        const randomDelay = Math.random() * 4000; // 0-4 seconds random
        
        interval = setInterval(() => {
          currentIndex = (currentIndex + 1) % pattern.length;
          setPatternIndex(currentIndex);
          setPosition(pattern[currentIndex]);
        }, baseDelay + randomDelay);
        break;

      case "thinking":
        setPosition(deskPosition);
        break;

      case "working":
        setPosition(deskPosition);
        break;

      case "error":
        setPosition(managerPosition);
        break;

      case "offline":
        setPosition(deskPosition);
        break;

      default:
        setPosition(deskPosition);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [agent.status, deskPosition, managerPosition, panicMode]);

  const getStatusColor = () => {
    switch (agent.status) {
      case "idle": return "#10b981";
      case "thinking": return "#3b82f6";
      case "working": return "#f59e0b";
      case "error": return "#ef4444";
      case "offline": return "#6b7280";
      default: return "#10b981";
    }
  };

  const getAnimation = () => {
    // Panic mode - frantic movement
    if (panicMode) {
      return {
        rotate: [-10, 10, -10, 10, -10],
        scale: [1, 1.1, 0.9, 1.1, 1],
        y: [0, -5, 0, -5, 0],
        transition: { duration: 0.5, repeat: Infinity },
      };
    }

    switch (agent.status) {
      case "idle":
        // Gentle walking animation - subtle bounce
        return {
          y: [0, -2, 0, -2, 0],
          rotate: [-1, 1, -1, 1, -1],
          transition: { duration: 2, repeat: Infinity, ease: "easeInOut" },
        };
      case "thinking":
        // Walking to desk with thinking animation
        return {
          y: [0, -5, 0],
          transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
        };
      case "working":
        // Sitting at desk - typing motion
        return {
          rotate: [-3, 3, -3],
          scale: [1, 1.05, 1],
          transition: { duration: 0.6, repeat: Infinity },
        };
      case "error":
        // Walking to manager with error shake
        return {
          x: [-2, 2, -2, 2, 0],
          y: [0, -3, 0, -3, 0],
          transition: { duration: 0.8, repeat: Infinity },
        };
      case "offline":
        return { 
          opacity: 0.3,
          scale: 0.9,
        };
      default:
        return {};
    }
  };

  // Calculate walking animation based on movement
  const isMoving = agent.status === "idle" || agent.status === "thinking" || agent.status === "error";
  const isSelected = selectedAgentId === agent.id;

  // Movement speed based on mode
  const movementDuration = panicMode ? 0.5 : (agent.status === "idle" ? 4 : 2);

  return (
    <motion.div
      className="absolute cursor-pointer z-10 hover:z-20"
      animate={{
        left: `${position.x}%`,
        top: `${position.y}%`,
      }}
      transition={{
        duration: movementDuration,
        ease: panicMode ? "linear" : "easeInOut",
      }}
      style={{
        transform: "translate(-50%, -50%)",
      }}
      onClick={(e) => {
        e.stopPropagation();
        selectAgent(isSelected ? null : agent.id);
      }}
    >
      <motion.div
        className="relative transition-transform hover:scale-110"
        animate={getAnimation()}
      >
        {/* Character Body with better styling */}
        <div
          className="w-20 h-24 rounded-full relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${getStatusColor()}, ${getStatusColor()}dd)`,
            boxShadow: isSelected
              ? `0 0 30px ${getStatusColor()}, 0 0 60px ${getStatusColor()}80`
              : `0 6px 15px rgba(0,0,0,0.4)`,
          }}
        >
          {/* Body shine effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-full" />
          
          {/* Face area */}
          <div className="absolute top-5 left-1/2 transform -translate-x-1/2 w-14 h-14 bg-white/10 rounded-full" />
          
          {/* Eyes */}
          <div className="absolute top-7 left-4 w-4 h-4 bg-white rounded-full shadow-inner">
            <div className="absolute inset-0.5 bg-white rounded-full" />
          </div>
          <div className="absolute top-7 right-4 w-4 h-4 bg-white rounded-full shadow-inner">
            <div className="absolute inset-0.5 bg-white rounded-full" />
          </div>
          
          {/* Pupils with slight movement */}
          <motion.div
            className="absolute top-8 left-5 w-2 h-2 bg-black rounded-full"
            animate={{
              x: [0, 1, 0, -1, 0],
              y: [0, 1, 0, -1, 0],
            }}
            transition={{ duration: 4, repeat: Infinity }}
          />
          <motion.div
            className="absolute top-8 right-5 w-2 h-2 bg-black rounded-full"
            animate={{
              x: [0, 1, 0, -1, 0],
              y: [0, 1, 0, -1, 0],
            }}
            transition={{ duration: 4, repeat: Infinity }}
          />

          {/* Mouth expressions based on status */}
          {agent.status === "working" && (
            <motion.div
              className="absolute bottom-7 left-1/2 transform -translate-x-1/2 w-6 h-3 border-b-2 border-white rounded-full"
              animate={{ scaleX: [1, 0.8, 1] }}
              transition={{ duration: 0.5, repeat: Infinity }}
            />
          )}
          {agent.status === "idle" && (
            <div className="absolute bottom-7 left-1/2 transform -translate-x-1/2 w-6 h-2 bg-white/80 rounded-full" />
          )}
          {agent.status === "error" && (
            <div className="absolute bottom-7 left-1/2 transform -translate-x-1/2 w-6 h-3 border-t-2 border-white rounded-full" />
          )}

          {/* Body details - arms/hands */}
          <div className="absolute bottom-2 left-1 w-3 h-6 bg-black/20 rounded-full" />
          <div className="absolute bottom-2 right-1 w-3 h-6 bg-black/20 rounded-full" />
        </div>

        {/* Status Indicator */}
        {agent.status === "thinking" && (
          <motion.div
            className="absolute -top-8 left-1/2 transform -translate-x-1/2 flex gap-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2.5 h-2.5 bg-blue-400 rounded-full"
                animate={{ y: [0, -10, 0] }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </motion.div>
        )}

        {agent.status === "working" && (
          <motion.div
            className="absolute -top-3 -right-3 w-8 h-8 bg-amber-400 rounded-full"
            animate={{ 
              scale: [1, 1.3, 1], 
              opacity: [1, 0.6, 1],
              rotate: [0, 180, 360],
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}

        {agent.status === "error" && (
          <motion.div
            className="absolute -top-3 -right-3 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white text-sm font-bold"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          >
            !
          </motion.div>
        )}

        {/* Name Label */}
        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
          <div 
            className={`text-xs font-medium px-3 py-1 rounded-full border transition-all ${
              isSelected 
                ? 'text-white bg-blue-600 border-blue-400 shadow-lg' 
                : 'text-slate-200 bg-slate-800/90 border-slate-600'
            }`}
          >
            {agent.name}
          </div>
        </div>

        {/* Dialogue bubble */}
        {dialogue && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.8 }}
            className="absolute -top-16 left-1/2 transform -translate-x-1/2 whitespace-nowrap"
          >
            <div className="relative bg-white text-slate-800 text-xs px-3 py-2 rounded-lg shadow-lg border border-slate-300">
              {dialogue}
              {/* Speech bubble tail */}
              <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
                <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white" />
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
