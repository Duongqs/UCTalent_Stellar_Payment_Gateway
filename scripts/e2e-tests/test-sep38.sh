#!/bin/bash
# test-sep38.sh

BASE="http://localhost:8081/api"
echo "=== SEP-38 Rate Tests ==="

USDC="stellar:USDC:GBBD47IF6LWK7P7MDEVSCZA7CFYGLVOLO25E34XDBIEU7E5XPIUBIVGF"
VND="iso4217:VND"

# Mock JWT for Sep10Guard
TOKEN="bypass-token"
AUTH_HEADER="Authorization: Bearer $TOKEN"

# Test 1: Indicative rate
echo -e "\n[T1] Indicative rate (/prices)..."
curl -s "$BASE/prices?sell_asset=$USDC&buy_asset=$VND&sell_amount=10" | python3 -m json.tool

# Test 2: Firm quote
echo -e "\n[T2] Firm quote (POST /quote)..."
FIRM=$(curl -s -X POST -H "Content-Type: application/json" -H "$AUTH_HEADER" -d "{
  \"sell_asset\": \"$USDC\",
  \"buy_asset\": \"$VND\",
  \"sell_amount\": \"5\",
  \"context\": \"sep31\"
}" "$BASE/quote")
echo $FIRM | python3 -m json.tool
QUOTE_ID=$(echo $FIRM | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")
echo "Saved quote_id: $QUOTE_ID"

# Test 3: Verify buy_amount has no decimal (VND must be integer)
echo -e "\n[T3] VND amount must be integer (no decimal)..."
BUY=$(echo $FIRM | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if '.' not in str(d.get('buy_amount','')) else 'FAIL - has decimal')")
echo "$BUY"

# Test 4: Invalid context - expect 400
echo -e "\n[T4] Firm quote with invalid context..."
curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "$AUTH_HEADER" -d "{
  \"sell_asset\": \"$USDC\",
  \"buy_asset\": \"$VND\",
  \"sell_amount\": \"5\",
  \"context\": \"invalid\"
}" "$BASE/quote"
echo " (expected: 400)"

# Test 5: Both sell and buy amount - expect 400
echo -e "\n[T5] Both sell_amount AND buy_amount (must reject)..."
curl -s -o /dev/null -w "%{http_code}" \
  "$BASE/prices?sell_asset=$USDC&buy_asset=$VND&sell_amount=10&buy_amount=250000"
echo " (expected: 400)"

# Test 6: GET /quote/:id - valid
echo -e "\n[T6] GET saved firm quote by id..."
curl -s -H "$AUTH_HEADER" "$BASE/quote/$QUOTE_ID" | python3 -m json.tool

# Test 7: GET /quote/:id - not found
echo -e "\n[T7] GET non-existent quote..."
curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HEADER" "$BASE/quote/fake-uuid-999"
echo " (expected: 404)"

# Test 8: Oracle health - verify rate is in valid range
echo -e "\n[T8] Rate in valid VND range [23000-28000]..."
PRICE=$(curl -s "$BASE/prices?sell_asset=$USDC&buy_asset=$VND&sell_amount=1" | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('buy_assets',[{}])[0].get('price','0'))")
python3 -c "
p = float('$PRICE') if '$PRICE' != '0' else 0
r = 1/p if p > 0 else 0
if 23000 <= r <= 28000:
    print(f'✅ Rate {r} in valid range [23000, 28000]')
else:
    print(f'❌ Rate {r} OUT OF RANGE')
"

echo -e "\n=== SEP-38 Tests Done ==="
