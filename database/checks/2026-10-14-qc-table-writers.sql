-- QC table writers: read-only checks to run BEFORE
-- 20261014000004_waqc_staff_write_policies_config.sql and
-- 20261014000005_waqc_staff_write_policies_samples.sql.
--
-- Five blocks. Run each block on its own (the editor shows only the last
-- result). Nothing here writes.
--   BLOCK 1  live policies on the eight QC tables
--   BLOCK 2  live bodies of waqc_is_staff / waqc_access_kind (an error here
--            means 20261014000001 is not applied: stop)
--   BLOCK 3  the service-role-only tables have no policies (expected: no rows)
--   BLOCK 4  database functions that write the QC tables, security definer or
--            not, and the triggers that fire them
--   BLOCK 5  people who wrote QC rows in the last 90 days and would fail the
--            staff test (expected: no rows)
--
-- ===========================================================================
-- Writer inventory (2026-10-14; WAQC branch feat/client-portal-accounts,
-- sys origin/main cb117137)
-- ===========================================================================
-- The new RESTRICTIVE policies apply to the authenticated role only. The
-- service role bypasses RLS, and so does a SECURITY DEFINER function owned by
-- the table owner. What the policies can break is a write made with a user's
-- own session by someone who fails waqc_is_staff(): an UPDATE or DELETE then
-- touches 0 rows WITHOUT an error (the route reports success, nothing is
-- saved); an INSERT fails with 42501.
--
-- 1. WAQC app, user-session client (@/lib/supabase-server): subject to RLS.
--    Every one is an /api route the middleware opens to staff only
--    (decideRouteAccess: kind 'staff', from waqc_access_kind(), the same test
--    as waqc_is_staff()). None is under /api/portal, /api/certificate,
--    /api/embed, /api/profiles/ensure, /api/portal/accept or
--    /api/auth/invitation, the only paths a non-staff user reaches; those
--    only read QC tables.
--      api/certificates/[id]/override/route.ts      114, 147 certificates update
--      api/client-qualities/[id]/duplicate/route.ts 129 quality_templates insert,
--                                                   155 client_qualities insert,
--                                                   176 quality_templates delete
--      api/client-qualities/[id]/route.ts           102, 156 client_qualities update; 177 delete
--      api/client-qualities/route.ts                142 client_qualities insert
--      api/clients/[id]/origin-pricing/[origin]/route.ts  47 qc_client_settings upsert
--      api/clients/[id]/origin-pricing/route.ts     144 qc_client_settings upsert
--      api/clients/[id]/quality-specifications/[specId]/route.ts  117 client_qualities update; 174 delete
--      api/clients/[id]/quality-specifications/route.ts  128 client_qualities insert
--      api/clients/[id]/route.ts                    180 qc_client_settings upsert; 269 client_qualities delete;
--                                                   272, 273 samples update; 278 qc_client_settings delete
--      api/clients/route.ts                         260 qc_client_settings upsert; 303 insert
--      api/cupping/scores/save-digital/route.ts     81 cupping_sessions insert; 138 cupping_scores update; 191 insert
--      api/cupping/scores/submit/route.ts           94 cupping_sessions insert; 223 cupping_scores insert
--      api/cupping/validate/route.ts                326 cupping_sessions update
--      api/quality-templates/[id]/clone/route.ts    80 quality_templates insert
--      api/quality-templates/[id]/restore/route.ts  76 quality_templates update
--      api/quality-templates/[id]/route.ts          188 quality_templates update; 243 delete
--      api/quality-templates/route.ts               185 quality_templates insert
--      api/samples/[id]/duplicate/route.ts          189 samples insert
--      api/samples/[id]/photos/route.ts             106, 258 quality_assessments update; 116 insert
--      api/samples/[id]/quality-assessment/route.ts 129 quality_assessments update; 144 insert
--      api/samples/[id]/route.ts                    451, 490, 712 samples update; 513, 559, 569 certificates update
--      api/samples/[id]/send-to-recipients/route.ts 192 samples update
--      api/samples/bulk/assign/route.ts             43 samples update
--      api/samples/route.ts                         637 samples insert
--      api/samples/tin-labels/mark-printed/route.ts 38 samples update
--    Library writers that take the caller's client, called with a session
--    client only from the staff routes above:
--      lib/sample-group.ts 313 samples insert, 347 samples update
--        (createSiblingSamples: api/samples/route.ts 681, api/samples/[id]/siblings/route.ts 89)
--      lib/cupping/certificate-mint.ts 181 certificates update, 232 insert, 308, 315 samples update
--        (mintGroupCertificates: api/samples/[id]/certificate/route.ts 324, lib/sample-group.ts 362)
--      lib/certificate-storage.ts 73 certificates update (invalidateCertificatePdf:
--        api/samples/[id]/route.ts 537, api/samples/[id]/quality-assessment/route.ts 263,
--        api/cupping/scores/save-digital/route.ts 180, 236, api/cupping/scores/[id]/route.ts 176,
--        api/cupping/scores/submit/route.ts 259)
--    Pre-existing, unchanged by these policies: api/clients/import/route.ts
--    272 (qc_client_settings insert) runs on an ANON client with no session,
--    so it is outside "TO authenticated" and is already refused by the
--    permissive policies, which all test auth.uid().
--
-- 2. WAQC app, service-role client: bypasses RLS, unaffected.
--      api/cupping/cva/[id]/route.ts 279-291 cupping_scores; api/cupping/cva/finalize/route.ts 334, 338
--      and api/cupping/finalize/route.ts 287-491 quality_assessments; api/cupping/cva/session/route.ts 69
--      cupping_sessions; api/cupping/scores/[id]/route.ts 160 cupping_scores; api/cupping/scores/submit/route.ts
--      244 samples; api/notifications/samples-assigned/route.ts 172-433 cupping_sessions, samples,
--      quality_assessments; api/samples/[id]/approve-with-comments/route.ts 256, 272; api/samples/[id]/
--      cupping-score/route.ts 130-188; api/samples/[id]/quality-assessment/route.ts 195;
--      api/samples/bulk/move-to-cupping/route.ts 93-142; lib/contract-ref-sync.ts 359 samples;
--      lib/cupping/finalize-pipeline.ts 324, 347, 431 cupping_sessions and every certificate-mint call
--      from the finalize routes, certify-after-grading and the certificate override (all service role).
--      The sys decision write-back (writeDecisionToShipmentSamples) always gets the service-role client
--      and writes sys tables, not QC tables.
--
-- 3. sys (origin/main): no user-session writer of the eight tables.
--      src/lib/samples/create.ts 99 samples insert: createAdminClient() (service role), from
--        api/samples/route.ts 237 and api/contracts/[id]/samples/route.ts 56.
--      supabase/functions/classify-sample-emails/classifier.ts 377 samples insert: service role.
--      Every other sys use is a read (contracts/[id]/all-samples, samples GET, finance/qc-offset-server,
--        portal/quality/loader).
--
-- 4. Database functions and triggers (from the migration files; BLOCK 4 is
--    the live answer):
--      SECURITY DEFINER, unaffected: soft_delete_sample, void_certificate,
--        save_lab_floor_plan, cleanup_old_defect_photos,
--        renumber_unsent_certificate_tail, assign_certificate_number (trigger
--        on certificates), void_certificates_of_deleted_sample (trigger on
--        samples), sys qc_mirror_sample (trigger on samples, writes sys
--        shipment_samples), sys hard_delete_contract (dynamic SQL).
--      SECURITY INVOKER that write QC tables:
--        recalculate_lab_sample_fees (trigger on laboratory_third_party_config)
--        and recalculate_origin_sample_fees (trigger on client_origin_pricing)
--        update samples. Only WAQC staff routes write those two tables
--        (api/laboratories/[id]/third-party-config, api/clients/[id]/
--        origin-pricing); sys only reads client_origin_pricing, with the
--        service role. recalculate_client_sample_fees fired from the dropped
--        clients table, so its trigger is gone. auto_generate_certificate_on_
--        approval lost its trigger in migration 127; if BLOCK 4 shows it still
--        fired, it fires on samples updates, which only staff and the service
--        role make. clone_quality_template is not called by either app.
--      sys migrations write samples only in one-off DO blocks run by hand
--        (0749 smoke test, 0756 repair, 0778 re-mirror), as the owner.
--
-- Verdict: no writer runs as a non-staff signed-in user, so all eight tables
-- are in the two migrations. STOP before applying if BLOCK 4 lists a
-- function with security_definer = false fired by a trigger on a table other
-- than the eight QC tables, laboratory_third_party_config and
-- client_origin_pricing, or if BLOCK 5 lists anyone who should keep working.
--
-- Paste-safe for the Supabase editor.

-- ---------------------------------------------------------------------------
-- BLOCK 1: live policies on the eight QC tables. Note any RESTRICTIVE write
-- policy already there, any policy already named *_waqc_staff_*, and any
-- permissive write policy for anon or public whose test does not need
-- auth.uid(). The migrations drop and recreate only their own *_waqc_staff_*
-- names.
-- ---------------------------------------------------------------------------
SELECT tablename, policyname, permissive, cmd, roles::text AS roles,
       coalesce(qual, '-') AS using_expression,
       coalesce(with_check, '-') AS check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('samples', 'certificates', 'quality_assessments', 'cupping_sessions',
                    'cupping_scores', 'client_qualities', 'quality_templates', 'qc_client_settings')
ORDER BY tablename, cmd, policyname;

-- ---------------------------------------------------------------------------
-- BLOCK 2: the live helper bodies the new policies call. An error means
-- 20261014000001 is not applied: stop.
-- ---------------------------------------------------------------------------
SELECT pg_get_functiondef('public.waqc_is_staff'::regproc) AS waqc_is_staff,
       pg_get_functiondef('public.waqc_access_kind'::regproc) AS waqc_access_kind;

-- ---------------------------------------------------------------------------
-- BLOCK 3: the service-role-only tables have no policies. Expected: no rows
-- (a row means someone added a policy: report it before going on).
-- ---------------------------------------------------------------------------
SELECT tablename, policyname, permissive, cmd, roles::text AS roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('portal_invitations', 'qc_portal_access')
ORDER BY tablename, policyname;

-- ---------------------------------------------------------------------------
-- BLOCK 4: which database functions write the QC tables, whether they run as
-- their owner (security_definer), and which triggers fire them. A function
-- that is NOT security definer and is fired by a trigger on a table sys users
-- write would run as that sys user and be blocked by the new policies.
-- Text match: dynamic SQL (EXECUTE format) is not seen; the only one known,
-- sys hard_delete_contract, is security definer.
-- ---------------------------------------------------------------------------
WITH qc_tables(t) AS (
  VALUES ('samples'), ('certificates'), ('quality_assessments'), ('cupping_sessions'),
         ('cupping_scores'), ('client_qualities'), ('quality_templates'), ('qc_client_settings')
),
fns AS (
  SELECT p.oid, p.proname, p.prosecdef, pg_get_functiondef(p.oid) AS body
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
)
SELECT f.proname AS function_name,
       f.prosecdef AS security_definer,
       string_agg(DISTINCT q.t, ', ') AS writes_tables,
       (SELECT string_agg(DISTINCT c.relname || '.' || tg.tgname, ', ')
          FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
         WHERE tg.tgfoid = f.oid AND NOT tg.tgisinternal) AS fired_by_triggers
FROM fns f
JOIN qc_tables q
  ON f.body ~* ('(update\s+(public\.)?' || q.t || '\M|insert\s+i' || 'nto\s+(public\.)?' || q.t || '\M|delete\s+from\s+(public\.)?' || q.t || '\M)')
GROUP BY f.oid, f.proname, f.prosecdef
ORDER BY f.prosecdef, f.proname;

-- ---------------------------------------------------------------------------
-- BLOCK 5: people who wrote QC rows in the last 90 days (as creator, issuer
-- or cupper) and would fail waqc_is_staff(). The staff test is written out
-- here for any user id; keep it equal to waqc_is_staff(): no disabled
-- user_profiles row, a qc_role other than client/supplier/buyer, and
-- qc_enabled IS TRUE. Expected: no rows. A row is a person whose next write
-- through a session route stops working once the policies are on (an update
-- saves nothing, an insert fails): switch their qc_enabled on first, or
-- accept that they lose QC write access. The 20261014000001 pre-check
-- (sections 2 and 3) lists every staff-role profile with qc_enabled not true,
-- active or not.
-- ---------------------------------------------------------------------------
WITH recent AS (
  SELECT s.created_by AS user_id, 'samples.created_by' AS wrote_as, max(s.created_at) AS last_write
  FROM public.samples s
  WHERE s.created_by IS NOT NULL AND s.created_at > now() - interval '90 days'
  GROUP BY s.created_by
  UNION ALL
  SELECT c.issued_by, 'certificates.issued_by', max(c.created_at)
  FROM public.certificates c
  WHERE c.issued_by IS NOT NULL AND c.created_at > now() - interval '90 days'
  GROUP BY c.issued_by
  UNION ALL
  SELECT cs.cupper_id, 'cupping_scores.cupper_id', max(cs.created_at)
  FROM public.cupping_scores cs
  WHERE cs.cupper_id IS NOT NULL AND cs.created_at > now() - interval '90 days'
  GROUP BY cs.cupper_id
  UNION ALL
  SELECT se.created_by, 'cupping_sessions.created_by', max(se.created_at)
  FROM public.cupping_sessions se
  WHERE se.created_by IS NOT NULL AND se.created_at > now() - interval '90 days'
  GROUP BY se.created_by
  UNION ALL
  SELECT qt.created_by, 'quality_templates.created_by', max(qt.created_at)
  FROM public.quality_templates qt
  WHERE qt.created_by IS NOT NULL AND qt.created_at > now() - interval '90 days'
  GROUP BY qt.created_by
)
SELECT coalesce((SELECT lower(u.email) FROM auth.users u WHERE u.id = r.user_id), 'no auth user: ' || r.user_id::text) AS person,
       string_agg(DISTINCT r.wrote_as, ', ') AS wrote_as,
       max(r.last_write) AS last_write,
       coalesce(p.qc_role::text, 'no WAQC profile') AS qc_role,
       coalesce(p.qc_enabled::text, '-') AS qc_enabled,
       coalesce((SELECT string_agg(up.user_type::text || '/' || coalesce(up.status::text, 'null'), ', ')
                   FROM public.user_profiles up WHERE up.id = r.user_id), 'none') AS sys_account
FROM recent r
LEFT JOIN public.profiles p ON p.id = r.user_id
WHERE NOT coalesce(
  NOT EXISTS (
    SELECT 1 FROM public.user_profiles d
    WHERE d.id = r.user_id AND d.status::text = 'disabled'
  )
  AND p.qc_role IS NOT NULL
  AND p.qc_role::text NOT IN ('client', 'supplier', 'buyer')
  AND p.qc_enabled IS TRUE,
  false)
GROUP BY r.user_id, p.qc_role, p.qc_enabled
ORDER BY max(r.last_write) DESC;
