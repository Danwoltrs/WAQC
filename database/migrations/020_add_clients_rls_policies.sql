-- Migration: Add RLS policies for clients table
-- Description: Add INSERT, UPDATE, and DELETE policies for authenticated users
-- Date: 2025-10-14

-- Allow authenticated users to insert clients
CREATE POLICY "Authenticated users can insert clients"
ON clients
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update clients
CREATE POLICY "Authenticated users can update clients"
ON clients
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow authenticated users to delete clients
CREATE POLICY "Authenticated users can delete clients"
ON clients
FOR DELETE
TO authenticated
USING (true);

-- Update the existing SELECT policy to be more specific
DROP POLICY IF EXISTS "QC users can view clients" ON clients;

CREATE POLICY "Authenticated users can view clients"
ON clients
FOR SELECT
TO authenticated
USING (true);
