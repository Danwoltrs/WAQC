-- ────────────────────────────────────────────────────────────────────
-- Migration: 20260609000000_sync_profiles_to_user_profiles.sql
-- Purpose:   Make WAQC lab users resolvable on sys.wolthers.com.
--
-- sys renders "requested by {name}" by joining created_by -> user_profiles
-- (reading short_name ?? full_name). qc-only staff have a WAQC `profiles`
-- row but NO `user_profiles` row, so their name can't resolve. This bridges
-- the two: a one-time backfill + an INSERT-only trigger keeping new staff in
-- sync. profiles and user_profiles live in the SAME (shared) Supabase DB and
-- are both keyed on auth.users.id, so ids match 1:1 across both apps.
--
-- Scope (per product decision, "for now"): @wolthers.com staff assigned to
-- the Brazil (Santos HQ) lab. These are internal Wolthers people -> user_type
-- 'internal'. Broaden the WHERE / trigger guard later if needed.
--
-- SAFETY: INSERT ... ON CONFLICT (id) DO NOTHING + an email-collision guard,
-- so this NEVER clobbers a real sys-managed user_profiles row (e.g. Débora
-- Sabino). It only CREATES rows for staff who lack one. It does not UPDATE
-- existing rows — later name edits in WAQC will not propagate (acceptable for
-- attribution; revisit if needed).
-- ────────────────────────────────────────────────────────────────────

-- ── 1. One-time backfill ────────────────────────────────────────────────
INSERT INTO public.user_profiles (id, full_name, short_name, email, user_type)
SELECT
    p.id,
    p.full_name,        -- NOT NULL on both tables
    p.first_name,       -- -> short_name, gives a clean "by Anderson"
    p.email,
    'internal'          -- CHECK ('internal','co_broker','external'); also the column default
FROM public.profiles p
WHERE p.email ILIKE '%@wolthers.com'
  AND p.laboratory_id IN (
        SELECT id FROM public.laboratories
        WHERE country = 'Brazil'
           OR location ILIKE '%brazil%'
           OR name ILIKE '%santos%'
      )
  -- never collide with a real sys row that already owns this email
  AND NOT EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.email = p.email AND up.id <> p.id
      )
ON CONFLICT (id) DO NOTHING;
-- All other NOT NULL columns self-fill from defaults: is_active=true,
-- permissions='{}', department_ids='{}', status='active', created_at/updated_at=now().

-- ── 2. Keep new / updated staff in sync ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_profile_to_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER          -- write user_profiles regardless of the caller's RLS
SET search_path = public
AS $$
BEGIN
    -- In scope only: @wolthers.com + assigned to the Brazil (Santos HQ) lab.
    IF NEW.email IS NULL
       OR NEW.email NOT ILIKE '%@wolthers.com'
       OR NEW.laboratory_id IS NULL
       OR NOT EXISTS (
            SELECT 1 FROM public.laboratories l
            WHERE l.id = NEW.laboratory_id
              AND (l.country = 'Brazil' OR l.location ILIKE '%brazil%' OR l.name ILIKE '%santos%')
          )
    THEN
        RETURN NEW;
    END IF;

    -- Skip if this email already belongs to a different sys user_profiles row.
    IF EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.email = NEW.email AND up.id <> NEW.id
    ) THEN
        RETURN NEW;
    END IF;

    -- Create only when missing — never overwrite a sys-managed row.
    INSERT INTO public.user_profiles (id, full_name, short_name, email, user_type)
    VALUES (NEW.id, NEW.full_name, NEW.first_name, NEW.email, 'internal')
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_to_user_profile ON public.profiles;
CREATE TRIGGER trg_sync_profile_to_user_profile
    AFTER INSERT OR UPDATE OF full_name, first_name, email, laboratory_id
    ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_profile_to_user_profile();
