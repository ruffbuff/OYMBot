"use client";

import { useState, useEffect } from "react";
import { useAgentStore } from "@/store/useAgentStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Zap, AlertCircle, MessageSquare, Wifi, WifiOff, Send } from "lucide-react";

export function AgentPanel() {
  const agents = useAgentStore((state) => state.agents);
  const selectedAgentId = useAgentStore((state) => state.selectedAgentId);
  const selectAgent = useAgentStore((state) => state.selectAgent);
  const connected = useAgentStore((state) => state.connected);
  const sendTask = useAgentStore((state) => state.sendTask);

  const [showChat, setShowChat] = useState(false);
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: string; content: string }>>([]);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  // Listen for agent responses
  useEffect(() => {
    const handleAgentResponse = (event: CustomEvent) => {
      const { agentId, message } = event.detail;
      if (agentId === selectedAgentId) {
        // Replace "Thinking..." with actual response
        setChatHistory((prev) => {
          const newHistory = [...prev];
          const lastIndex = newHistory.length - 1;
          if (lastIndex >= 0 && newHistory[lastIndex].content === "Thinking...") {
            newHistory[lastIndex] = { role: "agent", content: message };
          } else {
            newHistory.push({ role: "agent", content: message });
          }
          return newHistory;
        });
      }
    };

    window.addEventListener('agent-response', handleAgentResponse as EventListener);
    return () => {
      window.removeEventListener('agent-response', handleAgentResponse as EventListener);
    };
  }, [selectedAgentId]);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "idle": return "secondary";
      case "thinking": return "default";
      case "working": return "default";
      case "error": return "destructive";
      case "offline": return "outline";
      default: return "secondary";
    }
  };

  const getEnergyColor = (energy: number) => {
    if (energy > 70) return "bg-green-500";
    if (energy > 30) return "bg-yellow-500";
    return "bg-red-500";
  };

  const handleSendMessage = () => {
    if (!message.trim() || !selectedAgentId) return;

    // Add user message to chat
    setChatHistory([...chatHistory, { role: "user", content: message }]);

    // Send to agent
    sendTask(selectedAgentId, message);

    // Clear input
    setMessage("");

    // Add placeholder for agent response
    setChatHistory((prev) => [...prev, { role: "agent", content: "Thinking..." }]);
  };

  return (
    <div className="w-full h-full bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex-shrink-0 flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
          <Activity className="w-5 h-5" />
          Agents
        </h2>
        <Badge variant={connected ? "default" : "destructive"} className="flex items-center gap-1">
          {connected ? (
            <>
              <Wifi className="w-3 h-3" />
              Connected
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3" />
              Offline
            </>
          )}
        </Badge>
      </div>

      {/* Agent List or Chat */}
      {!showChat ? (
        <>
          {/* Agent List */}
          <div className="p-4 space-y-3 flex-1 overflow-y-auto">
            {agents.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No agents connected</p>
                <p className="text-xs mt-1">Check backend connection</p>
              </div>
            )}
            {agents.map((agent) => (
              <Card
                key={agent.id}
                className={`cursor-pointer transition-all ${
                  selectedAgentId === agent.id ? "ring-2 ring-blue-500" : ""
                }`}
                onClick={() => selectAgent(agent.id)}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{agent.name}</CardTitle>
                    <Badge variant={getStatusVariant(agent.status)}>
                      {agent.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Zap className="w-3 h-3" />
                    <span>Energy: {agent.energy}%</span>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-700">
                    <div
                      className={`h-full transition-all ${getEnergyColor(agent.energy)}`}
                      style={{ width: `${agent.energy}%` }}
                    />
                  </div>
                  {agent.currentTask && (
                    <div className="text-xs text-slate-400 flex items-start gap-1 mt-2">
                      <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{agent.currentTask}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Action Buttons */}
          {selectedAgent && (
            <div className="p-4 border-t border-slate-700 bg-slate-800 flex-shrink-0 space-y-3">
              <h3 className="font-semibold text-white text-sm">Actions</h3>
              <Button
                onClick={() => setShowChat(true)}
                className="w-full"
                disabled={!connected}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Open Chat
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Chat View */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Chat Header */}
            <div className="p-4 border-b border-slate-700 bg-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white text-sm">{selectedAgent?.name}</h3>
                <p className="text-xs text-slate-400">Chat Session</p>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowChat(false)}
              >
                Close
              </Button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatHistory.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Start a conversation</p>
                </div>
              )}
              {chatHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-700 text-slate-100"
                    }`}
                  >
                    <p className="text-sm">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Chat Input */}
            <div className="p-4 border-t border-slate-700 bg-slate-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 bg-slate-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!connected}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!connected || !message.trim()}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
