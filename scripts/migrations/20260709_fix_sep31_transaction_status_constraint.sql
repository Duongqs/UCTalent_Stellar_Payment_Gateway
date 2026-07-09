BEGIN;

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

COMMIT;
