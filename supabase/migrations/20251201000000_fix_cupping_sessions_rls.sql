-- Migration: Fix RLS policy for cupping_sessions to properly check cupper_ids
-- The previous policy used ANY() with participants which has type mismatch issues
-- This migration updates the policy to use JSONB contains operator for cupper_ids
--
-- Note: auth.uid() returns UUID type, but created_by and participants are text type
-- All comparisons must cast auth.uid() to text

-- Drop existing policy
DROP POLICY IF EXISTS "Users can view relevant cupping sessions" ON cupping_sessions;

-- Create new policy that works with JSONB cupper_ids array
CREATE POLICY "Users can view relevant cupping sessions"
ON cupping_sessions
FOR SELECT
TO authenticated
USING (
  -- User created the session (cast UUID to text)
  created_by = (auth.uid())::text
  OR
  -- User is in cupper_ids (JSONB array contains the user's UUID as text)
  cupper_ids @> to_jsonb(ARRAY[(auth.uid())::text])
  OR
  -- User is in participants (text array)
  (auth.uid())::text = ANY(participants)
);

-- Also add policy for UPDATE so cuppers can update session progress
DROP POLICY IF EXISTS "Users can update cupping sessions they participate in" ON cupping_sessions;

CREATE POLICY "Users can update cupping sessions they participate in"
ON cupping_sessions
FOR UPDATE
TO authenticated
USING (
  created_by = (auth.uid())::text
  OR
  cupper_ids @> to_jsonb(ARRAY[(auth.uid())::text])
  OR
  (auth.uid())::text = ANY(participants)
)
WITH CHECK (
  created_by = (auth.uid())::text
  OR
  cupper_ids @> to_jsonb(ARRAY[(auth.uid())::text])
  OR
  (auth.uid())::text = ANY(participants)
);
