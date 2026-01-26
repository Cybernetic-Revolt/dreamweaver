"""
Dreamweaver AI Agent

Handles:
- Joining LiveKit rooms as GM participant
- Subscribing to PTT tracks for STT
- Publishing ai_narration audio track
- GM response generation via LLM
- Policy enforcement
"""

import asyncio
import os
import structlog
from livekit import agents, rtc

logger = structlog.get_logger()


class DreamweaverAgent:
    """AI Game Master agent that joins LiveKit rooms."""

    def __init__(self):
        self.livekit_url = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
        self.api_key = os.getenv("LIVEKIT_API_KEY", "devkey")
        self.api_secret = os.getenv("LIVEKIT_API_SECRET", "secret")

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
        if publication.name and publication.name.startswith("ptt"):
            logger.info(
                "ptt_track_detected",
                participant=participant.identity,
            )
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


async def entrypoint(ctx: agents.JobContext):
    """Main entry point for the agent."""
    logger.info("agent_starting", room=ctx.room.name)

    agent = DreamweaverAgent()

    # Set up event handlers
    ctx.room.on("track_subscribed", agent.on_track_subscribed)
    ctx.room.on("participant_connected", agent.on_participant_connected)
    ctx.room.on("participant_disconnected", agent.on_participant_disconnected)

    # Connect to room
    await ctx.connect()
    logger.info("agent_connected", room=ctx.room.name)

    # Keep agent running
    while True:
        await asyncio.sleep(1)


if __name__ == "__main__":
    # Run as LiveKit agent
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
        )
    )
