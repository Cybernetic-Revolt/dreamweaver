/**
 * Dreamweaver Mobile App
 *
 * Day 6: Minimal PTT client.
 * - Connect to LiveKit room
 * - Publish mic track (always on)
 * - Hold-to-talk PTT button
 * - Subscribe to AI narration
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StatusBar,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { registerGlobals } from '@livekit/react-native';
import { DEFAULTS } from './src/constants';
import { fetchToken } from './src/api';
import { LiveKitManager, LiveKitState, ConnectionState, SpeakingState } from './src/livekit';

// Register LiveKit globals (required for React Native)
registerGlobals();

// Generate a random player ID
const generatePlayerId = (): string => {
  return `${DEFAULTS.IDENTITY_PREFIX}${Math.random().toString(36).substring(2, 8)}`;
};

export default function App() {
  // State
  const [roomName, setRoomName] = useState(DEFAULTS.ROOM_NAME);
  const [identity] = useState(generatePlayerId);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [speakingState, setSpeakingState] = useState<SpeakingState>('idle');
  const [error, setError] = useState<string | undefined>();
  const [isPttPressed, setIsPttPressed] = useState(false);

  // LiveKit manager ref
  const livekit = useRef<LiveKitManager | null>(null);

  // Initialize LiveKit manager
  useEffect(() => {
    livekit.current = new LiveKitManager({
      onStateChange: (state: LiveKitState) => {
        setConnectionState(state.connectionState);
        setSpeakingState(state.speakingState);
        setError(state.error);
      },
      onNarrationStart: () => {
        // Narration started - could add haptic feedback here
      },
      onNarrationEnd: () => {
        // Narration ended
      },
    });

    return () => {
      livekit.current?.disconnect();
    };
  }, []);

  // Connect to room
  const handleConnect = useCallback(async () => {
    if (!livekit.current) return;

    try {
      setError(undefined);
      const { token, wsUrl } = await fetchToken(identity, roomName);
      await livekit.current.connect(wsUrl, token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      Alert.alert('Connection Error', message);
    }
  }, [identity, roomName]);

  // Disconnect from room
  const handleDisconnect = useCallback(async () => {
    if (!livekit.current) return;
    await livekit.current.disconnect();
  }, []);

  // PTT press handlers
  const handlePttPressIn = useCallback(async () => {
    if (!livekit.current?.isConnected()) return;
    setIsPttPressed(true);
    await livekit.current.startPtt();
  }, []);

  const handlePttPressOut = useCallback(async () => {
    if (!livekit.current) return;
    setIsPttPressed(false);
    await livekit.current.stopPtt();
  }, []);

  // Status text
  const getStatusText = (): string => {
    if (error) return `Error: ${error}`;
    if (connectionState === 'connecting') return 'Connecting...';
    if (connectionState === 'disconnected') return 'Disconnected';
    if (speakingState === 'ptt') return 'Speaking...';
    if (speakingState === 'narration') return 'Receiving narration...';
    return 'Connected - Hold button to speak';
  };

  // Status color
  const getStatusColor = (): string => {
    if (error) return '#ff4444';
    if (connectionState === 'connecting') return '#ffaa00';
    if (connectionState === 'connected') {
      if (speakingState === 'ptt') return '#44ff44';
      if (speakingState === 'narration') return '#4444ff';
      return '#44ff44';
    }
    return '#888888';
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Dreamweaver</Text>
          <Text style={styles.subtitle}>Voice RPG</Text>
        </View>

        {/* Room input (only when disconnected) */}
        {connectionState === 'disconnected' && (
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Room Name</Text>
            <TextInput
              style={styles.input}
              value={roomName}
              onChangeText={setRoomName}
              placeholder="campaign-dev"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.identityText}>Playing as: {identity}</Text>
          </View>
        )}

        {/* Connect/Disconnect button */}
        <View style={styles.connectContainer}>
          {connectionState === 'disconnected' ? (
            <TouchableOpacity style={styles.connectButton} onPress={handleConnect}>
              <Text style={styles.connectButtonText}>Connect</Text>
            </TouchableOpacity>
          ) : connectionState === 'connecting' ? (
            <View style={[styles.connectButton, styles.connectingButton]}>
              <Text style={styles.connectButtonText}>Connecting...</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.connectButton, styles.disconnectButton]}
              onPress={handleDisconnect}
            >
              <Text style={styles.connectButtonText}>Disconnect</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* PTT Button (only when connected) */}
        {connectionState === 'connected' && (
          <View style={styles.pttContainer}>
            <Pressable
              style={[
                styles.pttButton,
                isPttPressed && styles.pttButtonPressed,
                speakingState === 'narration' && styles.pttButtonNarration,
              ]}
              onPressIn={handlePttPressIn}
              onPressOut={handlePttPressOut}
              delayLongPress={0}
            >
              <Text style={styles.pttButtonText}>
                {isPttPressed ? 'SPEAKING' : 'HOLD TO TALK'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Status line */}
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 16,
    color: '#888888',
    marginTop: 4,
  },
  inputContainer: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  label: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#2a2a4e',
    borderRadius: 8,
    padding: 16,
    fontSize: 18,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#3a3a6e',
  },
  identityText: {
    fontSize: 12,
    color: '#666666',
    marginTop: 12,
    textAlign: 'center',
  },
  connectContainer: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  connectButton: {
    backgroundColor: '#4a4aff',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  connectingButton: {
    backgroundColor: '#666666',
  },
  disconnectButton: {
    backgroundColor: '#ff4444',
  },
  connectButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  pttContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  pttButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#3a3a6e',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#4a4aff',
    ...Platform.select({
      ios: {
        shadowColor: '#4a4aff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  pttButtonPressed: {
    backgroundColor: '#44ff44',
    borderColor: '#22cc22',
  },
  pttButtonNarration: {
    backgroundColor: '#4444ff',
    borderColor: '#2222cc',
  },
  pttButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    color: '#888888',
  },
});
