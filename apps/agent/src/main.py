"""
Dreamweaver AI Agent

Handles:
- Joining LiveKit rooms as GM participant
- Subscribing to PTT tracks for STT
- Publishing ai_narration audio track
- GM response generation via LLM
- Policy enforcement
- Emitting events to game server
- PTT session lifecycle with audio frame capture
"""

import asyncio
import os
import time
import uuid
import httpx
import structlog
from livekit import agents, rtc

logger = structlog.get_logger()

# Track names (must match packages/shared/events.ts TRACK_NAMES)
TRACK_NAME_PTT = "ptt"
TRACK_NAME_MIC = "mic"
TRACK_NAME_AI_NARRATION = "ai_narration"


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


class DreamweaverAgent:
    """AI Game Master agent that joins LiveKit rooms."""

    def __init__(self, room_name: str):
        self.livekit_url = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
        self.api_key = os.getenv("LIVEKIT_API_KEY", "devkey")
        self.api_secret = os.getenv("LIVEKIT_API_SECRET", "secret")
        self.server_url = os.getenv("SERVER_URL", "http://localhost:3000")
        self.room_name = room_name
        self._http_client = httpx.AsyncClient(timeout=5.0)

        # Active PTT sessions: track_sid -> PttSessionState
        self._ptt_sessions: dict[str, PttSessionState] = {}

    async def emit_event(self, event: dict) -> dict | None:
        """Send event to game server. Returns response data or None on failure."""
        # Ensure eventId is present
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

            # Create local session state (ptt_session_id will come from server)
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
        """Capture audio frames from PTT track."""
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
                # TODO: Buffer frames for STT
                # For now, just count them
                if session.frame_count == 1:
                    logger.debug(
                        "first_audio_frame",
                        track_sid=session.track_sid,
                        sample_rate=frame_event.frame.sample_rate,
                        channels=frame_event.frame.num_channels,
                    )
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
            ptt_session_id = session.ptt_session_id if session else None

            # Emit PTT_TRACK_ENDED event to server
            await self.emit_event({
                "type": "PTT_TRACK_ENDED",
                "roomName": self.room_name,
                "identity": participant.identity,
                "trackSid": track.sid,
                "ts": int(time.time() * 1000),
            })

            # Emit COMMAND_RECEIVED with placeholder (proves pipeline works)
            if ptt_session_id:
                await self.emit_event({
                    "type": "COMMAND_RECEIVED",
                    "sessionId": self.room_name,  # Use room name as session for now
                    "pttSessionId": ptt_session_id,
                    "identity": participant.identity,
                    "text": "__placeholder__",  # Will be STT output later
                    "ts": int(time.time() * 1000),
                })

    async def cleanup(self):
        """Clean up resources."""
        await self._http_client.aclose()


async def entrypoint(ctx: agents.JobContext):
    """Main entry point for the agent."""
    logger.info("agent_starting", room=ctx.room.name)

    agent = DreamweaverAgent(room_name=ctx.room.name)

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
