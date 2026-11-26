/**
 * API client for Dreamweaver server.
 */

import { API } from './constants';

// Server URL - hardcoded for this build
const SERVER_URL = 'http://10.10.1.193:3000';

const getServerUrl = (): string => SERVER_URL;

export interface TokenResponse {
  token: string;
  wsUrl: string;
  identity: string;
  room: string;
}

/**
 * Fetch LiveKit token from server.
 */
export async function fetchToken(identity: string, room: string): Promise<TokenResponse> {
  const serverUrl = getServerUrl();
  const url = `${serverUrl}${API.TOKEN}`;

  console.log('[API] Fetching token from:', url);
  console.log('[API] Request body:', { identity, room });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identity, room }),
    });

    console.log('[API] Response status:', response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error('[API] Error response:', error);
      throw new Error(`Failed to fetch token: ${error}`);
    }

    const data = await response.json();
    console.log('[API] Token received for room:', data.room);
    return data;
  } catch (err) {
    console.error('[API] Fetch failed:', err);
    // Re-throw with more details
    if (err instanceof TypeError && err.message === 'Network request failed') {
      throw new Error(`Network request failed. Server: ${serverUrl}. Check that the server is running and accessible.`);
    }
    throw err;
  }
}

/**
 * Check server health.
 */
export async function checkHealth(): Promise<boolean> {
  const serverUrl = getServerUrl();

  try {
    const response = await fetch(`${serverUrl}${API.HEALTH}`);
    return response.ok;
  } catch {
    return false;
  }
}

export type ReservedCommand = 'stop' | 'repeat' | 'help';

export interface CommandResponse {
  status: string;
  commandId?: string;
  intent?: string;
}

/**
 * Send a reserved command directly to server (bypasses STT).
 * Day 7: STOP, REPEAT, HELP buttons.
 */
export async function sendCommand(
  roomName: string,
  identity: string,
  command: ReservedCommand,
  traceId?: string
): Promise<CommandResponse> {
  const serverUrl = getServerUrl();

  const response = await fetch(`${serverUrl}${API.COMMAND}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      roomName,
      identity,
      text: command,
      traceId: traceId || `cmd-${Date.now()}`,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Command failed: ${error}`);
  }

  return response.json();
}
