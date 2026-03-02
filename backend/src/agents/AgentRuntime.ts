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

  constructor(memoryManager: MemoryManager, llmManager: LLMManager) {
    this.memoryManager = memoryManager;
    this.llmManager = llmManager;
    this.toolManager = new ToolManager();
    this.commandManager = new CommandManager();
  }

  async initialize(): Promise<void> {
    // Load all agents from disk
    const agents = await this.memoryManager.loadAllAgents();
    for (const agent of agents) {
      this.agents.set(agent.id, agent);
    }
    logger.info(`Loaded ${agents.length} agents`);
  }

  async executeTask(agentId: string, task: Task): Promise<string> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    try {
      // Check if message is a command
      if (this.commandManager.isCommand(task.description)) {
        logger.info(`Processing command: ${task.description}`);
        
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

      // Load context
      const memory = await this.memoryManager.loadMemory(agentId);
      const context = await this.memoryManager.loadContext(agentId);

      // Build prompt
      const systemPrompt = this.buildSystemPrompt(agent, memory);
      const userPrompt = `${context}\n\nUser: ${task.description}`;

      // Update status to working
      await this.updateAgentStatus(agentId, 'working');

      // Call LLM
      const response = await this.llmManager.complete(
        agent.llm.provider,
        agent.llm.model,
        userPrompt,
        {
          systemPrompt,
          temperature: agent.llm.temperature,
          maxTokens: agent.llm.maxTokens,
        }
      );

      logger.info(`LLM Response (first 200 chars): ${response.content.slice(0, 200)}`);

      let finalResponse = response.content;

      // Check if response contains tool call
      const toolMatch = response.content.trim().match(/^\s*\{[\s\S]*?"tool"[\s\S]*?\}\s*$/);
      if (toolMatch) {
        try {
          const toolCall = JSON.parse(toolMatch[0]);
          logger.info(`Tool call detected: ${toolCall.tool} with params:`, toolCall.params);
          
          // Check if tool is disabled
          const disabledTools = agent.tools?.disabled || [];
          if (disabledTools.includes(toolCall.tool)) {
            finalResponse = `I tried to use the ${toolCall.tool} tool, but it's currently disabled. Please enable it with /enable ${toolCall.tool} if you want me to use it.`;
          } else {
            // Execute tool
            const toolResult = await this.toolManager.executeTool(
              toolCall.tool,
              toolCall.params || {}
            );

            logger.info(`Tool result: ${toolResult.slice(0, 200)}...`);

            // Get final response with tool result
            const toolPrompt = `The user asked: "${task.description}"\n\nYou used the ${toolCall.tool} tool and got this result:\n\n${toolResult}\n\nNow provide a helpful, natural language response to the user based on this information. Do NOT use JSON format in your response.`;
            const finalLLMResponse = await this.llmManager.complete(
              agent.llm.provider,
              agent.llm.model,
              toolPrompt,
              {
                systemPrompt: `You are ${agent.name}. Provide helpful, conversational responses.`,
                temperature: agent.llm.temperature,
                maxTokens: agent.llm.maxTokens,
              }
            );
            
            finalResponse = finalLLMResponse.content;
          }
        } catch (error) {
          logger.error('Tool execution failed:', error);
          finalResponse = `I tried to use a tool but encountered an error: ${error}. Let me try to help you another way.`;
        }
      }

      // Save user message to transcript (JSONL)
      await this.memoryManager.saveMessageToTranscript(agentId, 'user', task.description);
      
      // Save assistant response to transcript (JSONL)
      await this.memoryManager.saveMessageToTranscript(agentId, 'assistant', finalResponse);

      // Update context with new message (Markdown)
      const updatedContext = `${context}\n\nUser: ${task.description}\nAssistant: ${finalResponse}\n`;
      await this.memoryManager.updateContext(agentId, updatedContext);

      // Update status back to idle
      await this.updateAgentStatus(agentId, 'idle');

      logger.info(`Task completed for agent ${agentId}`);

      return finalResponse;
    } catch (error) {
      logger.error(`Task execution failed for agent ${agentId}:`, error);
      await this.updateAgentStatus(agentId, 'error');
      throw error;
    }
  }

  async processMessage(agentId: string, message: Message): Promise<string> {
    const task: Task = {
      id: randomUUID(),
      agentId,
      userId: message.userId,
      description: message.content,
      status: 'pending',
      createdAt: new Date(),
    };

    return this.executeTask(agentId, task);
  }

  private buildSystemPrompt(agent: AgentConfig, memory: string): string {
    let prompt = `You are ${agent.name}.`;
    
    // Add model info
    prompt += `\n\nYou are powered by ${agent.llm.provider} using the ${agent.llm.model} model.`;

    if (agent.personality) {
      prompt += `\n\n${agent.personality}`;
    }

    if (memory) {
      prompt += `\n\n# Memory\n${memory.slice(0, 1000)}`; // Limit memory size
    }

    if (agent.skills.length > 0) {
      prompt += `\n\n# Available Skills\n${agent.skills.join(', ')}`;
    }

    // Add tools description (only enabled tools)
    const disabledTools = agent.tools?.disabled || [];
    const toolsDesc = this.toolManager.getToolsDescription(disabledTools);
    
    if (toolsDesc !== 'No tools available') {
      prompt += `\n\n# Available Tools\n${toolsDesc}`;
      prompt += `\n\nIMPORTANT: When you need to use a tool, respond ONLY with a JSON object in this exact format:
{"tool": "tool_name", "params": {"param1": "value1"}}

Do NOT add any other text before or after the JSON. The system will execute the tool and provide you with the result.

Examples:
- To search the web: {"tool": "web_search", "params": {"query": "https://docs.openclaw.ai/"}}
- To read a file: {"tool": "read_file", "params": {"path": "README.md"}}
- To list directory: {"tool": "list_directory", "params": {"path": "."}}`;
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
