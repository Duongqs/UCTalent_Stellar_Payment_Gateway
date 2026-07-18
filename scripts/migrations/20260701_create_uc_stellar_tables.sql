BEGIN;

-- Baseline schema for uc-stellar / cross-border (shared DB safe).
-- Idempotent: IF NOT EXISTS throughout.

-- ── sep31_transactions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sep31_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  amount_in numeric(18, 7),
  asset_code varchar NOT NULL DEFAULT 'USDC',
  sender_id varchar,
  receiver_id varchar,
  status varchar NOT NULL DEFAULT 'pending_sender',
  idempotency_key varchar,
  quote_id varchar,
  stellar_tx_hash varchar,
  stellar_account varchar,
  stellar_memo varchar,
  stellar_memo_type varchar,
  napas_ref_id varchar,
  vnd_amount numeric(15, 0),
  withheld_tax_amount numeric(15, 0),
  tax_code varchar,
  retry_count integer NOT NULL DEFAULT 0,
  error_message text,
  expires_at timestamptz,
  distribution_id varchar,
  exchange_rate numeric(12, 4)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sep31_transactions_idempotency_key
  ON public.sep31_transactions (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_sep31_transactions_stellar_tx_hash
  ON public.sep31_transactions (stellar_tx_hash);

ALTER TABLE public.sep31_transactions
  DROP CONSTRAINT IF EXISTS sep31_transactions_status_check;
ALTER TABLE public.sep31_transactions
  ADD CONSTRAINT sep31_transactions_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'created'::text,
        'pending_sender'::text,
        'processing_lock'::text,
        'pending_receiver'::text,
        'pending_customer_info_update'::text,
        'pending_external'::text,
        'pending_clearing'::text,
        'usdc_retained'::text,
        'completed'::text,
        'error'::text,
        'expired'::text
      ]
    )
  );

-- ── firm_quotes (may already exist on shared DB) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.firm_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sell_asset varchar NOT NULL,
  buy_asset varchar NOT NULL,
  sell_amount varchar NOT NULL,
  buy_amount varchar NOT NULL,
  rate varchar NOT NULL,
  context varchar NOT NULL,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  transaction_id varchar
);

ALTER TABLE public.firm_quotes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ── bridge_events_queue ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bridge_events_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ledger integer NOT NULL,
  tx_hash varchar NOT NULL,
  contract_id varchar NOT NULL,
  payload_json text NOT NULL,
  status varchar NOT NULL DEFAULT 'pending',
  error_message text,
  retry_count integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bridge_events_queue_tx_hash
  ON public.bridge_events_queue (tx_hash);
CREATE INDEX IF NOT EXISTS idx_bridge_events_queue_status
  ON public.bridge_events_queue (status);

-- ── customers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  stellar_account varchar,
  first_name varchar,
  last_name varchar,
  email_address varchar,
  status varchar NOT NULL DEFAULT 'PROCESSING',
  customer_type varchar NOT NULL DEFAULT 'sep31-receiver'
);

CREATE INDEX IF NOT EXISTS idx_customers_stellar_account
  ON public.customers (stellar_account);

-- ── bank_profiles ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  customer_id varchar NOT NULL,
  stellar_wallet varchar NOT NULL,
  encrypted_account text NOT NULL,
  encrypted_name text NOT NULL,
  bank_code varchar NOT NULL,
  beneficiary_ref_id varchar NOT NULL,
  is_verified boolean NOT NULL DEFAULT false,
  verified_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_bank_profiles_customer_id
  ON public.bank_profiles (customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_profiles_beneficiary_ref_id
  ON public.bank_profiles (beneficiary_ref_id);

-- ── disbursement_audit_log ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.disbursement_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  transaction_id varchar NOT NULL,
  event_type varchar NOT NULL,
  payload text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_disbursement_audit_log_transaction_id
  ON public.disbursement_audit_log (transaction_id);

-- ── sync_state (no BaseEntity timestamps) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sync_state (
  key varchar PRIMARY KEY,
  value text NOT NULL
);

COMMIT;
