import OpenAI from 'openai';
import { logger } from '../../utils/logger';

export interface LLMResponse {
  content: string;
  tokens: number;
  model: string;
}

type LLMProvider = 'openai' | 'ollama' | 'anthropic' | 'openrouter';

export class LLMManager {
  private openai: OpenAI | null = null;
  private openrouter: OpenAI | null = null;
  private ollamaEndpoint: string;

  constructor() {
    // Initialize OpenAI if key exists
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }

    // Initialize OpenRouter if key exists
    if (process.env.OPENROUTER_API_KEY) {
      this.openrouter = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:3000',
          'X-Title': 'AI Office Platform',
        },
      });
    }

    this.ollamaEndpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
  }

  async complete(
    provider: LLMProvider,
    model: string,
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }
  ): Promise<LLMResponse> {
    switch (provider) {
      case 'openai':
        return this.completeOpenAI(model, prompt, options);
      case 'openrouter':
        return this.completeOpenRouter(model, prompt, options);
      case 'ollama':
        return this.completeOllama(model, prompt, options);
      case 'anthropic':
        throw new Error('Anthropic provider not yet implemented');
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private async completeOpenAI(
    model: string,
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }
  ): Promise<LLMResponse> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      
      if (options?.systemPrompt) {
        messages.push({
          role: 'system',
          content: options.systemPrompt,
        });
      }
      
      messages.push({
        role: 'user',
        content: prompt,
      });

      const response = await this.openai.chat.completions.create({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2000,
      });

      const content = response.choices[0]?.message?.content || '';
      const tokens = response.usage?.total_tokens || 0;

      logger.info(`OpenAI completion: ${tokens} tokens`);

      return {
        content,
        tokens,
        model,
      };
    } catch (error) {
      logger.error('OpenAI completion failed:', error);
      throw error;
    }
  }

  private async completeOpenRouter(
    model: string,
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }
  ): Promise<LLMResponse> {
    if (!this.openrouter) {
      throw new Error('OpenRouter API key not configured');
    }

    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      
      if (options?.systemPrompt) {
        messages.push({
          role: 'system',
          content: options.systemPrompt,
        });
      }
      
      messages.push({
        role: 'user',
        content: prompt,
      });

      const response = await this.openrouter.chat.completions.create({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2000,
      });

      const content = response.choices[0]?.message?.content || '';
      const tokens = response.usage?.total_tokens || 0;

      logger.info(`OpenRouter completion: ${model}, ${tokens} tokens`);

      return {
        content,
        tokens,
        model,
      };
    } catch (error) {
      logger.error('OpenRouter completion failed:', error);
      throw error;
    }
  }

  private async completeOllama(
    model: string,
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }
  ): Promise<LLMResponse> {
    try {
      const response = await fetch(`${this.ollamaEndpoint}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt,
          temperature: options?.temperature ?? 0.7,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.statusText}`);
      }

      const data = (await response.json()) as { response: string };

      logger.info(`Ollama completion: ${model}`);

      return {
        content: data.response || '',
        tokens: 0, // Ollama doesn't return token count
        model,
      };
    } catch (error) {
      logger.error('Ollama completion failed:', error);
      throw error;
    }
  }
}
