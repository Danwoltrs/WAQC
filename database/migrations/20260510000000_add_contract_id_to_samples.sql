-- 20260510000000_add_contract_id_to_samples.sql
-- Adds optional FK from samples (and sample_contracts) to public.contracts so that
-- samples created via the Contract Search step retain a link to the source contract.

BEGIN;

ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS contract_id UUID
    REFERENCES public.contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_samples_contract_id
  ON samples(contract_id) WHERE contract_id IS NOT NULL;

COMMENT ON COLUMN samples.contract_id IS
  'Optional link to public.contracts. Set when sample was created via the contract-search step in sample intake.';

ALTER TABLE sample_contracts
  ADD COLUMN IF NOT EXISTS contract_id UUID
    REFERENCES public.contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sample_contracts_contract_id
  ON sample_contracts(contract_id) WHERE contract_id IS NOT NULL;

COMMENT ON COLUMN sample_contracts.contract_id IS
  'Optional link to public.contracts. Reserved for future use; UI does not currently populate this.';

COMMIT;
