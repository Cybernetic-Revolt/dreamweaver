/**
 * LiveKit connection and track management.
 * Day 7: Enhanced reconnect handling, debug state.
 * Day 9: Speaker audio routing.
 */

import {
  Room,
  RoomEvent,
  Track,
  LocalAudioTrack,
  RemoteTrack,
  RemoteTrackPublication,
  LocalTrackPublication,
  Participant,
  createLocalAudioTrack,
} from 'livekit-client';
import { AudioSession } from '@livekit/react-native';
import { TRACK_NAMES } from './constants';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
export type SpeakingState = 'idle' | 'ptt' | 'narration';

export interface LiveKitState {
  connectionState: ConnectionState;
  speakingState: SpeakingState;
  error?: string;
}

export interface DebugState {
  connectionState: ConnectionState;
  micPublished: boolean;
  pttPublishing: boolean;
  lastNarrationId: string | null;
}

export interface LiveKitCallbacks {
  onStateChange: (state: LiveKitState) => void;
  onNarrationStart: (narrationId?: string) => void;
  onNarrationEnd: () => void;
  onDebugChange?: (debug: DebugState) => void;
}

/**
 * LiveKit connection manager.
 * Handles room connection, mic track, PTT track, and narration subscription.
 * Day 7: Enhanced reconnect, debug state tracking.
 */
export class LiveKitManager {
  private room: Room | null = null;
  private micTrack: LocalAudioTrack | null = null;
  private pttTrack: LocalAudioTrack | null = null;
  private callbacks: LiveKitCallbacks;
  private state: LiveKitState = {
    connectionState: 'disconnected',
    speakingState: 'idle',
  };

  // Debug state
  private lastNarrationId: string | null = null;
  private pttWasActiveOnDisconnect: boolean = false;

  constructor(callbacks: LiveKitCallbacks) {
    this.callbacks = callbacks;
  }

  private updateState(updates: Partial<LiveKitState>) {
    this.state = { ...this.state, ...updates };
    this.callbacks.onStateChange(this.state);
    this.emitDebugState();
  }

  private emitDebugState() {
    if (this.callbacks.onDebugChange) {
      this.callbacks.onDebugChange({
        connectionState: this.state.connectionState,
        micPublished: this.micTrack !== null,
        pttPublishing: this.pttTrack !== null,
        lastNarrationId: this.lastNarrationId,
      });
    }
  }

  /**
   * Connect to LiveKit room and publish mic track.
   * @param speakerMode If true, routes audio to speaker instead of earpiece (default: true)
   */
  async connect(wsUrl: string, token: string, speakerMode: boolean = true): Promise<void> {
    this.updateState({ connectionState: 'connecting', error: undefined });

    try {
      // Configure audio session for speaker output
      await AudioSession.configureAudio({
        android: {
          // Use speaker for output
          preferredOutputList: speakerMode ? ['speaker'] : ['earpiece'],
        },
        ios: {
          defaultOutput: speakerMode ? 'speaker' : 'earpiece',
        },
      });
      await AudioSession.startAudioSession();

      // Create room instance
      this.room = new Room();

      // Set up event handlers
      this.setupEventHandlers();

      // Connect to room
      await this.room.connect(wsUrl, token, {
        autoSubscribe: true,
      });

      // Publish mic track immediately
      await this.publishMicTrack();

      this.updateState({ connectionState: 'connected' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      this.updateState({ connectionState: 'disconnected', error: message });
      throw error;
    }
  }

  /**
   * Set speaker mode (routes audio to speaker or earpiece).
   */
  async setSpeakerMode(enabled: boolean): Promise<void> {
    try {
      await AudioSession.configureAudio({
        android: {
          preferredOutputList: enabled ? ['speaker'] : ['earpiece'],
        },
        ios: {
          defaultOutput: enabled ? 'speaker' : 'earpiece',
        },
      });
      console.log('[LiveKit] Speaker mode:', enabled ? 'ON' : 'OFF');
    } catch (error) {
      console.error('[LiveKit] Failed to set speaker mode:', error);
    }
  }

  /**
   * Disconnect from room and clean up.
   */
  async disconnect(): Promise<void> {
    try {
      // Unpublish tracks
      if (this.pttTrack) {
        await this.stopPtt();
      }

      if (this.micTrack && this.room?.localParticipant) {
        await this.room.localParticipant.unpublishTrack(this.micTrack);
        this.micTrack.stop();
        this.micTrack = null;
      }

      // Disconnect room
      if (this.room) {
        await this.room.disconnect();
        this.room = null;
      }
    } finally {
      this.updateState({ connectionState: 'disconnected', speakingState: 'idle' });
    }
  }

  /**
   * Publish open mic track (always on).
   */
  private async publishMicTrack(): Promise<void> {
    if (!this.room?.localParticipant) return;

    // Clean up existing track if any
    if (this.micTrack) {
      try {
        await this.room.localParticipant.unpublishTrack(this.micTrack);
        this.micTrack.stop();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.micTrack = null;
    }

    this.micTrack = await createLocalAudioTrack({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });

    await this.room.localParticipant.publishTrack(this.micTrack, {
      name: TRACK_NAMES.MIC,
      source: Track.Source.Microphone,
    });
    this.emitDebugState();
  }

  /**
   * Start PTT - create and publish PTT track.
   */
  async startPtt(): Promise<void> {
    if (!this.room?.localParticipant || this.pttTrack) return;

    this.pttTrack = await createLocalAudioTrack({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });

    await this.room.localParticipant.publishTrack(this.pttTrack, {
      name: TRACK_NAMES.PTT,
      source: Track.Source.Microphone,
    });
    this.updateState({ speakingState: 'ptt' });
  }

  /**
   * Stop PTT - unpublish and destroy PTT track.
   */
  async stopPtt(): Promise<void> {
    if (!this.pttTrack) return;

    try {
      if (this.room?.localParticipant) {
        await this.room.localParticipant.unpublishTrack(this.pttTrack);
      }
      this.pttTrack.stop();
    } catch (e) {
      // Ignore errors during cleanup
    } finally {
      this.pttTrack = null;
      if (this.state.speakingState === 'ptt') {
        this.updateState({ speakingState: 'idle' });
      }
    }
  }

  /**
   * Force stop PTT (for reconnect recovery).
   */
  private async forceStopPtt(): Promise<void> {
    if (this.pttTrack) {
      try {
        this.pttTrack.stop();
      } catch (e) {
        // Ignore
      }
      this.pttTrack = null;
    }
    if (this.state.speakingState === 'ptt') {
      this.updateState({ speakingState: 'idle' });
    }
    this.pttWasActiveOnDisconnect = false;
  }

  /**
   * Handle reconnection - verify and republish mic, cleanup stuck PTT.
   */
  private async handleReconnect(): Promise<void> {
    console.log('[LiveKit] Handling reconnect...');

    // Force-stop any stuck PTT
    if (this.pttWasActiveOnDisconnect || this.pttTrack) {
      console.log('[LiveKit] Force-stopping PTT after reconnect');
      await this.forceStopPtt();
    }

    // Verify mic is published, republish if needed
    if (this.room?.localParticipant) {
      const micPublications = this.room.localParticipant.audioTrackPublications;
      let micFound = false;

      micPublications.forEach((pub) => {
        if (pub.trackName === TRACK_NAMES.MIC) {
          micFound = true;
        }
      });

      if (!micFound) {
        console.log('[LiveKit] Mic not published, republishing...');
        await this.publishMicTrack();
      } else {
        console.log('[LiveKit] Mic already published');
      }
    }

    this.emitDebugState();
  }

  /**
   * Set up room event handlers.
   */
  private setupEventHandlers(): void {
    if (!this.room) return;

    // Track subscribed - check for AI narration
    this.room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: Participant) => {
      if (publication.trackName === TRACK_NAMES.AI_NARRATION) {
        // Extract narration ID from track metadata if available
        const narrationId = publication.trackSid || `narr-${Date.now()}`;
        this.lastNarrationId = narrationId;
        this.updateState({ speakingState: 'narration' });
        this.callbacks.onNarrationStart(narrationId);
      }
    });

    // Track unsubscribed
    this.room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: Participant) => {
      if (publication.trackName === TRACK_NAMES.AI_NARRATION) {
        if (this.state.speakingState === 'narration') {
          this.updateState({ speakingState: 'idle' });
        }
        this.callbacks.onNarrationEnd();
      }
    });

    // Connection state changes
    this.room.on(RoomEvent.Disconnected, () => {
      // Remember if PTT was active
      this.pttWasActiveOnDisconnect = this.pttTrack !== null;
      this.updateState({ connectionState: 'disconnected', speakingState: 'idle' });
    });

    this.room.on(RoomEvent.Reconnecting, () => {
      // Remember if PTT was active before reconnecting
      this.pttWasActiveOnDisconnect = this.pttTrack !== null;
      this.updateState({ connectionState: 'reconnecting' });
    });

    this.room.on(RoomEvent.Reconnected, async () => {
      this.updateState({ connectionState: 'connected' });
      // Handle reconnection recovery
      await this.handleReconnect();
    });

    // Track muted/unmuted for debugging
    this.room.on(RoomEvent.LocalTrackUnpublished, (publication: LocalTrackPublication, participant: Participant) => {
      console.log('[LiveKit] Local track unpublished:', publication.trackName);
      if (publication.trackName === TRACK_NAMES.MIC) {
        this.micTrack = null;
      } else if (publication.trackName === TRACK_NAMES.PTT) {
        this.pttTrack = null;
      }
      this.emitDebugState();
    });
  }

  /**
   * Get current state.
   */
  getState(): LiveKitState {
    return this.state;
  }

  /**
   * Get debug state.
   */
  getDebugState(): DebugState {
    return {
      connectionState: this.state.connectionState,
      micPublished: this.micTrack !== null,
      pttPublishing: this.pttTrack !== null,
      lastNarrationId: this.lastNarrationId,
    };
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.state.connectionState === 'connected';
  }

  /**
   * Get room name (for commands).
   */
  getRoomName(): string | undefined {
    return this.room?.name;
  }
}
