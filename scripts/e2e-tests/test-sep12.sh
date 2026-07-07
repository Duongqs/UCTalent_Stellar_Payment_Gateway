#!/bin/bash
# test-sep12.sh

BASE="http://localhost:8081"
echo "=== SEP-12 KYC Flow Tests ==="

# Step 1: Create receiver customer, save ID
echo -e "\n[T1] Create receiver..."
RESPONSE=$(curl -s -X PUT "$BASE/customer" \
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
echo $RESPONSE | python3 -m json.tool
CUSTOMER_ID=$(echo $RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Saved customer_id: $CUSTOMER_ID"

# Step 2: GET by id - expect ACCEPTED
echo -e "\n[T2] GET customer by id - expect ACCEPTED..."
curl -s "$BASE/customer?id=$CUSTOMER_ID" | python3 -m json.tool
# Expected: status=ACCEPTED + provided_fields

# Step 3: GET unknown id - expect NEEDS_INFO with fields
echo -e "\n[T3] GET unknown id - expect NEEDS_INFO with fields list..."
curl -s "$BASE/customer?id=unknown-uuid-123&type=sep31-receiver" | python3 -m json.tool
# Expected: status=NEEDS_INFO + fields object

# Step 4: GET missing both params - expect 400
echo -e "\n[T4] GET with no params - expect 400..."
curl -s -o /dev/null -w "%{http_code}" "$BASE/customer"
echo " (expected: 400)"

# Step 5: Idempotency test - same account, same ID returned
echo -e "\n[T5] Idempotency - same stellar_account returns same customer_id..."
R1=$(curl -s -X PUT "$BASE/customer" \
  -H "Content-Type: application/json" \
  -d "{
    \"first_name\": \"Tran\", \"last_name\": \"Thi B\",
    \"email_address\": \"b@test.com\",
    \"id_number\": \"999888777\",
    \"id_country\": \"VNM\",
    \"type\": \"sep31-receiver\",
    \"account\": \"GABC123TEST\"
  }")
R2=$(curl -s -X PUT "$BASE/customer" \
  -H "Content-Type: application/json" \
  -d "{
    \"first_name\": \"Tran\", \"last_name\": \"Thi B\",
    \"email_address\": \"b@test.com\",
    \"id_number\": \"999888777\",
    \"id_country\": \"VNM\",
    \"type\": \"sep31-receiver\",
    \"account\": \"GABC123TEST\"
  }")
ID1=$(echo $R1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")
ID2=$(echo $R2 | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")
if [ "$ID1" = "$ID2" ]; then
  echo "✅ Idempotency OK: both return $ID1"
else
  echo "❌ Idempotency FAIL: $ID1 vs $ID2"
fi

echo -e "\n=== SEP-12 Tests Done ==="
