#!/bin/bash
set -e

echo "==============================================="
echo "  UC Cross-Border — Starting all services..."
echo "==============================================="

# Check environment
if [ ! -f .env ]; then
  echo "❌ .env file not found! Copy from .env.example"
  exit 1
fi

# Fetch port from .env or fallback to 8081
API_PORT=$(grep '^PORT=' .env | cut -d '=' -f2)
API_PORT=${API_PORT:-8081}

echo "🧹 Cleaning up dangling processes..."
lsof -ti:${API_PORT} | xargs kill -9 2>/dev/null || true
pkill -f "npm run start:worker" 2>/dev/null || true
pkill -f "npm run start:api" 2>/dev/null || true
sleep 1

# Start services
echo "📡 Starting Soroban Event Listener (Worker)..."
npm run start:worker &
WORKER_PID=$!

echo "🌐 Starting SEP-31 Anchor API..."
npm run start:api &
API_PID=$!

# Handle shutdown
trap "echo 'Shutting down...'; kill $WORKER_PID $API_PID; exit 0" SIGINT SIGTERM

echo "==============================================="
echo "  API:      http://localhost:${API_PORT}"
echo "  API Docs: http://localhost:${API_PORT}/api/docs"
echo "  Worker:   Active background listener"
echo "==============================================="

wait
