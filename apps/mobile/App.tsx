/**
 * Dreamweaver Mobile App
 *
 * Day 7: Productization
 * - Zero-typing Quick Join
 * - Enhanced reconnect handling
 * - Reserved command buttons (STOP, REPEAT, HELP)
 * - Debug observability line
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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULTS } from './src/constants';
import { fetchToken, sendCommand, ReservedCommand } from './src/api';
import {
  getIdentity,
  getDefaultRoom,
  saveLastRoom,
  getLastRoom,
  getSpeakerMode,
  saveSpeakerMode,
} from './src/storage';

// Register LiveKit globals (required for React Native)
// Wrap in try-catch to debug initialization issues
let livekitAvailable = false;
let LiveKitManager: any = null;

try {
  const lkNative = require('@livekit/react-native');
  if (lkNative.registerGlobals) {
    lkNative.registerGlobals();
    livekitAvailable = true;
  }
  const lkModule = require('./src/livekit');
  LiveKitManager = lkModule.LiveKitManager;
} catch (e) {
  console.error('[LiveKit] Failed to initialize:', e);
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
export type SpeakingState = 'idle' | 'ptt' | 'narration';
export interface DebugState {
  connectionState: ConnectionState;
  micPublished: boolean;
  pttPublishing: boolean;
  lastNarrationId: string | null;
}
export interface LiveKitState {
  connectionState: ConnectionState;
  speakingState: SpeakingState;
  error?: string;
}

export default function App() {
  // State
  const [roomName, setRoomName] = useState('');
  const [identity, setIdentity] = useState('');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [speakingState, setSpeakingState] = useState<SpeakingState>('idle');
  const [error, setError] = useState<string | undefined>();
  const [isPttPressed, setIsPttPressed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showManualJoin, setShowManualJoin] = useState(false);

  // Day 8: Drive Mode - safety boundary for driving
  const [driveMode, setDriveMode] = useState(true);

  // Day 9: Speaker mode - route audio to speaker instead of earpiece
  const [speakerMode, setSpeakerMode] = useState(true);

  // Debug state
  const [debugState, setDebugState] = useState<DebugState>({
    connectionState: 'disconnected',
    micPublished: false,
    pttPublishing: false,
    lastNarrationId: null,
  });

  // LiveKit manager ref
  const livekit = useRef<any>(null);
  const currentRoomName = useRef<string>('');

  // Initialize persistent identity, room, and preferences
  useEffect(() => {
    const init = async () => {
      try {
        const [storedIdentity, defaultRoom, lastRoom, storedSpeakerMode] = await Promise.all([
          getIdentity(),
          getDefaultRoom(),
          getLastRoom(),
          getSpeakerMode(),
        ]);
        setIdentity(storedIdentity);
        setRoomName(lastRoom || defaultRoom);
        setSpeakerMode(storedSpeakerMode);
      } catch (e) {
        console.error('Failed to load stored data:', e);
        // Fallback to random identity
        setIdentity(`player-${Math.random().toString(36).substring(2, 8)}`);
        setRoomName(DEFAULTS.ROOM_NAME);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // Initialize LiveKit manager
  useEffect(() => {
    livekit.current = new LiveKitManager({
      onStateChange: (state: LiveKitState) => {
        setConnectionState(state.connectionState);
        setSpeakingState(state.speakingState);
        setError(state.error);
      },
      onNarrationStart: (narrationId?: string) => {
        // Narration started - could add haptic feedback here
      },
      onNarrationEnd: () => {
        // Narration ended
      },
      onDebugChange: (debug: DebugState) => {
        setDebugState(debug);
      },
    });

    return () => {
      livekit.current?.disconnect();
    };
  }, []);

  // Connect to room
  const handleConnect = useCallback(async (room?: string) => {
    if (!livekit.current || !identity) return;

    const targetRoom = room || roomName;
    if (!targetRoom) {
      Alert.alert('Error', 'Room name is required');
      return;
    }

    try {
      setError(undefined);
      currentRoomName.current = targetRoom;
      const { token, wsUrl } = await fetchToken(identity, targetRoom);
      await livekit.current.connect(wsUrl, token, speakerMode);
      await saveLastRoom(targetRoom);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      Alert.alert('Connection Error', message);
    }
  }, [identity, roomName, speakerMode]);

  // Quick Join - connects to default room
  const handleQuickJoin = useCallback(async () => {
    const defaultRoom = await getDefaultRoom();
    setRoomName(defaultRoom);
    await handleConnect(defaultRoom);
  }, [handleConnect]);

  // Disconnect from room
  const handleDisconnect = useCallback(async () => {
    if (!livekit.current) return;
    await livekit.current.disconnect();
    currentRoomName.current = '';
  }, []);

  // Toggle speaker mode
  const handleToggleSpeaker = useCallback(async () => {
    const newMode = !speakerMode;
    setSpeakerMode(newMode);
    await saveSpeakerMode(newMode);
    // Apply immediately if connected
    if (livekit.current?.isConnected()) {
      await livekit.current.setSpeakerMode(newMode);
    }
  }, [speakerMode]);

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

  // Reserved command handlers (bypass STT)
  const handleCommand = useCallback(async (command: ReservedCommand) => {
    if (!livekit.current?.isConnected() || !currentRoomName.current) return;

    try {
      await sendCommand(currentRoomName.current, identity, command);
    } catch (err) {
      console.error(`Command ${command} failed:`, err);
    }
  }, [identity]);

  // Status text
  const getStatusText = (): string => {
    if (error) return `Error: ${error}`;
    if (connectionState === 'connecting') return 'Connecting...';
    if (connectionState === 'reconnecting') return 'Reconnecting...';
    if (connectionState === 'disconnected') return 'Disconnected';
    if (speakingState === 'ptt') return 'Speaking...';
    if (speakingState === 'narration') return 'Receiving narration...';
    return 'Connected - Hold button to speak';
  };

  // Status color
  const getStatusColor = (): string => {
    if (error) return '#ff4444';
    if (connectionState === 'connecting' || connectionState === 'reconnecting') return '#ffaa00';
    if (connectionState === 'connected') {
      if (speakingState === 'ptt') return '#44ff44';
      if (speakingState === 'narration') return '#4444ff';
      return '#44ff44';
    }
    return '#888888';
  };

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4a4aff" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // LiveKit not available
  if (!livekitAvailable || !LiveKitManager) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <View style={styles.loadingContainer}>
            <Text style={styles.title}>LiveKit Error</Text>
            <Text style={styles.loadingText}>
              LiveKit native modules failed to initialize.
              Please rebuild the app.
            </Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Dreamweaver</Text>
          <Text style={styles.subtitle}>Voice RPG</Text>
        </View>

        {/* Join UI (only when disconnected) */}
        {connectionState === 'disconnected' && (
          <View style={styles.joinContainer}>
            {/* Quick Join button */}
            <TouchableOpacity style={styles.quickJoinButton} onPress={handleQuickJoin}>
              <Text style={styles.quickJoinButtonText}>Quick Join</Text>
              <Text style={styles.quickJoinSubtext}>Your personal campaign</Text>
            </TouchableOpacity>

            {/* Toggle for manual join */}
            <TouchableOpacity
              style={styles.manualToggle}
              onPress={() => setShowManualJoin(!showManualJoin)}
            >
              <Text style={styles.manualToggleText}>
                {showManualJoin ? 'Hide manual join' : 'Join a different room'}
              </Text>
            </TouchableOpacity>

            {/* Manual room input (collapsible) */}
            {showManualJoin && (
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Room Name</Text>
                <TextInput
                  style={styles.input}
                  value={roomName}
                  onChangeText={setRoomName}
                  placeholder="campaign-abc123"
                  placeholderTextColor="#666"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity style={styles.connectButton} onPress={() => handleConnect()}>
                  <Text style={styles.connectButtonText}>Connect</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.identityText}>Playing as: {identity}</Text>
          </View>
        )}

        {/* Connecting/Reconnecting state */}
        {(connectionState === 'connecting' || connectionState === 'reconnecting') && (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="large" color="#4a4aff" />
            <Text style={styles.connectingText}>
              {connectionState === 'reconnecting' ? 'Reconnecting...' : 'Connecting...'}
            </Text>
          </View>
        )}

        {/* Connected UI */}
        {connectionState === 'connected' && (
          <>
            {/* PTT Button */}
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

            {/* Reserved command buttons */}
            <View style={styles.commandContainer}>
              <TouchableOpacity
                style={[styles.commandButton, styles.commandStop]}
                onPress={() => handleCommand('stop')}
              >
                <Text style={styles.commandButtonText}>STOP</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.commandButton, styles.commandRepeat]}
                onPress={() => handleCommand('repeat')}
              >
                <Text style={styles.commandButtonText}>REPEAT</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.commandButton, styles.commandHelp]}
                onPress={() => handleCommand('help')}
              >
                <Text style={styles.commandButtonText}>HELP</Text>
              </TouchableOpacity>
            </View>

            {/* Disconnect button */}
            <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
              <Text style={styles.disconnectButtonText}>Disconnect</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Status line */}
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>

        {/* Settings row: Drive Mode + Speaker */}
        <View style={styles.settingsRow}>
          {/* Drive Mode toggle */}
          <TouchableOpacity
            style={styles.settingButton}
            onPress={() => setDriveMode(!driveMode)}
          >
            <View style={[styles.settingIndicator, driveMode && styles.settingOn]} />
            <Text style={styles.settingText}>
              {driveMode ? 'DRIVE MODE' : 'STATIONARY'}
            </Text>
          </TouchableOpacity>

          {/* Speaker toggle */}
          <TouchableOpacity
            style={styles.settingButton}
            onPress={handleToggleSpeaker}
          >
            <View style={[styles.settingIndicator, speakerMode && styles.settingOn]} />
            <Text style={styles.settingText}>
              {speakerMode ? 'SPEAKER' : 'EARPIECE'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Debug line (hidden in drive mode) */}
        {!driveMode && (
          <View style={styles.debugContainer}>
            <Text style={styles.debugText}>
              {debugState.connectionState.toUpperCase()} | mic:{debugState.micPublished ? 'Y' : 'N'} | ptt:{debugState.pttPublishing ? 'Y' : 'N'} | narr:{debugState.lastNarrationId ? debugState.lastNarrationId.substring(0, 8) : '-'}
            </Text>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888888',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888888',
    marginTop: 4,
  },
  joinContainer: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  quickJoinButton: {
    backgroundColor: '#4a4aff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  quickJoinButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  quickJoinSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  manualToggle: {
    padding: 12,
    alignItems: 'center',
  },
  manualToggleText: {
    fontSize: 14,
    color: '#4a4aff',
    textDecorationLine: 'underline',
  },
  inputContainer: {
    marginTop: 16,
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
    marginBottom: 12,
  },
  identityText: {
    fontSize: 12,
    color: '#666666',
    marginTop: 16,
    textAlign: 'center',
  },
  connectButton: {
    backgroundColor: '#4a4aff',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  connectButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  connectingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectingText: {
    color: '#ffaa00',
    marginTop: 16,
    fontSize: 18,
  },
  pttContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  pttButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  commandContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  commandButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  commandStop: {
    backgroundColor: '#cc4444',
  },
  commandRepeat: {
    backgroundColor: '#4488cc',
  },
  commandHelp: {
    backgroundColor: '#44aa44',
  },
  commandButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  disconnectButton: {
    marginHorizontal: 24,
    marginBottom: 8,
    padding: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666666',
    borderRadius: 8,
    alignItems: 'center',
  },
  disconnectButtonText: {
    fontSize: 14,
    color: '#888888',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
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
  debugContainer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    alignItems: 'center',
  },
  debugText: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#555555',
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  settingButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#666666',
    marginRight: 8,
  },
  settingOn: {
    backgroundColor: '#44ff44',
  },
  settingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888888',
    letterSpacing: 1,
  },
});
