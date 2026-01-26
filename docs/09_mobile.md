# Mobile App

Day 6 deliverable: Minimal Expo client with PTT functionality.

## Overview

The mobile app provides:
- LiveKit room connection
- Open mic track (always on for party chat)
- PTT (Push-to-Talk) for voice commands
- AI narration playback
- Driving-safe UI (single screen, no text walls)

## Architecture

```
apps/mobile/
├── App.tsx              # Main screen with PTT button
├── app.config.ts        # Expo configuration
├── package.json         # Dependencies
├── src/
│   ├── api.ts           # Server API client
│   ├── constants.ts     # Track names, defaults
│   └── livekit.ts       # LiveKit connection manager
└── assets/              # App icons, splash
```

## Track Names

| Track | Name | Purpose |
|-------|------|---------|
| Open Mic | `mic` | Always-on party voice chat |
| PTT | `ptt` | Voice commands to GM (published on press) |
| AI Narration | `ai_narration` | GM narration audio (subscribed) |

## Setup

### Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- iOS: Xcode 15+ (for iOS builds)
- Android: Android Studio (for Android builds)

### Install Dependencies

```bash
cd apps/mobile
npm install
```

### Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```
# For emulator (localhost works)
EXPO_PUBLIC_SERVER_URL=http://localhost:3000
EXPO_PUBLIC_LIVEKIT_URL=ws://localhost:7880

# For physical device (use your machine's IP)
EXPO_PUBLIC_SERVER_URL=http://192.168.1.x:3000
EXPO_PUBLIC_LIVEKIT_URL=ws://192.168.1.x:7880
```

### Start Development Server

```bash
# Start Expo dev server
npm start

# Or run directly on platform
npm run ios     # iOS simulator
npm run android # Android emulator
```

### Build for Device

```bash
# Generate native projects
npm run prebuild

# Build and run
npm run ios
npm run android
```

## Usage

1. **Start backend services**:
   ```bash
   cd infra
   docker-compose up -d
   ```

2. **Launch mobile app**

3. **Enter room name** (default: `campaign-dev`)

4. **Tap Connect**

5. **Hold the big button to speak**
   - Button turns green when speaking
   - Release to send command to GM

6. **Listen for AI narration**
   - Button turns blue when narration plays
   - Press PTT to interrupt

## API Endpoints Used

### POST /auth/token

Request:
```json
{
  "identity": "player-abc123",
  "room": "campaign-dev"
}
```

Response:
```json
{
  "token": "eyJ...",
  "wsUrl": "ws://localhost:7880",
  "identity": "player-abc123",
  "room": "campaign-dev"
}
```

## Troubleshooting

### Microphone Permission Denied

- iOS: Check Settings > Dreamweaver > Microphone
- Android: Check Settings > Apps > Dreamweaver > Permissions

### Cannot Connect to Server

- Ensure server is running: `curl http://localhost:3000/healthz`
- For physical device, use machine's IP instead of localhost
- Check firewall allows ports 3000, 7880

### No Audio

- Check device volume
- Ensure LiveKit room has participants
- Check agent is running and publishing narration

### Build Errors

```bash
# Clean and rebuild
npx expo prebuild --clean
npm run ios
```

## Known Limitations (Day 6)

- No persistent session (reconnect creates new player)
- No room code input via voice
- No haptic feedback on PTT
- No audio ducking (handled by OS)

## Next Steps (Day 7+)

- Voice-activated room code entry
- Session persistence across app restarts
- Haptic feedback on PTT press/release
- Background audio mode
- Bluetooth PTT button support
