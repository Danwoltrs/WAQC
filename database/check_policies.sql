-- Check all policies on profiles table
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename IN ('profiles', 'user_invitations')
ORDER BY tablename, policyname;

-- Check if our SECURITY DEFINER functions exist
SELECT
    proname as function_name,
    prosecdef as is_security_definer,
    provolatile as volatility
FROM pg_proc
WHERE proname IN (
    'is_global_admin_user',
    'get_user_lab_id',
    'is_lab_quality_manager_user',
    'get_user_role'
)
ORDER BY proname;
