-- Migration: Add soft delete support to samples table
-- This allows tracking deletions without losing data

-- Add soft delete columns to samples table
ALTER TABLE samples
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

-- Add index for better query performance when filtering deleted samples
CREATE INDEX IF NOT EXISTS idx_samples_deleted_at ON samples(deleted_at) WHERE deleted_at IS NOT NULL;

-- Add comment explaining the soft delete pattern
COMMENT ON COLUMN samples.deleted_at IS 'Timestamp when the sample was soft-deleted. NULL means not deleted.';
COMMENT ON COLUMN samples.deleted_by IS 'User ID who deleted the sample. References auth.users.';

-- Update existing RLS policies to exclude deleted samples for non-admin users
-- First, drop the existing select policy
DROP POLICY IF EXISTS "Users can view samples based on their role and lab" ON samples;

-- Recreate the select policy with deleted_at filter
CREATE POLICY "Users can view samples based on their role and lab" ON samples
  FOR SELECT
  USING (
    -- Exclude deleted samples for all users by default
    deleted_at IS NULL
    AND
    (
      -- Global admins can see all samples
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND (profiles.is_global_admin = true OR profiles.qc_role = 'global_admin')
      )
      OR
      -- Lab personnel can see samples from their lab
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.laboratory_id = samples.laboratory_id
        AND profiles.qc_role IN ('lab_manager', 'lab_technician', 'cupper')
      )
      OR
      -- Clients can see their own samples
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.client_id = samples.client_id
        AND profiles.qc_role = 'client'
      )
    )
  );

-- Create a separate policy for global admins to view deleted samples
CREATE POLICY "Global admins can view deleted samples" ON samples
  FOR SELECT
  USING (
    -- Only global admins can see deleted samples
    deleted_at IS NOT NULL
    AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_global_admin = true OR profiles.qc_role = 'global_admin')
    )
  );

-- Add a helpful function to soft delete samples
CREATE OR REPLACE FUNCTION soft_delete_sample(sample_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is a global admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.is_global_admin = true OR profiles.qc_role = 'global_admin')
  ) THEN
    RAISE EXCEPTION 'Only global admins can delete samples';
  END IF;

  -- Soft delete the sample
  UPDATE samples
  SET
    deleted_at = NOW(),
    deleted_by = auth.uid()
  WHERE id = sample_id
  AND deleted_at IS NULL; -- Prevent double deletion

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sample not found or already deleted';
  END IF;
END;
$$;

-- Add comment for the function
COMMENT ON FUNCTION soft_delete_sample IS 'Soft deletes a sample by setting deleted_at and deleted_by. Only global admins can call this.';
