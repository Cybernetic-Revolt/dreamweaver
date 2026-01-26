# Dreamweaver Infrastructure Commands

.PHONY: up down logs clean seed demo keys

# Start all services
up:
	docker-compose up -d
	@echo "Services starting..."
	@echo "LiveKit: http://localhost:7880"
	@echo "Server: http://localhost:3000"
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
