-- Task 20 (client portal accounts): drop the anonymous listing of pending
-- staff invitations.
--
-- Anonymous visitors could list every pending staff invitation, tokens
-- included ("Public can view pending invitations by token", and the older
-- public_invitations_select_policy). The accept page now reads its
-- invitation through /api/auth/invitation with the service role.
-- Apply ONLY after that code is deployed.

-- Step 1 (read-only, run first): every live policy on user_invitations.
-- If the live names differ from the two DROP lines below, edit them.
SELECT policyname, permissive, cmd, roles::text AS roles,
       coalesce(qual, '-') AS using_expression,
       coalesce(with_check, '-') AS check_expression
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_invitations'
ORDER BY policyname;

-- Step 2: the drops.
DROP POLICY IF EXISTS "Public can view pending invitations by token" ON public.user_invitations;
DROP POLICY IF EXISTS "public_invitations_select_policy" ON public.user_invitations;

-- Step 3 (final result set): no policy left that lets anon read the table.
SELECT policyname, permissive, cmd, roles::text AS roles,
       coalesce(qual, '-') AS using_expression
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_invitations'
ORDER BY policyname;
