FROM python:3.11-bookworm

WORKDIR /app

# Install system dependencies (bookworm has ffmpeg 5.x compatible with av 11)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    pkg-config \
    build-essential \
    libavformat-dev \
    libavcodec-dev \
    libavdevice-dev \
    libavutil-dev \
    libswscale-dev \
    libswresample-dev \
    libavfilter-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Piper voice model for faster TTS on first use
RUN mkdir -p /root/.local/share/piper && \
    piper --model en_US-lessac-medium --output_file /tmp/warmup.wav < /dev/null || true && \
    rm -f /tmp/warmup.wav

# Copy source
COPY src/ ./src/

ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "src.main", "start"]
