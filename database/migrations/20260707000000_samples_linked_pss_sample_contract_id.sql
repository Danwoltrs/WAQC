-- An SS can link to a specific sub-contract (container/buyer split) of an
-- approved PSS, not only the mother sample. linked_pss_sample_id keeps pointing
-- at the mother (so existing resolution/embeds are unchanged); this column pins
-- the exact leaf. NULL = linked to a whole mother PSS (or not an SS).
ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS linked_pss_sample_contract_id UUID NULL
    REFERENCES sample_contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_samples_linked_pss_sample_contract_id
  ON samples(linked_pss_sample_contract_id)
  WHERE linked_pss_sample_contract_id IS NOT NULL;
