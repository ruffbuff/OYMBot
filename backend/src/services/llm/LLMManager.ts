import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';

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
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    if (process.env.OPENROUTER_API_KEY) {
      this.openrouter = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
      });
    }
    this.ollamaEndpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
  }

  async complete(
    provider: LLMProvider,
    model: string,
    prompt: string,
    options?: { temperature?: number; maxTokens?: number; systemPrompt?: string; }
  ): Promise<LLMResponse> {
    switch (provider) {
      case 'openai': return this.completeOpenAI(model, prompt, options);
      case 'openrouter': return this.completeOpenRouter(model, prompt, options);
      case 'ollama': return this.completeOllama(model, prompt, options);
      default: throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private async completeOpenAI(model: string, prompt: string, options?: any): Promise<LLMResponse> {
    if (!this.openai) throw new Error('OpenAI key missing');
    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: options?.systemPrompt || '' },
        { role: 'user', content: prompt }
      ],
      temperature: options?.temperature ?? 0.7,
    });
    return { content: response.choices[0]?.message?.content || '', tokens: response.usage?.total_tokens || 0, model };
  }

  private async completeOpenRouter(model: string, prompt: string, options?: any): Promise<LLMResponse> {
    if (!this.openrouter) throw new Error('OpenRouter key missing');
    const response = await this.openrouter.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: options?.systemPrompt || '' },
        { role: 'user', content: prompt }
      ],
      temperature: options?.temperature ?? 0.7,
    });
    return { content: response.choices[0]?.message?.content || '', tokens: response.usage?.total_tokens || 0, model };
  }

  private async completeOllama(model: string, prompt: string, options?: any): Promise<LLMResponse> {
    const response = await fetch(`${this.ollamaEndpoint}/api/generate`, {
      method: 'POST',
      body: JSON.stringify({
        model,
        prompt: options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt,
        stream: false,
      }),
    });
    const data = await response.json() as any;
    return { content: data.response || '', tokens: 0, model };
  }
}
