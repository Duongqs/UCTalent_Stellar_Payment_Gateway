#!/bin/bash
# test-security.sh

BASE="http://localhost:8081"
echo "=== Security & Edge Case Tests ==="

# Test 1: Fake IPN without valid checksum - must reject
echo -e "\n[T1] Fake IPN without valid checksum (must reject 401)..."
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/ipn" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "result=fakebase64data&checksum=fakechecksum123&version=v1"
echo " (expected: 401)"

# Test 2: Duplicate IPN - must be idempotent
echo -e "\n[T2] Duplicate IPN same tx_id (must return 200 Already processed)..."
# Send same IPN twice with valid checksum from a known completed TX
# (replace TX_COMPLETED_ID with actual completed transaction id from DB)
TX_COMPLETED_ID="replace-with-completed-tx-id"
CHECKSUM_KEY=${NINEPAY_CHECKSUM_KEY:-"sandbox_checksum"}
RESULT_JSON="{\"status\":\"SUCCESS\",\"invoice_no\":\"$TX_COMPLETED_ID\"}"
RESULT_B64=$(echo -n $RESULT_JSON | base64)
CHECKSUM=$(echo -n "${RESULT_B64}${CHECKSUM_KEY}" | sha256sum | awk '{print $1}' | tr '[:lower:]' '[:upper:]')
curl -s -X POST "$BASE/ipn" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "result=$RESULT_B64&checksum=$CHECKSUM&version=v1" | python3 -m json.tool
# Expected: {"message": "Already processed"}

# Test 3: Circuit breaker
echo -e "\n[T3] Oracle circuit breaker state..."
curl -s "http://localhost:8081/admin/oracle/status" | python3 -m json.tool 2>/dev/null \
  || echo "(admin endpoint may not be implemented yet)"

# Test 4: Expired quote - must reject
echo -e "\n[T4] SEP-31 with expired quote_id..."
curl -s -X POST "$BASE/sep31/initiate" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "10",
    "asset_code": "USDC",
    "sender_id": "any-sender",
    "receiver_id": "any-receiver",
    "quote_id": "expired-quote-uuid-000"
  }' | python3 -m json.tool
# Expected: 400 + quote_expired error

echo -e "\n=== Security Tests Done ==="
