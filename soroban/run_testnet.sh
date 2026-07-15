#!/bin/bash
set -e

echo "=========================================================="
echo "🌟 UC TALENT: LIVE SOROBAN TESTNET DEPLOYMENT & EXECUTION"
echo "=========================================================="

# 1. Network configuration
echo "📡 Configuring Testnet..."
stellar network add --global testnet --rpc-url https://soroban-testnet.stellar.org:443 --network-passphrase "Test SDF Network ; September 2015" || true

# 2. Key Generation and Funding
echo "🔑 Generating Web3 Keypairs..."
stellar keys generate alice --network testnet || true
stellar keys generate bob --network testnet || true
stellar keys generate scout --network testnet || true
stellar keys generate platform --network testnet || true

echo "💸 Funding ALL Wallets (Alice, Bob, Scout, Platform) via Friendbot..."
stellar keys fund alice --network testnet || true
stellar keys fund bob --network testnet || true
stellar keys fund scout --network testnet || true
stellar keys fund platform --network testnet || true

ALICE_ADDR=$(stellar keys address alice)
BOB_ADDR=$(stellar keys address bob)
SCOUT_ADDR=$(stellar keys address scout)
PLATFORM_ADDR=$(stellar keys address platform)
# Use real USDC token as the testnet bounty asset
TOKEN_ADDR="CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
# Reflector Testnet DEX Oracle Address (SEP-40 compliant)
ORACLE_ADDR="CAVLP5DH2GJPZMVO7IJY4CVOD5MWEFTJFVPD2YY2FQXOQHRGHK4D6HLP"

echo ""
echo "👤 Employer: $ALICE_ADDR"
echo "👨‍💻 Talent  : $BOB_ADDR"
echo "🕵️  Scout   : $SCOUT_ADDR"
echo "🏦 Platform: $PLATFORM_ADDR"
echo "🔮 Oracle  : $ORACLE_ADDR"
echo ""

# 3. Build & Deploy Factory
echo "🚀 Uploading WASM and Deploying Factory Contract to Live Testnet..."
WASM_HASH=$(stellar contract install --wasm target/wasm32-unknown-unknown/release/uctalent_escrow.wasm --source alice --network testnet)
FACTORY_ID=$(stellar contract deploy --wasm target/wasm32-unknown-unknown/release/uctalent_escrow.wasm --source alice --network testnet)
echo "✅ Factory Deployed Successfully!"
echo "📜 Factory ID: $FACTORY_ID"
echo "📦 WASM Hash: $WASM_HASH"

# 4. Initialize Factory
echo "⚙️  Initializing Factory State on-chain..."
stellar contract invoke --id $FACTORY_ID --source alice --network testnet -- factory_init --wasm_hash "$WASM_HASH"

# 5. Create Child Escrow
echo "⚙️  Spawning child Escrow from Factory..."
DEV_KYC_ID="0101010101010101010101010101010101010101010101010101010101010101"
SCOUT_KYC_ID="0202020202020202020202020202020202020202020202020202020202020202"

# Parse the child address returned by create_escrow
ESCROW_ID=$(stellar contract invoke --id $FACTORY_ID --source alice --network testnet -- create_escrow \
  --config "{\"client\": \"$ALICE_ADDR\", \"developer\": \"$BOB_ADDR\", \"scout\": \"$SCOUT_ADDR\", \"platform_address\": \"$PLATFORM_ADDR\", \"anchor_address\": \"$PLATFORM_ADDR\", \"token\": \"$TOKEN_ADDR\", \"bounty_amount\": \"10000000\", \"scout_rate\": 800, \"platform_rate\": 200, \"expiry_ledger\": 9999999, \"developer_kyc_id\": \"$DEV_KYC_ID\", \"scout_kyc_id\": \"$SCOUT_KYC_ID\", \"oracle_address\": \"$ORACLE_ADDR\"}" | tr -d '"')

echo "✅ Child Escrow spawned successfully: $ESCROW_ID"

# 6. Execute Deposit on Child Escrow
echo "💰 Employer (Alice) depositing 1 USDC (10_000_000 stroops) into Escrow Vault..."
stellar contract invoke --id $ESCROW_ID --source alice --network testnet -- deposit --client "$ALICE_ADDR"

# 7. Execute release_bounty by Client
echo "✍️  Employer (Alice) signing milestone completion & TRIGGERING SPLIT..."
stellar contract invoke --id $ESCROW_ID --source alice --network testnet -- release_bounty --sig_party "$ALICE_ADDR"

echo "🎉 WEB3 LIFECYCLE COMPLETE: Funds have been atomically split (2% Platform Treasury / 98% Anchor Vault) on the Testnet!"
echo "=========================================================="
