#!/bin/bash
set -e

RPC="https://mainnet.sorobanrpc.com"
PASSPHRASE="Public Global Stellar Network ; September 2015"
SOURCE="${PLATFORM_SECRET_KEY:?❌ Set PLATFORM_SECRET_KEY env var}"
WASM_ORIG="target/wasm32v1-none/release/uctalent_escrow.wasm"
WASM_MIN="target/wasm32v1-none/release/uctalent_escrow.min.wasm"
HORIZON="https://horizon.stellar.org"

# Derive public key from secret
PUBKEY=$(node -e "
  const StellarSdk = require('@stellar/stellar-sdk');
  console.log(StellarSdk.Keypair.fromSecret('$SOURCE').publicKey());
")
echo "👛 Account: $PUBKEY"

# Check balance
echo "💰 Checking balance..."
BALANCE=$(curl -sf "$HORIZON/accounts/$PUBKEY" | python3 -c "
import json,sys
a=json.load(sys.stdin)
bal=[b for b in a['balances'] if b['asset_type']=='native'][0]['balance']
avail=float(bal)-2.0-a['subentry_count']*0.5
print(f'{float(bal):.4f}|{avail:.2f}')
")
TOTAL=$(echo "$BALANCE" | cut -d'|' -f1)
AVAIL=$(echo "$BALANCE" | cut -d'|' -f2)
echo "   Total:     $TOTAL XLM"
echo "   Available: ~$AVAIL XLM"

if (( $(echo "$AVAIL < 10" | bc -l) )); then
  echo ""
  echo "⚠️  Available balance is low. Uploading a WASM contract may need 10-25 XLM."
  echo "   Consider adding more XLM to this account before proceeding."
fi

# Build & optimize
echo ""
echo "🔨 Building..."
stellar contract build --optimize

echo "⚡ Optimizing WASM with wasm-opt..."
wasm-opt -Oz --strip-debug --strip-producers --dce \
  "$WASM_ORIG" \
  -o "$WASM_MIN"
WASM_SIZE=$(ls -lh "$WASM_MIN" | awk '{print $5}')
echo "   WASM size: $WASM_SIZE"

# Upload WASM
echo ""
echo "📤 Uploading WASM to mainnet..."
if WASM_HASH=$(stellar contract upload \
  --wasm "$WASM_MIN" \
  --source-account "$SOURCE" \
  --rpc-url "$RPC" \
  --network-passphrase "$PASSPHRASE" 2>/dev/null); then
  echo "📦 WASM Hash: $WASM_HASH"
else
  EXIT=$?
  echo ""
  echo "❌ Upload failed. This usually means insufficient XLM for state rent."
  echo "   Try adding more XLM to $PUBKEY"
  echo "   Check balance: https://stellar.expert/explorer/public/account/$PUBKEY"
  exit $EXIT
fi

# Deploy factory
echo ""
echo "🚀 Deploying factory from WASM hash..."
if FACTORY_ID=$(stellar contract deploy \
  --wasm-hash "$WASM_HASH" \
  --source-account "$SOURCE" \
  --rpc-url "$RPC" \
  --network-passphrase "$PASSPHRASE" 2>/dev/null); then
  echo "📜 Factory ID: $FACTORY_ID"
else
  EXIT=$?
  echo ""
  echo "❌ Deploy failed."
  exit $EXIT
fi

# Init factory
echo ""
echo "⚙️ Initializing factory..."
stellar contract invoke \
  --id "$FACTORY_ID" \
  --source-account "$SOURCE" \
  --rpc-url "$RPC" \
  --network-passphrase "$PASSPHRASE" \
  -- factory_init --wasm_hash "$WASM_HASH"

echo ""
echo "============================================"
echo "✅ Mainnet deployment complete!"
echo "   Factory ID: $FACTORY_ID"
echo "   WASM Hash:  $WASM_HASH"
echo "   WASM Size:  $WASM_SIZE"
echo "============================================"
echo ""
echo "📋 Update these in your .env files:"
echo "   ESCROW_CONTRACT_ID=$FACTORY_ID"
echo "   NEXT_PUBLIC_SOROBAN_FACTORY_ID=$FACTORY_ID"
echo "   VITE_CONTRACT_ID=$FACTORY_ID"
