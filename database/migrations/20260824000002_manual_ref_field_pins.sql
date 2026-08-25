-- Manual reference pins
--
-- sys.wolthers is the source of truth for a contract's seller (Ecom) and buyer
-- references, and the QC certificate + approval email read that value through at
-- render time. When staff CORRECT a reference here in QC, that correction was
-- stored and shown in the UI but silently discarded at render time, so the PDF and
-- the email kept printing the stale sys number (e.g. Ahold SAG-011846/26 printed
-- IR0007525-1 after it was corrected to IR0007524-1).
--
-- `manual_ref_fields` records which reference columns a user pinned by hand. A pinned
-- column always wins over sys — for display and for the automatic re-sync.
-- Allowed values: 'buyer_contract_nr', 'seller_contract_nr', 'supplier_contract_nr'.

ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS manual_ref_fields text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE sample_contracts
  ADD COLUMN IF NOT EXISTS manual_ref_fields text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN samples.manual_ref_fields IS
  'Reference columns corrected by hand in QC. A listed column wins over the sys.wolthers read-through everywhere (certificate, approval email) and is never re-synced from sys.';

COMMENT ON COLUMN sample_contracts.manual_ref_fields IS
  'Reference columns corrected by hand in QC. A listed column wins over the sys.wolthers read-through everywhere (certificate, approval email) and is never re-synced from sys.';
