-- Migration: Add client assignment to storage positions
-- This allows individual positions to be assigned to specific clients

-- Add client_id and allow_client_view to storage_positions
ALTER TABLE storage_positions
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS allow_client_view BOOLEAN DEFAULT false;

-- Add index for client lookups
CREATE INDEX IF NOT EXISTS idx_storage_positions_client ON storage_positions(client_id);

-- Comment on new columns
COMMENT ON COLUMN storage_positions.client_id IS 'Optional: Assign this position to a specific client. NULL means available for all clients.';
COMMENT ON COLUMN storage_positions.allow_client_view IS 'Whether the assigned client can view samples in this position in their dashboard';
