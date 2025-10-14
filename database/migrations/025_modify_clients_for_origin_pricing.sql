-- Migration 025: Modify Clients Table for Origin Pricing
-- Date: 2025-10-14
-- Purpose: Add billing basis and origin pricing flag to clients

-- Add new columns to clients table
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS billing_basis billing_basis DEFAULT 'approved_only',
    ADD COLUMN IF NOT EXISTS has_origin_pricing BOOLEAN DEFAULT false;

-- Add index for has_origin_pricing
CREATE INDEX IF NOT EXISTS idx_clients_has_origin_pricing ON clients(has_origin_pricing) WHERE has_origin_pricing = true;

-- Update existing clients to default billing basis
UPDATE clients SET billing_basis = 'approved_only' WHERE billing_basis IS NULL;
UPDATE clients SET has_origin_pricing = false WHERE has_origin_pricing IS NULL;

-- Comments
COMMENT ON COLUMN clients.billing_basis IS 'What samples to bill client for: approved_only or approved_and_rejected';
COMMENT ON COLUMN clients.has_origin_pricing IS 'Flag indicating if client uses multi-origin pricing (check client_origin_pricing table)';
