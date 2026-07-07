#!/bin/bash
# run-all-tests.sh

echo "Starting UCTalent Cross-Border Integration Tests..."
echo "Ensure business-server is running on :8081"
echo ""

chmod +x test-sep9.sh test-sep12.sh test-sep38.sh test-sep31-e2e.sh test-security.sh test-db-state.sh

mkdir -p logs

./test-sep9.sh 2>&1 | tee logs/sep9.log
./test-sep12.sh 2>&1 | tee logs/sep12.log
./test-sep38.sh 2>&1 | tee logs/sep38.log
./test-sep31-e2e.sh 2>&1 | tee logs/sep31-e2e.log
./test-security.sh 2>&1 | tee logs/security.log
./test-db-state.sh 2>&1 | tee logs/db-state.log

echo ""
echo "All tests complete. Check logs/ directory."
echo "Key things to verify:"
echo "  - No 'FAIL' in sep9.log, sep12.log, sep38.log"
echo "  - 'completed' status appears in sep31-e2e.log"
echo "  - HTTP 401 appears in security.log for fake IPN"
echo "  - 0 rows in double-payment check in db-state.log"
