#!/bin/bash
set -e

echo "=== UC TALENT PRE-DEPLOYED TEST FLOW ==="
FACTORY_ID="CB5XDGAX6FX4NYARD36YNIHUWBAFNSYPH64ZM7INOWM735UMFFKY35GZ"
TOKEN_ADDR="CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"

DEPLOYER_ADDR=$(stellar keys address deployer)
TALENT_ADDR=$(stellar keys address talent)
SCOUT_ADDR=$(stellar keys address scout)
ANCHOR_ADDR="GCPQBDOXM53SEXDV5SYRHSXOQ6BE277Y6SLLT3GCODKJVMFX2IZKLQCK"

DEV_KYC_ID="0101010101010101010101010101010101010101010101010101010101010101"
SCOUT_KYC_ID="0202020202020202020202020202020202020202020202020202020202020202"

echo "Deployer Address: $DEPLOYER_ADDR"
echo "Talent Address  : $TALENT_ADDR"
echo "Scout Address   : $SCOUT_ADDR"

echo "1. Creating Escrow Contract via Factory..."
ESCROW_ID=$(stellar contract invoke --id $FACTORY_ID --source deployer --network testnet -- create_escrow \
  --config "{\"client\": \"$DEPLOYER_ADDR\", \"developer\": \"$TALENT_ADDR\", \"scout\": \"$SCOUT_ADDR\", \"platform_address\": \"$ANCHOR_ADDR\", \"anchor_address\": \"$ANCHOR_ADDR\", \"token\": \"$TOKEN_ADDR\", \"bounty_amount\": \"590000000\", \"scout_rate\": 800, \"platform_rate\": 200, \"expiry_ledger\": 9999999, \"developer_kyc_id\": \"$DEV_KYC_ID\", \"scout_kyc_id\": \"$SCOUT_KYC_ID\"}" | tr -d '"')

echo "✅ Spawned Escrow ID: $ESCROW_ID"

echo "2. Depositing 59 USDC into Child Escrow..."
stellar contract invoke --id $ESCROW_ID --source deployer --network testnet -- deposit --client "$DEPLOYER_ADDR"

echo "✅ Deposit complete!"

echo "3. Releasing bounty..."
stellar contract invoke --id $ESCROW_ID --source deployer --network testnet -- release_bounty --sig_party "$DEPLOYER_ADDR"

echo "✅ Release complete!"
