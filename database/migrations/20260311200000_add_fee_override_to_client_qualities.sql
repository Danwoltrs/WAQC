-- Add per-quality fee override columns to client_qualities
-- These allow overriding the client's default billing settings per quality spec
-- If NULL, the client's default billing applies

ALTER TABLE client_qualities
  ADD COLUMN IF NOT EXISTS fee_price DECIMAL(10,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fee_currency VARCHAR(3) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fee_unit TEXT DEFAULT NULL;

-- fee_unit values: 'per_pound' (cents per pound) or 'per_sample'
-- fee_currency values: 'USD', 'EUR', 'BRL', 'GBP'

COMMENT ON COLUMN client_qualities.fee_price IS 'Override fee price for this quality (NULL = use client default)';
COMMENT ON COLUMN client_qualities.fee_currency IS 'Override currency for this quality (NULL = use client default)';
COMMENT ON COLUMN client_qualities.fee_unit IS 'Override pricing unit: per_pound or per_sample (NULL = use client default)';
