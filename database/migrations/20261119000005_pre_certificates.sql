-- 20261119000005_pre_certificates.sql
--
-- Pre-certificates: a laboratory that works with the "pre-certificate check"
-- issues an approved lot's certificate ON STANDBY, with its number already
-- assigned, and makes it final when the container is known.
--
--   laboratories.pre_cert_check   on for every laboratory except the HQ one
--                                 (Brazil: off; Colombia: on); a new laboratory
--                                 starts with it on.
--   certificates.standby_at       when the pre-certificate was issued. While it
--                                 waits, the row has status 'draft', which every
--                                 list of issued certificates and the results
--                                 email already leave out.
--   certificates.finalized_at/by  who made it final, and when; the container
--                                 they gave is kept in finalized_container and
--                                 written on the sample.
--
-- The number is assigned by the existing trigger when the row is inserted, so a
-- pre-certificate has its number from the start and keeps it when it becomes
-- final. No existing certificate changes: all 1,634 are 'issued' or 'revoked'
-- and none has a standby date.
--
-- Safe to run twice.

BEGIN;

SET LOCAL lock_timeout = '3s';

-- The laboratory setting. The UPDATE runs only when the column is new, so a
-- second run never undoes a choice made on the Laboratories page.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'laboratories' AND column_name = 'pre_cert_check'
  ) THEN
    ALTER TABLE public.laboratories ADD COLUMN pre_cert_check boolean NOT NULL DEFAULT true;
    UPDATE public.laboratories SET pre_cert_check = false WHERE lower(type::text) = 'hq';
  END IF;
END $$;

COMMENT ON COLUMN public.laboratories.pre_cert_check IS
  'Approved lots get a pre-certificate on standby, made final when the container is added.';

ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS standby_at          timestamptz;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS finalized_at        timestamptz;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS finalized_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS finalized_container text;

-- The Standby view reads only the waiting ones.
CREATE INDEX IF NOT EXISTS idx_certificates_standby
  ON public.certificates (standby_at)
  WHERE standby_at IS NOT NULL AND finalized_at IS NULL;

-- Checks: abort the whole migration if any of this did not hold.
DO $$
DECLARE
  v_count INT;
BEGIN
  v_count := (SELECT count(*) FROM information_schema.columns
              WHERE table_schema = 'public'
                AND ((table_name = 'laboratories' AND column_name = 'pre_cert_check')
                  OR (table_name = 'certificates' AND column_name IN ('standby_at', 'finalized_at', 'finalized_by', 'finalized_container'))));
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'expected the 5 pre-certificate columns, found %', v_count;
  END IF;

  v_count := (SELECT count(*) FROM public.certificates WHERE standby_at IS NOT NULL AND finalized_at IS NULL AND status::text <> 'draft');
  IF v_count > 0 THEN
    RAISE EXCEPTION '% certificate(s) wait on standby without being drafts', v_count;
  END IF;
END $$;

COMMIT;

-- Which laboratory works with pre-certificates.
SELECT name, type, pre_cert_check FROM public.laboratories ORDER BY name;
