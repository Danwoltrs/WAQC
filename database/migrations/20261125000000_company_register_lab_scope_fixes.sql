-- 20261125000000_company_register_lab_scope_fixes.sql
--
-- Two gaps in the company register's lab scope (migration A,
-- 20261124000000_company_register_lab_scope.sql), found by a security review
-- of A after it was applied. Neither is exploitable today: on 2026-11-25 no
-- staff work at a laboratory other than Santos (HQ). Both must be closed
-- before any are created.
--
-- Gap 1: a confined lab user can make a company it cannot see visible to its
-- laboratory through a sample.
--   A's trigger samples_qc_link_companies (AFTER, SECURITY DEFINER) links a
--   sample's party companies to the sample's laboratory, but only when the
--   writer is not confined, so a confined user's own save links nothing. Yet a
--   confined user could still write the uuid of a company its lab cannot see
--   in a party column (the foreign key check ignores row level security). The
--   next save of that sample by HQ, sys or the server fires A's trigger, links
--   the company to the lab, and the lab sees it from then on.
--   Fix: a BEFORE INSERT OR UPDATE trigger on samples. For a confined writer
--   only, each party column the statement sets (every non-null one on INSERT;
--   on UPDATE only those whose value changes) must name a company the writer
--   can read. Otherwise the save fails with 42501 and a message naming the
--   column (never the id). A value HQ set earlier and the confined user leaves
--   alone is not checked, so a lab can still edit such a sample's other fields.
--   Cost: a confined user's sample can only name companies its lab already
--   sees. A sample filled from a sys contract whose parties the lab cannot see
--   must be saved by HQ (whose save then links those parties to the lab, as
--   A intends), or the lab is first given the companies.
--
-- Gap 2: a confined lab can delete a company it created.
--   A let a confined lab delete a company with a created_company link. The
--   delete cascades: sys contacts, holders and bank accounts added since,
--   Santos's rows and other laboratories' rows all go with it, and sample
--   parties are blanked.
--   Fix: companies_lab_scope_delete is re-created from A's text with only its
--   USING clause changed: a confined user deletes no company at all.
--   Cost: a lab can no longer delete a company it added with a typo. It
--   deactivates it (it may still edit it), or asks HQ, who still can delete.
--
-- The trigger: samples_qc_guard_party_companies
--   - BEFORE row triggers on samples fire in name order (byte order). On
--     2026-11-25 the others are trg_assign_offer_number,
--     trigger_calculate_sample_fees_insert / _update,
--     trigger_update_equivalent_60kg_bags, update_samples_updated_at and
--     validate_sample_workflow_stage. "samples_..." sorts before all of them,
--     so the guard fires first: it sees exactly the party values the caller
--     wrote, and it refuses before trg_assign_offer_number takes an offer
--     number or the fee trigger prices the client. None of those triggers
--     changes a party column (read from their live text), so the value
--     checked is the value stored. The self-check below asserts nothing sorts
--     ahead of it.
--   - It fires on INSERT and on UPDATE OF the six party columns. An UPDATE
--     that sets none of them cannot change one (no other trigger writes
--     them), so a status or grading save does not even call it.
--   - The AFTER triggers (samples_mirror_to_shipment_samples,
--     samples_qc_link_companies, trg_void_certificates_of_deleted_sample) run
--     only once the row passes, and are unchanged.
--   - The function is SECURITY INVOKER: its EXISTS on companies runs under the
--     caller's row level security, i.e. it asks "can this caller read that
--     company". No companies policy reads samples, directly or through
--     contracts, company_labs or the helper functions they call (checked on
--     live 2026-11-25), so the lookup cannot recurse back to samples.
--   - Not confined (HQ, global admins, sys, portal users, the service role):
--     the function returns at once and changes nothing.
--   - A SECURITY DEFINER function that writes samples would run the EXISTS as
--     its owner, who reads every company. On 2026-11-25 no such function
--     writes a sample's party columns.
--
-- Locks: companies, then samples (A's order), ACCESS EXCLUSIVE, up front, so
-- the transaction never holds one while queueing for the other. lock_timeout
-- is 3s: if either is busy the whole transaction rolls back and nothing has
-- changed; simply run it again.
--
-- Safe to run twice.

BEGIN;

-- A trigger or a policy locks its table for a moment: fail fast rather than queue.
SET LOCAL lock_timeout = '3s';

-- Both up front, in migration A's order, rather than one by one as each statement needs it.
LOCK TABLE public.companies, public.samples IN ACCESS EXCLUSIVE MODE;

-- ── Gap 1: a confined writer names only companies it can read ──────────────
-- SECURITY INVOKER on purpose: the caller's row level security on companies
-- decides. Party columns as in qc_link_sample_companies (migration A).
CREATE OR REPLACE FUNCTION public.qc_guard_sample_party_companies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cols text[] := ARRAY['client_id', 'seller_id', 'exporter_id',
                         'importer_id', 'roaster_id', 'end_client_id'];
  v_new  uuid[];
  v_old  uuid[] := ARRAY[NULL, NULL, NULL, NULL, NULL, NULL]::uuid[];
BEGIN
  IF public.qc_read_scope_lab() IS NULL THEN
    RETURN NEW;
  END IF;

  v_new := ARRAY[NEW.client_id, NEW.seller_id, NEW.exporter_id,
                 NEW.importer_id, NEW.roaster_id, NEW.end_client_id];
  IF TG_OP = 'UPDATE' THEN
    v_old := ARRAY[OLD.client_id, OLD.seller_id, OLD.exporter_id,
                   OLD.importer_id, OLD.roaster_id, OLD.end_client_id];
  END IF;

  FOR i IN 1 .. array_length(v_cols, 1) LOOP
    CONTINUE WHEN v_new[i] IS NULL;
    CONTINUE WHEN TG_OP = 'UPDATE' AND v_new[i] IS NOT DISTINCT FROM v_old[i];
    IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_new[i]) THEN
      RAISE EXCEPTION 'samples.%: that company is not in your laboratory''s company register', v_cols[i]
        USING ERRCODE = '42501',
              HINT = 'Pick a company your laboratory has, or ask HQ to save this sample.';
    END IF;
  END LOOP;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.qc_guard_sample_party_companies() FROM PUBLIC;

DROP TRIGGER IF EXISTS samples_qc_guard_party_companies ON public.samples;
CREATE TRIGGER samples_qc_guard_party_companies
  BEFORE INSERT OR UPDATE OF client_id, seller_id, exporter_id, importer_id, roaster_id, end_client_id
  ON public.samples
  FOR EACH ROW EXECUTE FUNCTION public.qc_guard_sample_party_companies();

-- ── Gap 2: a confined lab deletes no company ───────────────────────────────
-- A delete cascades to sys's contacts, holders and bank accounts, Santos's
-- and other labs' rows, and blanks sample parties, so a confined lab never
-- deletes a company, not even one it created: it deactivates it. HQ, global
-- admins and sys still may (authenticated holds DELETE and the sys policy is
-- FOR ALL; this narrows it). Migration A's text, USING clause changed only.
DROP POLICY IF EXISTS companies_lab_scope_delete ON public.companies;
CREATE POLICY companies_lab_scope_delete ON public.companies
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.qc_read_scope_lab()) IS NULL);

-- ── Checks: abort the whole migration if any of this did not hold ──────────
DO $$
DECLARE
  v_n    int;
  v_bool boolean;
  v_text text;
BEGIN
  -- The guard: one enabled BEFORE ROW trigger on samples, INSERT and UPDATE, no DELETE.
  v_n := (SELECT count(*) FROM pg_trigger t
           WHERE t.tgrelid = 'public.samples'::regclass
             AND t.tgname = 'samples_qc_guard_party_companies'
             AND NOT t.tgisinternal
             AND t.tgenabled <> 'D'
             AND (t.tgtype & 1) <> 0      -- row
             AND (t.tgtype & 2) <> 0      -- before
             AND (t.tgtype & 4) <> 0      -- insert
             AND (t.tgtype & 16) <> 0     -- update
             AND (t.tgtype & 8) = 0       -- not delete
             AND t.tgfoid = 'public.qc_guard_sample_party_companies()'::regprocedure);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'expected the BEFORE INSERT OR UPDATE trigger samples_qc_guard_party_companies, found % matching', v_n;
  END IF;

  -- It fires first: no other BEFORE ROW trigger on samples sorts ahead of it.
  v_text := (SELECT string_agg(t.tgname::text, ', ') FROM pg_trigger t
              WHERE t.tgrelid = 'public.samples'::regclass
                AND NOT t.tgisinternal
                AND (t.tgtype & 1) <> 0 AND (t.tgtype & 2) <> 0
                AND t.tgname::text COLLATE "C" < 'samples_qc_guard_party_companies');
  IF v_text IS NOT NULL THEN
    RAISE EXCEPTION 'BEFORE triggers on samples fire ahead of the guard: %', v_text;
  END IF;

  -- SECURITY INVOKER (the caller's row level security decides), search_path pinned.
  v_bool := (SELECT p.prosecdef FROM pg_proc p
              WHERE p.oid = 'public.qc_guard_sample_party_companies()'::regprocedure);
  IF v_bool IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'qc_guard_sample_party_companies must be SECURITY INVOKER (prosecdef = false), found %', v_bool;
  END IF;
  v_bool := (SELECT 'search_path=public' = ANY (p.proconfig) FROM pg_proc p
              WHERE p.oid = 'public.qc_guard_sample_party_companies()'::regprocedure);
  IF v_bool IS NOT TRUE THEN
    RAISE EXCEPTION 'qc_guard_sample_party_companies must SET search_path TO public';
  END IF;

  -- The delete policy: restrictive, DELETE, authenticated, and only "not confined".
  v_n := (SELECT count(*) FROM pg_policies p
           WHERE p.schemaname = 'public' AND p.tablename = 'companies'
             AND p.policyname = 'companies_lab_scope_delete'
             AND p.permissive = 'RESTRICTIVE'
             AND p.cmd = 'DELETE'
             AND p.roles = ARRAY['authenticated']::name[]
             AND p.with_check IS NULL);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'expected one RESTRICTIVE FOR DELETE TO authenticated policy companies_lab_scope_delete, found %', v_n;
  END IF;
  v_text := (SELECT p.qual FROM pg_policies p
              WHERE p.schemaname = 'public' AND p.tablename = 'companies'
                AND p.policyname = 'companies_lab_scope_delete');
  IF regexp_replace(replace(COALESCE(v_text, ''), 'public.', ''), '\s+', '', 'g')
     <> '((SELECTqc_read_scope_lab()ASqc_read_scope_lab)ISNULL)' THEN
    RAISE EXCEPTION 'companies_lab_scope_delete USING is not "scope is null": %', v_text;
  END IF;

  RAISE NOTICE 'Lab scope fixes are on: samples_qc_guard_party_companies (BEFORE, first, SECURITY INVOKER) and companies_lab_scope_delete = not confined only.';
END $$;

COMMIT;

-- Post-apply check (read-only):
-- SELECT
--  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.samples'::regclass
--     AND tgname = 'samples_qc_guard_party_companies' AND (tgtype & 2) <> 0) AS guard_trigger,          -- 1
--  (SELECT prosecdef FROM pg_proc
--     WHERE oid = 'public.qc_guard_sample_party_companies()'::regprocedure) AS guard_security_definer,  -- false
--  (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies'
--     AND policyname = 'companies_lab_scope_delete') AS delete_using;  -- (( SELECT qc_read_scope_lab() AS qc_read_scope_lab) IS NULL)
