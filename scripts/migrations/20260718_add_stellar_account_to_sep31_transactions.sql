ALTER TABLE sep31_transactions ADD COLUMN IF NOT EXISTS stellar_account VARCHAR;
ALTER TABLE sep31_transactions ADD COLUMN IF NOT EXISTS stellar_memo VARCHAR;
ALTER TABLE sep31_transactions ADD COLUMN IF NOT EXISTS stellar_memo_type VARCHAR;
