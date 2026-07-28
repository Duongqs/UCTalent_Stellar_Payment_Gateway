#!/bin/bash
set -e

export STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
export STELLAR_RPC_URL="https://soroban-testnet.stellar.org:443"
export STELLAR_NETWORK="testnet"

stellar network add testnet --rpc-url $STELLAR_RPC_URL --network-passphrase "$STELLAR_NETWORK_PASSPHRASE" || true

echo "🚀 Uploading WASM and Deploying Factory Contract to Live Testnet..."
WASM_HASH=$(stellar contract upload --wasm target/wasm32v1-none/release/uctalent_escrow.wasm --source alice --network testnet)
FACTORY_ID=$(stellar contract deploy --wasm target/wasm32v1-none/release/uctalent_escrow.wasm --source alice --network testnet)

echo "✅ Factory Deployed Successfully!"
echo "📜 Factory ID: $FACTORY_ID"
echo "📦 WASM Hash: $WASM_HASH"

echo "⚙️  Initializing Factory State on-chain..."
stellar contract invoke --id $FACTORY_ID --source alice --network testnet -- factory_init --wasm_hash "$WASM_HASH"
