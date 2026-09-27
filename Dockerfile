# ===========================================================================
# SonicSentinel AI — Railway Production Multi-Stage Dockerfile
# ===========================================================================

# --- Stage 1: Build React Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json tsconfig*.json vite.config.ts ./
RUN npm ci || npm install
COPY index.html ./
COPY public/ ./public/
COPY src/ ./src/
RUN npm run build

# --- Stage 2: Python FastAPI Backend + Served Frontend ---
FROM python:3.11-slim

# Install system dependencies for audio processing & C libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    libsndfile1-dev \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/ml-service

# Install Python ML & API dependencies
COPY ml-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code & ML models
COPY ml-service/ ./

# Copy built frontend assets into dist/
COPY --from=frontend-builder /app/dist /app/dist
COPY --from=frontend-builder /app/dist /app/ml-service/dist

# Set environment variables defaults
ENV PORT=8000
ENV PYTHONUNBUFFERED=1
ENV USE_SQLITE=true

EXPOSE 8000

# Start Uvicorn bound to $PORT
CMD ["sh", "-c", "python -m app.create_admin || true && exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
