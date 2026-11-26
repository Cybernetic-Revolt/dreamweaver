# Dreamweaver Infrastructure Commands

.PHONY: up down logs clean seed demo keys health verify_day3 demo_loop verify_state demo_phone

# Start all services
up:
	docker-compose up -d
	@echo "Services starting..."
	@echo "LiveKit: http://localhost:7880"
	@echo "Server: http://localhost:3000"
	@echo "Web client: http://localhost:8080"
	@echo "Ollama: http://localhost:11434"

# Stop all services
down:
	docker-compose down

# View logs
logs:
	docker-compose logs -f

# Clean all data
clean:
	docker-compose down -v
	rm -rf ../data

# Generate LiveKit keys
keys:
	@echo "Generating LiveKit keys..."
	@docker run --rm livekit/livekit-server generate-keys
	@echo ""
	@echo "Add these to your .env file"

# Seed Ollama with model
seed:
	@echo "Pulling llama3:8b model..."
	docker-compose exec ollama ollama pull llama3:8b
	@echo "Model ready"

# Run walking skeleton demo
demo:
	@echo "=== Walking Skeleton Demo ==="
	@echo ""
	@echo "1. Checking services..."
	curl -s http://localhost:3000/health | jq .
	@echo ""
	@echo "2. Creating session..."
	@curl -s -X POST http://localhost:3000/api/sessions \
		-H "Content-Type: application/json" \
		-d '{"playerId":"demo-host","playerName":"Host","adventureId":"goblin_cave"}' | jq .
	@echo ""
	@echo "3. Room ready. Join with mobile app."
	@echo ""
	@echo "4. Watch agent logs:"
	@echo "   make logs | grep agent"

# Health check
health:
	@echo "LiveKit:" && curl -s http://localhost:7880/health || echo "DOWN"
	@echo "Server:" && curl -s http://localhost:3000/health || echo "DOWN"
	@echo "Ollama:" && curl -s http://localhost:11434/api/tags | head -1 || echo "DOWN"
	@echo "Redis:" && docker-compose exec redis redis-cli ping || echo "DOWN"

# Day 5 demo loop: test look → go → repeat → stop sequence
demo_loop:
	@echo "=== Day 5 Demo Loop ==="
	@echo ""
	@echo "Testing: look → go north → repeat → stop"
	@echo ""
	@echo "1. Sending 'look' command..."
	@curl -s -X POST http://localhost:3000/events \
		-H "Content-Type: application/json" \
		-d '{"type":"COMMAND_TRANSCRIBED","eventId":"demo-1-$(shell date +%s)","sessionId":"demo-session","pttSessionId":"demo-ptt-1","roomName":"campaign-DEMO","identity":"demo-player","text":"look","latencyMs":100,"ts":'$(shell date +%s000)'}' | jq .
	@echo ""
	@sleep 2
	@echo "2. Sending 'go north' command..."
	@curl -s -X POST http://localhost:3000/events \
		-H "Content-Type: application/json" \
		-d '{"type":"COMMAND_TRANSCRIBED","eventId":"demo-2-$(shell date +%s)","sessionId":"demo-session","pttSessionId":"demo-ptt-2","roomName":"campaign-DEMO","identity":"demo-player","text":"go north","latencyMs":100,"ts":'$(shell date +%s000)'}' | jq .
	@echo ""
	@sleep 2
	@echo "3. Sending 'repeat' command..."
	@curl -s -X POST http://localhost:3000/events \
		-H "Content-Type: application/json" \
		-d '{"type":"COMMAND_TRANSCRIBED","eventId":"demo-3-$(shell date +%s)","sessionId":"demo-session","pttSessionId":"demo-ptt-3","roomName":"campaign-DEMO","identity":"demo-player","text":"repeat","latencyMs":100,"ts":'$(shell date +%s000)'}' | jq .
	@echo ""
	@sleep 2
	@echo "4. Sending 'stop' command..."
	@curl -s -X POST http://localhost:3000/events \
		-H "Content-Type: application/json" \
		-d '{"type":"COMMAND_TRANSCRIBED","eventId":"demo-4-$(shell date +%s)","sessionId":"demo-session","pttSessionId":"demo-ptt-4","roomName":"campaign-DEMO","identity":"demo-player","text":"stop","latencyMs":100,"ts":'$(shell date +%s000)'}' | jq .
	@echo ""
	@echo "5. Checking game state..."
	@curl -s http://localhost:3000/api/state/campaign-DEMO | jq .
	@echo ""
	@echo "=== Demo Loop Complete ==="
	@echo "Check logs with: make logs | grep -E '(intent_parsed|narration_published|latency_summary)'"

# Day 3 verification: check logs for complete pipeline events
verify_day3:
	@echo "=== Day 3 Walking Skeleton Verification ==="
	@echo ""
	@echo "Checking for PTT detection events..."
	@docker-compose logs agent 2>&1 | grep -c "ptt_audio_frames_started" || echo "0"
	@echo ""
	@echo "Checking for transcription events..."
	@docker-compose logs server 2>&1 | grep -c "COMMAND_TRANSCRIBED" || echo "0"
	@echo ""
	@echo "Checking for narration events..."
	@docker-compose logs agent 2>&1 | grep -c "narration_received_from_redis" || echo "0"
	@echo ""
	@echo "Checking for interruption events..."
	@docker-compose logs server 2>&1 | grep -c "NARRATION_INTERRUPT" || echo "0"
	@echo ""
	@echo "=== Full Pipeline Check ==="
	@echo "Looking for complete PTT→STT→GM→TTS flow:"
	@echo ""
	@docker-compose logs 2>&1 | grep -E "(ptt_track_detected|ptt_audio_frames_started|transcription_complete|COMMAND_TRANSCRIBED|narration_ready|narration_received_from_redis|tts_generated)" | tail -20
	@echo ""
	@echo "If you see all event types above, Day 3 skeleton is working."

# Day 8: State snapshot durability test
verify_state:
	@echo "=== Day 8 State Durability Test ==="
	@echo ""
	@echo "1. Sending 'look' command to create state..."
	@curl -s -X POST http://localhost:3000/events \
		-H "Content-Type: application/json" \
		-d '{"type":"COMMAND_TRANSCRIBED","eventId":"state-test-1","sessionId":"test-session","pttSessionId":"state-ptt-1","roomName":"campaign-DURABILITY","identity":"test-player","text":"look","latencyMs":50,"ts":'$$(date +%s000)'}' | jq -r '.intent // .error'
	@echo ""
	@echo "2. Checking initial state..."
	@curl -s http://localhost:3000/api/state/campaign-DURABILITY | jq -r '.location.name // "NOT_FOUND"'
	@echo ""
	@echo "3. Restarting server container..."
	@docker-compose restart server
	@sleep 5
	@echo ""
	@echo "4. Sending 'status' command after restart..."
	@curl -s -X POST http://localhost:3000/events \
		-H "Content-Type: application/json" \
		-d '{"type":"COMMAND_TRANSCRIBED","eventId":"state-test-2","sessionId":"test-session","pttSessionId":"state-ptt-2","roomName":"campaign-DURABILITY","identity":"test-player","text":"status","latencyMs":50,"ts":'$$(date +%s000)'}' | jq -r '.intent // .error'
	@echo ""
	@echo "5. Verifying state persisted..."
	@LOCATION=$$(curl -s http://localhost:3000/api/state/campaign-DURABILITY | jq -r '.location.name // "NOT_FOUND"'); \
	if [ "$$LOCATION" = "NOT_FOUND" ]; then \
		echo "FAIL: State not persisted across restart"; \
		exit 1; \
	else \
		echo "PASS: State persisted. Location: $$LOCATION"; \
	fi
	@echo ""
	@echo "=== State Durability Test Complete ==="

# Day 8: Demo setup for phone testing
demo_phone:
	@echo "=== Dreamweaver Phone Demo Setup ==="
	@echo ""
	@LAN_IP=$$(hostname -I 2>/dev/null | awk '{print $$1}' || ipconfig getifaddr en0 2>/dev/null || echo "localhost"); \
	echo "Your LAN IP: $$LAN_IP"; \
	echo ""; \
	echo "=== Mobile App Setup ==="; \
	echo ""; \
	echo "1. Create apps/mobile/.env:"; \
	echo ""; \
	echo "   EXPO_PUBLIC_SERVER_URL=http://$$LAN_IP:3000"; \
	echo "   EXPO_PUBLIC_LIVEKIT_URL=ws://$$LAN_IP:7880"; \
	echo ""; \
	echo "2. Update infra/.env:"; \
	echo ""; \
	echo "   LIVEKIT_WS_URL_EXTERNAL=ws://$$LAN_IP:7880"; \
	echo ""; \
	echo "3. Restart services:"; \
	echo ""; \
	echo "   make down && make up"; \
	echo ""; \
	echo "4. Run Expo:"; \
	echo ""; \
	echo "   cd ../apps/mobile && npx expo start"; \
	echo ""; \
	echo "5. Scan QR code with Expo Go app"; \
	echo ""; \
	echo "=== Quick Connectivity Test ==="; \
	echo ""; \
	echo "Server: http://$$LAN_IP:3000/health"; \
	echo "LiveKit: ws://$$LAN_IP:7880"; \
	echo ""
	@curl -s http://localhost:3000/health | jq -r '.status // "DOWN"' | xargs -I {} echo "Server status: {}"
