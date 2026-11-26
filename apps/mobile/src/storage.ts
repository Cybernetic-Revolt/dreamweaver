/**
 * Persistent storage for device/session data.
 * Day 7: Zero-typing join requires persisted identity.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const KEYS = {
  DEVICE_ID: '@dreamweaver/deviceId',
  IDENTITY: '@dreamweaver/identity',
  LAST_ROOM: '@dreamweaver/lastRoom',
  SPEAKER_MODE: '@dreamweaver/speakerMode',
} as const;

/**
 * Generate a stable device ID (persisted).
 */
export async function getDeviceId(): Promise<string> {
  let deviceId = await AsyncStorage.getItem(KEYS.DEVICE_ID);
  if (!deviceId) {
    deviceId = Crypto.randomUUID();
    await AsyncStorage.setItem(KEYS.DEVICE_ID, deviceId);
  }
  return deviceId;
}

/**
 * Get or generate persistent identity.
 */
export async function getIdentity(): Promise<string> {
  let identity = await AsyncStorage.getItem(KEYS.IDENTITY);
  if (!identity) {
    const deviceId = await getDeviceId();
    identity = `player-${deviceId.substring(0, 8)}`;
    await AsyncStorage.setItem(KEYS.IDENTITY, identity);
  }
  return identity;
}

/**
 * Get the default room name based on device ID.
 * Format: campaign-{deviceIdPrefix}
 */
export async function getDefaultRoom(): Promise<string> {
  const deviceId = await getDeviceId();
  return `campaign-${deviceId.substring(0, 8)}`;
}

/**
 * Save last used room name.
 */
export async function saveLastRoom(roomName: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.LAST_ROOM, roomName);
}

/**
 * Get last used room name.
 */
export async function getLastRoom(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.LAST_ROOM);
}

/**
 * Get speaker mode preference (defaults to true for voice RPG).
 */
export async function getSpeakerMode(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.SPEAKER_MODE);
  // Default to true (speaker on) for voice RPG use case
  return value === null ? true : value === 'true';
}

/**
 * Save speaker mode preference.
 */
export async function saveSpeakerMode(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.SPEAKER_MODE, enabled ? 'true' : 'false');
}

/**
 * Clear all stored data (for debugging/reset).
 */
export async function clearStorage(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.DEVICE_ID, KEYS.IDENTITY, KEYS.LAST_ROOM, KEYS.SPEAKER_MODE]);
}
