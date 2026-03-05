import { randomUUID } from 'crypto';
import { AgentConfig, Task, Message, AgentPlan, AgentStep } from '../types/agent.js';
import { MemoryManager } from '../services/memory/MemoryManager.js';
import { LLMManager } from '../services/llm/LLMManager.js';
import { ToolManager } from '../services/tools/ToolManager.js';
import { CommandManager } from '../services/commands/CommandManager.js';
import { PlannerService } from '../services/planner/PlannerService.js';
import { SessionManager } from '../services/session/SessionManager.js';
import { logger } from '../utils/logger.js';

export class AgentRuntime {
  private memoryManager: MemoryManager;
  private llmManager: LLMManager;
  private toolManager: ToolManager;
  private commandManager: CommandManager;
  private plannerService: PlannerService;
  private sessionManager: SessionManager;
  private agents: Map<string, AgentConfig> = new Map();
  public onStep: ((data: { agentId: string; step: number; thought?: string; tool?: string; params?: any; result?: string; planProgress?: string }) => void) | null = null;

  constructor(memoryManager: MemoryManager, llmManager: LLMManager, sessionManager: SessionManager) {
    this.memoryManager = memoryManager;
    this.llmManager = llmManager;
    this.sessionManager = sessionManager;
    this.toolManager = new ToolManager(memoryManager);
    this.commandManager = new CommandManager();
    this.plannerService = new PlannerService(llmManager);
  }

  async initialize(): Promise<void> {
    // Load all agents from disk
    const agents = await this.memoryManager.loadAllAgents();
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

  async executeTask(agentId: string, task: Task, sessionKey?: string): Promise<string> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    try {
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
          }
        );

        if (commandResult) {
          return commandResult;
        }
      }

      // Check if this is a complex task that needs planning
      const needsPlanning = this.plannerService.isComplexTask(task.description);
      
      if (needsPlanning && sessionKey) {
        logger.info(`🏗️ Complex task detected, using planner mode`);
        return await this.executeWithPlanner(agentId, task, sessionKey);
      } else {
        logger.info(`💬 Simple task, using reactive mode`);
        return await this.executeReactive(agentId, task, sessionKey);
      }
    } catch (error) {
      logger.error(`Task failed for ${agentId}:`, error);
      await this.updateAgentStatus(agentId, 'error');
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
        // Execute the step
        const result = await this.toolManager.executeTool(
          step.action,
          step.params,
          agentId
        );

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

    // Update context
    const context = await this.memoryManager.loadContext(agentId, sessionKey);
    const updatedContext = `${context}\n\nUser: ${task.description}\nAssistant: ${finalResponse}\n`;
    await this.memoryManager.updateContext(agentId, updatedContext, sessionKey);

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

    // Build initial system prompt
    const systemPrompt = await this.buildSystemPrompt(agent, memory, agentId);
    
    let loopCount = 0;
    const MAX_LOOPS = 5;
    let finalResponse = '';
    let currentPrompt = `${context}\n\nUser: ${task.description}`;

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
          // Execute tool
          const toolResult = await this.toolManager.executeTool(
            toolCall.tool,
            toolCall.params || {},
            agentId
          );

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

    // Update context
    const updatedContext = `${context}\n\nUser: ${task.description}\nAssistant: ${finalResponse}\n`;
    await this.memoryManager.updateContext(agentId, updatedContext, sessionKey);

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
      } catch (e) {}

      // 2. Regex for JSON inside text
      const jsonRegex = /\{[\s\S]*?"tool"\s*:\s*"[^"]+"[\s\S]*?\}/g;
      const matches = text.match(jsonRegex);

      if (matches) {
        for (const match of matches) {
          try {
            const jsonStr = match.replace(/,\s*\}/g, '}').replace(/,\s*\]/g, ']');
            const parsed = JSON.parse(jsonStr);
            if (parsed.tool) return parsed;
          } catch (e) {}
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
    try {
      soul = await this.memoryManager.loadSoul(agentId);
    } catch (error) {
      // SOUL.md is optional
    }
    
    // Workspace is the agent's home directory
    const workspace = process.env.AGENT_WORKSPACE || process.cwd();
    
    let prompt = `You are ${agent.name}, an AI agent with full file system access.

${soul ? `# Your Personality\n${soul}\n` : ''}

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
2. For simple questions and greetings - respond naturally without tools
3. For tasks requiring actions - use tools in JSON format: {"tool": "name", "params": {...}}
4. Always explain what you're doing
5. Ask user for clarification if path is ambiguous

# Available Tools (${toolsList.length} total)
${toolsList.map(t => `- ${t.name}: ${t.description}`).join('\n')}

# Tool Usage Format
{"tool": "tool_name", "params": {"key": "value"}}

Examples:
- {"tool": "read_file", "params": {"path": "/Users/user/Desktop/README.md"}}
- {"tool": "shell_exec", "params": {"command": "ls -la /Users/user/Desktop"}}
- {"tool": "write_file", "params": {"path": "./test.txt", "content": "Hello"}}
- {"tool": "shell_exec", "params": {"command": "mkdir ~/Documents/my-project"}}

${memory ? `# Long-term Memory\n${memory.slice(0, 500)}` : ''}

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
}
