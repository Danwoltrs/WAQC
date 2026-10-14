-- Task 20 (client portal accounts): drop the anonymous listing of pending
-- staff invitations.
--
-- Anonymous visitors could list every pending staff invitation, tokens
-- included. The accept page now reads its invitation through
-- /api/auth/invitation with the service role.
-- Apply ONLY after that code is deployed, and run
-- database/checks/20261014000003_precheck.sql first (it shows the live names).

DROP POLICY IF EXISTS "Public can view pending invitations by token" ON public.user_invitations;
DROP POLICY IF EXISTS "public_invitations_select_policy" ON public.user_invitations;
DROP POLICY IF EXISTS "Anyone can view invitation by token" ON public.user_invitations;

-- Final result set: no policy left that lets anon read the table.
SELECT policyname, permissive, cmd, roles::text AS roles,
       coalesce(qual, '-') AS using_expression
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_invitations'
ORDER BY policyname;
