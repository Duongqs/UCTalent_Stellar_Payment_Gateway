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
echo "  API:      http://localhost:4000"
echo "  API Docs: http://localhost:4000/api/docs"
echo "  Worker:   Active background listener"
echo "==============================================="

wait
