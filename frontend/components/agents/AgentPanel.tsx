"use client";

import { useState, useEffect, useRef } from "react";
import { useAgentStore } from "@/store/useAgentStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Zap, AlertCircle, MessageSquare, Wifi, WifiOff, Send, Monitor, Smartphone, Terminal, ChevronRight, Wrench, Brain } from "lucide-react";
import { PlanProgress } from "@/components/agents/PlanProgress";

export function AgentPanel() {
  const agents = useAgentStore((state) => state.agents);
  const sessions = useAgentStore((state) => state.sessions);
  const selectedAgentId = useAgentStore((state) => state.selectedAgentId);
  const selectedSessionKey = useAgentStore((state) => state.selectedSessionKey);
  const selectAgent = useAgentStore((state) => state.selectAgent);
  const selectSession = useAgentStore((state) => state.selectSession);
  const connected = useAgentStore((state) => state.connected);
  const sendTask = useAgentStore((state) => state.sendTask);
  const agentSteps = useAgentStore((state) => state.agentSteps);

  const [showChat, setShowChat] = useState(false);
  const [showSessionSelector, setShowSessionSelector] = useState(false);
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: string; content: string; isStep?: boolean }>>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const selectedSession = sessions.find((s) => s.sessionKey === selectedSessionKey);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // Inject live agent steps into chat as they arrive
  useEffect(() => {
    if (!selectedAgentId) return;
    const steps = agentSteps[selectedAgentId] || [];
    if (steps.length === 0) return;

    const lastStep = steps[steps.length - 1];
    const stepContent = formatStep(lastStep);

    setChatHistory((prev) => {
      // Replace "Thinking..." placeholder if present
      const withoutThinking = prev.filter((m) => m.content !== "Thinking...");
      // Avoid duplicate steps
      const alreadyExists = withoutThinking.some((m) => m.isStep && m.content === stepContent);
      if (alreadyExists) return prev;
      return [...withoutThinking, { role: "agent", content: stepContent, isStep: true }];
    });
  }, [agentSteps, selectedAgentId]);

  // Listen for agent responses
  useEffect(() => {
    const handleAgentResponse = (event: CustomEvent) => {
      const { agentId, sessionKey, message } = event.detail;
      if (agentId === selectedAgentId && sessionKey === selectedSessionKey) {
        // Replace last step/thinking with final response
        setChatHistory((prev) => {
          const withoutPending = prev.filter((m) => m.content !== "Thinking...");
          return [...withoutPending, { role: "agent", content: message }];
        });
      }
    };

    window.addEventListener('agent-response', handleAgentResponse as EventListener);
    return () => {
      window.removeEventListener('agent-response', handleAgentResponse as EventListener);
    };
  }, [selectedAgentId, selectedSessionKey]);

  const formatStep = (step: { step: number; thought?: string; tool?: string; params?: Record<string, unknown>; result?: string; planProgress?: string }) => {
    const parts: string[] = [];
    if (step.planProgress) parts.push(`📋 ${step.planProgress}`);
    if (step.thought) parts.push(`💭 ${step.thought}`);
    if (step.tool) {
      const paramsStr = step.params ? ` (${Object.entries(step.params).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join(', ')})` : '';
      parts.push(`🔧 ${step.tool}${paramsStr}`);
    }
    if (step.result) parts.push(`✅ ${step.result.slice(0, 200)}${step.result.length > 200 ? '...' : ''}`);
    return parts.join('\n') || `Step ${step.step}`;
  };

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

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'cli': return <Terminal className="w-4 h-4" />;
      case 'telegram': return <Smartphone className="w-4 h-4" />;
      case 'web': return <Monitor className="w-4 h-4" />;
      default: return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getChannelColor = (channel: string) => {
    switch (channel) {
      case 'cli': return 'bg-purple-500';
      case 'telegram': return 'bg-blue-500';
      case 'web': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const handleSendMessage = () => {
    if (!message.trim() || !selectedAgentId || !selectedSessionKey) return;

    setChatHistory([...chatHistory, { role: "user", content: message }]);
    sendTask(selectedAgentId, message, selectedSessionKey);
    setMessage("");
    // Placeholder until first step arrives
    setChatHistory((prev) => [...prev, { role: "agent", content: "Thinking..." }]);
  };

  const handleOpenChat = () => {
    if (sessions.length === 0) {
      alert('No active sessions. Please start a CLI session or Telegram bot first.');
      return;
    }
    
    if (!selectedSessionKey) {
      setShowSessionSelector(true);
    } else {
      setShowChat(true);
    }
  };

  const handleSelectSession = (sessionKey: string) => {
    selectSession(sessionKey);
    setShowSessionSelector(false);
    setShowChat(true);
    setChatHistory([]); // Clear chat history when switching sessions
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

      {/* Session Selector */}
      {showSessionSelector ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-700 bg-slate-800 flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">Select Session</h3>
            <Button
              variant="outline"
              onClick={() => setShowSessionSelector(false)}
            >
              Cancel
            </Button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {sessions.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No active sessions</p>
                <p className="text-xs mt-1">Start CLI or Telegram bot first</p>
              </div>
            )}
            {sessions.map((session) => (
              <Card
                key={session.sessionKey}
                className="cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                onClick={() => handleSelectSession(session.sessionKey)}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded ${getChannelColor(session.channel)}`}>
                        {getChannelIcon(session.channel)}
                      </div>
                      <div>
                        <CardTitle className="text-sm font-medium">{session.channel.toUpperCase()}</CardTitle>
                        <p className="text-xs text-slate-400">{session.userId}</p>
                      </div>
                    </div>
                    <Badge variant="secondary">{session.messageCount} msgs</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <p className="text-xs text-slate-400">
                    Last activity: {new Date(session.lastActivity).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : !showChat ? (
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
                onClick={handleOpenChat}
                className="w-full"
                disabled={!connected}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Open Chat
              </Button>
              {sessions.length > 0 && (
                <p className="text-xs text-slate-400 text-center">
                  {sessions.length} active session(s)
                </p>
              )}
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
                {selectedSession && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`p-1 rounded ${getChannelColor(selectedSession.channel)}`}>
                      {getChannelIcon(selectedSession.channel)}
                    </div>
                    <p className="text-xs text-slate-400">
                      {selectedSession.channel.toUpperCase()} - {selectedSession.userId}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowSessionSelector(true)}
                >
                  Switch Session
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowChat(false)}
                >
                  Close
                </Button>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatHistory.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Continue the conversation</p>
                  <p className="text-xs mt-1">This session has {selectedSession?.messageCount || 0} messages</p>
                </div>
              )}
              {chatHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.isStep ? (
                    // Step bubble — compact, muted style
                    <div className="max-w-[90%] rounded-lg p-2 bg-slate-800 border border-slate-600 text-slate-300">
                      <div className="flex items-center gap-1 mb-1 text-xs text-slate-500">
                        <Brain className="w-3 h-3" />
                        <span>Agent thinking</span>
                      </div>
                      <p className="text-xs whitespace-pre-wrap font-mono">{msg.content}</p>
                    </div>
                  ) : (
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white"
                          : msg.content === "Thinking..."
                          ? "bg-slate-700 text-slate-400 animate-pulse"
                          : "bg-slate-700 text-slate-100"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Plan Progress (shown when agent is executing a plan) */}
            {selectedAgentId && (agentSteps[selectedAgentId] || []).some((s) => s.planProgress) && (
              <PlanProgress steps={agentSteps[selectedAgentId] || []} />
            )}

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
                  disabled={!connected || !selectedSessionKey}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!connected || !message.trim() || !selectedSessionKey}
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
