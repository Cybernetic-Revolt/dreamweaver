/**
 * Test script: Publish a PTT track to LiveKit
 *
 * Usage:
 *   bun run scripts/publish_ptt.ts --room=campaign-TEST --identity=test-player
 *
 * This simulates a mobile client publishing a PTT track,
 * allowing you to verify the agent detects it and emits PTT_TRACK_DETECTED.
 */

import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

const LIVEKIT_URL = process.env.LIVEKIT_WS_URL_EXTERNAL || 'ws://localhost:7880';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret_min_32_characters_long_here';

// Parse command line arguments
function parseArgs(): { room: string; identity: string } {
  const args = process.argv.slice(2);
  let room = 'campaign-TEST';
  let identity = 'test-player';

  for (const arg of args) {
    if (arg.startsWith('--room=')) {
      room = arg.split('=')[1];
    } else if (arg.startsWith('--identity=')) {
      identity = arg.split('=')[1];
    }
  }

  return { room, identity };
}

async function main() {
  const { room, identity } = parseArgs();

  console.log('=== PTT Track Test ===');
  console.log(`LiveKit URL: ${LIVEKIT_URL}`);
  console.log(`Room: ${room}`);
  console.log(`Identity: ${identity}`);
  console.log('');

  // Generate a token for the test participant
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name: `Test Player (${identity})`,
  });

  token.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  const jwt = await token.toJwt();

  console.log('Generated token for test participant');
  console.log(`Token (first 50 chars): ${jwt.substring(0, 50)}...`);
  console.log('');

  // Create room if it doesn't exist
  const httpUrl = LIVEKIT_URL.replace('ws://', 'http://').replace('wss://', 'https://');
  const roomService = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  try {
    await roomService.createRoom({ name: room });
    console.log(`Created room: ${room}`);
  } catch (e: any) {
    if (e.message?.includes('already exists')) {
      console.log(`Room ${room} already exists`);
    } else {
      console.log(`Room creation note: ${e.message}`);
    }
  }

  console.log('');
  console.log('To test PTT detection:');
  console.log('1. Start the agent: cd apps/agent && python src/main.py');
  console.log('2. Connect to the room using the LiveKit CLI or a test client');
  console.log('3. Publish an audio track named "ptt"');
  console.log('');
  console.log('Or use the LiveKit CLI:');
  console.log(`  lk room join ${room} --identity ${identity}`);
  console.log('  Then publish audio with track name "ptt"');
  console.log('');
  console.log('The agent should log:');
  console.log('  ptt_track_detected participant=test-player');
  console.log('  event_emitted event_type=PTT_TRACK_DETECTED');
  console.log('');
  console.log('And the server should log:');
  console.log('  event_received event_type=PTT_TRACK_DETECTED');
}

main().catch(console.error);
