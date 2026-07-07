#!/bin/bash
set -e

echo "=========================================="
echo "🚀 UC TALENT - NESTJS CROSS-BORDER STARTUP"
echo "=========================================="

# Trap EXIT to kill child processes when this script stops
trap "kill 0" EXIT

# Use the freshly deployed Factory Contract ID
CONTRACT_ID="CB5XDGAX6FX4NYARD36YNIHUWBAFNSYPH64ZM7INOWM735UMFFKY35GZ"

echo "1. Starting Backend API and Worker Daemon..."
# Clear port 8081 (default port for the NestJS API)
lsof -ti :8081 | xargs kill -9 2>/dev/null || true

export ESCROW_CONTRACT_ID=$CONTRACT_ID

# Run API in dev/watch mode
npm run start:api &
API_PID=$!

# Run Worker in dev/watch mode
npm run start:worker &
WORKER_PID=$!

# 2. Conditionally Start Frontend (React App) if it exists
if [ -d "uctalent-disbursement-demo" ]; then
  echo "2. Starting Frontend (React App)..."
  # Clear port 5173
  lsof -ti :5173 | xargs kill -9 2>/dev/null || true

  cd uctalent-disbursement-demo
  npm install
  export VITE_CONTRACT_ID=$CONTRACT_ID
  # Fetch local keys used by Freighter
  export VITE_DEPLOYER_ADDR=$(stellar keys address deployer)
  export VITE_TALENT_ADDR=$(stellar keys address talent)
  export VITE_ANCHOR_ADDR="GCPQBDOXM53SEXDV5SYRHSXOQ6BE277Y6SLLT3GCODKJVMFX2IZKLQCK"
  export VITE_FACTORY_ADDR="CB5XDGAX6FX4NYARD36YNIHUWBAFNSYPH64ZM7INOWM735UMFFKY35GZ"
  export VITE_TOKEN_ADDR="CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
  export VITE_ORACLE_ADDR="CAVLP5DH2GJPZMVO7IJY4CVOD5MWEFTJFVPD2YY2FQXOQHRGHK4D6HLP"
  export VITE_DEV_KYC_HASH=$(node -e "console.log(require('crypto').createHash('sha256').update('kyc_dev_001' + 'uctalent-salt-2026').digest('hex'))")
  export VITE_SCOUT_KYC_HASH=$(node -e "console.log(require('crypto').createHash('sha256').update('kyc_scout_001' + 'uctalent-salt-2026').digest('hex'))")
  npm run dev &
  FE_PID=$!
  cd ..
else
  echo "⚠️  Directory uctalent-disbursement-demo not found, skipping frontend."
  FE_PID=""
fi

echo "=========================================="
echo "✅ All NestJS backend services started successfully!"
echo "📜 Watching Factory ID: $CONTRACT_ID"
echo "API PID   : $API_PID"
echo "Worker PID : $WORKER_PID"
if [ -n "$FE_PID" ]; then
  echo "Frontend PID: $FE_PID"
fi
echo "=========================================="

# Wait for background processes
wait
