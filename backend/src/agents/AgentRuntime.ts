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
      const context = await this.memoryManager.loadContext(agentId, sessionKey);

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
    let prompt = `You are ${agent.name}, an AI assistant.`;
    
    // Add model info with few-shot examples - CRITICAL for overriding training data
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
