# Invitation Email Case Sensitivity Fix

**Date**: 2025-10-31
**Issue**: Victor de Paula accepted an invitation but couldn't access the system

## Problem Summary

When Victor accepted his invitation via Microsoft OAuth, he was redirected to a "QC Access Required" page instead of being granted access to the dashboard.

### Root Cause

**Email case mismatch** between the invitation and Microsoft OAuth login:

- **Invitation email**: `victorWolthers@outlook.com` (capital W)
- **Microsoft OAuth email**: `victorwolthers@outlook.com` (lowercase w)

The `handle_new_user()` database trigger used **case-sensitive** email matching:
```sql
WHERE email = NEW.email
```

This caused the trigger to fail finding Victor's invitation, resulting in:
1. A basic profile with `qc_enabled = false` and no `qc_role`
2. The invitation remaining in "pending" status
3. Victor seeing the "QC Access Required" page

## Database State Before Fix

### Victor's Profile
```json
{
  "id": "24832170-fe01-48a7-9f51-5286afb95702",
  "email": "victorwolthers@outlook.com",
  "full_name": "Victor de Paula",
  "qc_role": null,
  "qc_enabled": false
}
```

### Victor's Invitation
```json
{
  "id": "e5da4887-3375-4b74-a832-638981def680",
  "email": "victorWolthers@outlook.com",
  "first_name": "Victor",
  "last_name": "de Paula",
  "qc_role": "lab_personnel",
  "laboratory_id": "9346551b-f8c1-4fd8-b4b0-8dd1eac72ee0",
  "qc_enabled": false,
  "status": "pending"
}
```

## Fix Applied

### 1. Database Migration (096_fix_invitation_email_case_sensitivity.sql)

Updated the `handle_new_user()` trigger to use **case-insensitive** email matching:

```sql
-- Before (case-sensitive)
WHERE email = NEW.email

-- After (case-insensitive)
WHERE LOWER(email) = LOWER(NEW.email)
```

This ensures that future invitations will work regardless of email casing differences between:
- How the admin entered the email in the invitation
- How the OAuth provider returns the email

### 2. Manual Profile Update

Fixed Victor's existing profile to match the invitation data:

```sql
UPDATE profiles
SET
  qc_role = 'lab_personnel',
  laboratory_id = '9346551b-f8c1-4fd8-b4b0-8dd1eac72ee0',
  qc_enabled = true,
  updated_at = NOW()
WHERE id = '24832170-fe01-48a7-9f51-5286afb95702';

UPDATE user_invitations
SET
  status = 'accepted',
  accepted_at = NOW(),
  updated_at = NOW()
WHERE id = 'e5da4887-3375-4b74-a832-638981def680';
```

## Database State After Fix

### Victor's Profile (Fixed)
```json
{
  "id": "24832170-fe01-48a7-9f51-5286afb95702",
  "email": "victorwolthers@outlook.com",
  "full_name": "Victor de Paula",
  "qc_role": "lab_personnel",
  "laboratory_id": "9346551b-f8c1-4fd8-b4b0-8dd1eac72ee0",
  "qc_enabled": true
}
```

### Victor's Invitation (Accepted)
```json
{
  "id": "e5da4887-3375-4b74-a832-638981def680",
  "email": "victorWolthers@outlook.com",
  "status": "accepted",
  "accepted_at": "2025-10-31 19:30:01+00"
}
```

## Result

✅ **Victor can now log in and access the dashboard**

The next time Victor logs in via Microsoft OAuth:
1. He will authenticate successfully
2. His profile will load with `qc_enabled = true`
3. He will see the dashboard instead of the "QC Access Required" page

## Prevention

The trigger fix ensures this won't happen again. Future invitations will work correctly regardless of:
- Email casing in the invitation (e.g., `John.Smith@Example.com`)
- Email casing from OAuth provider (e.g., `john.smith@example.com`)

## Testing Recommendations

To verify the fix works for future invitations:

1. Create a test invitation with mixed-case email: `Test.User@Example.com`
2. Accept invitation via Microsoft OAuth (which may return: `test.user@example.com`)
3. Verify profile is created with invitation data
4. Verify invitation status changes to "accepted"
5. Verify user can access dashboard

## Files Changed

- **Migration**: `database/migrations/096_fix_invitation_email_case_sensitivity.sql`
- **Documentation**: This file

## Related Issues

- Initial invitation system: Migration 084
- Profile creation trigger: Migration 087
- Microsoft OAuth support: AUTH_FIX_SUMMARY.md

## Contact

If similar issues occur:
1. Check email casing in both `profiles` and `user_invitations` tables
2. Verify invitation status is "pending" and not expired
3. Check Supabase logs for trigger execution errors
4. Contact: anderson@wolthers.com
