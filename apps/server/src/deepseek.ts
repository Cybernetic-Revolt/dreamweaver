/**
 * DeepSeek LLM Client
 *
 * OpenAI-compatible chat-completions client. Drop-in replacement for the old
 * Ollama client: same `generateResponse(prompt, config?)` signature and the same
 * "return null on any failure" contract so the GM falls back to deterministic
 * narration cleanly. No local GPU required — narration is generated in the cloud.
 */

import { logger } from './logger';

export interface LLMConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

export interface LLMResult {
  text: string;
  latencyMs: number;
  tokens?: number;
}

const DEFAULT_CONFIG: LLMConfig = {
  baseUrl: process.env.DEEPSEEK_URL || 'https://api.deepseek.com',
  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  // Cloud round-trip: allow more headroom than the old 3s local budget, but keep
  // it short enough that a slow call falls back to the deterministic GM.
  timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 8000),
};

const SYSTEM_PROMPT =
  'You are the Game Master of a voice-first fantasy adventure. Reply with ONLY vivid, ' +
  'atmospheric narration — no preamble, no lists, no meta-commentary. Obey any word ' +
  'limit stated in the user message exactly.';

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { completion_tokens?: number };
}

/**
 * Generate a response from DeepSeek.
 * Returns null on any failure (timeout, HTTP error, empty/invalid response).
 */
export async function generateResponse(
  prompt: string,
  config: Partial<LLMConfig> = {},
): Promise<LLMResult | null> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!cfg.apiKey) {
    logger.error('deepseek_no_api_key', {});
    return null;
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: 120,
        temperature: 0.8,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.error('deepseek_http_error', {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) {
      logger.error('deepseek_invalid_response', {});
      return null;
    }

    const latencyMs = Date.now() - startTime;
    logger.info('deepseek_response', {
      latencyMs,
      tokens: data.usage?.completion_tokens,
      textLen: text.length,
    });

    return { text, latencyMs, tokens: data.usage?.completion_tokens };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        logger.warn('deepseek_timeout', { timeoutMs: cfg.timeoutMs });
      } else {
        logger.error('deepseek_error', { error: error.message });
      }
    }
    return null;
  }
}
