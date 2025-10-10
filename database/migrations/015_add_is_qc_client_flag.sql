-- Migration 015: Add is_qc_client flag to distinguish QC clients from supply chain participants
-- Date: 2025-10-10
-- Purpose: Distinguish who HIRED us for QC vs who is just in the supply chain or pays fees

-- Add is_qc_client flag
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS is_qc_client BOOLEAN DEFAULT true;

-- Update existing clients to be QC clients by default
UPDATE clients SET is_qc_client = true WHERE is_qc_client IS NULL;

-- Add index for filtering
CREATE INDEX IF NOT EXISTS idx_clients_is_qc_client ON clients(is_qc_client);

-- Add comments for clarity
COMMENT ON COLUMN clients.is_qc_client IS 'True if this entity HIRED us for quality control services. False if they are just a supply chain participant or fee payer.';
COMMENT ON COLUMN clients.fee_payer IS 'Who PAYS the QC fee - can be different from who hired us (e.g., roaster pays on behalf of final buyer client)';
COMMENT ON COLUMN clients.client_types IS 'Their role(s) in the supply chain: producer, exporter, importer, roaster, final_buyer, etc.';

-- Example usage:
-- Dunkin (hired us, roaster pays):
--   is_qc_client = true
--   fee_payer = 'roaster'
--   client_types = ['final_buyer']
--
-- Roaster (pays for Dunkin's QC):
--   is_qc_client = false
--   fee_payer = 'client_pays'
--   client_types = ['roaster']
--
-- Roaster (is ALSO our direct client):
--   is_qc_client = true
--   fee_payer = 'client_pays'
--   client_types = ['roaster']
