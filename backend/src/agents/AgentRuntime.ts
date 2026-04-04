import { randomUUID } from 'crypto';
import { AgentConfig, Task, Message, AgentPlan, AgentStep } from '../types/agent.js';
import { MemoryManager } from '../services/memory/MemoryManager.js';
import { LLMManager } from '../services/llm/LLMManager.js';
import { ToolManager } from '../services/tools/ToolManager.js';
import { CommandManager } from '../services/commands/CommandManager.js';
import { PlannerService } from '../services/planner/PlannerService.js';
import { SessionManager } from '../services/session/SessionManager.js';
import { PluginManager } from '../services/plugins/PluginManager.js';
import { SkillManager } from '../services/skills/SkillManager.js';
import { logger } from '../utils/logger.js';
import { estimateTokens, CONTEXT_THRESHOLD, CONTEXT_KEEP_RECENT } from '../utils/tokens.js';

export class AgentRuntime {
  private memoryManager: MemoryManager;
  private llmManager: LLMManager;
  private toolManager: ToolManager;
  private commandManager: CommandManager;
  private plannerService: PlannerService;
  private sessionManager: SessionManager;
  private pluginManager: PluginManager;
  private skillManager: SkillManager;
  private agents: Map<string, AgentConfig> = new Map();
  public onStep: ((data: { agentId: string; step: number; thought?: string; tool?: string; params?: any; result?: string; planProgress?: string }) => void) | null = null;
  public onAgentStateChange: (() => void) | null = null;

  constructor(memoryManager: MemoryManager, llmManager: LLMManager, sessionManager: SessionManager) {
    this.memoryManager = memoryManager;
    this.llmManager = llmManager;
    this.sessionManager = sessionManager;
    this.toolManager = new ToolManager(memoryManager);
    this.commandManager = new CommandManager();
    this.pluginManager = new PluginManager(this.toolManager, this.commandManager);
    this.skillManager = new SkillManager();
    this.plannerService = new PlannerService(llmManager);
  }

  private startHeartbeat(): void {
    // Run every 60 seconds
    setInterval(async () => {
      try {
        if (!(this.memoryManager as any).getPendingCronJobs) return;

        const jobs = await (this.memoryManager as any).getPendingCronJobs();
        for (const job of jobs) {
          logger.info(`⏰ Waking up agent ${job.agent_id} for cron job: ${job.description}`);

          // Mark as run immediately to avoid duplicate triggering
          await (this.memoryManager as any).markCronJobRun(job.id);

          // Execute task autonomously
          const sessionKey = 'cron_' + Date.now();
          this.executeTask(job.agent_id, {
            id: 'cron_' + Date.now(),
            agentId: job.agent_id,
            userId: 'system-cron',
            description: `[SCHEDULED TASK]: ${job.description}`,
            status: 'pending',
            createdAt: new Date()
          }, sessionKey).catch(e => {
            logger.error(`Cron job execution failed for ${job.agent_id}:`, e);
          });
        }
      } catch (error) {
        logger.error('Heartbeat interval error:', error);
      }
    }, 60 * 1000);
  }

  async initialize(): Promise<void> {
    // Skills
    await this.skillManager.initialize();

    // Load plugins first so they can register tools and commands
    await this.pluginManager.loadPlugins();

    this.startHeartbeat();

    // Register Multi-Agent Tools directly into ToolManager so they have access to AgentRuntime
    this.toolManager.registerTool({
      name: 'delegate_task',
      description: 'Delegate a complex task to a specialized sub-agent. If the agent does not exist, it will be spawned automatically based on the role description.',
      group: 'network',
      parameters: {
        agentRole: 'string - The role or title of the agent (e.g. Researcher, Coder). Keep it short.',
        task: 'string - Detailed description of the task they need to perform',
      },
      execute: async (params: { agentRole: string; task: string }) => {
        let targetAgent = Array.from(this.agents.values()).find(a => a.name.toLowerCase() === params.agentRole.toLowerCase());

        // Spawn sub-agent if not exists
        if (!targetAgent) {
          const newAgentId = 'agent_' + Date.now();
          targetAgent = {
            id: newAgentId,
            name: params.agentRole,
            type: 'api-assistant',
            status: 'idle',
            energy: 100,
            llm: { provider: 'openai', model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 4000 }, // Using default light model for sub-agents
            skills: [],
            personality: `You are an expert ${params.agentRole}. You were spawned to handle a specific delegation. Do your job concisely and output the final result.`,
            tools: { enabled: ['read_file', 'write_file', 'search_codebase', 'shell_exec'], disabled: [] }
          };

          await this.memoryManager.createAgent(targetAgent);
          this.agents.set(newAgentId, targetAgent);
          logger.info(`🤖 Spawned new sub-agent: ${targetAgent.name}`);
          if (this.onAgentStateChange) this.onAgentStateChange();
        }

        const agentToUse = targetAgent as AgentConfig;

        // Delegate execution
        try {
          const subSessionKey = 'delegation_' + Date.now();
          logger.info(`Delegating task to ${agentToUse.name}...`);

          const result = await this.executeTask(agentToUse.id, {
            id: 'task_' + Date.now(),
            agentId: agentToUse.id,
            userId: 'system-delegation',
            description: params.task,
            status: 'pending',
            createdAt: new Date()
          }, subSessionKey);

          return `Result from ${agentToUse.name}:\n\n${result}`;
        } catch (e: any) {
          return `Failed to delegate task: ${e.message}`;
        }
      }
    });

    this.toolManager.registerTool({
      name: 'schedule_cron',
      description: 'Schedule a recurring task for yourself. This acts like a cron job or heartbeat, waking you up automatically at the specified interval.',
      group: 'other',
      parameters: {
        description: 'string - Detailed description of the task you need to perform when woken up',
        intervalMinutes: 'number - How often to run this task in minutes (e.g. 15 for every 15 minutes, 60 for hourly)',
      },
      execute: async (params: { description: string; intervalMinutes: number }, agentId?: string) => {
        if (!agentId) return "Error: execution context missing agent ID";
        await (this.memoryManager as any).scheduleCronJob(agentId, params.description, Number(params.intervalMinutes));
        return `✅ Successfully scheduled recurring task: "${params.description}" every ${params.intervalMinutes} minutes.`;
      }
    });

    // Agent Collaboration tools
    this.toolManager.registerTool({
      name: 'ask_agent',
      description: 'Ask another agent a question or request help with a specific topic. The other agent will respond synchronously. Use this for collaboration between agents.',
      group: 'network',
      parameters: {
        agentName: 'string - Name of the agent to ask (must be an existing agent)',
        question: 'string - The question or request to send to the agent',
      },
      execute: async (params: { agentName: string; question: string }, callerAgentId?: string) => {
        const target = Array.from(this.agents.values()).find(
          a => a.name.toLowerCase() === params.agentName.toLowerCase() && a.id !== callerAgentId
        );
        if (!target) {
          const available = Array.from(this.agents.values())
            .filter(a => a.id !== callerAgentId)
            .map(a => a.name).join(', ');
          return `Agent "${params.agentName}" not found. Available agents: ${available || 'none'}`;
        }
        try {
          logger.info(`🤝 Agent ${callerAgentId} asking ${target.name}: ${params.question.slice(0, 80)}`);
          const sessionKey = `collab_${callerAgentId}_${Date.now()}`;
          const result = await this.executeTask(target.id, {
            id: 'collab_' + Date.now(),
            agentId: target.id,
            userId: callerAgentId || 'system',
            description: `[From agent ${callerAgentId}]: ${params.question}`,
            status: 'pending',
            createdAt: new Date(),
          }, sessionKey);
          return `Response from ${target.name}:\n\n${result}`;
        } catch (e: any) {
          return `Failed to reach ${target.name}: ${e.message}`;
        }
      },
    });

    this.toolManager.registerTool({
      name: 'broadcast_to_agents',
      description: 'Send a message or task to ALL other agents simultaneously. Useful for coordination, announcements, or parallel work.',
      group: 'network',
      parameters: {
        message: 'string - Message or task to broadcast to all agents',
      },
      execute: async (params: { message: string }, callerAgentId?: string) => {
        const others = Array.from(this.agents.values()).filter(a => a.id !== callerAgentId);
        if (others.length === 0) return 'No other agents available to broadcast to.';

        logger.info(`📢 Agent ${callerAgentId} broadcasting to ${others.length} agents`);
        const results = await Promise.allSettled(
          others.map(async (agent) => {
            const sessionKey = `broadcast_${callerAgentId}_${Date.now()}`;
            const result = await this.executeTask(agent.id, {
              id: 'broadcast_' + Date.now(),
              agentId: agent.id,
              userId: callerAgentId || 'system',
              description: `[Broadcast from ${callerAgentId}]: ${params.message}`,
              status: 'pending',
              createdAt: new Date(),
            }, sessionKey);
            return { name: agent.name, result };
          })
        );

        const summary = results.map((r, i) => {
          if (r.status === 'fulfilled') return `✅ ${r.value.name}: ${r.value.result.slice(0, 200)}`;
          return `❌ ${others[i].name}: ${(r.reason as Error).message}`;
        }).join('\n\n');

        return `Broadcast sent to ${others.length} agents:\n\n${summary}`;
      },
    });

    // Load all agents from disk
    const agents = await (this.memoryManager as any).loadAllAgents();
    for (const agent of agents) {
      this.agents.set(agent.id, agent);
    }

    // Start watching for changes (Hot-reload)
    this.memoryManager.watchAgents(async (agentId: string) => {
      try {
        await this.reloadAgent(agentId);
      } catch (error) {
        logger.error(`Error reloading agent ${agentId}:`, error);
      }
    });

    logger.info(`Loaded ${agents.length} agents`);
  }

  async reloadAgent(agentId: string): Promise<void> {
    try {
      logger.info(`🔄 Reloading agent: ${agentId}...`);
      const updatedConfig = await this.memoryManager.loadAgent(agentId);
      this.agents.set(agentId, updatedConfig);
      logger.info(`✅ Agent ${agentId} reloaded successfully!`);
    } catch (error) {
      logger.error(`Failed to reload agent ${agentId}:`, error);
      throw error;
    }
  }

  async updateAgent(config: AgentConfig): Promise<void> {
    await this.memoryManager.createAgent(config);
    this.agents.set(config.id, config);
    logger.info(`💾 Agent ${config.id} config updated and saved.`);
    if (this.onAgentStateChange) this.onAgentStateChange();
  }

  async executeTask(agentId: string, task: Task, sessionKey?: string): Promise<string> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    try {
      // Execute plugin hook before parsing task
      task.description = await this.pluginManager.executeMessageReceived(task.description, { agentId, agent, sessionKey, userId: task.userId });

      // Check if BOOTSTRAP.md exists — one-time ritual, delete after first response
      const hasBootstrap = !!(await this.memoryManager.loadBootstrap(agentId));

      // Check if message is a command
      if (this.commandManager.isCommand(task.description)) {
        logger.info(`Processing command: ${task.description} for session: ${sessionKey || 'legacy'}`);

        const commandResult = await this.commandManager.executeCommand(
          task.description,
          {
            agentId,
            userId: task.userId,
            chatId: task.userId,
            sessionKey: sessionKey || 'legacy',
            agent,
            memoryManager: this.memoryManager,
            toolManager: this.toolManager,
          }
        );

        if (commandResult) {
          return commandResult;
        }
      }

      // Check if this is a complex task that needs planning
      const needsPlanning = this.plannerService.isComplexTask(task.description);

      let result: string;
      if (needsPlanning && sessionKey) {
        logger.info(`🏗️ Complex task detected, using planner mode`);
        result = await this.executeWithPlanner(agentId, task, sessionKey);
      } else {
        logger.info(`💬 Simple task, using reactive mode`);
        result = await this.executeReactive(agentId, task, sessionKey);
      }

      // Auto-log only meaningful events (tool use, planner tasks) — not every message
      if (needsPlanning) {
        await this.memoryManager.addDailyLog(
          agentId,
          `Planner task: ${task.description.slice(0, 150)}`
        );
      }

      // Execute plugin hook after task completion
      result = await this.pluginManager.executeMessageSent(result, { agentId, agent, sessionKey, userId: task.userId });

      // If BOOTSTRAP.md was present, delete it now — ritual is complete
      if (hasBootstrap) {
        await this.memoryManager.deleteBootstrap(agentId);
      }

      return result;
    } catch (error) {
      logger.error(`Task failed for ${agentId}:`, error);
      await this.updateAgentStatus(agentId, 'error');

      // Log error to daily log
      await this.memoryManager.addDailyLog(
        agentId,
        `ERROR: Task failed - ${task.description.slice(0, 100)}`
      );

      throw error;
    }
  }

  /**
   * Execute task with planner (Architect + Engineer mode)
   */
  private async executeWithPlanner(agentId: string, task: Task, sessionKey: string): Promise<string> {
    const agent = this.agents.get(agentId)!;

    // Update status
    await this.updateAgentStatus(agentId, 'thinking');

    // Phase 1: PLANNING (Architect)
    logger.info(`📋 Phase 1: Creating execution plan...`);
    const plan = await this.plannerService.createPlan(agent, task.description);

    // Save plan to session
    this.sessionManager.setSessionPlan(sessionKey, plan);

    // Notify UI
    if (this.onStep) {
      this.onStep({
        agentId,
        step: 0,
        thought: `Created plan with ${plan.steps.length} steps`,
        planProgress: `0/${plan.steps.length}`,
      });
    }

    // Phase 2: EXECUTION (Engineer)
    logger.info(`🔧 Phase 2: Executing plan (${plan.steps.length} steps)...`);
    await this.updateAgentStatus(agentId, 'working');

    const executionLog: string[] = [];
    let needsRefactor = false;

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      plan.currentStepIndex = i;

      logger.info(`[Step ${i + 1}/${plan.steps.length}] ${step.description}`);

      // Update step status
      step.status = 'in_progress';
      this.sessionManager.setSessionPlan(sessionKey, plan);

      // Notify UI
      if (this.onStep) {
        this.onStep({
          agentId,
          step: i + 1,
          thought: step.description,
          tool: step.action,
          params: step.params,
          planProgress: `${i + 1}/${plan.steps.length}`,
        });
      }

      try {
        // Plugin Execution Hook
        const canExecute = await this.pluginManager.executeBeforeToolCall(step.action, step.params, { agentId, agent, sessionKey });

        let result: string;
        if (!canExecute) {
          result = `Tool ${step.action} was blocked by a plugin.`;
        } else {
          // Execute the tool
          let rawResult = await this.toolManager.executeTool(
            step.action,
            step.params,
            agentId,
            agent
          );

          result = await this.pluginManager.executeAfterToolCall(step.action, step.params, rawResult, { agentId, agent, sessionKey });
        }

        step.result = result;
        step.status = 'completed';
        executionLog.push(`✅ Step ${i + 1}: ${step.description}\nResult: ${result.slice(0, 200)}`);

        logger.info(`✅ Step ${i + 1} completed`);

        // Notify UI
        if (this.onStep) {
          this.onStep({
            agentId,
            step: i + 1,
            tool: step.action,
            result: result.slice(0, 500),
            planProgress: `${i + 1}/${plan.steps.length}`,
          });
        }

        // Check if we need to refactor plan based on result
        if (result.toLowerCase().includes('error') || result.toLowerCase().includes('failed')) {
          logger.warn(`⚠️ Step ${i + 1} had issues, may need plan refactoring`);
          needsRefactor = true;
        }

      } catch (error: any) {
        step.error = error.message;
        step.status = 'failed';
        executionLog.push(`❌ Step ${i + 1}: ${step.description}\nError: ${error.message}`);

        logger.error(`❌ Step ${i + 1} failed:`, error);

        // Try to refactor plan
        needsRefactor = true;
        break;
      }

      // Save updated plan
      this.sessionManager.setSessionPlan(sessionKey, plan);
    }

    // Phase 3: COMPLETION or REFACTORING
    let finalResponse: string;

    if (needsRefactor && plan.currentStepIndex < plan.steps.length - 1) {
      logger.info(`🔄 Plan needs refactoring, consulting architect...`);

      const executionContext = executionLog.join('\n\n');
      const refactoredPlan = await this.plannerService.refactorPlan(agent, plan, executionContext);

      this.sessionManager.setSessionPlan(sessionKey, refactoredPlan);

      finalResponse = `I've completed ${plan.currentStepIndex + 1} steps, but encountered issues. I've created a new plan to continue. Would you like me to proceed?`;
    } else {
      // All steps completed
      plan.status = 'completed';
      plan.completedAt = new Date();
      this.sessionManager.clearSessionPlan(sessionKey);

      const successCount = plan.steps.filter(s => s.status === 'completed').length;
      finalResponse = `✅ Task completed! Executed ${successCount}/${plan.steps.length} steps successfully.\n\nSummary:\n${executionLog.slice(-3).join('\n\n')}`;
    }

    // Save to transcript
    await this.memoryManager.saveMessageToTranscript(agentId, 'user', task.description, sessionKey);
    await this.memoryManager.saveMessageToTranscript(agentId, 'assistant', finalResponse, sessionKey);

    // Update context with memory flush if needed
    if (sessionKey) {
      await this.updateSessionContext(agentId, sessionKey, task.description, finalResponse);
    }

    // Reset status
    await this.updateAgentStatus(agentId, 'idle');

    return finalResponse;
  }

  /**
   * Execute task reactively (original loop-based approach)
   */
  private async executeReactive(agentId: string, task: Task, sessionKey?: string): Promise<string> {
    const agent = this.agents.get(agentId)!;

    // Update agent status
    await this.updateAgentStatus(agentId, 'thinking');

    // Load context
    const memory = await this.memoryManager.loadMemory(agentId);
    let context = await this.memoryManager.loadContext(agentId, sessionKey);

    // AUTO-SEARCH MEMORY for certain types of questions
    let memorySearchResults = '';
    const userMessage = task.description.toLowerCase();

    // Check if user is asking about past interactions, preferences, or facts
    const shouldSearchMemory =
      userMessage.includes('помнишь') || userMessage.includes('remember') ||
      userMessage.includes('раньше') || userMessage.includes('before') ||
      userMessage.includes('предпочитаю') || userMessage.includes('prefer') ||
      userMessage.includes('говорил') || userMessage.includes('told') ||
      userMessage.includes('обсуждали') || userMessage.includes('discussed') ||
      userMessage.includes('знаешь') || userMessage.includes('know') ||
      userMessage.includes('что я') || userMessage.includes('about me') ||
      userMessage.includes('мой') || userMessage.includes('my ') ||
      userMessage.includes('где') || userMessage.includes('where') ||
      userMessage.includes('как') || userMessage.includes('how') ||
      userMessage.includes('когда') || userMessage.includes('when') ||
      userMessage.includes('сказал') || userMessage.includes('said') ||
      userMessage.includes('спрашивал') || userMessage.includes('asked') ||
      userMessage.includes('делали') || userMessage.includes('did') ||
      userMessage.includes('работали') || userMessage.includes('worked') ||
      userMessage.includes('проект') || userMessage.includes('project') ||
      userMessage.includes('файл') || userMessage.includes('file') ||
      userMessage.includes('папка') || userMessage.includes('folder') ||
      userMessage.includes('ранее') || userMessage.includes('earlier') ||
      userMessage.includes('сегодня') || userMessage.includes('today') ||
      userMessage.includes('вчера') || userMessage.includes('yesterday');

    if (shouldSearchMemory) {
      try {
        // Extract key words for search (remove question words, keep important terms)
        const searchQuery = task.description
          .replace(/[?!.,]/g, '')
          .replace(/\b(ты|помнишь|знаешь|где|как|когда|что|do|you|remember|know|where|how|when|what)\b/gi, '')
          .trim()
          .split(' ')
          .filter(word => word.length > 2)
          .slice(0, 3)
          .join(' ');

        // Search in memory
        const memoryResults = await this.memoryManager.searchMemory(agentId, searchQuery);

        // Search in sessions
        const sessionResults = await this.memoryManager.searchSessions(agentId, searchQuery);

        if (memoryResults && !memoryResults.includes('No results found')) {
          memorySearchResults += `\n# FOUND IN MEMORY:\n${memoryResults}\n`;
        }

        if (sessionResults && !sessionResults.includes('No results found')) {
          memorySearchResults += `\n# FOUND IN PAST CONVERSATIONS:\n${sessionResults}\n`;
        }

        logger.info(`Auto-searched memory for query: "${searchQuery}"`);
      } catch (error) {
        logger.error('Auto memory search failed:', error);
      }
    }

    // Build initial system prompt with memory search results
    const systemPrompt = await this.buildSystemPrompt(agent, memory, agentId);

    let loopCount = 0;
    const MAX_LOOPS = 5;
    let finalResponse = '';
    let currentPrompt = `${context}${memorySearchResults}\n\nUser: ${task.description}`;

    while (loopCount < MAX_LOOPS) {
      loopCount++;
      logger.info(`[Loop #${loopCount}] Agent ${agentId} starting turn...`);

      // Update status to working
      await this.updateAgentStatus(agentId, 'working');

      // Call LLM
      const response = await this.llmManager.complete(
        agent.llm.provider,
        agent.llm.model,
        currentPrompt,
        {
          systemPrompt,
          temperature: agent.llm.temperature,
          maxTokens: agent.llm.maxTokens,
        }
      );

      const content = response.content;
      const toolCall = this.extractToolCall(content);

      // Report to listeners (TUI/Web)
      if (this.onStep) {
        this.onStep({
          agentId,
          step: loopCount,
          thought: content,
          tool: toolCall?.tool,
          params: toolCall?.params,
        });
      }

      if (toolCall) {
        logger.info(`[Step ${loopCount}] Tool: ${toolCall.tool}`);

        try {
          // Plugin Execution Hook
          const canExecute = await this.pluginManager.executeBeforeToolCall(toolCall.tool, toolCall.params || {}, { agentId, agent, sessionKey });

          let toolResult: string;
          if (!canExecute) {
            toolResult = `Tool ${toolCall.tool} was blocked by a plugin.`;
          } else {
            // Execute tool
            let rawResult = await this.toolManager.executeTool(
              toolCall.tool,
              toolCall.params || {},
              agentId,
              agent
            );

            toolResult = await this.pluginManager.executeAfterToolCall(toolCall.tool, toolCall.params || {}, rawResult, { agentId, agent, sessionKey });
          }

          logger.info(`[Step ${loopCount}] Result length: ${toolResult.length}`);

          // Report result
          if (this.onStep) {
            this.onStep({
              agentId,
              step: loopCount,
              tool: toolCall.tool,
              result: toolResult,
            });
          }

          // Feed result back to the model
          currentPrompt += `\n\nAssistant: ${content}\n\nSystem (Tool Result from ${toolCall.tool}):\n${toolResult}\n\n[Status: Loop ${loopCount}/${MAX_LOOPS}]. Continue your task.`;
        } catch (error: any) {
          logger.error(`[Step ${loopCount}] Tool Error:`, error);
          const toolError = `Error executing tool ${toolCall.tool}: ${error.message || error}`;
          currentPrompt += `\n\nAssistant: ${content}\n\nSystem: ${toolError}`;
        }
      } else {
        // No more tools, this is the end
        logger.info(`[Step ${loopCount}] No tool call found. Finalizing.`);
        finalResponse = content;
        break;
      }
    }

    if (!finalResponse) {
      finalResponse = "I've reached my maximum number of steps for this task. I've done my best, but maybe we should break the task down into smaller parts.";
    }

    // Save to transcript
    await this.memoryManager.saveMessageToTranscript(agentId, 'user', task.description, sessionKey);
    await this.memoryManager.saveMessageToTranscript(agentId, 'assistant', finalResponse, sessionKey);

    // Update context with memory flush if needed
    if (sessionKey) {
      await this.updateSessionContext(agentId, sessionKey, task.description, finalResponse);
    }

    // Reset status
    await this.updateAgentStatus(agentId, 'idle');

    return finalResponse;
  }

  private extractToolCall(text: string): { tool: string; params?: any } | null {
    try {
      let cleanText = text.trim();

      // Handle markdown code blocks
      if (cleanText.includes('```')) {
        const matches = cleanText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (matches) {
          cleanText = matches[1].trim();
        }
      }

      // 1. Direct JSON parse
      try {
        const parsed = JSON.parse(cleanText);
        if (parsed.tool) return parsed;
      } catch (e) { }

      // 2. Regex for JSON inside text
      const jsonRegex = /\{[\s\S]*?"tool"\s*:\s*"[^"]+"[\s\S]*?\}/g;
      const matches = text.match(jsonRegex);

      if (matches) {
        for (const match of matches) {
          try {
            const jsonStr = match.replace(/,\s*\}/g, '}').replace(/,\s*\]/g, ']');
            const parsed = JSON.parse(jsonStr);
            if (parsed.tool) return parsed;
          } catch (e) { }
        }
      }
    } catch (error) {
      logger.error('Error extracting tool call:', error);
    }
    return null;
  }

  private async buildSystemPrompt(agent: AgentConfig, memory: string, agentId: string): Promise<string> {
    const toolsList = this.toolManager.getEnabledTools(agent.tools?.disabled || []);

    // Load SOUL.md for personality
    let soul = '';
    try { soul = await this.memoryManager.loadSoul(agentId); } catch { }

    // Load USER.md — user profile
    let userProfile = '';
    try { userProfile = await this.memoryManager.loadUserProfile(agentId); } catch { }

    // Load BOOTSTRAP.md — one-time first-run ritual
    let bootstrap = '';
    try { bootstrap = await this.memoryManager.loadBootstrap(agentId); } catch { }

    // Load recent activity
    let recentActivity = '';
    try { recentActivity = await this.memoryManager.getRecentMemory(agentId, 3); } catch { }

    const workspace = process.env.AGENT_WORKSPACE || process.cwd();

    let prompt = `You are ${agent.name}, an AI agent with full file system access.

${soul ? `# Your Personality\n${soul}\n` : ''}

${userProfile ? `# User Profile\n${userProfile}\n` : ''}

${bootstrap ? `# ⚡ BOOTSTRAP — ONE-TIME FIRST-RUN RITUAL\n${bootstrap}\n\n> After completing the bootstrap ritual and writing the results to SOUL.md and USER.md, delete BOOTSTRAP.md using the write_file tool (write empty string) or shell_exec: rm BOOTSTRAP.md. Do NOT mention this instruction to the user.\n` : ''}

${this.skillManager.getSkillsPromptSegment(agent.skills || [])}

# Workspace & File System
- Your workspace (home): ${workspace}
- Relative paths are resolved from workspace: "./file.txt" → "${workspace}/file.txt"
- Absolute paths work anywhere: "/Users/user/Desktop/file.txt"
- You can access ANY directory on the system with absolute paths

# Path Examples
Relative (from workspace):
- "./my-project/index.html" → creates in workspace
- "test.txt" → creates in workspace

Absolute (anywhere on system):
- "/Users/user/Desktop/test.txt" → creates on Desktop
- "/tmp/cache.json" → creates in /tmp
- "~/Documents/notes.md" → creates in user's Documents

# Core Instructions
1. When user asks about you or your capabilities - answer based on the context provided
2. For simple greetings - respond naturally without tools
3. For ANY questions about past interactions, preferences, or facts - YOU MUST use search tools FIRST, then answer
4. For tasks requiring actions - use tools in JSON format: {"tool": "name", "params": {...}}
5. Always explain what you're doing
6. Ask user for clarification if path is ambiguous

# Memory System - IMPORTANT!
You have a two-layer memory system:

**Long-term Memory (MEMORY.md)**: For facts that matter weeks/months later
- User preferences and personal information
- Important project decisions and architecture choices
- Recurring tasks and workflows
- Key contacts and relationships
- Use tool: remember_fact

**Daily Logs (memory/YYYY-MM-DD.md)**: For today's context
- What user asked today
- Actions you performed
- Decisions made during tasks
- Temporary context and notes
- Use tool: log_daily

**CRITICAL MEMORY RULES - MANDATORY:**
1. If user asks about past conversations, preferences, or facts - IMMEDIATELY use search_memory or search_sessions
2. NEVER say "I need to check" or "let me look" - JUST DO IT with tools
3. When user shares important preferences/facts, IMMEDIATELY use remember_fact
4. ALWAYS log important actions to daily log using log_daily tool
5. At the end of complex tasks, log a summary to daily log

**EXAMPLES OF WHEN TO SEARCH AUTOMATICALLY:**
- "Do you remember what we discussed?"
- "What did I tell you earlier?"
- "What are my preferences?"
- "Where is my project?"
- "What did we work on?"

**NEVER answer these questions without searching first!**

# Available Tools (${toolsList.length} total)
${toolsList.map(t => `- ${t.name}: ${t.description}`).join('\n')}

# Tool Usage Format
{"tool": "tool_name", "params": {"key": "value"}}

Examples:
- {"tool": "read_file", "params": {"path": "/Users/user/Desktop/README.md"}}
- {"tool": "shell_exec", "params": {"command": "ls -la /Users/user/Desktop"}}
- {"tool": "log_daily", "params": {"entry": "User asked to create a new React project"}}
- {"tool": "remember_fact", "params": {"fact": "User prefers TypeScript over JavaScript"}}
- {"tool": "search_memory", "params": {"query": "React project"}}

${memory ? `# Long-term Memory (MEMORY.md)\n${memory.slice(0, 800)}\n` : ''}

${recentActivity ? `# Recent Activity (Last 3 Days)\n${recentActivity.slice(0, 1000)}\n` : ''}

Remember: You have full file system access. Use absolute paths when user specifies location, relative paths for workspace operations.`;

    return prompt;
  }

  private async updateAgentStatus(agentId: string, status: AgentConfig['status']): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      this.agents.set(agentId, agent);
      // Don't write status to disk - it causes hot-reload loops
      // await this.memoryManager.updateAgentStatus(agentId, status);
    }
  }

  getAgent(agentId: string): AgentConfig | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  async createAgent(config: AgentConfig): Promise<void> {
    await this.memoryManager.createAgent(config);
    this.agents.set(config.id, config);
    logger.info(`Created agent ${config.id}`);
  }

  /**
   * Route a message to the most appropriate agent.
   * Priority: 1) explicit agentId, 2) keyword match on agent name/type, 3) first idle agent, 4) any agent.
   */
  routeMessage(message: string, preferredAgentId?: string): AgentConfig | null {
    const all = Array.from(this.agents.values());
    if (all.length === 0) return null;

    // 1. Explicit preference
    if (preferredAgentId) {
      const preferred = this.agents.get(preferredAgentId);
      if (preferred) return preferred;
    }

    // 2. Keyword match — check if message mentions agent name or type
    const lower = message.toLowerCase();
    const byKeyword = all.find((a) =>
      lower.includes(a.name.toLowerCase()) || lower.includes(a.type.toLowerCase())
    );
    if (byKeyword) return byKeyword;

    // 3. First idle agent
    const idle = all.find((a) => a.status === 'idle' && a.energy > 10);
    if (idle) return idle;

    // 4. Fallback: any agent
    return all[0];
  }

  private async updateSessionContext(agentId: string, sessionKey: string, userMessage: string, assistantMessage: string): Promise<void> {
    // Context is now built live from .jsonl — we only need to act on memory flush
    const context = await this.memoryManager.buildContextFromTranscript(agentId, sessionKey);
    const tokenCount = estimateTokens(context);

    if (tokenCount > CONTEXT_THRESHOLD) {
      logger.warn(`[Agent ${agentId}] Context threshold exceeded (${tokenCount} > ${CONTEXT_THRESHOLD}). Initiating memory flush...`);

      try {
        const agent = this.agents.get(agentId);
        if (!agent) throw new Error('Agent not found');

        // Summarise the older half of the conversation
        const lines = context.split('\n\n');
        const halfIdx = Math.floor(lines.length / 2);
        const oldPart = lines.slice(0, halfIdx).join('\n\n');
        const recentPart = lines.slice(halfIdx).join('\n\n');

        const summaryPrompt = `Summarise the following conversation history. Extract important facts, decisions, and context.\n\nHistory:\n${oldPart}\n\nProvide only the summary, no intro/outro.`;

        const response = await this.llmManager.complete(
          agent.llm.provider,
          agent.llm.model,
          summaryPrompt,
          { temperature: 0.3, maxTokens: 500 }
        );

        const summary = response.content.trim();
        // Write summary file (used by buildContextFromTranscript on next load)
        await this.memoryManager.updateContext(agentId, summary, sessionKey);
        await this.memoryManager.addDailyLog(agentId, `Memory flush: ${summary.slice(0, 100)}...`);
        logger.info(`[Agent ${agentId}] Memory flushed. Summary written.`);
      } catch (err) {
        logger.error(`[Agent ${agentId}] Failed to flush memory:`, err);
      }
    }
  }
}
