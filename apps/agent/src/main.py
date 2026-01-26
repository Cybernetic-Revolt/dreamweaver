"""
Dreamweaver AI Agent

Handles:
- Joining LiveKit rooms as GM participant
- Subscribing to PTT tracks for STT
- Audio frame buffering and transcription
- Publishing ai_narration audio track
- GM response generation via LLM
- Policy enforcement
- Emitting events to game server
- PTT interruption of narration
"""

import asyncio
import io
import os
import time
import uuid
import wave
import httpx
import numpy as np
import structlog
from livekit import agents, rtc

logger = structlog.get_logger()

# Track names (must match packages/shared/events.ts TRACK_NAMES)
TRACK_NAME_PTT = "ptt"
TRACK_NAME_MIC = "mic"
TRACK_NAME_AI_NARRATION = "ai_narration"

# Audio constants
SAMPLE_RATE = 48000  # LiveKit default
CHANNELS = 1


def generate_event_id() -> str:
    """Generate a UUID v4 for event IDs."""
    return str(uuid.uuid4())


class PttSessionState:
    """State for an active PTT session."""

    def __init__(self, track_sid: str, identity: str, ptt_session_id: str | None = None):
        self.track_sid = track_sid
        self.identity = identity
        self.ptt_session_id = ptt_session_id
        self.frame_count = 0
        self.started_at = time.time()
        self.audio_buffer: list[bytes] = []  # Raw PCM frames
        self.sample_rate = SAMPLE_RATE
        self.channels = CHANNELS


class NarrationState:
    """State for active narration playback."""

    def __init__(self, narration_id: str, session_id: str):
        self.narration_id = narration_id
        self.session_id = session_id
        self.started_at = time.time()
        self.interrupted = False
        self.task: asyncio.Task | None = None


class DreamweaverAgent:
    """AI Game Master agent that joins LiveKit rooms."""

    def __init__(self, room_name: str, room: rtc.Room):
        self.livekit_url = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
        self.api_key = os.getenv("LIVEKIT_API_KEY", "devkey")
        self.api_secret = os.getenv("LIVEKIT_API_SECRET", "secret")
        self.server_url = os.getenv("SERVER_URL", "http://localhost:3000")
        self.whisper_model = os.getenv("WHISPER_MODEL", "small.en")
        self.room_name = room_name
        self.room = room
        self._http_client = httpx.AsyncClient(timeout=30.0)

        # Active PTT sessions: track_sid -> PttSessionState
        self._ptt_sessions: dict[str, PttSessionState] = {}

        # Current narration state (only one at a time)
        self._narration: NarrationState | None = None

        # Audio source for publishing narration
        self._audio_source: rtc.AudioSource | None = None
        self._audio_track: rtc.LocalAudioTrack | None = None

        # STT model (lazy loaded)
        self._whisper = None

    async def _init_whisper(self):
        """Initialize Whisper STT model."""
        if self._whisper is not None:
            return

        try:
            from faster_whisper import WhisperModel
            logger.info("loading_whisper", model=self.whisper_model)
            # Use CPU for compatibility; can switch to cuda if GPU available
            self._whisper = WhisperModel(
                self.whisper_model,
                device="cpu",
                compute_type="int8",
            )
            logger.info("whisper_loaded", model=self.whisper_model)
        except ImportError:
            logger.warning("whisper_not_available", reason="faster-whisper not installed")
        except Exception as e:
            logger.error("whisper_load_error", error=str(e))

    async def _init_audio_track(self):
        """Initialize audio source and track for narration."""
        if self._audio_source is not None:
            return

        self._audio_source = rtc.AudioSource(SAMPLE_RATE, CHANNELS)
        self._audio_track = rtc.LocalAudioTrack.create_audio_track(
            TRACK_NAME_AI_NARRATION,
            self._audio_source,
        )
        # Publish the track
        await self.room.local_participant.publish_track(
            self._audio_track,
            rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE),
        )
        logger.info("audio_track_published", name=TRACK_NAME_AI_NARRATION)

    async def emit_event(self, event: dict) -> dict | None:
        """Send event to game server. Returns response data or None on failure."""
        if "eventId" not in event:
            event["eventId"] = generate_event_id()

        try:
            response = await self._http_client.post(
                f"{self.server_url}/events",
                json=event,
            )
            if response.status_code == 200:
                data = response.json()
                deduped = data.get("deduped", False)
                logger.info(
                    "event_emitted",
                    event_type=event.get("type"),
                    event_id=event.get("eventId"),
                    deduped=deduped,
                )
                return data
            else:
                logger.warning(
                    "event_emit_failed",
                    status=response.status_code,
                    body=response.text,
                )
                return None
        except Exception as e:
            logger.error("event_emit_error", error=str(e))
            return None

    async def transcribe_audio(self, session: PttSessionState) -> tuple[str, float] | None:
        """Transcribe buffered audio using Whisper. Returns (text, latency_ms) or None."""
        if not session.audio_buffer:
            logger.warning("no_audio_to_transcribe", track_sid=session.track_sid)
            return None

        await self._init_whisper()
        if self._whisper is None:
            # Fallback: return placeholder if STT not available
            logger.warning("stt_unavailable_using_placeholder")
            return ("__stt_unavailable__", 0.0)

        start_time = time.time()

        try:
            # Combine audio frames into single buffer
            audio_data = b"".join(session.audio_buffer)

            # Convert to numpy array (16-bit PCM)
            audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)
            audio_array /= 32768.0  # Normalize to [-1, 1]

            # Write to WAV in memory for Whisper
            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, "wb") as wav:
                wav.setnchannels(session.channels)
                wav.setsampwidth(2)  # 16-bit
                wav.setframerate(session.sample_rate)
                wav.writeframes(audio_data)
            wav_buffer.seek(0)

            # Transcribe
            segments, info = self._whisper.transcribe(
                wav_buffer,
                language="en",
                beam_size=1,  # Faster
                vad_filter=True,
            )

            # Collect text from segments
            text = " ".join(segment.text.strip() for segment in segments)
            latency_ms = (time.time() - start_time) * 1000

            logger.info(
                "transcription_complete",
                text=text[:100],
                latency_ms=latency_ms,
                audio_duration_s=len(audio_data) / (session.sample_rate * 2),
            )

            return (text.strip() or "__silence__", latency_ms)

        except Exception as e:
            logger.error("transcription_error", error=str(e))
            return None

    async def generate_tts(self, text: str) -> bytes | None:
        """Generate TTS audio using Piper. Returns raw PCM or None."""
        try:
            # Try using piper-tts
            import subprocess
            import tempfile

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                temp_path = f.name

            # Run piper (assumes it's installed and model is available)
            result = subprocess.run(
                ["piper", "--model", "en_US-lessac-medium", "--output_file", temp_path],
                input=text.encode(),
                capture_output=True,
                timeout=30,
            )

            if result.returncode != 0:
                logger.warning("piper_failed", stderr=result.stderr.decode())
                return None

            # Read the generated audio
            with wave.open(temp_path, "rb") as wav:
                audio_data = wav.readframes(wav.getnframes())

            os.unlink(temp_path)
            logger.info("tts_generated", text_len=len(text), audio_bytes=len(audio_data))
            return audio_data

        except FileNotFoundError:
            logger.warning("piper_not_installed")
            return None
        except Exception as e:
            logger.error("tts_error", error=str(e))
            return None

    async def play_narration(self, narration: dict):
        """Play narration audio into the room."""
        text = narration.get("text", "")
        if not text:
            return

        narration_id = generate_event_id()
        self._narration = NarrationState(
            narration_id=narration_id,
            session_id=narration.get("sessionId", self.room_name),
        )

        # Emit NARRATION_START
        await self.emit_event({
            "type": "NARRATION_START",
            "sessionId": self._narration.session_id,
            "narrationId": narration_id,
            "ts": int(time.time() * 1000),
        })

        try:
            await self._init_audio_track()

            # Generate TTS
            audio_data = await self.generate_tts(text)
            if audio_data is None:
                # Fallback: just log that we would narrate
                logger.info("narration_text_only", text=text)
                await asyncio.sleep(len(text) * 0.05)  # Simulate speech time
            else:
                # Play audio frames
                frame_size = SAMPLE_RATE // 50  # 20ms frames
                frame_bytes = frame_size * 2  # 16-bit samples

                for i in range(0, len(audio_data), frame_bytes):
                    if self._narration and self._narration.interrupted:
                        logger.info("narration_interrupted_during_playback")
                        break

                    chunk = audio_data[i : i + frame_bytes]
                    if len(chunk) < frame_bytes:
                        chunk = chunk + b"\x00" * (frame_bytes - len(chunk))

                    # Convert to AudioFrame
                    frame = rtc.AudioFrame(
                        data=chunk,
                        sample_rate=SAMPLE_RATE,
                        num_channels=CHANNELS,
                        samples_per_channel=frame_size,
                    )
                    await self._audio_source.capture_frame(frame)
                    await asyncio.sleep(0.02)  # 20ms per frame

            duration_ms = (time.time() - self._narration.started_at) * 1000

            if self._narration.interrupted:
                # Emit NARRATION_INTERRUPT
                await self.emit_event({
                    "type": "NARRATION_INTERRUPT",
                    "sessionId": self._narration.session_id,
                    "narrationId": narration_id,
                    "identity": "ptt",  # Interrupted by PTT
                    "reason": "ptt",
                    "ts": int(time.time() * 1000),
                })
            else:
                # Emit NARRATION_END
                await self.emit_event({
                    "type": "NARRATION_END",
                    "sessionId": self._narration.session_id,
                    "narrationId": narration_id,
                    "durationMs": int(duration_ms),
                    "ts": int(time.time() * 1000),
                })

        except Exception as e:
            logger.error("narration_error", error=str(e))
        finally:
            self._narration = None

    def interrupt_narration(self):
        """Interrupt any active narration."""
        if self._narration and not self._narration.interrupted:
            logger.info("interrupting_narration", narration_id=self._narration.narration_id)
            self._narration.interrupted = True

    async def on_track_subscribed(
        self,
        track: rtc.Track,
        publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ):
        """Called when we subscribe to a track."""
        logger.info(
            "track_subscribed",
            track_sid=track.sid,
            track_name=publication.name,
            participant=participant.identity,
        )

        # Only process PTT tracks
        if publication.name == TRACK_NAME_PTT:
            logger.info(
                "ptt_track_detected",
                participant=participant.identity,
                track_sid=track.sid,
            )

            # INTERRUPT any active narration immediately
            self.interrupt_narration()

            # Create local session state
            session = PttSessionState(
                track_sid=track.sid,
                identity=participant.identity,
            )
            self._ptt_sessions[track.sid] = session

            # Emit PTT_TRACK_DETECTED event to server
            response = await self.emit_event({
                "type": "PTT_TRACK_DETECTED",
                "roomName": self.room_name,
                "identity": participant.identity,
                "trackSid": track.sid,
                "trackName": publication.name,
                "ts": int(time.time() * 1000),
            })

            # Store pttSessionId from server response
            if response and "pttSessionId" in response:
                session.ptt_session_id = response["pttSessionId"]
                logger.info(
                    "ptt_session_id_received",
                    ptt_session_id=session.ptt_session_id,
                    track_sid=track.sid,
                )

            # Start audio frame capture
            if isinstance(track, rtc.AudioTrack):
                asyncio.create_task(self._capture_audio_frames(track, session))

    async def _capture_audio_frames(
        self,
        track: rtc.AudioTrack,
        session: PttSessionState,
    ):
        """Capture audio frames from PTT track into buffer."""
        logger.info(
            "ptt_audio_frames_started",
            track_sid=session.track_sid,
            identity=session.identity,
            ptt_session_id=session.ptt_session_id,
        )

        try:
            audio_stream = rtc.AudioStream(track)
            async for frame_event in audio_stream:
                session.frame_count += 1

                # Store sample rate from first frame
                if session.frame_count == 1:
                    session.sample_rate = frame_event.frame.sample_rate
                    session.channels = frame_event.frame.num_channels
                    logger.debug(
                        "first_audio_frame",
                        track_sid=session.track_sid,
                        sample_rate=session.sample_rate,
                        channels=session.channels,
                    )

                # Buffer the raw audio data
                session.audio_buffer.append(bytes(frame_event.frame.data))

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("audio_capture_error", error=str(e))
        finally:
            logger.info(
                "ptt_audio_frames_stopped",
                track_sid=session.track_sid,
                identity=session.identity,
                ptt_session_id=session.ptt_session_id,
                frame_count=session.frame_count,
                buffer_size=len(session.audio_buffer),
            )

    async def on_participant_connected(self, participant: rtc.RemoteParticipant):
        """Called when a participant joins the room."""
        logger.info(
            "participant_connected",
            identity=participant.identity,
            name=participant.name,
        )

    async def on_participant_disconnected(self, participant: rtc.RemoteParticipant):
        """Called when a participant leaves the room."""
        logger.info(
            "participant_disconnected",
            identity=participant.identity,
        )

    async def on_track_unsubscribed(
        self,
        track: rtc.Track,
        publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ):
        """Called when a track is unsubscribed (ended)."""
        if publication.name == TRACK_NAME_PTT:
            logger.info(
                "ptt_track_ended",
                participant=participant.identity,
                track_sid=track.sid,
            )

            # Get session state
            session = self._ptt_sessions.pop(track.sid, None)
            if not session:
                return

            ptt_session_id = session.ptt_session_id

            # Emit PTT_TRACK_ENDED event to server
            await self.emit_event({
                "type": "PTT_TRACK_ENDED",
                "roomName": self.room_name,
                "identity": participant.identity,
                "trackSid": track.sid,
                "ts": int(time.time() * 1000),
            })

            # Transcribe the buffered audio
            transcription = await self.transcribe_audio(session)
            if transcription:
                text, latency_ms = transcription

                # Emit COMMAND_TRANSCRIBED
                response = await self.emit_event({
                    "type": "COMMAND_TRANSCRIBED",
                    "sessionId": self.room_name,
                    "pttSessionId": ptt_session_id or "",
                    "identity": participant.identity,
                    "text": text,
                    "latencyMs": int(latency_ms),
                    "ts": int(time.time() * 1000),
                })

                # Check if server returned narration
                if response and "narration" in response:
                    narration = response["narration"]
                    logger.info(
                        "narration_ready_received",
                        text=narration.get("text", "")[:50],
                    )
                    # Play the narration
                    asyncio.create_task(self.play_narration(narration))

    async def cleanup(self):
        """Clean up resources."""
        await self._http_client.aclose()


async def entrypoint(ctx: agents.JobContext):
    """Main entry point for the agent."""
    logger.info("agent_starting", room=ctx.room.name)

    agent = DreamweaverAgent(room_name=ctx.room.name, room=ctx.room)

    # Set up event handlers
    ctx.room.on("track_subscribed", agent.on_track_subscribed)
    ctx.room.on("track_unsubscribed", agent.on_track_unsubscribed)
    ctx.room.on("participant_connected", agent.on_participant_connected)
    ctx.room.on("participant_disconnected", agent.on_participant_disconnected)

    # Connect to room
    await ctx.connect()
    logger.info("agent_connected", room=ctx.room.name)

    try:
        # Keep agent running
        while True:
            await asyncio.sleep(1)
    finally:
        await agent.cleanup()


if __name__ == "__main__":
    # Run as LiveKit agent
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
        )
    )
