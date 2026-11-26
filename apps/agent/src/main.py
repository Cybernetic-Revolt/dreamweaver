"""
Dreamweaver AI Agent

Handles:
- Joining LiveKit rooms as GM participant
- Subscribing to PTT tracks for STT
- Audio frame buffering with caps and timeouts
- Publishing ai_narration audio track
- Redis pub/sub for async narration delivery
- Audio normalization for consistent levels
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
import redis.asyncio as redis
from livekit import agents, rtc
from livekit.agents import cli

logger = structlog.get_logger()

# Track names (must match packages/shared/events.ts TRACK_NAMES)
TRACK_NAME_PTT = "ptt"
TRACK_NAME_MIC = "mic"
TRACK_NAME_AI_NARRATION = "ai_narration"

# Audio constants
SAMPLE_RATE = 48000  # LiveKit default
CHANNELS = 1
BYTES_PER_SAMPLE = 2  # 16-bit

# Hardening caps (from CONSTANTS)
MAX_PTT_SECONDS = 5
MAX_AUDIO_BYTES = SAMPLE_RATE * MAX_PTT_SECONDS * BYTES_PER_SAMPLE * CHANNELS
STT_TIMEOUT_SECONDS = 8
TTS_TIMEOUT_SECONDS = 5

# Audio normalization
TARGET_RMS_DB = -18


def generate_event_id() -> str:
    """Generate a UUID v4 for event IDs."""
    return str(uuid.uuid4())


def normalize_audio(audio_data: bytes, target_db: float = TARGET_RMS_DB) -> bytes:
    """Normalize audio to target RMS level."""
    try:
        # Convert to numpy
        audio = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)

        # Calculate current RMS
        rms = np.sqrt(np.mean(audio ** 2))
        if rms < 1:
            return audio_data  # Too quiet, don't amplify noise

        # Calculate current dB
        current_db = 20 * np.log10(rms / 32768.0)

        # Calculate gain needed
        gain_db = target_db - current_db
        gain = 10 ** (gain_db / 20)

        # Apply gain with clipping protection
        audio = audio * gain
        audio = np.clip(audio, -32768, 32767)

        return audio.astype(np.int16).tobytes()
    except Exception as e:
        logger.warning("audio_normalization_failed", error=str(e))
        return audio_data


class PttSessionState:
    """State for an active PTT session."""

    def __init__(self, track_sid: str, identity: str, ptt_session_id: str | None = None):
        self.track_sid = track_sid
        self.identity = identity
        self.ptt_session_id = ptt_session_id
        self.frame_count = 0
        self.started_at = time.time()
        self.audio_buffer: list[bytes] = []
        self.total_bytes = 0
        self.sample_rate = SAMPLE_RATE
        self.channels = CHANNELS
        self.capped = False  # True if we hit the buffer cap


class NarrationState:
    """State for active narration playback. Day 8: Enhanced timing."""

    def __init__(self, narration_id: str, session_id: str, trace_id: str | None = None):
        self.narration_id = narration_id
        self.session_id = session_id
        self.trace_id = trace_id
        self.started_at = time.time()
        self.interrupted = False
        # Day 8: Timing for TRACE_SUMMARY
        self.server_publish_ts: int = 0  # When server published to Redis
        self.tts_start_ts: float = 0     # When TTS generation started
        self.tts_end_ts: float = 0       # When TTS generation ended
        self.first_frame_ts: float = 0   # When first audio frame published
        self.ptt_ms: int = 0             # From narration payload
        self.stt_ms: int = 0             # From narration payload
        self.gm_ms: int = 0              # From narration payload
        self.intent: str = "UNKNOWN"     # From narration payload
        self.identity: str = ""          # Who issued command


class DreamweaverAgent:
    """AI Game Master agent that joins LiveKit rooms."""

    def __init__(self, room_name: str, room: rtc.Room):
        self.livekit_url = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
        self.api_key = os.getenv("LIVEKIT_API_KEY", "devkey")
        self.api_secret = os.getenv("LIVEKIT_API_SECRET", "secret")
        self.server_url = os.getenv("SERVER_URL", "http://localhost:3000")
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        self.whisper_model = os.getenv("WHISPER_MODEL", "tiny.en")  # Use tiny for speed
        self.room_name = room_name
        self.room = room
        self._http_client = httpx.AsyncClient(timeout=30.0)

        # Redis client for narration subscription
        self._redis: redis.Redis | None = None
        self._redis_subscription_task: asyncio.Task | None = None

        # Active PTT sessions: track_sid -> PttSessionState
        self._ptt_sessions: dict[str, PttSessionState] = {}

        # Current narration state (only one at a time)
        self._narration: NarrationState | None = None

        # Audio source for publishing narration
        self._audio_source: rtc.AudioSource | None = None
        self._audio_track: rtc.LocalAudioTrack | None = None

        # STT model (lazy loaded)
        self._whisper = None

    async def _init_redis(self):
        """Initialize Redis connection."""
        if self._redis is not None:
            return

        self._redis = redis.from_url(self.redis_url)
        logger.info("redis_connected", url=self.redis_url)

    async def _subscribe_narration(self):
        """Subscribe to Redis channel for narration delivery."""
        await self._init_redis()
        channel = f"dreamweaver:narration:{self.room_name}"

        pubsub = self._redis.pubsub()
        await pubsub.subscribe(channel)
        logger.info("redis_subscribed", channel=channel)

        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        import json
                        narration = json.loads(message["data"])
                        trace_id = narration.get("traceId") or narration.get("pttSessionId")
                        logger.info(
                            "narration_received_from_redis",
                            trace_id=trace_id,
                            text=narration.get("text", "")[:50],
                        )
                        asyncio.create_task(self.play_narration(narration))
                    except Exception as e:
                        logger.error("redis_message_parse_error", error=str(e))
        except asyncio.CancelledError:
            await pubsub.unsubscribe(channel)
            raise
        except Exception as e:
            logger.error("redis_subscription_error", error=str(e))

    async def _init_whisper(self):
        """Initialize Whisper STT model."""
        if self._whisper is not None:
            return

        try:
            from faster_whisper import WhisperModel
            logger.info("loading_whisper", model=self.whisper_model)
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
            # Accept both 200 and 202
            if response.status_code in (200, 202):
                data = response.json()
                logger.info(
                    "event_emitted",
                    event_type=event.get("type"),
                    event_id=event.get("eventId"),
                    trace_id=event.get("traceId"),
                    status=response.status_code,
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
        """Transcribe buffered audio using Whisper with timeout."""
        trace_id = session.ptt_session_id or session.track_sid

        if not session.audio_buffer:
            logger.warning("no_audio_to_transcribe", trace_id=trace_id)
            return None

        if session.capped:
            logger.warning("audio_was_capped", trace_id=trace_id, bytes=session.total_bytes)

        await self._init_whisper()
        if self._whisper is None:
            logger.warning("stt_unavailable_using_placeholder", trace_id=trace_id)
            return ("__stt_unavailable__", 0.0)

        start_time = time.time()

        try:
            # Combine audio frames
            audio_data = b"".join(session.audio_buffer)

            # Resample to 16kHz mono for Whisper (faster)
            audio_16k = self._resample_audio(audio_data, session.sample_rate, 16000)

            # Write to WAV
            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(16000)
                wav.writeframes(audio_16k)
            wav_buffer.seek(0)

            # Transcribe with timeout
            try:
                segments, info = await asyncio.wait_for(
                    asyncio.to_thread(
                        self._whisper.transcribe,
                        wav_buffer,
                        language="en",
                        beam_size=1,
                        vad_filter=True,
                    ),
                    timeout=STT_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                logger.warning("stt_timeout", trace_id=trace_id)
                return ("__timeout__", STT_TIMEOUT_SECONDS * 1000)

            text = " ".join(segment.text.strip() for segment in segments)
            latency_ms = (time.time() - start_time) * 1000

            logger.info(
                "transcription_complete",
                text=text[:100],
                latency_ms=latency_ms,
                audio_duration_s=len(audio_data) / (session.sample_rate * 2),
                trace_id=trace_id,
            )

            return (text.strip() or "__silence__", latency_ms)

        except Exception as e:
            logger.error("transcription_error", error=str(e), trace_id=trace_id)
            return ("__error__", 0.0)

    def _resample_audio(self, audio_data: bytes, from_rate: int, to_rate: int) -> bytes:
        """Resample audio to target rate using linear interpolation."""
        if from_rate == to_rate:
            return audio_data

        try:
            audio = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)
            ratio = to_rate / from_rate
            new_length = int(len(audio) * ratio)
            indices = np.linspace(0, len(audio) - 1, new_length)
            resampled = np.interp(indices, np.arange(len(audio)), audio)
            return resampled.astype(np.int16).tobytes()
        except Exception:
            return audio_data

    async def generate_tts(self, text: str, trace_id: str | None = None) -> bytes | None:
        """Generate TTS audio using Piper with timeout."""
        try:
            import subprocess
            import tempfile

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                temp_path = f.name

            try:
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        subprocess.run,
                        ["piper", "--model", "en_US-lessac-medium", "--output_file", temp_path],
                        input=text.encode(),
                        capture_output=True,
                    ),
                    timeout=TTS_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                logger.warning("tts_timeout", trace_id=trace_id)
                return None

            if result.returncode != 0:
                logger.warning("piper_failed", stderr=result.stderr.decode(), trace_id=trace_id)
                return None

            with wave.open(temp_path, "rb") as wav:
                piper_sample_rate = wav.getframerate()
                audio_data = wav.readframes(wav.getnframes())

            os.unlink(temp_path)

            # Resample from Piper's rate (usually 22050) to LiveKit's rate (48000)
            if piper_sample_rate != SAMPLE_RATE:
                audio_data = self._resample_audio(audio_data, piper_sample_rate, SAMPLE_RATE)
                logger.info("tts_resampled", from_rate=piper_sample_rate, to_rate=SAMPLE_RATE, trace_id=trace_id)

            # Normalize audio levels
            audio_data = normalize_audio(audio_data)

            logger.info("tts_generated", text_len=len(text), audio_bytes=len(audio_data), trace_id=trace_id)
            return audio_data

        except FileNotFoundError:
            logger.warning("piper_not_installed", trace_id=trace_id)
            return None
        except Exception as e:
            logger.error("tts_error", error=str(e), trace_id=trace_id)
            return None

    async def play_narration(self, narration: dict):
        """Play narration audio into the room.

        Day 7: Implements last-write-wins - if a new narration arrives while
        one is playing, interrupt the current and start the new one.
        """
        text = narration.get("text", "")
        trace_id = narration.get("traceId") or narration.get("pttSessionId")

        if not text:
            return

        # Day 7: Last-write-wins - interrupt any active narration
        if self._narration and not self._narration.interrupted:
            logger.info(
                "last_write_wins_interrupt",
                old_narration_id=self._narration.narration_id,
                new_trace_id=trace_id,
            )
            self._narration.interrupted = True
            # Brief wait for the playback loop to notice the interruption
            await asyncio.sleep(0.05)

        narration_id = generate_event_id()
        self._narration = NarrationState(
            narration_id=narration_id,
            session_id=narration.get("sessionId", self.room_name),
            trace_id=trace_id,
        )

        # Day 8: Extract timing metadata from server
        self._narration.server_publish_ts = narration.get("serverPublishTs", 0)
        self._narration.ptt_ms = narration.get("ptt_ms", 0)
        self._narration.stt_ms = narration.get("stt_ms", 0)
        self._narration.gm_ms = narration.get("gm_ms", 0)
        self._narration.intent = narration.get("intent", "UNKNOWN")
        self._narration.identity = narration.get("identity", "")

        await self.emit_event({
            "type": "NARRATION_START",
            "sessionId": self._narration.session_id,
            "narrationId": narration_id,
            "ts": int(time.time() * 1000),
            "traceId": trace_id,
        })

        result = "ok"
        try:
            await self._init_audio_track()

            # Day 8: Track TTS timing
            self._narration.tts_start_ts = time.time()
            audio_data = await self.generate_tts(text, trace_id)
            self._narration.tts_end_ts = time.time()

            if audio_data is None:
                logger.info("narration_text_only", text=text, trace_id=trace_id)
                await asyncio.sleep(len(text) * 0.05)
            else:
                frame_size = SAMPLE_RATE // 50  # 20ms frames
                frame_bytes = frame_size * 2
                first_frame = True

                for i in range(0, len(audio_data), frame_bytes):
                    if self._narration and self._narration.interrupted:
                        logger.info("narration_interrupted_during_playback", trace_id=trace_id)
                        result = "interrupted"
                        break

                    chunk = audio_data[i : i + frame_bytes]
                    if len(chunk) < frame_bytes:
                        chunk = chunk + b"\x00" * (frame_bytes - len(chunk))

                    frame = rtc.AudioFrame(
                        data=chunk,
                        sample_rate=SAMPLE_RATE,
                        num_channels=CHANNELS,
                        samples_per_channel=frame_size,
                    )
                    await self._audio_source.capture_frame(frame)

                    # Day 8: Track first frame publish time
                    if first_frame:
                        self._narration.first_frame_ts = time.time()
                        first_frame = False

                    await asyncio.sleep(0.02)

            duration_ms = (time.time() - self._narration.started_at) * 1000

            if self._narration.interrupted:
                result = "interrupted"
                await self.emit_event({
                    "type": "NARRATION_INTERRUPT",
                    "sessionId": self._narration.session_id,
                    "narrationId": narration_id,
                    "identity": "ptt",
                    "reason": "ptt",
                    "ts": int(time.time() * 1000),
                    "traceId": trace_id,
                })
            else:
                await self.emit_event({
                    "type": "NARRATION_END",
                    "sessionId": self._narration.session_id,
                    "narrationId": narration_id,
                    "durationMs": int(duration_ms),
                    "ts": int(time.time() * 1000),
                    "traceId": trace_id,
                })

            # Day 8: Emit TRACE_SUMMARY
            await self._emit_trace_summary(result)

        except Exception as e:
            logger.error("narration_error", error=str(e), trace_id=trace_id)
            result = "timeout"
        finally:
            self._narration = None

    def interrupt_narration(self):
        """Interrupt any active narration."""
        if self._narration and not self._narration.interrupted:
            logger.info("interrupting_narration", narration_id=self._narration.narration_id, trace_id=self._narration.trace_id)
            self._narration.interrupted = True

    async def _emit_trace_summary(self, result: str):
        """Day 8: Emit TRACE_SUMMARY event with end-to-end timing."""
        if not self._narration:
            return

        # Calculate timing components
        tts_ms = int((self._narration.tts_end_ts - self._narration.tts_start_ts) * 1000) if self._narration.tts_end_ts > 0 else 0
        publish_ms = int((self._narration.first_frame_ts - self._narration.tts_end_ts) * 1000) if self._narration.first_frame_ts > 0 else 0

        # Total: from server publish to first frame (what user experiences after speaking)
        total_ms = 0
        if self._narration.server_publish_ts > 0 and self._narration.first_frame_ts > 0:
            # server_publish_ts is in ms, first_frame_ts is in seconds
            total_ms = int(self._narration.first_frame_ts * 1000 - self._narration.server_publish_ts)
        elif self._narration.first_frame_ts > 0:
            total_ms = int((self._narration.first_frame_ts - self._narration.started_at) * 1000)

        trace_summary = {
            "type": "TRACE_SUMMARY",
            "eventId": generate_event_id(),
            "traceId": self._narration.trace_id or self._narration.narration_id,
            "roomName": self.room_name,
            "identity": self._narration.identity,
            "intent": self._narration.intent,
            "ptt_ms": self._narration.ptt_ms,
            "stt_ms": self._narration.stt_ms,
            "gm_ms": self._narration.gm_ms,
            "tts_ms": tts_ms,
            "publish_ms": publish_ms,
            "total_ms": total_ms,
            "result": result,
            "ts": int(time.time() * 1000),
        }

        await self.emit_event(trace_summary)

        # Also log it locally for quick observability
        logger.info(
            "trace_summary",
            trace_id=trace_summary["traceId"],
            ptt_ms=trace_summary["ptt_ms"],
            stt_ms=trace_summary["stt_ms"],
            gm_ms=trace_summary["gm_ms"],
            tts_ms=trace_summary["tts_ms"],
            publish_ms=trace_summary["publish_ms"],
            total_ms=trace_summary["total_ms"],
            result=result,
        )

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

        if publication.name == TRACK_NAME_PTT:
            logger.info(
                "ptt_track_detected",
                participant=participant.identity,
                track_sid=track.sid,
            )

            self.interrupt_narration()

            session = PttSessionState(
                track_sid=track.sid,
                identity=participant.identity,
            )
            self._ptt_sessions[track.sid] = session

            response = await self.emit_event({
                "type": "PTT_TRACK_DETECTED",
                "roomName": self.room_name,
                "identity": participant.identity,
                "trackSid": track.sid,
                "trackName": publication.name,
                "ts": int(time.time() * 1000),
            })

            if response and "pttSessionId" in response:
                session.ptt_session_id = response["pttSessionId"]
                logger.info(
                    "ptt_session_id_received",
                    ptt_session_id=session.ptt_session_id,
                    track_sid=track.sid,
                )

            if isinstance(track, rtc.AudioTrack):
                asyncio.create_task(self._capture_audio_frames(track, session))

    async def _capture_audio_frames(
        self,
        track: rtc.AudioTrack,
        session: PttSessionState,
    ):
        """Capture audio frames with buffer cap enforcement."""
        trace_id = session.ptt_session_id or session.track_sid

        logger.info(
            "ptt_audio_frames_started",
            track_sid=session.track_sid,
            identity=session.identity,
            trace_id=trace_id,
        )

        try:
            audio_stream = rtc.AudioStream(track)
            async for frame_event in audio_stream:
                session.frame_count += 1

                if session.frame_count == 1:
                    session.sample_rate = frame_event.frame.sample_rate
                    session.channels = frame_event.frame.num_channels

                frame_data = bytes(frame_event.frame.data)

                # Check buffer cap
                if session.total_bytes + len(frame_data) > MAX_AUDIO_BYTES:
                    if not session.capped:
                        logger.warning(
                            "audio_buffer_capped",
                            trace_id=trace_id,
                            max_bytes=MAX_AUDIO_BYTES,
                        )
                        session.capped = True
                    continue  # Skip frame, don't add to buffer

                session.audio_buffer.append(frame_data)
                session.total_bytes += len(frame_data)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("audio_capture_error", error=str(e), trace_id=trace_id)
        finally:
            logger.info(
                "ptt_audio_frames_stopped",
                track_sid=session.track_sid,
                identity=session.identity,
                trace_id=trace_id,
                frame_count=session.frame_count,
                buffer_bytes=session.total_bytes,
                capped=session.capped,
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
            session = self._ptt_sessions.pop(track.sid, None)
            if not session:
                return

            trace_id = session.ptt_session_id or session.track_sid

            logger.info(
                "ptt_track_ended",
                participant=participant.identity,
                track_sid=track.sid,
                trace_id=trace_id,
            )

            await self.emit_event({
                "type": "PTT_TRACK_ENDED",
                "roomName": self.room_name,
                "identity": participant.identity,
                "trackSid": track.sid,
                "ts": int(time.time() * 1000),
                "traceId": trace_id,
            })

            # Transcribe with timeout
            transcription = await self.transcribe_audio(session)
            if transcription:
                text, latency_ms = transcription

                # Require pttSessionId for proper correlation
                ptt_session_id = session.ptt_session_id
                if not ptt_session_id:
                    logger.warning(
                        "missing_ptt_session_id_skipping_transcription",
                        track_sid=track.sid,
                        trace_id=trace_id,
                    )
                    return

                # Emit COMMAND_TRANSCRIBED (server returns 202, narration via Redis)
                await self.emit_event({
                    "type": "COMMAND_TRANSCRIBED",
                    "sessionId": self.room_name,
                    "pttSessionId": ptt_session_id,
                    "roomName": self.room_name,  # Required for Redis routing
                    "identity": participant.identity,
                    "text": text,
                    "latencyMs": int(latency_ms),
                    "ts": int(time.time() * 1000),
                    "traceId": trace_id,
                })

    async def cleanup(self):
        """Clean up resources."""
        if self._redis_subscription_task:
            self._redis_subscription_task.cancel()
        if self._redis:
            await self._redis.close()
        await self._http_client.aclose()


async def entrypoint(ctx: agents.JobContext):
    """Main entry point for the agent."""
    logger.info("agent_starting", room=ctx.room.name)

    agent = DreamweaverAgent(room_name=ctx.room.name, room=ctx.room)

    # Set up event handlers (wrap async callbacks for new LiveKit SDK)
    def on_track_subscribed(track, publication, participant):
        asyncio.create_task(agent.on_track_subscribed(track, publication, participant))

    def on_track_unsubscribed(track, publication, participant):
        asyncio.create_task(agent.on_track_unsubscribed(track, publication, participant))

    def on_participant_connected(participant):
        asyncio.create_task(agent.on_participant_connected(participant))

    def on_participant_disconnected(participant):
        asyncio.create_task(agent.on_participant_disconnected(participant))

    ctx.room.on("track_subscribed", on_track_subscribed)
    ctx.room.on("track_unsubscribed", on_track_unsubscribed)
    ctx.room.on("participant_connected", on_participant_connected)
    ctx.room.on("participant_disconnected", on_participant_disconnected)

    # Connect to room
    await ctx.connect()
    logger.info("agent_connected", room=ctx.room.name)

    # Start Redis subscription for narration
    agent._redis_subscription_task = asyncio.create_task(agent._subscribe_narration())

    try:
        while True:
            await asyncio.sleep(1)
    finally:
        await agent.cleanup()


if __name__ == "__main__":
    cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
        )
    )
