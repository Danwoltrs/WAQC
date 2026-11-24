-- sample_recipients.responded_by points at auth.users instead of profiles.
--
-- sys writes this column with the signed-in user's id, and since
-- 20261109000000 a sys user has no QC profile, so the old foreign key would
-- refuse them. samples.created_by already points at auth.users the same way.
--
-- Dropping a foreign key locks both tables exclusively: sample_recipients,
-- then profiles. The first attempt deadlocked with a live request that held
-- profiles and was waiting for sample_recipients. So this takes both locks up
-- front, in that request's order (profiles first, holding nothing while it
-- waits), and gives up after 3 seconds instead of queueing the whole app
-- behind it. If it gives up, nothing changed: run it again.
--
-- Paste-safe: one implicit transaction, no select-to-variable.

SET LOCAL lock_timeout = '3s';
LOCK TABLE public.profiles, public.sample_recipients IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.conrelid = 'public.sample_recipients'::regclass
      AND c.contype = 'f'
      AND a.attname = 'responded_by'
  LOOP
    EXECUTE format('ALTER TABLE public.sample_recipients DROP CONSTRAINT %I', fk.conname);
  END LOOP;
END $$;

ALTER TABLE public.sample_recipients
  ADD CONSTRAINT sample_recipients_responded_by_fkey
  FOREIGN KEY (responded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Verification: responded_by_points_at = auth.users; fks_to_profiles lists the
-- columns that still need a QC profile (none of them should be one sys writes).
SELECT
  (SELECT c.confrelid::regclass::text
   FROM pg_constraint c
   JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
   WHERE c.conrelid = 'public.sample_recipients'::regclass
     AND c.contype = 'f'
     AND a.attname = 'responded_by') AS responded_by_points_at,
  (SELECT string_agg(f.col, ', ' ORDER BY f.col)
   FROM (
     SELECT c.conrelid::regclass::text || '.' || a.attname AS col
     FROM pg_constraint c
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.confrelid = 'public.profiles'::regclass
   ) f) AS fks_to_profiles;
