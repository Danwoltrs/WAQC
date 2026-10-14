-- Read-only, run BEFORE 20261014000003_drop_anon_invitation_listing.sql:
-- every live policy on user_invitations. If the live names differ from the
-- DROP lines in the migration, edit them there.
SELECT policyname, permissive, cmd, roles::text AS roles,
       coalesce(qual, '-') AS using_expression,
       coalesce(with_check, '-') AS check_expression
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_invitations'
ORDER BY policyname;
