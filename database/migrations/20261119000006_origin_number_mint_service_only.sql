-- 20261119000006_origin_number_mint_service_only.sql
--
-- Only the numbering itself may take an origin certificate number.
--
-- 20261119000004 revoked mint_origin_certificate_number from PUBLIC, but this
-- database's default privileges also grant EXECUTE on every new function to
-- the authenticated role directly, and that grant survived. Any signed-in user
-- (a portal client included) could therefore call it through the API and use
-- up origin numbers, leaving gaps in a line that must have none.
--
-- It is called only from mint_certificate_number, which runs as its owner, so
-- certification is unaffected. Safe to run twice.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.mint_origin_certificate_number(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_origin_certificate_number(text, uuid, uuid) TO service_role;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.mint_origin_certificate_number(text, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.mint_origin_certificate_number(text, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a signed-in user can still take origin certificate numbers';
  END IF;
END $$;

COMMIT;

-- Who may call it now: postgres and service_role only.
SELECT p.proname, p.proacl::text AS who_may_call
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'mint_origin_certificate_number';
