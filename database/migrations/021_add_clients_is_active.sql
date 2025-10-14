-- Migration: Add is_active column to clients table
-- Description: Track whether a client relationship is currently active
-- Date: 2025-10-14

-- Add is_active column (defaults to true for new clients)
ALTER TABLE clients
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- Update existing clients to be active
UPDATE clients SET is_active = true WHERE is_active IS NULL;

-- Add index for filtering by active status
CREATE INDEX idx_clients_is_active ON clients(is_active);

-- Add comment
COMMENT ON COLUMN clients.is_active IS 'Whether the client relationship is currently active';
