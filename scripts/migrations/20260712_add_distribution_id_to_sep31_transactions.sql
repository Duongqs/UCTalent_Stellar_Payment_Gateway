BEGIN;

ALTER TABLE public.sep31_transactions
  ADD COLUMN IF NOT EXISTS distribution_id text;

COMMIT;
