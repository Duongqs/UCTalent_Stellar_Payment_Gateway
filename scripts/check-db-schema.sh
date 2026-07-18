#!/usr/bin/env bash
# Compare live Postgres schema vs uc-stellar expected tables.
# Usage:
#   POSTGRES_HOST=... POSTGRES_PORT=15432 POSTGRES_USER=... POSTGRES_PASSWORD=... \
#   POSTGRES_DB=uct_cross_border_dev ./scripts/check-db-schema.sh

set -euo pipefail

HOST="${POSTGRES_HOST:?}"
PORT="${POSTGRES_PORT:-5432}"
USER="${POSTGRES_USER:?}"
PASS="${POSTGRES_PASSWORD:?}"
DB="${POSTGRES_DB:?}"

EXPECTED=(
  sep31_transactions
  firm_quotes
  bridge_events_queue
  customers
  bank_profiles
  disbursement_audit_log
  sync_state
  uc_stellar_schema_migrations
)

export PGPASSWORD="$PASS"

echo "=== Connecting ${USER}@${HOST}:${PORT}/${DB} ==="
echo
echo "=== Expected uc-stellar tables ==="
for t in "${EXPECTED[@]}"; do
  exists=$(psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -Atc \
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='$t')")
  if [ "$exists" = "t" ]; then
    cols=$(psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -Atc \
      "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='$t'")
    echo "  OK   $t ($cols cols)"
  else
    echo "  MISS $t"
  fi
done

echo
echo "=== Applied uc-stellar migrations (if tracker exists) ==="
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -c \
  "SELECT id, applied_at FROM uc_stellar_schema_migrations ORDER BY id" 2>/dev/null \
  || echo "  (uc_stellar_schema_migrations not created yet)"

echo
echo "=== WARNING: Rails schema_migrations also exists on shared DBs ==="
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -c '\d schema_migrations' 2>/dev/null || true
