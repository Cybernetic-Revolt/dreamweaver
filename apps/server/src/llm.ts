/**
 * LLM Provider Dispatch
 *
 * Routes GM/intent prompts to DeepSeek's hosted API when DEEPSEEK_API_KEY is
 * set, otherwise falls back to a local Ollama instance. Set LLM_PROVIDER to
 * force a specific provider regardless of which keys are present.
 */

import { generateResponse as generateOllamaResponse } from './ollama';
import { generateResponse as generateDeepSeekResponse } from './deepseek';

export interface LLMResult {
  text: string;
  latencyMs: number;
  tokens?: number;
}

export interface LLMConfig {
  timeoutMs?: number;
}

type Provider = 'deepseek' | 'ollama';

function resolveProvider(): Provider {
  const forced = process.env.LLM_PROVIDER as Provider | undefined;
  if (forced === 'deepseek' || forced === 'ollama') return forced;
  return process.env.DEEPSEEK_API_KEY ? 'deepseek' : 'ollama';
}

/**
 * Generate a response from the configured LLM provider.
 * Returns null on any failure for graceful fallback to deterministic responses.
 */
export async function generateResponse(
  prompt: string,
  config: LLMConfig = {},
): Promise<LLMResult | null> {
  return resolveProvider() === 'deepseek'
    ? generateDeepSeekResponse(prompt, config)
    : generateOllamaResponse(prompt, config);
}
