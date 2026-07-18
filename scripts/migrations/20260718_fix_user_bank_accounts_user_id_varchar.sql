BEGIN;

-- users.id is varchar (nanoid). user_bank_accounts.user_id must match.
-- Fixes: invalid input syntax for type uuid: "S9EFUACcxYEUSuj3kj1f"

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_bank_accounts'
      AND column_name = 'user_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE public.user_bank_accounts
      ALTER COLUMN user_id TYPE varchar(50) USING user_id::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_bank_accounts'
      AND column_name = 'account_number'
      AND data_type = 'character varying'
  ) THEN
    ALTER TABLE public.user_bank_accounts
      ALTER COLUMN account_number TYPE text USING account_number::text;
  END IF;
END $$;

COMMIT;
