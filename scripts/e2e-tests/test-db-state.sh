#!/bin/bash
# test-db-state.sh
# Chạy sau E2E test để verify DB state

DB_URL=${DATABASE_URL:-"postgres://localhost:5432/uct_cross_border_dev"}

echo "=== Database State Verification ==="

echo -e "\n[1] Transaction status distribution:"
psql $DB_URL -c "
SELECT status, COUNT(*) as count 
FROM sep31_transactions 
GROUP BY status 
ORDER BY count DESC;"

echo -e "\n[2] Any stuck in processing_lock > 5 min:"
psql $DB_URL -c "
SELECT id, status, updated_at 
FROM sep31_transactions 
WHERE status = 'processing_lock' 
  AND updated_at < now() - interval '5 minutes';"
# Expected: 0 rows (none stuck)

echo -e "\n[3] Unused quotes older than 20 min:"
psql $DB_URL -c "
SELECT id, expires_at, used_at 
FROM firm_quotes 
WHERE expires_at < now() - interval '5 minutes' 
  AND used_at IS NULL
LIMIT 5;"

echo -e "\n[4] Audit log for last 5 transactions:"
psql $DB_URL -c "
SELECT transaction_id, event_type, created_at, payload->>'error' as error
FROM disbursement_audit_log 
ORDER BY created_at DESC 
LIMIT 20;"

echo -e "\n[5] Double-payment check (should be 0):"
psql $DB_URL -c "
SELECT quote_id, COUNT(*) as used_count
FROM sep31_transactions
WHERE quote_id IS NOT NULL
GROUP BY quote_id
HAVING COUNT(*) > 1;"
# Expected: 0 rows

echo -e "\n=== DB Verification Done ==="
