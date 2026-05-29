-- Add neighborhood (bairro) to companies. Address parts on companies are
-- (street) address + neighborhood + city + state + country + zip_code.
-- Mirrors what laboratories already stores.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS neighborhood TEXT;

COMMENT ON COLUMN companies.neighborhood IS
  'Neighborhood / bairro / borough — the address line that sits between '
  'street and city. Optional; sys.wolthers.com is the source of truth.';
