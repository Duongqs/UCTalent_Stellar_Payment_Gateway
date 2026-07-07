#!/bin/bash
set -e

echo "=========================================="
echo "🚀 UC TALENT - END-TO-END TESTNET STARTUP (SERVICES ONLY)"
echo "=========================================="

# Trap EXIT to kill child processes when this script stops
trap "kill 0" EXIT

# Use the freshly deployed Factory Contract ID
CONTRACT_ID="CB5XDGAX6FX4NYARD36YNIHUWBAFNSYPH64ZM7INOWM735UMFFKY35GZ"

echo "1. Starting Backend (SDP Listener & Anchor)..."
# Clear port 4001
lsof -ti :4001 | xargs kill -9 2>/dev/null || true

cd disbursement-bridge
npm install
export ESCROW_CONTRACT_ID=$CONTRACT_ID
export PORT=4001
npm run start &
BE_PID=$!
cd ..

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

echo "=========================================="
echo "✅ All services started successfully!"
echo "📜 Watching Factory ID: $CONTRACT_ID"
echo "Backend PID: $BE_PID"
echo "Frontend PID: $FE_PID"
echo "=========================================="

# Wait for background processes
wait
