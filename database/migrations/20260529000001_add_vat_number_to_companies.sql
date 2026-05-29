-- Migration 20260529000001
-- Phase 9b: add vat_number to companies so WAQC's Add Client modal can persist
-- the VAT/CNPJ field.
--
-- sys.wolthers.com keeps document_cnpj (Brazilian-specific) for the trading
-- side. vat_number is the generic field for non-Brazilian VAT / tax identifiers
-- entered through WAQC (EU VAT, US EIN, etc.).
--
-- Without this column, /api/clients GET fails with:
--   ERROR 42703: column companies.vat_number does not exist

BEGIN;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS vat_number text;

COMMENT ON COLUMN companies.vat_number IS
  'Generic VAT/tax identifier captured by WAQC. Distinct from document_cnpj which is sys.wolthers.com''s Brazilian-specific field.';

COMMIT;
