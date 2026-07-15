BEGIN;

ALTER TABLE public.firm_quotes
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

COMMIT;
