-- Global admins pass get_user_qc_role() with qc_enabled off.
--
-- get_user_qc_role() returned the role only when qc_enabled = true. It is the
-- only PERMISSIVE write test on qc_client_settings ("QC staff full access")
-- and on 15 other QC tables (quality_templates, client_origin_pricing,
-- client_qualities delete, ...). daniel@wolthers.com is global_admin with
-- qc_enabled false, so every one of those writes failed for him with
-- "new row violates row-level security policy" (2026-11-18: Save QC
-- configuration on Swiss Water).
--
-- waqc_is_staff() / waqc_access_kind() (20261014000001) already decided that
-- the global_admin and global_quality_admin roles count without qc_enabled.
-- This makes the old helper follow the same rule. Every other role still
-- needs qc_enabled, so the old open sign-ups (lab_personnel, qc_enabled false)
-- stay out. On 2026-11-18 the new branch admits exactly one profile:
-- daniel@wolthers.com.
--
-- Same signature and return type; search_path pinned (SECURITY DEFINER).
-- Paste-safe for the Supabase editor.

CREATE OR REPLACE FUNCTION public.get_user_qc_role(user_id uuid)
RETURNS user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    RETURN (
      SELECT p.qc_role
        FROM public.profiles p
       WHERE p.id = user_id
         AND (p.qc_enabled = true
              OR p.qc_role::text IN ('global_admin', 'global_quality_admin'))
    );
END;
$function$;

-- Verification: one row, daniel@wolthers.com | global_admin.
SELECT p.email, public.get_user_qc_role(p.id) AS role_now
FROM public.profiles p
WHERE p.qc_enabled IS NOT TRUE
  AND public.get_user_qc_role(p.id) IS NOT NULL;
