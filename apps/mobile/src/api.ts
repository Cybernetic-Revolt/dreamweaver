/**
 * API client for Dreamweaver server.
 */

import { API } from './constants';

// Get server URL from Expo config
const getServerUrl = (): string => {
  // @ts-ignore - Expo constants
  const expoConfig = global.__expo?.modules?.ExpoConstants?.manifest?.extra;
  return expoConfig?.serverUrl || 'http://localhost:3000';
};

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

  const response = await fetch(`${serverUrl}${API.TOKEN}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ identity, room }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch token: ${error}`);
  }

  return response.json();
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
