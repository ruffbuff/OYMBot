import { randomUUID } from 'crypto';
import { AgentConfig, Task, Message } from '../types/agent';
import { MemoryManager } from '../services/memory/MemoryManager';
import { LLMManager } from '../services/llm/LLMManager';
import { ToolManager } from '../services/tools/ToolManager';
import { CommandManager } from '../services/commands/CommandManager';
import { logger } from '../utils/logger';

export class AgentRuntime {
  private memoryManager: MemoryManager;
  private llmManager: LLMManager;
  private toolManager: ToolManager;
  private commandManager: CommandManager;
  private agents: Map<string, AgentConfig> = new Map();
  public onStep: ((data: { agentId: string; step: number; thought?: string; tool?: string; params?: any; result?: string }) => void) | null = null;

  constructor(memoryManager: MemoryManager, llmManager: LLMManager) {
    this.memoryManager = memoryManager;
    this.llmManager = llmManager;
    this.toolManager = new ToolManager(memoryManager);
    this.commandManager = new CommandManager();
  }

  async initialize(): Promise<void> {
    // Load all agents from disk
    const agents = await this.memoryManager.loadAllAgents();
    for (const agent of agents) {
      this.agents.set(agent.id, agent);
    }
    
    // Start watching for changes (Hot-reload)
    this.memoryManager.watchAgents(async (agentId) => {
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
      
      // Keep internal runtime state if needed (status is currently in config)
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
            chatId: task.userId, // For now, userId = chatId
            agent,
            memoryManager: this.memoryManager,
          }
        );

        if (commandResult) {
          // Commands don't update context
          return commandResult;
        }
      }

      // Update agent status
      await this.updateAgentStatus(agentId, 'thinking');

      // Load context (session-aware)
      const memory = await this.memoryManager.loadMemory(agentId);
      let context = await this.memoryManager.loadContext(agentId, sessionKey);

      // Build initial system prompt
      const systemPrompt = this.buildSystemPrompt(agent, memory);
      
      let loopCount = 0;
      const MAX_LOOPS = 5;
      let finalResponse = '';
      let currentPrompt = `${context}\n\nUser: ${task.description}`;

      while (loopCount < MAX_LOOPS) {
        loopCount++;
        logger.info(`Agent Loop #${loopCount} for task: ${task.description.slice(0, 50)}...`);

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
        logger.info(`LLM Response (loop ${loopCount}): ${content.slice(0, 200)}...`);

        // Report thought/action if callback exists
        if (this.onStep) {
          this.onStep({
            agentId,
            step: loopCount,
            thought: content.slice(0, 1000), // Full thought, truncated only for safety
          });
        }

        // Extract tool call from anywhere in the response
        const toolCall = this.extractToolCall(content);

        if (toolCall) {
          logger.info(`Tool call detected: ${toolCall.tool} with params:`, toolCall.params);
          
          // Report tool call
          if (this.onStep) {
            this.onStep({
              agentId,
              step: loopCount,
              tool: toolCall.tool,
              params: toolCall.params,
            });
          }
          
          // Check if tool is disabled
          const disabledTools = agent.tools?.disabled || [];
          if (disabledTools.includes(toolCall.tool)) {
            const toolError = `I tried to use the ${toolCall.tool} tool, but it's currently disabled. Please enable it with /enable ${toolCall.tool} if you want me to use it.`;
            currentPrompt += `\n\nAssistant: ${content}\n\nSystem: ${toolError}`;
            continue;
          }

          try {
            // Execute tool with agentId context
            const toolResult = await this.toolManager.executeTool(
              toolCall.tool,
              toolCall.params || {},
              agentId
            );

            logger.info(`Tool result for ${toolCall.tool} (first 200 chars): ${toolResult.slice(0, 200)}...`);

            // Report tool result
            if (this.onStep) {
              this.onStep({
                agentId,
                step: loopCount,
                tool: toolCall.tool,
                result: toolResult.slice(0, 500), // Limit size for report
              });
            }

            // Add result to prompt for next turn
            currentPrompt += `\n\nAssistant: ${content}\n\nSystem (Tool Result from ${toolCall.tool}):\n${toolResult}\n\nContinue with your task or provide a final response if you are finished.`;
          } catch (error: any) {
            logger.error(`Tool execution failed (${toolCall.tool}):`, error);
            const toolError = `Error executing tool ${toolCall.tool}: ${error.message || error}`;
            currentPrompt += `\n\nAssistant: ${content}\n\nSystem: ${toolError}`;
          }
        } else {
          // No tool call - this is the final response
          finalResponse = content;
          break;
        }
      }

      if (!finalResponse) {
        finalResponse = "I've reached my maximum number of steps for this task. Please let me know if you'd like me to continue or if you have any questions about what I've done so far.";
      }

      // Save user message to transcript (JSONL) - session-aware
      await this.memoryManager.saveMessageToTranscript(agentId, 'user', task.description, sessionKey);
      
      // Save assistant response to transcript (JSONL) - session-aware
      await this.memoryManager.saveMessageToTranscript(agentId, 'assistant', finalResponse, sessionKey);

      // Update context with new message (Markdown) - session-aware
      const updatedContext = `${context}\n\nUser: ${task.description}\nAssistant: ${finalResponse}\n`;
      await this.memoryManager.updateContext(agentId, updatedContext, sessionKey);

      // Update status back to idle
      await this.updateAgentStatus(agentId, 'idle');

      logger.info(`Task completed for agent ${agentId}, session: ${sessionKey || 'legacy'}`);

      return finalResponse;
    } catch (error) {
      logger.error(`Task execution failed for agent ${agentId}:`, error);
      await this.updateAgentStatus(agentId, 'error');
      throw error;
    }
  }

  /**
   * Extracts a JSON tool call from a text string.
   * Looks for the first occurrence of a JSON object containing a "tool" property.
   */
  private extractToolCall(text: string): { tool: string; params?: any } | null {
    try {
      // 1. Try exact match if response is only JSON
      if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
        const parsed = JSON.parse(text.trim());
        if (parsed.tool) return parsed;
      }

      // 2. Search for JSON block within text using regex
      const jsonRegex = /\{[\s\S]*?"tool"[\s\S]*?\}/g;
      const matches = text.match(jsonRegex);

      if (matches) {
        for (const match of matches) {
          try {
            const parsed = JSON.parse(match);
            if (parsed.tool) return parsed;
          } catch (e) {
            // Skip invalid JSON and try next match
            continue;
          }
        }
      }
    } catch (error) {
      logger.error('Error extracting tool call:', error);
    }
    return null;
  }

  async processMessage(agentId: string, message: Message, sessionKey?: string): Promise<string> {
    const task: Task = {
      id: randomUUID(),
      agentId,
      userId: message.userId,
      description: message.content,
      status: 'pending',
      createdAt: new Date(),
    };

    return this.executeTask(agentId, task, sessionKey);
  }

  private buildSystemPrompt(agent: AgentConfig, memory: string): string {
    let prompt = `You are ${agent.name}, an AI software engineer and autonomous agent. You are running in a local terminal environment on macOS.`;
    
    // Core Engineering Mandates
    prompt += `\n\n# Your Mission (Agentic AI Mode)

1. **ACTION OVER WORDS**: If the user asks you to create, modify, or run something, you MUST use a tool immediately. Do not just say "I'll do it". EXECUTE IT in the same message.
2. **One tool at a time**: You can use ONLY ONE tool per message. 
3. **Desktop Path**: On this Mac, the Desktop is located at: /Users/user/Desktop. If the user asks for the Desktop, use this path.
4. **Be Precise**: When fixing bugs, always verify your changes using 'shell_exec'.
5. **Autonomy**: You are allowed to perform multiple steps to complete a task. Don't ask for permission for every small step; just execute your plan.

# Tool Usage Format
You MUST respond with a JSON object to use a tool. You can add reasoning before the JSON.
Example:
"I will create the script now.
{\\"tool\\": \\"write_file\\", \\"params\\": {\\"path\\": \\"/Users/user/Desktop/test.py\\", \\"content\\": \\"print('hello')\\"}}"`;

    // Add model info
    prompt += `\n\n# Your AI Model Configuration

You are currently running on:
- Provider: ${agent.llm.provider}
- Model: ${agent.llm.model}
- Temperature: ${agent.llm.temperature}
- Max Tokens: ${agent.llm.maxTokens}

# How to Answer Questions About Your Model

CRITICAL INSTRUCTION: When users ask about your AI model, you MUST respond with your actual provider and model from the configuration above.

Examples of CORRECT responses:
- User: "what ai model are you using?"
  You: "I'm using ${agent.llm.provider}/${agent.llm.model}"

- User: "which model are you?"
  You: "I'm running on ${agent.llm.model} via ${agent.llm.provider}"

- User: "what's your model?"
  You: "My current model is ${agent.llm.provider}/${agent.llm.model}"

NEVER mention "OpenClaw" when asked about your model. OpenClaw is the platform/gateway that connects you to users, NOT your AI model.`;

    if (agent.personality) {
      prompt += `\n\n# Your Personality\n${agent.personality}`;
    }

    if (memory) {
      prompt += `\n\n# Long-term Memory\n${memory.slice(0, 1000)}`; // Limit memory size
    }

    if (agent.skills.length > 0) {
      prompt += `\n\n# Your Skills\n${agent.skills.join(', ')}`;
    }

    // Add tools description (only enabled tools)
    const disabledTools = agent.tools?.disabled || [];
    const toolsDesc = this.toolManager.getToolsDescription(disabledTools);
    
    if (toolsDesc !== 'No tools available') {
      prompt += `\n\n# Available Tools\n${toolsDesc}`;
      prompt += `\n\n# How to Use Tools

1. **Reasoning first**: Always think and explain your plan to the user BEFORE using a tool.
2. **One tool at a time**: You can use ONLY ONE tool per message. After you use a tool, the system will provide you with the result.
3. **JSON Format**: When you need to call a tool, include a JSON object in your response. You can surround it with other text if you want, but the JSON itself must follow this format:
{"tool": "tool_name", "params": {"param1": "value1"}}

4. **Available Tools for Tasks**:
   - \`shell_exec\`: Use this to run terminal commands (npm, git, ls, etc.).
   - \`list_directory\`: Use this to see files in a directory.
   - \`read_file\`: Use this to examine code or documentation.
   - \`write_file\`: Use this to save your work or updates.

# Multi-step Workflow
You can perform multi-step tasks by calling tools one by one. For example:
- Task: "Run tests and fix if broken"
- Step 1: You call {"tool": "shell_exec", "params": {"command": "npm test"}}
- Step 2: System gives result. You see an error in "App.tsx".
- Step 3: You call {"tool": "read_file", "params": {"path": "src/App.tsx"}}
- Step 4: System gives content. You find the bug.
- Step 5: You call {"tool": "write_file", "params": {"path": "src/App.tsx", "content": "..."}}
- Step 6: You call {"tool": "shell_exec", "params": {"command": "npm test"}} again.
- Step 7: Tests pass. You provide the final result to the user.

Do NOT provide a final response until the task is complete. Always state when you are finished.`;
    }

    return prompt;
  }

  private async updateAgentStatus(
    agentId: string,
    status: AgentConfig['status']
  ): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      this.agents.set(agentId, agent);
      await this.memoryManager.updateAgentStatus(agentId, status);
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
