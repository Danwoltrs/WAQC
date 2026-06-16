-- Migration: Allow all internal lab staff to create / update client qualities
-- Date: 2026-06-15
-- Purpose:
--   Assigning a quality template to a client (INSERT into client_qualities) hit
--   RLS error 42501 ("new row violates row-level security policy"). Root cause:
--   the INSERT/UPDATE policies from migration 070 rely on get_user_qc_role(),
--   which filters on "profiles.qc_enabled = true". Any internal user with
--   qc_enabled = false -- including a global_admin (e.g. daniel@wolthers.com) --
--   makes the helper return NULL, so the policy check evaluates to NULL and the
--   write is denied.
--
--   This is the same qc_enabled gotcha already fixed for the samples table in
--   migration 20260610000000. Quality-spec policies were never given the same
--   treatment, so they still silently block internal staff.
--
-- Decision (2026-06-15): creating / editing client qualities should be available
--   to ANY internal staff regardless of the qc_enabled flag, mirroring sample
--   writes. External portal roles (client/supplier/buyer) must still NOT write.
--   These policies read profiles directly and do not depend on qc_enabled or the
--   qc-role helper functions. DELETE stays restricted (unchanged).

-- ---------------------------------------------------------------------------
-- INSERT: any internal staff can create client qualities
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Quality managers can create client qualities" ON client_qualities;

CREATE POLICY "Quality managers can create client qualities" ON client_qualities
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

COMMENT ON POLICY "Quality managers can create client qualities" ON client_qualities IS
'Allows the service role and any internal staff (profile exists and qc_role is not client/supplier/buyer) to create client qualities. Independent of qc_enabled so internal staff are never silently blocked.';

-- ---------------------------------------------------------------------------
-- UPDATE: any internal staff can update client qualities
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Quality managers can update client qualities" ON client_qualities;

CREATE POLICY "Quality managers can update client qualities" ON client_qualities
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

COMMENT ON POLICY "Quality managers can update client qualities" ON client_qualities IS
'Allows the service role and any internal staff to update client qualities. Independent of qc_enabled, mirroring sample writes.';

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
SELECT
    'client_qualities write policies updated - internal staff (any qc_enabled) can create/update' AS status,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'client_qualities' AND policyname = 'Quality managers can create client qualities') AS insert_policy_exists,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'client_qualities' AND policyname = 'Quality managers can update client qualities') AS update_policy_exists;
