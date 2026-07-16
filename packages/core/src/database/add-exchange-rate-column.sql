-- Migration: Add exchange_rate column to sep31_transactions
-- Required for: uc-cross-border (PostgreSQL)
-- Date: 2026-07-15
-- Description: Stores the USDC/VND exchange rate used during disbursement
--              so it can be forwarded to backend and recorded on-chain.

ALTER TABLE sep31_transactions
ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(12, 4);
