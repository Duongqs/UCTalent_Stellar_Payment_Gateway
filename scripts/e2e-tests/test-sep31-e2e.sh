#!/bin/bash
# test-sep31-e2e.sh

BASE="http://localhost:8081"
USDC="stellar:USDC:GBBD47IF6LWK7P7MDEVSCZA7CFYGLVOLO25E34XDBIEU7E5XPIUBIVGF"
VND="iso4217:VND"

echo "=== SEP-31 End-to-End Flow Test ==="
echo "Note: Requires running services + USE_MOCK_IPN=true"

# Step 1: Create sender customer
echo -e "\n[Step 1] Create sender..."
SENDER=$(curl -s -X PUT "$BASE/customer" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Enterprise",
    "last_name": "Client",
    "email_address": "client@company.com",
    "type": "sep31-sender"
  }')
SENDER_ID=$(echo $SENDER | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "sender_id: $SENDER_ID"

# Step 2: Create receiver customer
echo -e "\n[Step 2] Create receiver..."
RECEIVER=$(curl -s -X PUT "$BASE/customer" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Nguyen",
    "last_name": "Van A",
    "email_address": "nguyenvana@gmail.com",
    "id_number": "001122334455",
    "id_type": "national_id",
    "id_country": "VNM",
    "type": "sep31-receiver"
  }')
RECEIVER_ID=$(echo $RECEIVER | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "receiver_id: $RECEIVER_ID"

# Step 3: Get firm quote
echo -e "\n[Step 3] Get firm quote for 10 USDC..."
QUOTE=$(curl -s "$BASE/rate?type=firm&sell_asset=$USDC&buy_asset=$VND&sell_amount=10&context=sep31")
QUOTE_ID=$(echo $QUOTE | python3 -c "import sys,json; print(json.load(sys.stdin)['rate']['id'])")
VND_AMOUNT=$(echo $QUOTE | python3 -c "import sys,json; print(json.load(sys.stdin)['rate']['buy_amount'])")
echo "quote_id: $QUOTE_ID"
echo "Expected VND (before PIT): $VND_AMOUNT"
echo "Expected VND (after 10% PIT): $(python3 -c "print(int('$VND_AMOUNT') - int(int('$VND_AMOUNT') * 0.1))")"

# Step 4: Initiate SEP-31 transaction
echo -e "\n[Step 4] Initiate SEP-31 transaction..."
TX=$(curl -s -X POST "$BASE/sep31/initiate" \
  -H "Content-Type: application/json" \
  -d "{
    \"amount\": \"10\",
    \"asset_code\": \"USDC\",
    \"sender_id\": \"$SENDER_ID\",
    \"receiver_id\": \"$RECEIVER_ID\"
  }")
echo $TX | python3 -m json.tool
TX_ID=$(echo $TX | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('transactionId',''))" 2>/dev/null)
echo "transaction_id: $TX_ID"

# Step 5: Simulate IPN callback (manual, since mock may not be wired)
echo -e "\n[Step 5] Manually simulate 9Pay IPN callback (waiting 15s for poller)..."
sleep 15
CHECKSUM_KEY=${NINEPAY_CHECKSUM_KEY:-""}
RESULT_JSON="{\"invoice_no\":\"$TX_ID\",\"transaction_id\":\"$TX_ID\",\"status\":\"SUCCESS\",\"external_transaction_id\":\"NAPAS-TEST-001\"}"
RESULT_B64=$(echo -n $RESULT_JSON | base64)
CHECKSUM=$(echo -n "${RESULT_B64}${CHECKSUM_KEY}" | sha256sum | awk '{print $1}' | tr '[:lower:]' '[:upper:]')

curl -s -X POST "$BASE/ipn" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "result=$RESULT_B64" \
  --data-urlencode "checksum=$CHECKSUM" \
  --data-urlencode "version=v1" | python3 -m json.tool
# Expected: 200 OK, transaction marked completed

echo -e "\n=== SEP-31 E2E Test Done ==="
echo "Check DB: SELECT status FROM sep31_transactions WHERE id = '$TX_ID';"
