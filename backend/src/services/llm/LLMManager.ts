import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger.js';

export interface LLMResponse {
  content: string;
  tokens: number;
  model: string;
}

type LLMProvider = 'openai' | 'ollama' | 'ollama-cloud' | 'anthropic' | 'openrouter';

export class LLMManager {
  private openai: OpenAI | null = null;
  private openrouter: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  private ollamaEndpoint: string;
  private ollamaCloudEndpoint: string;

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
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    this.ollamaEndpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
    // Ollama Cloud uses the same local endpoint — auth is handled by `ollama signin`
    this.ollamaCloudEndpoint = process.env.OLLAMA_CLOUD_ENDPOINT || 'http://localhost:11434';
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
      case 'ollama-cloud': return this.completeOllamaCloud(model, prompt, options);
      case 'anthropic': return this.completeAnthropic(model, prompt, options);
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

  private async completeOllamaCloud(model: string, prompt: string, options?: any): Promise<LLMResponse> {
    // Ollama Cloud uses the same local API — auth is via `ollama signin` (OAuth to ollama.com)
    // Cloud models have the `-cloud` suffix, e.g. gpt-oss:120b-cloud
    const response = await fetch(`${this.ollamaCloudEndpoint}/api/generate`, {
      method: 'POST',
      body: JSON.stringify({
        model,
        prompt: options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt,
        stream: false,
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      if (response.status === 401 || err.includes('sign')) {
        throw new Error('Ollama Cloud: not signed in. Run `ollama signin` in your terminal first.');
      }
      throw new Error(`Ollama Cloud error ${response.status}: ${err}`);
    }
    const data = await response.json() as any;
    return { content: data.response || '', tokens: 0, model };
  }

  private async completeAnthropic(model: string, prompt: string, options?: any): Promise<LLMResponse> {
    if (!this.anthropic) throw new Error('Anthropic API key missing. Set ANTHROPIC_API_KEY in .env');
    const response = await this.anthropic.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 4096,
      system: options?.systemPrompt || undefined,
      messages: [{ role: 'user', content: prompt }],
    });
    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    return { content, tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0), model };
  }
}
