-- 20261124000000_company_register_lab_scope.sql
--
-- A laboratory sees the companies it added. HQ, global admins and sys see all.
--
-- QC and sys share one company register: companies, contacts, company_titulares
-- (the legal holders a company trades under) and company_bank_accounts. Until
-- now a QC lab user outside Brazil would read every Brazilian company, contact,
-- holder and bank account in it. Daniel's rule (spec 2026-11-24, decisions 1-4):
--
--   companies     a confined lab user reads a company only when its laboratory
--                 is linked to it (company_labs), or the user created it; edits
--                 it only when that laboratory created it. Adding a company is
--                 unchanged; the new company is linked to the adder's lab.
--   contacts,     each row carries owner_lab_id: NULL = sys or Santos (HQ), a
--   holders,      laboratory = the non-HQ lab that added it. A confined lab
--   bank accts    user reads and writes only its own lab's rows, even on a
--                 shared company such as Ahold (option A).
--   samples       a sample saved in a non-HQ lab links its parties' companies
--                 to that lab, so a sample filled from a sys contract still
--                 shows its client, seller, exporter, importer and roaster.
--   QC staff      any QC staff login may read, add and edit holders and bank
--                 accounts (decision 1). Never delete: no DELETE grant exists.
--
-- "Confined" is public.qc_read_scope_lab() (20261119000002_lab_scope.sql): the
-- caller's laboratory when it is not of type 'hq'; NULL otherwise. Nothing here
-- names a laboratory or a country.
--
-- Who is NOT touched (qc_read_scope_lab() is NULL for all of them):
--   - HQ (Santos) staff and global admins;
--   - every sys user: no laboratory on their profile;
--   - portal users (client / supplier / buyer);
--   - the service role and triggers (no auth.uid() -> no confinement).
-- The existing permissive and sys deny policies are neither dropped nor altered.
--
-- On 2026-11-24 Buenaventura has no staff and no samples: this changes what
-- nobody sees today. Every existing contact, holder and bank account gets
-- owner_lab_id NULL, i.e. stays sys's / Santos's.
--
-- The policies are RESTRICTIVE: they can only narrow, and a sys policy reset
-- (which drops PERMISSIVE policies only) leaves them in place.
--
-- Safe to run twice.

BEGIN;

-- Adding a column or a policy locks its table for a moment: fail fast rather than queue.
SET LOCAL lock_timeout = '3s';

-- ── Functions ──────────────────────────────────────────────────────────────

-- The laboratory that owns a new contact / holder / bank account: the adder's,
-- when the adder is confined. The owner never changes through the API: an
-- UPDATE keeps the row's owner whatever it sends.
-- SECURITY DEFINER so the scope can be read whatever role writes the row.
CREATE OR REPLACE FUNCTION public.qc_stamp_owner_lab()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.owner_lab_id := COALESCE(NEW.owner_lab_id, public.qc_read_scope_lab());
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.owner_lab_id := OLD.owner_lab_id;
  END IF;
  RETURN NEW;
END
$function$;

-- A confined user's new company remembers who made it, so the user can read it
-- back in the same statement (insert ... returning), before the AFTER trigger
-- below has linked it to the lab.
CREATE OR REPLACE FUNCTION public.qc_stamp_company_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.qc_read_scope_lab() IS NOT NULL THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  RETURN NEW;
END
$function$;

-- A company a confined user adds belongs to their laboratory (it created it).
CREATE OR REPLACE FUNCTION public.qc_link_company_to_scope_lab()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lab uuid := public.qc_read_scope_lab();
BEGIN
  IF v_lab IS NOT NULL THEN
    INSERT INTO public.company_labs (company_id, laboratory_id, created_company)
    VALUES (NEW.id, v_lab, true)
    ON CONFLICT (company_id, laboratory_id) DO NOTHING;
  END IF;
  RETURN NULL;
END
$function$;

-- A sample in a non-HQ laboratory links each of its party companies to that
-- laboratory (created_company = false: the lab may read them, not edit them).
-- HQ is decided by laboratories.type, never by name or code. The join on
-- companies keeps an id that is not a company from ever failing the sample save.
CREATE OR REPLACE FUNCTION public.qc_link_sample_companies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.laboratory_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.laboratories l
    WHERE l.id = NEW.laboratory_id
      AND lower(COALESCE(l.type::text, '')) <> 'hq'
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.company_labs (company_id, laboratory_id, created_company)
  SELECT DISTINCT c.id, NEW.laboratory_id, false
  FROM unnest(ARRAY[NEW.client_id, NEW.seller_id, NEW.exporter_id,
                    NEW.importer_id, NEW.roaster_id, NEW.end_client_id]) AS party(id)
  JOIN public.companies c ON c.id = party.id
  ON CONFLICT (company_id, laboratory_id) DO NOTHING;

  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION public.qc_stamp_owner_lab() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qc_stamp_company_creator() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qc_link_company_to_scope_lab() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qc_link_sample_companies() FROM PUBLIC;

-- ── company_labs: which laboratory has which company ───────────────────────
CREATE TABLE IF NOT EXISTS public.company_labs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  laboratory_id   uuid NOT NULL REFERENCES public.laboratories(id) ON DELETE CASCADE,
  created_company boolean NOT NULL DEFAULT false,
  created_by      uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, laboratory_id)
);

COMMENT ON TABLE public.company_labs IS
  'A laboratory has a company when this row exists. created_company = that lab added the company (and may edit it). Written by triggers and the service role only.';

CREATE INDEX IF NOT EXISTS company_labs_laboratory_id_idx
  ON public.company_labs (laboratory_id);

ALTER TABLE public.company_labs ENABLE ROW LEVEL SECURITY;

-- ── owner_lab_id on the rows that hang off a company ───────────────────────
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS owner_lab_id uuid REFERENCES public.laboratories(id) ON DELETE SET NULL;
ALTER TABLE public.company_titulares
  ADD COLUMN IF NOT EXISTS owner_lab_id uuid REFERENCES public.laboratories(id) ON DELETE SET NULL;
ALTER TABLE public.company_bank_accounts
  ADD COLUMN IF NOT EXISTS owner_lab_id uuid REFERENCES public.laboratories(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.contacts.owner_lab_id IS
  'NULL = sys or Santos (HQ). A laboratory = the non-HQ lab that added it; only that lab''s confined users see it.';
COMMENT ON COLUMN public.company_titulares.owner_lab_id IS
  'NULL = sys or Santos (HQ). A laboratory = the non-HQ lab that added it; only that lab''s confined users see it.';
COMMENT ON COLUMN public.company_bank_accounts.owner_lab_id IS
  'NULL = sys or Santos (HQ). A laboratory = the non-HQ lab that added it; only that lab''s confined users see it.';

CREATE INDEX IF NOT EXISTS contacts_owner_lab_id_idx
  ON public.contacts (owner_lab_id) WHERE owner_lab_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS company_titulares_owner_lab_id_idx
  ON public.company_titulares (owner_lab_id) WHERE owner_lab_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS company_bank_accounts_owner_lab_id_idx
  ON public.company_bank_accounts (owner_lab_id) WHERE owner_lab_id IS NOT NULL;

-- ── Triggers ───────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS contacts_qc_stamp_owner ON public.contacts;
CREATE TRIGGER contacts_qc_stamp_owner
  BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.qc_stamp_owner_lab();

DROP TRIGGER IF EXISTS company_titulares_qc_stamp_owner ON public.company_titulares;
CREATE TRIGGER company_titulares_qc_stamp_owner
  BEFORE INSERT OR UPDATE ON public.company_titulares
  FOR EACH ROW EXECUTE FUNCTION public.qc_stamp_owner_lab();

DROP TRIGGER IF EXISTS company_bank_accounts_qc_stamp_owner ON public.company_bank_accounts;
CREATE TRIGGER company_bank_accounts_qc_stamp_owner
  BEFORE INSERT OR UPDATE ON public.company_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.qc_stamp_owner_lab();

DROP TRIGGER IF EXISTS companies_qc_stamp_creator ON public.companies;
CREATE TRIGGER companies_qc_stamp_creator
  BEFORE INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.qc_stamp_company_creator();

DROP TRIGGER IF EXISTS companies_qc_link_scope_lab ON public.companies;
CREATE TRIGGER companies_qc_link_scope_lab
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.qc_link_company_to_scope_lab();

DROP TRIGGER IF EXISTS samples_qc_link_companies ON public.samples;
CREATE TRIGGER samples_qc_link_companies
  AFTER INSERT OR UPDATE OF laboratory_id, client_id, seller_id, exporter_id, importer_id, roaster_id, end_client_id
  ON public.samples
  FOR EACH ROW EXECUTE FUNCTION public.qc_link_sample_companies();

-- ── Policies ───────────────────────────────────────────────────────────────
-- The scope is read once per statement ((SELECT ...) is an init plan), not per row.

-- company_labs: a confined user reads its own lab's links; everyone else all.
-- No INSERT/UPDATE/DELETE policy and no such grant: writes come from the
-- SECURITY DEFINER triggers above and the service role.
DROP POLICY IF EXISTS company_labs_select ON public.company_labs;
CREATE POLICY company_labs_select ON public.company_labs
  FOR SELECT TO authenticated
  USING ((SELECT public.qc_read_scope_lab()) IS NULL
         OR laboratory_id = (SELECT public.qc_read_scope_lab()));

-- sys 0919's deny for the plan-space kinds ('field', 'nespresso'), as on every new table.
DROP POLICY IF EXISTS company_labs_plan_space_deny ON public.company_labs;
CREATE POLICY company_labs_plan_space_deny ON public.company_labs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.current_user_is_plan_space()))
  WITH CHECK (NOT (SELECT public.current_user_is_plan_space()));

-- companies: read when linked to the lab (or created by the caller); edit only
-- when the lab created it. Inserts and deletes stay as today.
DROP POLICY IF EXISTS companies_lab_scope_select ON public.companies;
CREATE POLICY companies_lab_scope_select ON public.companies
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.qc_read_scope_lab()) IS NULL
         OR created_by = (SELECT auth.uid())
         OR EXISTS (SELECT 1 FROM public.company_labs cl
                    WHERE cl.company_id = companies.id
                      AND cl.laboratory_id = (SELECT public.qc_read_scope_lab())));

DROP POLICY IF EXISTS companies_lab_scope_update ON public.companies;
CREATE POLICY companies_lab_scope_update ON public.companies
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.qc_read_scope_lab()) IS NULL
         OR EXISTS (SELECT 1 FROM public.company_labs cl
                    WHERE cl.company_id = companies.id
                      AND cl.laboratory_id = (SELECT public.qc_read_scope_lab())
                      AND cl.created_company))
  WITH CHECK ((SELECT public.qc_read_scope_lab()) IS NULL
              OR EXISTS (SELECT 1 FROM public.company_labs cl
                         WHERE cl.company_id = companies.id
                           AND cl.laboratory_id = (SELECT public.qc_read_scope_lab())
                           AND cl.created_company));

-- contacts, holders, bank accounts: a confined user only touches its own lab's
-- rows. The BEFORE INSERT trigger stamps owner_lab_id before WITH CHECK runs.
DROP POLICY IF EXISTS contacts_lab_scope ON public.contacts;
CREATE POLICY contacts_lab_scope ON public.contacts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.qc_read_scope_lab()) IS NULL
         OR owner_lab_id = (SELECT public.qc_read_scope_lab()))
  WITH CHECK ((SELECT public.qc_read_scope_lab()) IS NULL
              OR owner_lab_id = (SELECT public.qc_read_scope_lab()));

DROP POLICY IF EXISTS company_titulares_lab_scope ON public.company_titulares;
CREATE POLICY company_titulares_lab_scope ON public.company_titulares
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.qc_read_scope_lab()) IS NULL
         OR owner_lab_id = (SELECT public.qc_read_scope_lab()))
  WITH CHECK ((SELECT public.qc_read_scope_lab()) IS NULL
              OR owner_lab_id = (SELECT public.qc_read_scope_lab()));

DROP POLICY IF EXISTS company_bank_accounts_lab_scope ON public.company_bank_accounts;
CREATE POLICY company_bank_accounts_lab_scope ON public.company_bank_accounts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.qc_read_scope_lab()) IS NULL
         OR owner_lab_id = (SELECT public.qc_read_scope_lab()))
  WITH CHECK ((SELECT public.qc_read_scope_lab()) IS NULL
              OR owner_lab_id = (SELECT public.qc_read_scope_lab()));

-- QC staff may read, add and edit holders and bank accounts (decision 1). FOR
-- ALL is safe: authenticated holds no DELETE grant on either table. These are
-- PERMISSIVE: the sys deny policies and the lab scope above still apply.
DROP POLICY IF EXISTS company_titulares_qc_staff ON public.company_titulares;
CREATE POLICY company_titulares_qc_staff ON public.company_titulares
  FOR ALL TO authenticated
  USING ((SELECT public.waqc_is_staff()))
  WITH CHECK ((SELECT public.waqc_is_staff()));

DROP POLICY IF EXISTS company_bank_accounts_qc_staff ON public.company_bank_accounts;
CREATE POLICY company_bank_accounts_qc_staff ON public.company_bank_accounts
  FOR ALL TO authenticated
  USING ((SELECT public.waqc_is_staff()))
  WITH CHECK ((SELECT public.waqc_is_staff()));

-- ── Grants ─────────────────────────────────────────────────────────────────
REVOKE ALL ON public.company_labs FROM anon, authenticated;
GRANT SELECT ON public.company_labs TO authenticated;
GRANT ALL ON public.company_labs TO service_role;

-- ── Checks: abort the whole migration if any of this did not hold ──────────
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_policy pol
  WHERE pol.polname LIKE '%\_lab\_scope%'
    AND NOT pol.polpermissive
    AND pol.polrelid IN ('public.companies'::regclass, 'public.contacts'::regclass,
                         'public.company_titulares'::regclass, 'public.company_bank_accounts'::regclass);
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'expected 5 restrictive company-register lab-scope policies, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name = 'owner_lab_id'
    AND table_name IN ('contacts', 'company_titulares', 'company_bank_accounts');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'expected owner_lab_id on 3 tables, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname IN ('companies_qc_stamp_creator', 'companies_qc_link_scope_lab', 'samples_qc_link_companies',
                   'contacts_qc_stamp_owner', 'company_titulares_qc_stamp_owner', 'company_bank_accounts_qc_stamp_owner');
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'expected 6 company-register triggers, found %', v_count;
  END IF;

  -- Exactly one HQ, or "HQ sees all" means nothing / too much.
  SELECT count(*) INTO v_count FROM public.laboratories WHERE lower(type::text) = 'hq';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one laboratory of type hq, found %', v_count;
  END IF;

  RAISE NOTICE 'Company register lab scope is on: company_labs, owner_lab_id x3, 6 triggers, 5 restrictive + 2 QC staff policies.';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Post-apply check (read-only):
-- SELECT
--  (SELECT count(*) FROM pg_policy WHERE polname LIKE '%lab_scope%' AND polrelid IN
--     ('public.companies'::regclass,'public.contacts'::regclass,'public.company_titulares'::regclass,'public.company_bank_accounts'::regclass)) AS lab_policies,      -- 5
--  (SELECT count(*) FROM information_schema.columns WHERE column_name='owner_lab_id' AND table_name IN ('contacts','company_titulares','company_bank_accounts')) AS owner_cols, -- 3
--  (SELECT count(*) FROM pg_trigger WHERE tgname IN ('companies_qc_link_scope_lab','samples_qc_link_companies','contacts_qc_stamp_owner','company_titulares_qc_stamp_owner','company_bank_accounts_qc_stamp_owner')) AS triggers; -- 5
