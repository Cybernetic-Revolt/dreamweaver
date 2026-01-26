"""
Dreamweaver AI Agent

Handles:
- Joining LiveKit rooms as GM participant
- Subscribing to PTT tracks for STT
- Publishing ai_narration audio track
- GM response generation via LLM
- Policy enforcement
- Emitting events to game server
"""

import asyncio
import os
import time
import httpx
import structlog
from livekit import agents, rtc

logger = structlog.get_logger()

# Track names (must match packages/shared/events.ts TRACK_NAMES)
TRACK_NAME_PTT = "ptt"
TRACK_NAME_MIC = "mic"
TRACK_NAME_AI_NARRATION = "ai_narration"


class DreamweaverAgent:
    """AI Game Master agent that joins LiveKit rooms."""

    def __init__(self, room_name: str):
        self.livekit_url = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
        self.api_key = os.getenv("LIVEKIT_API_KEY", "devkey")
        self.api_secret = os.getenv("LIVEKIT_API_SECRET", "secret")
        self.server_url = os.getenv("SERVER_URL", "http://localhost:3000")
        self.room_name = room_name
        self._http_client = httpx.AsyncClient(timeout=5.0)

    async def emit_event(self, event: dict) -> bool:
        """Send event to game server."""
        try:
            response = await self._http_client.post(
                f"{self.server_url}/events",
                json=event,
            )
            if response.status_code == 200:
                logger.info("event_emitted", event_type=event.get("type"))
                return True
            else:
                logger.warning(
                    "event_emit_failed",
                    status=response.status_code,
                    body=response.text,
                )
                return False
        except Exception as e:
            logger.error("event_emit_error", error=str(e))
            return False

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

            # Emit PTT_TRACK_DETECTED event to server
            await self.emit_event({
                "type": "PTT_TRACK_DETECTED",
                "roomName": self.room_name,
                "identity": participant.identity,
                "trackSid": track.sid,
                "trackName": publication.name,
                "ts": int(time.time() * 1000),
            })

            # TODO: Route to STT pipeline

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

            # Emit PTT_TRACK_ENDED event to server
            await self.emit_event({
                "type": "PTT_TRACK_ENDED",
                "roomName": self.room_name,
                "identity": participant.identity,
                "trackSid": track.sid,
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
