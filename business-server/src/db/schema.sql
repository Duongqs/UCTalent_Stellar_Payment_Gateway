-- UCTalent Cross-Border Disbursement — PostgreSQL Schema
-- Production-first design: replaces all in-memory stores
-- Run: psql $DATABASE_URL -f schema.sql

-- ═══════════════════════════════════════════════════════════════
-- KYC Customers (SEP-9 / SEP-12)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stellar_account TEXT,
  first_name      TEXT,
  last_name       TEXT,
  email_address   TEXT,
  id_number_enc   TEXT,              -- encrypted: v1:salt:iv:cipher
  id_type         TEXT DEFAULT 'national_id',
  status          TEXT NOT NULL DEFAULT 'NEEDS_INFO'
                  CHECK (status IN ('NEEDS_INFO', 'PROCESSING', 'ACCEPTED', 'REJECTED')),
  customer_type   TEXT NOT NULL
                  CHECK (customer_type IN ('sep31-sender', 'sep31-receiver')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_account ON customers(stellar_account);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);

-- ═══════════════════════════════════════════════════════════════
-- BankVault — Encrypted Banking PII
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bank_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  stellar_wallet      TEXT NOT NULL,
  encrypted_account   TEXT NOT NULL,   -- v1:salt:iv:cipher
  encrypted_name      TEXT NOT NULL,   -- v1:salt:iv:cipher
  bank_code           TEXT NOT NULL,
  beneficiary_ref_id  TEXT NOT NULL UNIQUE,  -- SHA-256 tokenized reference
  is_verified         BOOLEAN NOT NULL DEFAULT false,
  verified_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bp_customer ON bank_profiles(customer_id);
CREATE INDEX IF NOT EXISTS idx_bp_ref ON bank_profiles(beneficiary_ref_id);

-- ═══════════════════════════════════════════════════════════════
-- SEP-38 Firm Quotes
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS firm_quotes (
  id              UUID PRIMARY KEY,
  sell_asset      TEXT NOT NULL,
  buy_asset       TEXT NOT NULL,
  sell_amount     TEXT NOT NULL,
  buy_amount      TEXT NOT NULL,
  rate            TEXT NOT NULL,
  context         TEXT NOT NULL CHECK (context IN ('sep6', 'sep24', 'sep31')),
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,           -- NULL = available; set = consumed
  transaction_id  TEXT,                   -- SEP-31 tx that consumed this quote
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fq_expires ON firm_quotes(expires_at);
CREATE INDEX IF NOT EXISTS idx_fq_context ON firm_quotes(context);

-- ═══════════════════════════════════════════════════════════════
-- SEP-31 Transaction Lifecycle Tracking
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sep31_transactions (
  id                UUID PRIMARY KEY,   -- matches Anchor Platform tx ID
  quote_id          UUID REFERENCES firm_quotes(id),
  sender_id         UUID REFERENCES customers(id),
  receiver_id       UUID REFERENCES customers(id),
  amount_in         TEXT NOT NULL,
  asset_code        TEXT NOT NULL DEFAULT 'USDC',
  stellar_tx_hash   TEXT,
  napas_ref_id      TEXT,
  vnd_amount        BIGINT,
  withheld_tax_amount BIGINT DEFAULT 0,
  tax_code          TEXT,
  status            TEXT NOT NULL DEFAULT 'created'
                    CHECK (status IN (
                      'created', 'pending_sender', 'processing_lock', 'pending_receiver',
                      'pending_customer_info_update', 'pending_external',
                      'completed', 'error', 'expired'
                    )),
  error_message     TEXT,
  retry_count       INT NOT NULL DEFAULT 0,
  idempotency_key   TEXT UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_s31_status ON sep31_transactions(status);
CREATE INDEX IF NOT EXISTS idx_s31_updated ON sep31_transactions(updated_at);

-- ═══════════════════════════════════════════════════════════════
-- Immutable Disbursement Audit Log (append-only)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS disbursement_audit_log (
  id              BIGSERIAL PRIMARY KEY,
  transaction_id  UUID NOT NULL,
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_tx ON disbursement_audit_log(transaction_id);
CREATE INDEX IF NOT EXISTS idx_audit_event ON disbursement_audit_log(event_type);

-- Prevent mutations: audit log is append-only
REVOKE UPDATE, DELETE ON disbursement_audit_log FROM PUBLIC;
