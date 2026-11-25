-- 20261124000001_qc_settings_per_lab.sql
--
-- QC settings and quality specs belong to a laboratory.
--
-- Until now qc_client_settings (certificate and tracking number patterns,
-- layout, logo, pricing, recipients) and client_qualities (a client's quality
-- specs) were keyed by company alone: one row for a client, shared by every
-- laboratory. Daniel's rule (spec 2026-11-24, decision 8): each laboratory has
-- its own. A laboratory that links to a client starts with no settings and no
-- specs for it and builds its own; it never reads or edits another
-- laboratory's.
--
--   qc_client_settings  + laboratory_id (NOT NULL). The key becomes
--                       (company_id, laboratory_id): a client can have one
--                       settings row per laboratory. The foreign key
--                       qc_client_settings_company_id_fkey is kept by name
--                       (the API embeds name it).
--   client_qualities    + laboratory_id (NOT NULL). The two "one per client"
--                       unique indexes become "one per client and laboratory":
--                       a second laboratory may use the same template and the
--                       same quality code for the same client.
--   new rows            laboratory_id defaults to qc_default_settings_lab():
--                       the caller's own laboratory, else the HQ laboratory
--                       (service role, sys, a user without one). The screens
--                       will pass the laboratory explicitly; the default keeps
--                       today's insert paths right until then.
--   lab scope           RESTRICTIVE policies, the same shape as the sample
--                       ones (20261119000002_lab_scope.sql): a confined user
--                       (qc_read_scope_lab()) reads only its own laboratory's
--                       rows; everyone writes only in their own laboratory
--                       (qc_write_scope_lab()), a global admin anywhere. HQ
--                       reads every laboratory's rows and writes only HQ's.
--   numbering, fees     every function and view that looked a client's
--                       settings up by company alone now also matches the
--                       laboratory: of the sample, or the one passed in.
--                       A laboratory with no settings row for the client gets
--                       the built-in defaults, never another laboratory's row.
--
-- Changed functions and views (each re-created from its live text; only the
-- settings lookup changes):
--   generate_certificate_number   AND laboratory_id = p_laboratory_id
--   generate_tracking_number      AND laboratory_id = the lab passed in (none
--                                 passed: qc_default_settings_lab())
--   mint_origin_certificate_number  gains p_laboratory_id uuid DEFAULT NULL
--                                 (old 3-argument version dropped, the same
--                                 grants re-applied: postgres + service role)
--   mint_certificate_number       passes its p_laboratory_id on to it
--   calculate_client_fee          the laboratory of the sample
--   view qc_billing_feed          joins settings on the sample's laboratory
--   view dashboard_lab_fees_v     the same (a sys dashboard view on this database)
-- Not changed, because they read a spec by its id, or a template's specs (a
-- template already belongs to a laboratory): apply/insert/record_client_quality_version,
-- client_quality_spec_snapshot, certificate_list_filter_options,
-- get_certificate_quality_name, get_client_quality_display_name(_with_code),
-- clone_quality_template, assign_certificate_number (already passes the
-- sample's laboratory to mint_certificate_number).
-- sys merge_companies keeps working: its catch-all finds the new key and drops
-- a loser's settings row only when the survivor has one for the same laboratory.
--
-- Nothing changes for anybody today: on 2026-11-25 every settings row (38) and
-- every spec (88) is the HQ laboratory's, every sample is HQ's, and no other
-- laboratory has staff. All existing rows are backfilled to the HQ laboratory,
-- found by laboratories.type, never by name or code. The backfill does not
-- touch updated_at (the updated_at triggers are paused for it).
--
-- One thing to know: from COMMIT until the Part 2 code is live, the screens
-- that save a client's settings with an upsert on company_id alone (client
-- edit, origin pricing, "make an existing company a QC client") get an error,
-- because that key no longer exists. Reading is unaffected. Push the Part 2
-- clients code right after applying.
--
-- Locks: qc_client_settings and client_qualities together, then laboratories
-- (the new foreign keys), in that order. Saving a sample waits a moment for
-- client_qualities (samples.quality_spec_id points at it). lock_timeout is 3s:
-- if any of them is busy the whole transaction rolls back and nothing has
-- changed; simply run it again.
--
-- The policies are RESTRICTIVE: they can only narrow, and a sys policy reset
-- (which drops PERMISSIVE policies only) leaves them in place. The existing
-- policies are neither dropped nor altered.
--
-- Safe to run twice.

BEGIN;

-- Adding a column or a policy locks its table for a moment: fail fast rather than queue.
SET LOCAL lock_timeout = '3s';

-- All up front, in one order, rather than one by one as each statement needs it.
LOCK TABLE public.qc_client_settings, public.client_qualities IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.laboratories IN SHARE ROW EXCLUSIVE MODE;

-- ── Preconditions ──────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INT;
BEGIN
  -- Exactly one HQ, or "backfill to HQ" means nothing / too much.
  SELECT count(*) INTO v_count FROM public.laboratories WHERE lower(COALESCE(type::text, '')) = 'hq';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one laboratory of type hq, found %', v_count;
  END IF;

  -- The lab scope of Part 1 must be there.
  IF to_regprocedure('public.qc_read_scope_lab()') IS NULL
     OR to_regprocedure('public.qc_write_scope_lab()') IS NULL THEN
    RAISE EXCEPTION 'apply 20261119000002_lab_scope.sql first: qc_read_scope_lab / qc_write_scope_lab are missing';
  END IF;

  -- The primary key is swapped below: nothing may hang a foreign key on it.
  SELECT count(*) INTO v_count FROM pg_constraint
  WHERE contype = 'f' AND confrelid = 'public.qc_client_settings'::regclass;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'a foreign key references qc_client_settings (% found): its primary key cannot be swapped', v_count;
  END IF;

  -- Row counts of the two billing views before the change; checked again at the end.
  PERFORM set_config('qc_settings_lab.billing_feed_before',
                     (SELECT count(*) FROM public.qc_billing_feed)::text, true);
  PERFORM set_config('qc_settings_lab.lab_fees_before',
                     (SELECT count(*) FROM public.dashboard_lab_fees_v)::text, true);
END $$;

-- ── The laboratory of a new row when none is given ─────────────────────────
-- The caller's own laboratory; else (service role, sys, a user without a
-- laboratory) the HQ laboratory. SECURITY DEFINER so it can read profiles
-- whatever role inserts.
CREATE OR REPLACE FUNCTION public.qc_default_settings_lab()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT p.laboratory_id FROM profiles p WHERE p.id = auth.uid()),
    (SELECT l.id FROM laboratories l
      WHERE lower(COALESCE(l.type::text, '')) = 'hq'
      ORDER BY l.created_at NULLS LAST, l.id
      LIMIT 1)
  )
$function$;

REVOKE ALL ON FUNCTION public.qc_default_settings_lab() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qc_default_settings_lab() FROM anon;
GRANT EXECUTE ON FUNCTION public.qc_default_settings_lab() TO authenticated, service_role;

-- ── laboratory_id on both tables ───────────────────────────────────────────
ALTER TABLE public.qc_client_settings
  ADD COLUMN IF NOT EXISTS laboratory_id uuid REFERENCES public.laboratories(id);
ALTER TABLE public.client_qualities
  ADD COLUMN IF NOT EXISTS laboratory_id uuid REFERENCES public.laboratories(id);

COMMENT ON COLUMN public.qc_client_settings.laboratory_id IS
  'The laboratory these settings belong to. One row per (company, laboratory); a laboratory never reads another''s.';
COMMENT ON COLUMN public.client_qualities.laboratory_id IS
  'The laboratory this quality spec belongs to. A laboratory never reads another''s.';

-- Every existing row is the HQ laboratory's. updated_at stays as it was.
ALTER TABLE public.qc_client_settings DISABLE TRIGGER trg_qc_client_settings_updated_at;
UPDATE public.qc_client_settings
SET laboratory_id = (SELECT l.id FROM public.laboratories l
                      WHERE lower(COALESCE(l.type::text, '')) = 'hq')
WHERE laboratory_id IS NULL;
ALTER TABLE public.qc_client_settings ENABLE TRIGGER trg_qc_client_settings_updated_at;

ALTER TABLE public.client_qualities DISABLE TRIGGER update_client_qualities_updated_at;
UPDATE public.client_qualities
SET laboratory_id = (SELECT l.id FROM public.laboratories l
                      WHERE lower(COALESCE(l.type::text, '')) = 'hq')
WHERE laboratory_id IS NULL;
ALTER TABLE public.client_qualities ENABLE TRIGGER update_client_qualities_updated_at;

ALTER TABLE public.qc_client_settings
  ALTER COLUMN laboratory_id SET DEFAULT public.qc_default_settings_lab(),
  ALTER COLUMN laboratory_id SET NOT NULL;
ALTER TABLE public.client_qualities
  ALTER COLUMN laboratory_id SET DEFAULT public.qc_default_settings_lab(),
  ALTER COLUMN laboratory_id SET NOT NULL;

-- ── Keys and indexes ───────────────────────────────────────────────────────
-- One settings row per client and laboratory (was: per client).
ALTER TABLE public.qc_client_settings DROP CONSTRAINT IF EXISTS qc_client_settings_pkey;
ALTER TABLE public.qc_client_settings
  ADD CONSTRAINT qc_client_settings_pkey PRIMARY KEY (company_id, laboratory_id);

-- One active spec per client, laboratory and template; one active quality code
-- per client and laboratory. Same names and predicates as before, plus the lab.
DROP INDEX IF EXISTS public.idx_client_qualities_unique_template_per_client;
CREATE UNIQUE INDEX idx_client_qualities_unique_template_per_client
  ON public.client_qualities (client_id, laboratory_id, template_id)
  WHERE (is_active = true);

DROP INDEX IF EXISTS public.idx_client_qualities_unique_code_per_client;
CREATE UNIQUE INDEX idx_client_qualities_unique_code_per_client
  ON public.client_qualities (client_id, laboratory_id, quality_code)
  WHERE ((quality_code IS NOT NULL) AND (quality_code <> ''::text) AND (is_active = true));

CREATE INDEX IF NOT EXISTS idx_client_qualities_client_lab
  ON public.client_qualities (client_id, laboratory_id);

-- ── Policies ───────────────────────────────────────────────────────────────
-- The scope is read once per statement ((SELECT ...) is an init plan), not per row.

DROP POLICY IF EXISTS qc_client_settings_lab_scope_select ON public.qc_client_settings;
CREATE POLICY qc_client_settings_lab_scope_select ON public.qc_client_settings
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.qc_read_scope_lab()) IS NULL
         OR laboratory_id = (SELECT public.qc_read_scope_lab()));

DROP POLICY IF EXISTS qc_client_settings_lab_scope_insert ON public.qc_client_settings;
CREATE POLICY qc_client_settings_lab_scope_insert ON public.qc_client_settings
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.qc_write_scope_lab()) IS NULL
              OR laboratory_id = (SELECT public.qc_write_scope_lab()));

DROP POLICY IF EXISTS qc_client_settings_lab_scope_update ON public.qc_client_settings;
CREATE POLICY qc_client_settings_lab_scope_update ON public.qc_client_settings
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.qc_write_scope_lab()) IS NULL
         OR laboratory_id = (SELECT public.qc_write_scope_lab()))
  WITH CHECK ((SELECT public.qc_write_scope_lab()) IS NULL
              OR laboratory_id = (SELECT public.qc_write_scope_lab()));

DROP POLICY IF EXISTS qc_client_settings_lab_scope_delete ON public.qc_client_settings;
CREATE POLICY qc_client_settings_lab_scope_delete ON public.qc_client_settings
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.qc_write_scope_lab()) IS NULL
         OR laboratory_id = (SELECT public.qc_write_scope_lab()));

DROP POLICY IF EXISTS client_qualities_lab_scope_select ON public.client_qualities;
CREATE POLICY client_qualities_lab_scope_select ON public.client_qualities
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.qc_read_scope_lab()) IS NULL
         OR laboratory_id = (SELECT public.qc_read_scope_lab()));

DROP POLICY IF EXISTS client_qualities_lab_scope_insert ON public.client_qualities;
CREATE POLICY client_qualities_lab_scope_insert ON public.client_qualities
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.qc_write_scope_lab()) IS NULL
              OR laboratory_id = (SELECT public.qc_write_scope_lab()));

DROP POLICY IF EXISTS client_qualities_lab_scope_update ON public.client_qualities;
CREATE POLICY client_qualities_lab_scope_update ON public.client_qualities
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.qc_write_scope_lab()) IS NULL
         OR laboratory_id = (SELECT public.qc_write_scope_lab()))
  WITH CHECK ((SELECT public.qc_write_scope_lab()) IS NULL
              OR laboratory_id = (SELECT public.qc_write_scope_lab()));

DROP POLICY IF EXISTS client_qualities_lab_scope_delete ON public.client_qualities;
CREATE POLICY client_qualities_lab_scope_delete ON public.client_qualities
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.qc_write_scope_lab()) IS NULL
         OR laboratory_id = (SELECT public.qc_write_scope_lab()));

-- ── Functions ──────────────────────────────────────────────────────────────

-- Live text of 2026-11-25; only the settings lookup gains the laboratory.
CREATE OR REPLACE FUNCTION public.generate_certificate_number(p_client_id uuid, p_origin text DEFAULT NULL::text, p_quality_spec_id uuid DEFAULT NULL::uuid, p_is_rejected boolean DEFAULT false, p_laboratory_id uuid DEFAULT NULL::uuid, p_sequence integer DEFAULT NULL::integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_pattern JSONB;
    v_has_quality BOOLEAN;
    v_quality_position TEXT;
    v_has_origin BOOLEAN;
    v_origin_position TEXT;
    v_padding INT;
    v_starting_seq INT;
    v_lab_specific_start INT;
    v_year_format TEXT;
    v_separator TEXT;
    v_rejected_prefix TEXT;
    v_sequence INT;
    v_year_int INT;
    v_year TEXT;
    v_quality_code TEXT;
    v_origin_code TEXT;
    v_result TEXT := '';
    v_prefix TEXT := '';
    v_suffix TEXT := '';
BEGIN
    IF p_laboratory_id IS NULL THEN
        RAISE EXCEPTION 'generate_certificate_number now requires p_laboratory_id (per-lab sequences). Pass the sample''s laboratory_id.';
    END IF;

    -- The laboratory's own settings for this client; none = the defaults below.
    SELECT certificate_pattern INTO v_pattern
    FROM qc_client_settings
    WHERE company_id = p_client_id
      AND laboratory_id = p_laboratory_id;

    IF v_pattern IS NULL THEN
        v_pattern := jsonb_build_object(
            'has_quality_code', false,
            'quality_position', 'prefix',
            'has_origin_code', false,
            'origin_position', 'prefix',
            'sequence_padding', 6,
            'starting_sequence', 1,
            'year_format', 'YY',
            'separator', '-',
            'rejected_prefix', 'R-'
        );
    END IF;

    v_has_quality := COALESCE((v_pattern->>'has_quality_code')::boolean, false);
    v_quality_position := COALESCE(v_pattern->>'quality_position', 'prefix');
    v_has_origin := COALESCE((v_pattern->>'has_origin_code')::boolean, false);
    v_origin_position := COALESCE(v_pattern->>'origin_position', 'prefix');
    v_padding := COALESCE((v_pattern->>'sequence_padding')::int, 6);
    v_starting_seq := COALESCE((v_pattern->>'starting_sequence')::int, 1);
    v_year_format := COALESCE(v_pattern->>'year_format', 'YY');
    v_separator := COALESCE(v_pattern->>'separator', '-');
    v_rejected_prefix := COALESCE(v_pattern->>'rejected_prefix', 'R-');

    SELECT starting_sequence INTO v_lab_specific_start
    FROM client_laboratory_config
    WHERE client_id = p_client_id
      AND laboratory_id = p_laboratory_id;

    IF v_lab_specific_start IS NOT NULL THEN
        v_starting_seq := v_lab_specific_start;
    END IF;

    v_year_int := EXTRACT(YEAR FROM NOW())::INT;

    IF p_sequence IS NOT NULL THEN
        v_sequence := p_sequence;
    ELSE
        -- Atomic per-(client, lab, year) increment.
        INSERT INTO certificate_sequences (client_id, laboratory_id, year, last_sequence)
        VALUES (p_client_id, p_laboratory_id, v_year_int, v_starting_seq)
        ON CONFLICT (client_id, laboratory_id, year)
        DO UPDATE SET last_sequence = certificate_sequences.last_sequence + 1
        RETURNING last_sequence INTO v_sequence;
    END IF;

    IF v_year_format = 'YYYY' THEN
        v_year := TO_CHAR(NOW(), 'YYYY');
    ELSE
        v_year := TO_CHAR(NOW(), 'YY');
    END IF;

    IF v_has_quality AND p_quality_spec_id IS NOT NULL THEN
        SELECT UPPER(COALESCE(quality_code, SUBSTRING(custom_name FROM 1 FOR 2), 'QC'))
        INTO v_quality_code
        FROM client_qualities
        WHERE id = p_quality_spec_id
        LIMIT 1;

        v_quality_code := COALESCE(v_quality_code, 'QC');
    END IF;

    IF v_has_origin AND p_origin IS NOT NULL THEN
        SELECT country_code INTO v_origin_code
        FROM country_codes
        WHERE country_name ILIKE p_origin
        LIMIT 1;

        v_origin_code := COALESCE(v_origin_code, UPPER(SUBSTRING(p_origin FROM 1 FOR 2)));
    END IF;

    IF v_has_quality AND v_quality_position = 'prefix' THEN
        v_prefix := v_quality_code;
    ELSIF v_has_origin AND v_origin_position = 'prefix' THEN
        v_prefix := v_origin_code;
    END IF;

    IF v_has_quality AND v_quality_position = 'suffix' THEN
        v_suffix := v_quality_code;
    ELSIF v_has_origin AND v_origin_position = 'suffix' THEN
        v_suffix := v_origin_code;
    END IF;

    IF p_is_rejected THEN
        v_result := v_rejected_prefix;
    END IF;

    IF v_prefix != '' THEN
        v_result := v_result || v_prefix || v_separator;
    END IF;

    v_result := v_result || LPAD(v_sequence::TEXT, v_padding, '0');

    IF v_suffix != '' THEN
        v_result := v_result || v_separator || v_suffix;
    END IF;

    v_result := v_result || '/' || v_year;

    RETURN v_result;
END;
$function$;

-- The origin line's quality-code prefix comes from the laboratory's own
-- pattern. A new argument, so the old 3-argument version is dropped (otherwise
-- a 3-argument call would match both). Its only caller is
-- mint_certificate_number, which looks it up by name at run time.
DROP FUNCTION IF EXISTS public.mint_origin_certificate_number(text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.mint_origin_certificate_number(p_origin text, p_client_id uuid, p_quality_spec_id uuid, p_laboratory_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_line    origin_certificate_sequences%ROWTYPE;
  v_year    INT := EXTRACT(YEAR FROM NOW())::INT;
  v_yy      TEXT := TO_CHAR(NOW(), 'YY');
  v_pattern JSONB;
  v_prefix  TEXT := '';
  v_quality TEXT;
  v_seq     INT;
  v_tries   INT := 0;
BEGIN
  IF p_origin IS NULL OR btrim(p_origin) = '' THEN
    RETURN NULL;
  END IF;

  -- Every mint of this origin queues here.
  PERFORM 1 FROM origin_certificate_sequences o
  WHERE lower(btrim(o.origin)) = lower(btrim(p_origin)) AND o.is_active
  FOR UPDATE;
  v_line := (SELECT o FROM origin_certificate_sequences o
             WHERE lower(btrim(o.origin)) = lower(btrim(p_origin)) AND o.is_active);
  IF v_line.origin IS NULL THEN
    RETURN NULL;
  END IF;

  -- A new year: a line that restarts each January goes back to 1.
  IF v_line.counter_year <> v_year THEN
    IF v_line.resets_yearly THEN
      v_line.next_number := 1;
    END IF;
    v_line.counter_year := v_year;
    UPDATE origin_certificate_sequences
    SET next_number = v_line.next_number, counter_year = v_year, updated_at = now()
    WHERE origin = v_line.origin;
  END IF;

  -- The client's quality code in front, when the client's own pattern in this
  -- laboratory puts one there. No laboratory given = no pattern: never another
  -- laboratory's.
  IF p_client_id IS NOT NULL AND p_laboratory_id IS NOT NULL THEN
    v_pattern := (SELECT certificate_pattern FROM qc_client_settings
                  WHERE company_id = p_client_id AND laboratory_id = p_laboratory_id);
  END IF;
  IF p_quality_spec_id IS NOT NULL
     AND COALESCE((v_pattern->>'has_quality_code')::boolean, false)
     AND COALESCE(v_pattern->>'quality_position', 'prefix') = 'prefix'
  THEN
    v_quality := (SELECT UPPER(COALESCE(quality_code, SUBSTRING(custom_name FROM 1 FOR 2)))
                  FROM client_qualities WHERE id = p_quality_spec_id LIMIT 1);
    IF v_quality IS NOT NULL AND btrim(v_quality) <> '' THEN
      v_prefix := v_quality || COALESCE(v_pattern->>'separator', '-');
    END IF;
  END IF;

  LOOP
    -- A released number of this year first, lowest first.
    v_seq := (SELECT min(sequence) FROM origin_certificate_number_pool
              WHERE origin = v_line.origin AND year = v_year AND sequence < v_line.next_number);
    IF v_seq IS NOT NULL THEN
      DELETE FROM origin_certificate_number_pool
      WHERE origin = v_line.origin AND year = v_year AND sequence = v_seq;
    ELSE
      v_seq := v_line.next_number;
      v_line.next_number := v_line.next_number + 1;
      UPDATE origin_certificate_sequences
      SET next_number = v_line.next_number, updated_at = now()
      WHERE origin = v_line.origin;
    END IF;

    -- The number is shared by every client, so it must be free on EVERY
    -- certificate, whatever sits in front of it. (This is also what makes it
    -- safe to set next_number by hand: a number already used is stepped over.)
    IF NOT EXISTS (
      SELECT 1 FROM certificates c
      WHERE c.certificate_number ~ ('(^|[^0-9])0*' || v_seq::text || '-' || v_line.code || '/' || v_yy || '$')
    ) THEN
      RETURN v_prefix
        || CASE WHEN length(v_seq::text) >= v_line.padding THEN v_seq::text
                ELSE lpad(v_seq::text, v_line.padding, '0') END
        || '-' || v_line.code || '/' || v_yy;
    END IF;

    v_tries := v_tries + 1;
    IF v_tries > 100000 THEN
      RAISE EXCEPTION 'no free certificate number found for origin %', v_line.origin;
    END IF;
  END LOOP;
END;
$function$;

-- Same callers as before (20261119000006): the numbering only.
REVOKE ALL ON FUNCTION public.mint_origin_certificate_number(text, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mint_origin_certificate_number(text, uuid, uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_origin_certificate_number(text, uuid, uuid, uuid) TO service_role;

-- Live text of 2026-11-25; only the origin call passes the laboratory on.
CREATE OR REPLACE FUNCTION public.mint_certificate_number(p_client_id uuid, p_origin text, p_quality_spec_id uuid, p_laboratory_id uuid, p_cert_client_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year   INT := EXTRACT(YEAR FROM NOW())::INT;
  v_last   INT;
  v_seq    INT;
  v_number TEXT;
BEGIN
  -- An origin with its own line numbers its certificates there, for every
  -- client and laboratory. NULL = this origin has none: the client line below.
  v_number := mint_origin_certificate_number(p_origin, p_client_id, p_quality_spec_id, p_laboratory_id);
  IF v_number IS NOT NULL THEN
    RETURN v_number;
  END IF;

  -- Every mint of this line queues on its counter row (generate_certificate_number
  -- locks the same row), so two certifications never take the same number.
  PERFORM 1 FROM certificate_sequences
  WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id AND year = v_year
  FOR UPDATE;
  v_last := (SELECT last_sequence FROM certificate_sequences
             WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id AND year = v_year);

  LOOP
    v_seq := (SELECT min(sequence) FROM certificate_number_pool
              WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id
                AND year = v_year AND sequence <= v_last);
    EXIT WHEN v_seq IS NULL;

    DELETE FROM certificate_number_pool
    WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id
      AND year = v_year AND sequence = v_seq;

    -- generate_certificate_number formats the line's next number: point the
    -- counter just below the released one, let it take it, then put it back.
    UPDATE certificate_sequences SET last_sequence = v_seq - 1
    WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id AND year = v_year;
    v_number := generate_certificate_number(p_client_id, p_origin, p_quality_spec_id, false, p_laboratory_id);
    UPDATE certificate_sequences SET last_sequence = v_last
    WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id AND year = v_year;

    -- Never hand out a number this client already holds (its pattern changed
    -- since the number was released, or a rejected copy carries it).
    IF NOT EXISTS (SELECT 1 FROM certificates
                   WHERE client_id = p_cert_client_id
                     AND certificate_number IN (v_number, 'R-' || v_number)) THEN
      RETURN v_number;
    END IF;
  END LOOP;

  RETURN generate_certificate_number(p_client_id, p_origin, p_quality_spec_id, false, p_laboratory_id);
END;
$function$;

-- Live text of 2026-11-25; only the format lookup gains the laboratory.
CREATE OR REPLACE FUNCTION public.generate_tracking_number(p_client_id uuid, p_laboratory_id uuid DEFAULT NULL::uuid, p_origin text DEFAULT NULL::text, p_quality_template_id uuid DEFAULT NULL::uuid, p_is_rejected boolean DEFAULT false, p_sample_type text DEFAULT 'pss'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_format JSONB;
    v_pattern TEXT;
    v_type TEXT;
    v_separator TEXT;
    v_sequence INT;
    v_year TEXT;
    v_country_code TEXT;
    v_quality_code TEXT;
    v_tracking_number TEXT;
    v_rejected_suffix TEXT;
    v_lab_prefix TEXT;
    v_starting_sequence INT;
    v_sequence_padding INT;
    v_lab_specific_start INT;
    v_has_origin_code BOOLEAN;
    v_has_quality_code BOOLEAN;
    v_origin_position TEXT;
    v_quality_position TEXT;
BEGIN
    -- Get client's tracking number format (handle null client_id), from the
    -- laboratory's own settings (no laboratory passed: the caller's default).
    IF p_client_id IS NOT NULL THEN
        SELECT tracking_number_format INTO v_format
        FROM qc_client_settings
        WHERE company_id = p_client_id
          AND laboratory_id = COALESCE(p_laboratory_id, public.qc_default_settings_lab());
    END IF;

    -- Handle NULL or missing format - use simple default
    IF v_format IS NULL THEN
        v_format := '{"type": "standard", "pattern": "[5N]/[YY]", "separator": "-", "starting_sequence": 1, "sequence_padding": 5}'::jsonb;
        RAISE NOTICE 'Client % has NULL tracking_number_format, using default pattern', p_client_id;
    END IF;

    -- Extract format components
    v_type := v_format->>'type';
    v_pattern := v_format->>'pattern';
    v_separator := COALESCE(v_format->>'separator', '-');
    v_rejected_suffix := COALESCE(v_format->>'rejected_suffix', '-R');
    v_starting_sequence := COALESCE((v_format->>'starting_sequence')::int, 1);
    v_sequence_padding := COALESCE((v_format->>'sequence_padding')::int, 5);

    -- CRITICAL: Handle old-format configs that have has_origin_code/has_quality_code
    -- but no type/pattern fields. Always use /[YY] for year separator.
    IF v_pattern IS NULL OR v_pattern = '' THEN
        v_has_origin_code := COALESCE((v_format->>'has_origin_code')::boolean, false);
        v_has_quality_code := COALESCE((v_format->>'has_quality_code')::boolean, false);
        v_origin_position := COALESCE(v_format->>'origin_position', 'prefix');
        v_quality_position := COALESCE(v_format->>'quality_position', 'prefix');

        IF v_has_origin_code AND v_has_quality_code THEN
            IF v_origin_position = 'prefix' AND v_quality_position = 'suffix' THEN
                v_pattern := '[C]' || v_separator || '[' || v_sequence_padding || 'N]' || v_separator || '[QC]/[YY]';
                v_type := 'country_based';
            ELSIF v_quality_position = 'prefix' AND v_origin_position = 'suffix' THEN
                v_pattern := '[QC]' || v_separator || '[' || v_sequence_padding || 'N]' || v_separator || '[C]/[YY]';
                v_type := 'quality_based';
            ELSE
                v_pattern := '[C]' || v_separator || '[QC]' || v_separator || '[' || v_sequence_padding || 'N]/[YY]';
                v_type := 'country_based';
            END IF;
        ELSIF v_has_origin_code THEN
            v_type := 'country_based';
            v_pattern := '[C]' || v_separator || '[' || v_sequence_padding || 'N]/[YY]';
        ELSIF v_has_quality_code THEN
            v_type := 'quality_based';
            v_pattern := '[QC]' || v_separator || '[' || v_sequence_padding || 'N]/[YY]';
        ELSE
            v_type := 'standard';
            v_pattern := '[' || v_sequence_padding || 'N]/[YY]';
        END IF;

        RAISE NOTICE 'Client % has old-format config, generated pattern: % (type: %)', p_client_id, v_pattern, v_type;
    END IF;

    -- Final fallback if pattern is still null
    IF v_pattern IS NULL THEN
        v_type := 'standard';
        v_pattern := '[5N]/[YY]';
        RAISE WARNING 'Pattern still NULL for client %, using ultimate fallback: %', p_client_id, v_pattern;
    END IF;

    -- Check for lab-specific starting sequence
    IF p_laboratory_id IS NOT NULL THEN
        SELECT starting_sequence INTO v_lab_specific_start
        FROM client_laboratory_config
        WHERE client_id = p_client_id
          AND laboratory_id = p_laboratory_id;

        IF v_lab_specific_start IS NOT NULL THEN
            v_starting_sequence := v_lab_specific_start;
        END IF;
    END IF;

    -- For type samples, get lab prefix
    IF p_sample_type = 'type' AND p_laboratory_id IS NOT NULL THEN
        SELECT type_sample_prefix INTO v_lab_prefix
        FROM laboratories
        WHERE id = p_laboratory_id;
    END IF;

    -- Get next sequence number (continuous across years, per client + per lab)
    -- Sequence is shared across ALL quality prefixes for the same client + lab.
    -- Uses '(\d+)/' regex to extract the sequence number (digits before the slash).
    -- This correctly handles prefixes with digits (e.g., "AD1-890239/26" -> 890239).
    -- Also checks sample_contracts to avoid gaps/duplicates with sub-contract numbers.
    -- NOTE: Because this function is SECURITY DEFINER, it sees ALL rows including
    -- soft-deleted samples, preventing duplicate tracking number collisions.
    SELECT COALESCE(MAX(seq_num), v_starting_sequence - 1) + 1
    INTO v_sequence
    FROM (
        SELECT CAST(SUBSTRING(tracking_number FROM '(\d+)/') AS INTEGER) AS seq_num
        FROM samples
        WHERE client_id = p_client_id
          AND (p_laboratory_id IS NULL OR laboratory_id = p_laboratory_id)
          AND tracking_number IS NOT NULL
          AND tracking_number != 'null'
          AND tracking_number ~ '\d+/'
        UNION ALL
        SELECT CAST(SUBSTRING(sc.tracking_number FROM '(\d+)/') AS INTEGER) AS seq_num
        FROM sample_contracts sc
        JOIN samples s ON sc.sample_id = s.id
        WHERE s.client_id = p_client_id
          AND (p_laboratory_id IS NULL OR s.laboratory_id = p_laboratory_id)
          AND sc.tracking_number IS NOT NULL
          AND sc.tracking_number != 'null'
          AND sc.tracking_number ~ '\d+/'
    ) combined
    WHERE seq_num IS NOT NULL;

    IF v_sequence IS NULL THEN
        v_sequence := v_starting_sequence;
    END IF;

    -- Get 2-digit year
    v_year := TO_CHAR(NOW(), 'YY');

    -- Build tracking number based on type
    IF v_type = 'country_based' THEN
        SELECT country_code INTO v_country_code
        FROM country_codes
        WHERE country_name ILIKE p_origin
        LIMIT 1;

        IF v_country_code IS NULL THEN
            v_country_code := UPPER(SUBSTRING(COALESCE(p_origin, 'XX') FROM 1 FOR 2));
        END IF;

        IF v_pattern LIKE '%[QC]%' THEN
            SELECT UPPER(quality_code) INTO v_quality_code
            FROM client_qualities
            WHERE id = p_quality_template_id;
            v_quality_code := COALESCE(v_quality_code, 'QC');
        END IF;

        v_tracking_number := REPLACE(v_pattern, '[C]', v_country_code);
        v_tracking_number := REPLACE(v_tracking_number, '[QC]', COALESCE(v_quality_code, 'QC'));
        v_tracking_number := REPLACE(v_tracking_number, '[' || v_sequence_padding || 'N]', LPAD(v_sequence::TEXT, v_sequence_padding, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[6N]', LPAD(v_sequence::TEXT, 6, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);

    ELSIF v_type = 'quality_based' THEN
        SELECT UPPER(quality_code) INTO v_quality_code
        FROM client_qualities
        WHERE id = p_quality_template_id;

        v_quality_code := COALESCE(v_quality_code, 'QC');

        IF v_pattern LIKE '%[C]%' THEN
            SELECT country_code INTO v_country_code
            FROM country_codes
            WHERE country_name ILIKE p_origin
            LIMIT 1;
            IF v_country_code IS NULL THEN
                v_country_code := UPPER(SUBSTRING(COALESCE(p_origin, 'XX') FROM 1 FOR 2));
            END IF;
        END IF;

        v_tracking_number := REPLACE(v_pattern, '[QC]', v_quality_code);
        v_tracking_number := REPLACE(v_tracking_number, '[C]', COALESCE(v_country_code, 'XX'));
        v_tracking_number := REPLACE(v_tracking_number, '[' || v_sequence_padding || 'N]', LPAD(v_sequence::TEXT, v_sequence_padding, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[6N]', LPAD(v_sequence::TEXT, 6, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);

    ELSE
        -- Standard type
        v_tracking_number := REPLACE(v_pattern, '[' || v_sequence_padding || 'N]', LPAD(v_sequence::TEXT, v_sequence_padding, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[6N]', LPAD(v_sequence::TEXT, 6, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);
    END IF;

    -- Prepend lab prefix for type samples
    IF v_lab_prefix IS NOT NULL THEN
        v_tracking_number := v_lab_prefix || v_tracking_number;
    END IF;

    -- Add rejected suffix if applicable
    IF p_is_rejected THEN
        v_tracking_number := v_tracking_number || v_rejected_suffix;
    END IF;

    -- Final safety check
    IF v_tracking_number IS NULL OR v_tracking_number = '' THEN
        v_tracking_number := 'ERR-' || LPAD(v_sequence::TEXT, 6, '0') || '/' || v_year;
        RAISE WARNING 'Tracking number generation failed for client %, using error fallback: %', p_client_id, v_tracking_number;
    END IF;

    RETURN v_tracking_number;
END;
$function$;

-- Live text of 2026-11-25; the settings fallback reads the sample's laboratory.
CREATE OR REPLACE FUNCTION public.calculate_client_fee(client_id_param uuid, sample_id_param uuid)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
    sample_data RECORD;
    pricing_data RECORD;
    total_pounds DECIMAL(12,4);
    fee DECIMAL(10,2);
    cents_per_pound DECIMAL(10,4);
BEGIN
    SELECT origin, bags_quantity_mt, bag_count, bag_weight_kg, sample_type, laboratory_id
    INTO sample_data
    FROM samples
    WHERE id = sample_id_param;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF sample_data.sample_type::text = 'type' THEN
        RETURN 0.00;
    END IF;

    SELECT pricing_model, price_per_sample, price_per_pound_cents
    INTO pricing_data
    FROM client_origin_pricing
    WHERE client_id = client_id_param
      AND origin = sample_data.origin
      AND is_active = true;

    IF NOT FOUND THEN
        SELECT pricing_model, price_per_sample, price_per_pound_cents
        INTO pricing_data
        FROM qc_client_settings
        WHERE company_id = client_id_param
          AND laboratory_id = sample_data.laboratory_id
        LIMIT 1;

        IF NOT FOUND OR pricing_data.pricing_model IS NULL THEN
            RETURN NULL;
        END IF;
    END IF;

    IF pricing_data.pricing_model = 'complimentary' THEN
        RETURN 0.00;

    ELSIF pricing_data.pricing_model = 'per_sample' THEN
        RETURN pricing_data.price_per_sample;

    ELSIF pricing_data.pricing_model = 'per_pound' THEN
        IF pricing_data.price_per_pound_cents IS NULL THEN
            RETURN NULL;
        END IF;

        IF sample_data.bags_quantity_mt IS NOT NULL THEN
            total_pounds := sample_data.bags_quantity_mt * 2204.62;
        ELSIF sample_data.bag_count IS NOT NULL AND sample_data.bag_weight_kg IS NOT NULL THEN
            total_pounds := (sample_data.bag_count * sample_data.bag_weight_kg) * 2.20462;
        ELSE
            RETURN NULL;
        END IF;

        cents_per_pound := GREATEST(pricing_data.price_per_pound_cents, 0.25);
        fee := total_pounds * (cents_per_pound / 100);
        RETURN ROUND(fee, 2);
    END IF;

    RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.calculate_client_fee(uuid, uuid) IS
  'Calculate fee to charge client - checks client_origin_pricing first, then falls back to qc_client_settings of the sample''s laboratory (company_id, laboratory_id).';

-- ── Views ──────────────────────────────────────────────────────────────────
-- Same columns as live; only the settings join gains the laboratory. The WITH
-- clause is repeated because CREATE OR REPLACE VIEW resets a view's options.

CREATE OR REPLACE VIEW public.qc_billing_feed WITH (security_invoker = on) AS
 SELECT s.id AS sample_id,
    s.tracking_number,
    s.origin,
    s.status,
    s.workflow_stage,
    s.client_id,
    prog.name AS billed_program,
    pounds.lbs AS billable_pounds,
    qcs.price_per_pound_cents AS cents_per_pound,
    round(pounds.lbs * (qcs.price_per_pound_cents / 100::numeric), 2) AS fee_amount,
    COALESCE(qcs.currency, 'USD'::character varying) AS currency,
    COALESCE(s.roaster_id, s.importer_id) AS payer_company_id,
        CASE
            WHEN s.roaster_id IS NOT NULL THEN 'roaster'::text
            WHEN s.importer_id IS NOT NULL THEN 'importer'::text
            ELSE 'unattributed'::text
        END AS payer_role,
    payer.name AS payer_name
   FROM samples s
     JOIN qc_client_settings qcs ON qcs.company_id = s.client_id AND qcs.laboratory_id = s.laboratory_id
     JOIN companies prog ON prog.id = s.client_id
     LEFT JOIN companies payer ON payer.id = COALESCE(s.roaster_id, s.importer_id)
     LEFT JOIN LATERAL ( SELECT
                CASE
                    WHEN s.bags_quantity_mt IS NOT NULL THEN s.bags_quantity_mt * 2204.62
                    WHEN s.bag_count IS NOT NULL AND s.bag_weight_kg IS NOT NULL THEN s.bag_count::numeric * s.bag_weight_kg * 2.20462
                    ELSE NULL::numeric
                END AS lbs) pounds ON true
  WHERE s.status = 'approved'::sample_status AND s.sample_type::text IS DISTINCT FROM 'type'::text AND qcs.pricing_model = 'per_pound'::pricing_model AND qcs.price_per_pound_cents IS NOT NULL;

CREATE OR REPLACE VIEW public.dashboard_lab_fees_v WITH (security_invoker = true) AS
 WITH rate AS (
         SELECT q.company_id AS client_id,
            q.laboratory_id,
            q.price_per_pound_cents AS cents_per_lb,
            COALESCE(q.currency, 'USD'::character varying) AS currency
           FROM qc_client_settings q
          WHERE q.pricing_model = 'per_pound'::pricing_model AND q.price_per_pound_cents IS NOT NULL
        ), s AS MATERIALIZED (
         SELECT s.id AS sample_id,
            s.tracking_number,
            s.sample_type::text AS sample_type,
            s.client_id,
            s.exporter_id,
            s.linked_pss_sample_id,
            s.lab_source_sample_id,
            s.buyer_contract_nr,
            s.seller_contract_nr,
            s.equivalent_60kg_bags AS bags_60,
            COALESCE(s.roaster_id, s.importer_id) AS payer_company_id,
                CASE
                    WHEN s.roaster_id IS NOT NULL THEN 'roaster'::text
                    WHEN s.importer_id IS NOT NULL THEN 'importer'::text
                    ELSE 'unattributed'::text
                END AS payer_role,
                CASE
                    WHEN s.bags_quantity_mt IS NOT NULL THEN s.bags_quantity_mt * 2204.62
                    WHEN s.bag_count IS NOT NULL AND s.bag_weight_kg IS NOT NULL THEN s.bag_count::numeric * s.bag_weight_kg * 2.20462
                    ELSE NULL::numeric
                END AS lbs,
            r.cents_per_lb,
            r.currency,
            s.created_at,
            s.lab_source_sample_id IS NOT NULL AND (EXISTS ( SELECT 1
                   FROM samples m
                  WHERE m.id = s.lab_source_sample_id AND NOT m.equivalent_60kg_bags IS DISTINCT FROM s.equivalent_60kg_bags AND NOT m.bags_quantity_mt IS DISTINCT FROM s.bags_quantity_mt AND NOT m.bag_count IS DISTINCT FROM s.bag_count AND NOT m.bag_weight_kg IS DISTINCT FROM s.bag_weight_kg AND NOT m.bag_type IS DISTINCT FROM s.bag_type)) AS sibling_qty_copy
           FROM samples s
             JOIN rate r ON r.client_id = s.client_id AND r.laboratory_id = s.laboratory_id
          WHERE s.deleted_at IS NULL AND s.status = 'approved'::sample_status AND s.sample_type::text IS DISTINCT FROM 'type'::text
        ), cert AS (
         SELECT DISTINCT ON (k.sample_id) k.sample_id,
            k.issued_at
           FROM certificates k
          WHERE k.status = 'issued'::certificate_status AND NOT COALESCE(k.is_rejected, false) AND k.is_latest AND k.issued_at IS NOT NULL
          ORDER BY k.sample_id, k.issued_at DESC
        ), t AS (
         SELECT s.sample_id,
            s.tracking_number,
            s.sample_type,
            s.client_id,
            s.exporter_id,
            s.linked_pss_sample_id,
            s.lab_source_sample_id,
            s.buyer_contract_nr,
            s.seller_contract_nr,
            s.bags_60,
            s.payer_company_id,
            s.payer_role,
            s.lbs,
            s.cents_per_lb,
            s.currency,
            s.created_at,
            s.sibling_qty_copy,
            cert.issued_at,
                CASE
                    WHEN s.sample_type = 'pss'::text THEN 'pss_lot'::text
                    WHEN (EXISTS ( SELECT 1
                       FROM s p
                      WHERE p.sample_id = s.linked_pss_sample_id AND p.sample_type = 'pss'::text)) THEN 'ss_covered_by_pss'::text
                    ELSE 'ss_no_pss_in_waqc'::text
                END AS role,
            s.sample_type = 'ss'::text AND s.linked_pss_sample_id IS NULL AND (EXISTS ( SELECT 1
                   FROM s p
                  WHERE p.sample_type = 'pss'::text AND NOT p.exporter_id IS DISTINCT FROM s.exporter_id AND (NULLIF(btrim(p.buyer_contract_nr), ''::text) IS NOT NULL AND btrim(p.buyer_contract_nr) = btrim(s.buyer_contract_nr) OR NULLIF(btrim(p.seller_contract_nr), ''::text) IS NOT NULL AND btrim(p.seller_contract_nr) = btrim(s.seller_contract_nr)))) AS ref_match_pss
           FROM s
             LEFT JOIN cert ON cert.sample_id = s.sample_id
        ), st AS (
         SELECT t.sample_id,
            t.tracking_number,
            t.sample_type,
            t.client_id,
            t.exporter_id,
            t.linked_pss_sample_id,
            t.lab_source_sample_id,
            t.buyer_contract_nr,
            t.seller_contract_nr,
            t.bags_60,
            t.payer_company_id,
            t.payer_role,
            t.lbs,
            t.cents_per_lb,
            t.currency,
            t.created_at,
            t.sibling_qty_copy,
            t.issued_at,
            t.role,
            t.ref_match_pss,
                CASE
                    WHEN t.role = 'ss_covered_by_pss'::text THEN 'not_billable'::text
                    WHEN t.sibling_qty_copy THEN 'under_review_sibling_copy'::text
                    WHEN t.ref_match_pss THEN 'under_review_ref_match'::text
                    ELSE 'billable'::text
                END AS fee_status,
            (COALESCE(t.issued_at, t.created_at) AT TIME ZONE 'America/Sao_Paulo'::text)::date AS fee_on
           FROM t
        )
 SELECT sample_id,
    tracking_number,
    sample_type,
    role,
    fee_status,
    fee_status = 'billable'::text AS counts_in_headline,
    client_id,
    exporter_id,
    payer_company_id,
    payer_role,
    lbs,
    bags_60,
    cents_per_lb,
    currency,
    round(lbs * cents_per_lb / 100::numeric, 2) AS fee_usd,
    COALESCE(issued_at, created_at) AS fee_at,
    fee_on,
        CASE
            WHEN issued_at IS NULL THEN 'created_fallback'::text
            ELSE 'certificate'::text
        END AS date_basis,
    date_trunc('month'::text, fee_on::timestamp without time zone)::date AS fee_month
   FROM st;

-- ── Checks: abort the whole migration if any of this did not hold ──────────
DO $$
DECLARE
  v_count INT;
  v_hq    uuid := (SELECT l.id FROM public.laboratories l WHERE lower(COALESCE(l.type::text, '')) = 'hq');
  v_def   text;
BEGIN
  -- laboratory_id NOT NULL with the default, on both tables.
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name = 'laboratory_id'
    AND table_name IN ('qc_client_settings', 'client_qualities')
    AND is_nullable = 'NO'
    AND column_default LIKE '%qc_default_settings_lab()%';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'expected laboratory_id NOT NULL with its default on 2 tables, found %', v_count;
  END IF;

  -- Every row is the HQ laboratory's.
  SELECT (SELECT count(*) FROM public.qc_client_settings WHERE laboratory_id IS DISTINCT FROM v_hq)
       + (SELECT count(*) FROM public.client_qualities WHERE laboratory_id IS DISTINCT FROM v_hq)
    INTO v_count;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '% settings / spec rows are not on the HQ laboratory', v_count;
  END IF;

  -- The new primary key, and the company foreign key kept by name.
  v_def := (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
            WHERE c.conrelid = 'public.qc_client_settings'::regclass AND c.contype = 'p');
  IF v_def IS DISTINCT FROM 'PRIMARY KEY (company_id, laboratory_id)' THEN
    RAISE EXCEPTION 'qc_client_settings primary key is %, expected (company_id, laboratory_id)', v_def;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.qc_client_settings'::regclass
                   AND conname = 'qc_client_settings_company_id_fkey' AND contype = 'f') THEN
    RAISE EXCEPTION 'qc_client_settings_company_id_fkey is gone: the API embeds name it';
  END IF;

  -- Both spec unique indexes carry the laboratory.
  SELECT count(*) INTO v_count FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'client_qualities'
    AND indexname IN ('idx_client_qualities_unique_template_per_client', 'idx_client_qualities_unique_code_per_client')
    AND indexdef LIKE 'CREATE UNIQUE INDEX%(client_id, laboratory_id, %';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'expected 2 unique spec indexes keyed by (client_id, laboratory_id, ...), found %', v_count;
  END IF;

  -- Eight restrictive lab-scope policies: four commands on each table.
  SELECT count(*) INTO v_count FROM pg_policy pol
  WHERE NOT pol.polpermissive
    AND pol.polrelid IN ('public.qc_client_settings'::regclass, 'public.client_qualities'::regclass)
    AND pol.polname LIKE '%\_lab\_scope\_%';
  IF v_count <> 8 THEN
    RAISE EXCEPTION 'expected 8 restrictive lab-scope policies on settings and specs, found %', v_count;
  END IF;

  -- Every function that reads qc_client_settings matches the laboratory.
  SELECT count(*) INTO v_count FROM pg_proc p
  WHERE p.oid IN ('public.generate_certificate_number(uuid,text,uuid,boolean,uuid,integer)'::regprocedure,
                  'public.generate_tracking_number(uuid,uuid,text,uuid,boolean,text)'::regprocedure,
                  'public.mint_origin_certificate_number(text,uuid,uuid,uuid)'::regprocedure,
                  'public.calculate_client_fee(uuid,uuid)'::regprocedure)
    AND p.prosrc ~ 'FROM qc_client_settings\s+WHERE company_id = \S+\s+AND laboratory_id = ';
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'expected 4 functions reading settings by (company, laboratory), found %', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM pg_proc p
  WHERE p.prosrc ILIKE '%qc_client_settings%'
    AND p.oid NOT IN ('public.generate_certificate_number(uuid,text,uuid,boolean,uuid,integer)'::regprocedure,
                      'public.generate_tracking_number(uuid,uuid,text,uuid,boolean,text)'::regprocedure,
                      'public.mint_origin_certificate_number(text,uuid,uuid,uuid)'::regprocedure,
                      'public.calculate_client_fee(uuid,uuid)'::regprocedure);
  IF v_count <> 0 THEN
    RAISE EXCEPTION '% other function(s) read qc_client_settings: check they match the laboratory', v_count;
  END IF;

  -- mint_certificate_number passes the laboratory on; the old origin minter is gone.
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                 WHERE oid = 'public.mint_certificate_number(uuid,text,uuid,uuid,uuid)'::regprocedure
                   AND prosrc LIKE '%mint_origin_certificate_number(p_origin, p_client_id, p_quality_spec_id, p_laboratory_id)%') THEN
    RAISE EXCEPTION 'mint_certificate_number does not pass the laboratory to mint_origin_certificate_number';
  END IF;
  IF to_regprocedure('public.mint_origin_certificate_number(text,uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'the 3-argument mint_origin_certificate_number is still there';
  END IF;
  IF has_function_privilege('authenticated', 'public.mint_origin_certificate_number(text,uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.mint_origin_certificate_number(text,uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a signed-in user could take origin certificate numbers';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.qc_default_settings_lab()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot run qc_default_settings_lab(): its inserts would fail';
  END IF;

  -- No caller here (postgres, no login): the default is HQ.
  IF public.qc_default_settings_lab() IS DISTINCT FROM v_hq THEN
    RAISE EXCEPTION 'qc_default_settings_lab() without a login is not the HQ laboratory';
  END IF;

  -- Both views join on the laboratory, kept security_invoker, and still return
  -- the same rows (every sample and settings row is HQ's today).
  SELECT count(*) INTO v_count FROM pg_class c
  WHERE c.oid IN ('public.qc_billing_feed'::regclass, 'public.dashboard_lab_fees_v'::regclass)
    AND (c.reloptions @> ARRAY['security_invoker=on'] OR c.reloptions @> ARRAY['security_invoker=true'])
    AND pg_get_viewdef(c.oid) LIKE '%.laboratory_id = s.laboratory_id%';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'expected 2 billing views joined on the laboratory and security_invoker, found %', v_count;
  END IF;
  IF (SELECT count(*) FROM public.qc_billing_feed)::text <> current_setting('qc_settings_lab.billing_feed_before') THEN
    RAISE EXCEPTION 'qc_billing_feed rows changed: % before, % after',
      current_setting('qc_settings_lab.billing_feed_before'), (SELECT count(*) FROM public.qc_billing_feed);
  END IF;
  IF (SELECT count(*) FROM public.dashboard_lab_fees_v)::text <> current_setting('qc_settings_lab.lab_fees_before') THEN
    RAISE EXCEPTION 'dashboard_lab_fees_v rows changed: % before, % after',
      current_setting('qc_settings_lab.lab_fees_before'), (SELECT count(*) FROM public.dashboard_lab_fees_v);
  END IF;

  RAISE NOTICE 'QC settings per laboratory is on: laboratory_id x2 (all HQ), key (company_id, laboratory_id), 2 spec indexes, 8 restrictive policies, 5 functions, 2 views (% and % rows, unchanged).',
    current_setting('qc_settings_lab.billing_feed_before'), current_setting('qc_settings_lab.lab_fees_before');
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Post-apply check (read-only):
-- SELECT
--  (SELECT count(*) FROM qc_client_settings) AS settings_rows,                                   -- 38 on 2026-11-25
--  (SELECT count(*) FROM qc_client_settings q JOIN laboratories l ON l.id = q.laboratory_id
--     WHERE l.type = 'hq') AS settings_hq_rows,                                                   -- same as settings_rows
--  (SELECT count(*) FROM client_qualities) AS spec_rows,                                          -- 88 on 2026-11-25
--  (SELECT count(*) FROM client_qualities c JOIN laboratories l ON l.id = c.laboratory_id
--     WHERE l.type = 'hq') AS spec_hq_rows,                                                       -- same as spec_rows
--  (SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'public.qc_client_settings'::regclass AND contype = 'p') AS settings_key,   -- PRIMARY KEY (company_id, laboratory_id)
--  (SELECT count(*) FROM pg_policy WHERE polname LIKE '%lab_scope%' AND polrelid IN
--     ('public.qc_client_settings'::regclass, 'public.client_qualities'::regclass)) AS lab_policies, -- 8
--  (SELECT count(*) FROM qc_billing_feed) AS billing_feed_rows,                                   -- 644 on 2026-11-25
--  (SELECT count(*) FROM dashboard_lab_fees_v) AS lab_fees_rows,                                  -- 639 on 2026-11-25
--  (SELECT count(*) FROM pg_proc WHERE proname = 'mint_origin_certificate_number') AS origin_minters; -- 1
