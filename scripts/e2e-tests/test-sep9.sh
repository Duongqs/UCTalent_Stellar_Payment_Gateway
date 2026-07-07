#!/bin/bash
# test-sep9.sh

BASE="http://localhost:8081"
echo "=== SEP-9 Validation Tests ==="

# Test 1: Valid receiver - expect 202
echo -e "\n[T1] Valid receiver payload..."
curl -s -X PUT "$BASE/customer" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Nguyen",
    "last_name": "Van A",
    "email_address": "nguyenvana@gmail.com",
    "id_number": "001122334455",
    "id_type": "national_id",
    "id_country": "VNM",
    "type": "sep31-receiver"
  }' | python3 -m json.tool
# Expected: {"id": "<uuid>"}

# Test 2: camelCase - expect 400
echo -e "\n[T2] camelCase field (must reject)..."
curl -s -X PUT "$BASE/customer" \
  -H "Content-Type: application/json" \
  -d '{"firstName": "Nguyen", "type": "sep31-receiver"}' | python3 -m json.tool
# Expected: 400 + error mentioning snake_case

# Test 3: Invalid id_country - expect 400
echo -e "\n[T3] Invalid id_country 'VN' (must be 3 letters)..."
curl -s -X PUT "$BASE/customer" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "A", "last_name": "B",
    "email_address": "a@b.com", "id_number": "123",
    "id_country": "VN",
    "type": "sep31-receiver"
  }' | python3 -m json.tool
# Expected: 400 + ISO 3166-1 alpha-3 error

# Test 4: Unknown field injection - expect 400
echo -e "\n[T4] Unknown field injection (ssn)..."
curl -s -X PUT "$BASE/customer" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "A", "last_name": "B",
    "email_address": "a@b.com",
    "ssn": "secret-data",
    "type": "sep31-receiver"
  }' | python3 -m json.tool
# Expected: 400 + unknown field error

# Test 5: driver_license - expect 400
echo -e "\n[T5] Invalid id_type driver_license..."
curl -s -X PUT "$BASE/customer" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "A", "last_name": "B",
    "email_address": "a@b.com", "id_number": "123",
    "id_type": "driver_license",
    "id_country": "VNM",
    "type": "sep31-receiver"
  }' | python3 -m json.tool
# Expected: 400 + national_id or passport error

echo -e "\n=== SEP-9 Tests Done ==="
