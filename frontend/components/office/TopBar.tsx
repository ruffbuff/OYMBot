"use client";

import { useAgentStore } from "@/store/useAgentStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, TrendingUp, AlertTriangle, Zap, Wifi, WifiOff } from "lucide-react";

export function TopBar() {
  const systemStatus = useAgentStore((state) => state.systemStatus);
  const panicMode = useAgentStore((state) => state.panicMode);
  const connected = useAgentStore((state) => state.connected);
  const simulateRequest = useAgentStore((state) => state.simulateRequest);
  const simulateLoadSpike = useAgentStore((state) => state.simulateLoadSpike);
  const simulateError = useAgentStore((state) => state.simulateError);
  const triggerPanic = useAgentStore((state) => state.triggerPanic);

  const getSystemStatusVariant = () => {
    if (panicMode) return "destructive";
    switch (systemStatus) {
      case "normal": return "secondary";
      case "high-load": return "default";
      case "error": return "destructive";
      default: return "secondary";
    }
  };

  return (
    <div className="h-16 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold text-white">AI Office Dashboard</h1>
        <Badge variant={getSystemStatusVariant()}>
          {panicMode ? "🚨 PANIC MODE" : `System: ${systemStatus}`}
        </Badge>
        <Badge variant={connected ? "default" : "destructive"} className="flex items-center gap-1">
          {connected ? (
            <>
              <Wifi className="w-3 h-3" />
              Connected
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3" />
              Disconnected
            </>
          )}
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={simulateRequest} variant="default" disabled={!connected}>
          <Send className="w-4 h-4 mr-2" />
          Send Request
        </Button>
        <Button onClick={simulateLoadSpike} variant="outline" disabled={!connected}>
          <TrendingUp className="w-4 h-4 mr-2" />
          Load Spike
        </Button>
        <Button onClick={simulateError} variant="destructive" disabled={!connected}>
          <AlertTriangle className="w-4 h-4 mr-2" />
          Trigger Error
        </Button>
        <Button 
          onClick={triggerPanic} 
          variant="destructive"
          className="bg-red-600 hover:bg-red-700 animate-pulse"
          disabled={!connected}
        >
          <Zap className="w-4 h-4 mr-2" />
          PANIC MODE
        </Button>
      </div>
    </div>
  );
}
