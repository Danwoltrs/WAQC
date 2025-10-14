-- Migration: Add 'complimentary' option to pricing_model enum
-- Description: Adds support for complimentary pricing model where QC services are included in other services
-- Date: 2025-10-14

-- Add 'complimentary' value to the pricing_model enum
ALTER TYPE pricing_model ADD VALUE IF NOT EXISTS 'complimentary';

-- Comment explaining the new value
COMMENT ON TYPE pricing_model IS 'Pricing models for client services: per_sample (per sample fee), per_pound (per pound fee), complimentary (included in other services)';
