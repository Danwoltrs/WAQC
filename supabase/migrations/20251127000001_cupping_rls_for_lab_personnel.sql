-- Migration: Add RLS policies for lab personnel to scan cupping cards
-- Ensures entry-level lab workers can scan cards and submit scores

-- ============================================================================
-- CUPPING_SCORES TABLE POLICIES
-- ============================================================================

-- Allow lab personnel to insert their own cupping scores
CREATE POLICY "Lab personnel can insert cupping scores"
ON cupping_scores
FOR INSERT
TO authenticated
WITH CHECK (
  -- User must be authenticated
  auth.uid() IS NOT NULL
);

-- Allow users to view cupping scores they created or participated in
CREATE POLICY "Users can view relevant cupping scores"
ON cupping_scores
FOR SELECT
TO authenticated
USING (
  -- User is the cupper
  cupper_id = auth.uid()
  OR
  -- User created the session
  EXISTS (
    SELECT 1 FROM cupping_sessions
    WHERE cupping_sessions.id = cupping_scores.session_id
    AND cupping_sessions.created_by = auth.uid()
  )
  OR
  -- User is a participant in the session
  EXISTS (
    SELECT 1 FROM cupping_sessions
    WHERE cupping_sessions.id = cupping_scores.session_id
    AND auth.uid() = ANY(cupping_sessions.participants)
  )
);

-- ============================================================================
-- CUPPING_SESSIONS TABLE POLICIES
-- ============================================================================

-- Allow lab personnel to create cupping sessions
CREATE POLICY "Lab personnel can create cupping sessions"
ON cupping_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  -- User must be authenticated and is the creator
  created_by = auth.uid()
);

-- Allow users to view sessions they created or participate in
CREATE POLICY "Users can view relevant cupping sessions"
ON cupping_sessions
FOR SELECT
TO authenticated
USING (
  -- User created the session
  created_by = auth.uid()
  OR
  -- User is a participant
  auth.uid() = ANY(participants)
);

-- ============================================================================
-- SAMPLES TABLE - READ ACCESS FOR LAB PERSONNEL
-- ============================================================================

-- Create policy to allow lab personnel to read samples for verification
-- (Only if one doesn't already exist - this may need adjustment based on existing policies)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'samples'
    AND policyname = 'Lab personnel can read samples'
  ) THEN
    CREATE POLICY "Lab personnel can read samples"
    ON samples
    FOR SELECT
    TO authenticated
    USING (
      -- Allow authenticated users to read samples
      -- This is needed for the scan workflow to verify sample existence
      auth.uid() IS NOT NULL
    );
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES (for testing)
-- ============================================================================

-- Uncomment these to verify policies are created:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd
-- FROM pg_policies
-- WHERE tablename IN ('cupping_scores', 'cupping_sessions', 'samples')
-- ORDER BY tablename, policyname;
