/**
 * Ollama LLM Client
 *
 * Wrapper for Ollama API with timeout and error handling.
 * Returns null on any failure for graceful fallback to deterministic responses.
 */

import { logger } from './logger';

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface OllamaResult {
  text: string;
  latencyMs: number;
  tokens?: number;
}

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: false;
  // Disable "thinking" for reasoning models (e.g. qwen3.x) so the response is
  // the narration only — thinking tokens would blow the driving-safety budget.
  think?: boolean;
  // Keep the model resident in VRAM between turns to avoid cold-load latency
  // (a cold load of a large model can take >10s; -1 pins it indefinitely).
  keep_alive?: string | number;
  options?: {
    temperature?: number;
    num_predict?: number;
    stop?: string[];
  };
}

interface OllamaGenerateResponse {
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

// Default configuration
const DEFAULT_CONFIG: OllamaConfig = {
  baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  model: process.env.OLLAMA_MODEL || 'llama3:8b',
  timeoutMs: 3000, // 3 second timeout for driving safety
};

/**
 * Generate a response from Ollama.
 * Returns null on any failure (timeout, connection error, invalid response).
 */
export async function generateResponse(
  prompt: string,
  config: Partial<OllamaConfig> = {},
): Promise<OllamaResult | null> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const requestBody: OllamaGenerateRequest = {
      model: cfg.model,
      prompt,
      stream: false,
      think: false, // narration only — no chain-of-thought tokens
      keep_alive: -1, // pin the model in VRAM so live turns stay warm (~1.7s)
      options: {
        temperature: 0.7,
        num_predict: 100, // Limit tokens for concise responses
      },
    };

    const response = await fetch(`${cfg.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.error('ollama_http_error', {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = (await response.json()) as OllamaGenerateResponse;
    const latencyMs = Date.now() - startTime;

    if (!data.response || typeof data.response !== 'string') {
      logger.error('ollama_invalid_response', { data });
      return null;
    }

    const text = data.response.trim();

    logger.info('ollama_response', {
      latencyMs,
      tokens: data.eval_count,
      textLen: text.length,
    });

    return {
      text,
      latencyMs,
      tokens: data.eval_count,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        logger.warn('ollama_timeout', { timeoutMs: cfg.timeoutMs });
      } else {
        logger.error('ollama_error', { error: error.message });
      }
    }

    return null;
  }
}

/**
 * Check if Ollama is available and has the model loaded.
 */
export async function checkOllamaHealth(
  config: Partial<OllamaConfig> = {},
): Promise<boolean> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  try {
    const response = await fetch(`${cfg.baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) return false;

    const data = (await response.json()) as { models?: Array<{ name: string }> };
    const models = data.models || [];

    const hasModel = models.some(
      (m) => m.name === cfg.model || m.name.startsWith(cfg.model.split(':')[0]),
    );

    logger.info('ollama_health', { available: true, hasModel, modelCount: models.length });
    return hasModel;
  } catch {
    logger.warn('ollama_health', { available: false });
    return false;
  }
}
