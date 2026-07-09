BEGIN;

ALTER TABLE public.sep31_transactions
  ADD COLUMN IF NOT EXISTS stellar_account text,
  ADD COLUMN IF NOT EXISTS stellar_memo text,
  ADD COLUMN IF NOT EXISTS stellar_memo_type text,
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;

ALTER TABLE public.disbursement_audit_log
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

ALTER TABLE public.bank_profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

ALTER TABLE public.disbursement_audit_log
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE varchar USING id::text;

DROP SEQUENCE IF EXISTS public.disbursement_audit_log_id_seq;

COMMIT;
