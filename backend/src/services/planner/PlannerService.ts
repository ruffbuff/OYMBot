import { randomUUID } from 'crypto';
import { AgentPlan, AgentStep, AgentConfig } from '../../types/agent.js';
import { LLMManager } from '../llm/LLMManager.js';
import { logger } from '../../utils/logger.js';

export class PlannerService {
  private llmManager: LLMManager;

  constructor(llmManager: LLMManager) {
    this.llmManager = llmManager;
  }

  /**
   * Create a plan for a complex task
   * This is the "Architect" phase
   */
  async createPlan(agent: AgentConfig, taskDescription: string): Promise<AgentPlan> {
    logger.info(`🏗️ Creating plan for task: ${taskDescription}`);

    const architectPrompt = this.buildArchitectPrompt(taskDescription);

    try {
      const response = await this.llmManager.complete(
        agent.llm.provider,
        agent.llm.model,
        architectPrompt,
        {
          systemPrompt: this.getArchitectSystemPrompt(),
          temperature: 0.3, // Lower temperature for more deterministic planning
          maxTokens: 4000,
        }
      );

      // Parse the plan from LLM response
      const plan = this.parsePlanFromResponse(response.content, taskDescription);
      
      logger.info(`✅ Plan created with ${plan.steps.length} steps`);
      
      return plan;
    } catch (error) {
      logger.error('Failed to create plan:', error);
      throw new Error(`Plan creation failed: ${error}`);
    }
  }

  /**
   * Refactor an existing plan based on execution results
   */
  async refactorPlan(
    agent: AgentConfig,
    currentPlan: AgentPlan,
    executionContext: string
  ): Promise<AgentPlan> {
    logger.info(`🔄 Refactoring plan from step ${currentPlan.currentStepIndex}`);

    const refactorPrompt = this.buildRefactorPrompt(currentPlan, executionContext);

    try {
      const response = await this.llmManager.complete(
        agent.llm.provider,
        agent.llm.model,
        refactorPrompt,
        {
          systemPrompt: this.getArchitectSystemPrompt(),
          temperature: 0.3,
          maxTokens: 4000,
        }
      );

      // Parse new steps
      const newSteps = this.parseStepsFromResponse(response.content);
      
      // Keep completed steps, replace remaining with new plan
      const updatedSteps = [
        ...currentPlan.steps.slice(0, currentPlan.currentStepIndex),
        ...newSteps,
      ];

      const updatedPlan: AgentPlan = {
        ...currentPlan,
        steps: updatedSteps,
        updatedAt: new Date(),
      };

      logger.info(`✅ Plan refactored: ${updatedSteps.length} total steps`);

      return updatedPlan;
    } catch (error) {
      logger.error('Failed to refactor plan:', error);
      throw new Error(`Plan refactoring failed: ${error}`);
    }
  }

  /**
   * Build architect system prompt
   */
  private getArchitectSystemPrompt(): string {
    const workspace = process.env.AGENT_WORKSPACE || process.cwd();
    
    return `You are an AI Architect specialized in breaking down complex tasks into executable steps.

# File System Access
- Workspace (home): ${workspace}
- Relative paths: resolved from workspace (./file.txt)
- Absolute paths: work anywhere on system (/Users/user/Desktop/file.txt)
- You have FULL file system access

# Path Strategy
- If user specifies location (Desktop, Documents, etc.) → use absolute path
- If user doesn't specify → use relative path (workspace)
- Ask for clarification if ambiguous

Your role:
- Analyze the user's request
- Break it down into atomic, sequential steps
- Each step should use ONE tool/action
- Be specific and detailed
- Consider error handling and validation
- Use appropriate paths (absolute or relative)

Available tools:
- shell_exec: Execute shell commands (mkdir, cd, npm, git, etc.)
- write_file: Create or overwrite a file with content
- read_file: Read file contents
- list_directory: List directory contents
- web_search: Search the web for information
- search_codebase: Search for patterns in project files (grep)
- get_file_tree: Get recursive directory structure

Output format: JSON array of steps
[
  {
    "id": 1,
    "action": "shell_exec",
    "params": {"command": "mkdir ~/Desktop/my-project"},
    "description": "Create project directory on Desktop",
    "validation": "Directory should exist"
  },
  {
    "id": 2,
    "action": "write_file",
    "params": {"path": "~/Desktop/my-project/index.html", "content": "<!DOCTYPE html>..."},
    "description": "Create index.html",
    "validation": "File should contain DOCTYPE declaration"
  }
]

CRITICAL RULES:
1. Use absolute paths when user specifies location
2. Use relative paths for workspace operations
3. Expand ~ to user home directory
4. Output ONLY valid JSON array, no markdown, no explanations.`;
  }

  /**
   * Build architect prompt for initial planning
   */
  private buildArchitectPrompt(taskDescription: string): string {
    return `Task: ${taskDescription}

Create a detailed execution plan as a JSON array of steps. Each step should:
1. Use ONE specific tool/action
2. Have clear parameters
3. Include validation criteria
4. Be atomic and sequential

Consider:
- Project structure and organization
- Dependencies and installation
- File creation order
- Testing and verification

Output the JSON array now:`;
  }

  /**
   * Build refactor prompt
   */
  private buildRefactorPrompt(currentPlan: AgentPlan, executionContext: string): string {
    const completedSteps = currentPlan.steps.slice(0, currentPlan.currentStepIndex);
    const remainingSteps = currentPlan.steps.slice(currentPlan.currentStepIndex);

    return `Original task: ${currentPlan.taskDescription}

Completed steps:
${completedSteps.map(s => `${s.id}. ${s.description} - ${s.status}`).join('\n')}

Current situation:
${executionContext}

Remaining steps (may need adjustment):
${remainingSteps.map(s => `${s.id}. ${s.description}`).join('\n')}

Based on the execution results, create a NEW plan for the remaining work.
Output ONLY the JSON array of new steps (starting from id ${currentPlan.currentStepIndex + 1}):`;
  }

  /**
   * Parse plan from LLM response
   */
  private parsePlanFromResponse(response: string, taskDescription: string): AgentPlan {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = response.trim();
      
      // Remove markdown code blocks if present
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }

      const steps = JSON.parse(jsonStr) as AgentStep[];

      // Validate and normalize steps
      const normalizedSteps = steps.map((step, index) => ({
        id: step.id || index + 1,
        action: step.action,
        params: step.params || {},
        description: step.description || `Step ${index + 1}`,
        validation: step.validation,
        status: 'pending' as const,
      }));

      return {
        id: randomUUID(),
        taskDescription,
        steps: normalizedSteps,
        currentStepIndex: 0,
        status: 'executing',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to parse plan:', error);
      logger.error('Response was:', response);
      throw new Error('Invalid plan format from LLM');
    }
  }

  /**
   * Parse steps from refactor response
   */
  private parseStepsFromResponse(response: string): AgentStep[] {
    try {
      let jsonStr = response.trim();
      
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }

      const steps = JSON.parse(jsonStr) as AgentStep[];

      return steps.map((step, index) => ({
        id: step.id || index + 1,
        action: step.action,
        params: step.params || {},
        description: step.description || `Step ${index + 1}`,
        validation: step.validation,
        status: 'pending' as const,
      }));
    } catch (error) {
      logger.error('Failed to parse refactored steps:', error);
      throw new Error('Invalid steps format from LLM');
    }
  }

  /**
   * Check if a task requires planning (complex task detection)
   */
  isComplexTask(description: string): boolean {
    const complexKeywords = [
      'создай',
      'create',
      'build',
      'develop',
      'implement',
      'setup',
      'install',
      'configure',
      'deploy',
      'generate',
      'make',
      'сделай',
      'напиши',
      'website',
      'app',
      'application',
      'project',
      'system',
      'api',
      'database',
      'сайт',
      'приложение',
      'проект',
    ];

    const lowerDesc = description.toLowerCase();
    
    // Check for complex keywords
    const hasComplexKeyword = complexKeywords.some(keyword => lowerDesc.includes(keyword));
    
    // Check for file creation patterns
    const hasFileCreation = /файл|file|html|css|js|py|java|cpp/.test(lowerDesc);
    
    // If it's a creation task with file operations, use planner
    if (hasComplexKeyword && hasFileCreation) {
      return true;
    }
    
    // Check for multiple actions (and, then, also, etc.)
    const hasMultipleActions = /\band\b|\bthen\b|\balso\b|\bafter\b|\bи\b|\bпотом\b|\bтакже\b/.test(lowerDesc);
    
    return hasComplexKeyword && hasMultipleActions;
  }
}
