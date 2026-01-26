/**
 * LiveKit connection and track management.
 */

import {
  Room,
  RoomEvent,
  LocalParticipant,
  RemoteParticipant,
  Track,
  LocalTrack,
  RemoteTrack,
  createLocalAudioTrack,
  AudioCaptureOptions,
  TrackPublishOptions,
} from '@livekit/react-native';
import { TRACK_NAMES } from './constants';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type SpeakingState = 'idle' | 'ptt' | 'narration';

export interface LiveKitState {
  connectionState: ConnectionState;
  speakingState: SpeakingState;
  error?: string;
}

export interface LiveKitCallbacks {
  onStateChange: (state: LiveKitState) => void;
  onNarrationStart: () => void;
  onNarrationEnd: () => void;
}

/**
 * LiveKit connection manager.
 * Handles room connection, mic track, PTT track, and narration subscription.
 */
export class LiveKitManager {
  private room: Room | null = null;
  private micTrack: LocalTrack | null = null;
  private pttTrack: LocalTrack | null = null;
  private callbacks: LiveKitCallbacks;
  private state: LiveKitState = {
    connectionState: 'disconnected',
    speakingState: 'idle',
  };

  constructor(callbacks: LiveKitCallbacks) {
    this.callbacks = callbacks;
  }

  private updateState(updates: Partial<LiveKitState>) {
    this.state = { ...this.state, ...updates };
    this.callbacks.onStateChange(this.state);
  }

  /**
   * Connect to LiveKit room and publish mic track.
   */
  async connect(wsUrl: string, token: string): Promise<void> {
    this.updateState({ connectionState: 'connecting', error: undefined });

    try {
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
      this.updateState({ connectionState: 'error', error: message });
      throw error;
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

    const options: AudioCaptureOptions = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };

    this.micTrack = await createLocalAudioTrack(options);

    const publishOptions: TrackPublishOptions = {
      name: TRACK_NAMES.MIC,
      source: Track.Source.Microphone,
    };

    await this.room.localParticipant.publishTrack(this.micTrack, publishOptions);
  }

  /**
   * Start PTT - create and publish PTT track.
   */
  async startPtt(): Promise<void> {
    if (!this.room?.localParticipant || this.pttTrack) return;

    const options: AudioCaptureOptions = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };

    this.pttTrack = await createLocalAudioTrack(options);

    const publishOptions: TrackPublishOptions = {
      name: TRACK_NAMES.PTT,
      source: Track.Source.Microphone,
    };

    await this.room.localParticipant.publishTrack(this.pttTrack, publishOptions);
    this.updateState({ speakingState: 'ptt' });
  }

  /**
   * Stop PTT - unpublish and destroy PTT track.
   */
  async stopPtt(): Promise<void> {
    if (!this.room?.localParticipant || !this.pttTrack) return;

    await this.room.localParticipant.unpublishTrack(this.pttTrack);
    this.pttTrack.stop();
    this.pttTrack = null;

    this.updateState({ speakingState: 'idle' });
  }

  /**
   * Set up room event handlers.
   */
  private setupEventHandlers(): void {
    if (!this.room) return;

    // Track subscribed - check for AI narration
    this.room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication, participant) => {
      if (publication.trackName === TRACK_NAMES.AI_NARRATION) {
        this.updateState({ speakingState: 'narration' });
        this.callbacks.onNarrationStart();
      }
    });

    // Track unsubscribed
    this.room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication, participant) => {
      if (publication.trackName === TRACK_NAMES.AI_NARRATION) {
        if (this.state.speakingState === 'narration') {
          this.updateState({ speakingState: 'idle' });
        }
        this.callbacks.onNarrationEnd();
      }
    });

    // Connection state changes
    this.room.on(RoomEvent.Disconnected, () => {
      this.updateState({ connectionState: 'disconnected', speakingState: 'idle' });
    });

    this.room.on(RoomEvent.Reconnecting, () => {
      this.updateState({ connectionState: 'connecting' });
    });

    this.room.on(RoomEvent.Reconnected, () => {
      this.updateState({ connectionState: 'connected' });
    });
  }

  /**
   * Get current state.
   */
  getState(): LiveKitState {
    return this.state;
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.state.connectionState === 'connected';
  }
}
