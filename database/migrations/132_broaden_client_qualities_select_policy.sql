-- Migration 132: Broaden client_qualities SELECT policy
-- Any authenticated user should be able to view quality assignments
-- (e.g., when viewing client details). The API already checks authentication.
-- INSERT/UPDATE/DELETE policies remain restricted to QC roles.

DROP POLICY IF EXISTS "Users can view client qualities" ON client_qualities;
CREATE POLICY "Users can view client qualities" ON client_qualities
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Verify
DO $$
BEGIN
    RAISE NOTICE 'Migration 132: client_qualities SELECT policy broadened to all authenticated users';
END;
$$;

SELECT 'Migration 132: Broaden client_qualities SELECT to all authenticated users' AS status;
