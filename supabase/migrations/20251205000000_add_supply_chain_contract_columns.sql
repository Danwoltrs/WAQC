-- Add new contract reference columns for supply chain entities
-- This supports the QC Client/Importer restructure

-- Add seller contract number (for seller/exporter)
ALTER TABLE samples ADD COLUMN IF NOT EXISTS seller_contract_nr TEXT;

-- Add shipper contract number (when shipper differs from seller)
ALTER TABLE samples ADD COLUMN IF NOT EXISTS shipper_contract_nr TEXT;

-- Add QC client contract number (when QC client is separate from importer)
ALTER TABLE samples ADD COLUMN IF NOT EXISTS qc_client_contract_nr TEXT;

-- Note: buyer_contract_nr is kept for backward compatibility
-- UI will display it as "Importer Contract Nr"

-- Add comments for documentation
COMMENT ON COLUMN samples.seller_contract_nr IS 'Contract reference number from the seller (exporter)';
COMMENT ON COLUMN samples.shipper_contract_nr IS 'Contract reference number from the shipper (when different from seller)';
COMMENT ON COLUMN samples.qc_client_contract_nr IS 'Contract reference number from the QC client (when separate from importer)';
