-- Migration: Allow all internal lab staff to create / duplicate / update samples
-- Date: 2026-06-10
-- Purpose:
--   Lab personnel were hitting RLS error 42501 on sample INSERT/UPDATE (create &
--   duplicate). Root cause: the prior "Lab personnel can insert/update samples"
--   policies relied on get_user_qc_role()/get_user_qc_laboratory()/
--   has_global_qc_access(), and ALL of those helpers filter on
--   "profiles.qc_enabled = true". Any lab user with qc_enabled = false (e.g. a
--   newly added lab_personnel) makes every helper return NULL, so the policy
--   check (get_user_qc_role(auth.uid()) = 'lab_personnel') evaluates to NULL and
--   the write is denied. Master cuppers worked only because they happened to be
--   qc_enabled = true.
--
-- Decision (2026-06-10): sample create/duplicate/update should be available to
--   ANY internal staff regardless of the qc_enabled flag, so future lab staff are
--   never silently blocked. External portal roles (client/supplier/buyer) must
--   still NOT be able to write samples. These policies read profiles directly and
--   do not depend on qc_enabled or the qc-role helper functions.
--
-- Note: field-level edit restrictions (only master cuppers/admins may edit a
--   sample's quality fields) remain enforced at the API layer (PATCH
--   /api/samples/[id] via authorizeSampleEdit). RLS stays permissive for internal
--   staff so lab workflow (assessments, status changes) and duplication keep
--   working; the API is the gate for who may edit what.

-- ---------------------------------------------------------------------------
-- INSERT: any internal staff can create (and therefore duplicate) samples
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lab personnel can insert samples" ON samples;

CREATE POLICY "Lab personnel can insert samples" ON samples
    FOR INSERT
    WITH CHECK (
        -- Service role bypasses all checks (server-side / admin operations)
        (auth.jwt() ->> 'role') = 'service_role'
        OR
        -- Any internal staff member: has a profile and is not an external role
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND COALESCE(p.qc_role::text, '') NOT IN ('client', 'supplier', 'buyer')
        )
    );

COMMENT ON POLICY "Lab personnel can insert samples" ON samples IS
'Allows the service role and any internal staff (profile exists and qc_role is not client/supplier/buyer) to create samples. Independent of qc_enabled so lab staff are never silently blocked.';

-- ---------------------------------------------------------------------------
-- UPDATE: any internal staff can update samples (field edits still gated in API)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lab personnel can update samples" ON samples;

CREATE POLICY "Lab personnel can update samples" ON samples
    FOR UPDATE
    USING (
        (auth.jwt() ->> 'role') = 'service_role'
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND COALESCE(p.qc_role::text, '') NOT IN ('client', 'supplier', 'buyer')
        )
    )
    WITH CHECK (
        (auth.jwt() ->> 'role') = 'service_role'
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND COALESCE(p.qc_role::text, '') NOT IN ('client', 'supplier', 'buyer')
        )
    );

COMMENT ON POLICY "Lab personnel can update samples" ON samples IS
'Allows the service role and any internal staff to update samples. Field-level edit restrictions (master cuppers/admins only) are enforced at the API layer, not RLS.';

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
SELECT
    'Sample write policies updated - internal staff (any qc_enabled) can create/duplicate/update' AS status,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'samples' AND policyname = 'Lab personnel can insert samples') AS insert_policy_exists,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'samples' AND policyname = 'Lab personnel can update samples') AS update_policy_exists;
