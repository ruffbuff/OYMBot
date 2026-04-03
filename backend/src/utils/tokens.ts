/**
 * Simple token estimation utility.
 * For more accurate results, tiktoken could be used for OpenAI models.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  
  // A rough estimate: ~4 characters per token for English
  // For Russian/UTF-8, it's often more (around 1-2 tokens per word or 1 token per 2 chars)
  // We'll use a conservative 3 characters per token to be safe across languages
  return Math.ceil(text.length / 3);
}

export const CONTEXT_THRESHOLD = 4000; // Trigger flush when context exceeds this
export const CONTEXT_KEEP_RECENT = 1000; // Keep roughly this many tokens of recent history
