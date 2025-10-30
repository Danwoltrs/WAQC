# Authentication Fix Summary

## Problem Identified

When Svenn tried to accept an invitation, he received this error:
```
new row violates row-level security policy for table "profiles"
```

### Root Causes

1. **Missing INSERT Policy**: The `profiles` table had RLS enabled but NO INSERT policy, preventing new users from creating their profile records during signup
2. **No Microsoft OAuth Option**: The invitation acceptance page only showed password creation, not giving users the option to use their existing Microsoft account
3. **Manual Profile Creation**: The accept-invite flow required manual profile upserts, which could fail due to RLS

## Changes Implemented

### 1. Database Migration (087_add_profiles_insert_policy_and_trigger.sql)

#### Part 1: INSERT Policy for Profiles
- Added policy allowing authenticated users to insert their own profile record
- Policy checks that `auth.uid() = id` (user can only create their own profile)

#### Part 2: Auto-Create Profile Trigger
- Created `handle_new_user()` function that automatically creates profiles when users sign up
- Trigger fires on `auth.users` INSERT (after signup via password OR OAuth)
- Smart logic:
  - **If invitation exists**: Uses invitation data (name, role, lab, permissions)
  - **If no invitation**: Creates basic profile from user metadata
- Automatically marks invitations as "accepted"

#### Part 3: Invitation SELECT Policy
- Allows public read access to invitations by token (needed for accept-invite page)

### 2. Frontend Changes (accept-invite/page.tsx)

#### Microsoft OAuth Support
- Added "Continue with Microsoft" button with Microsoft logo
- OAuth flow automatically creates profile via trigger (no manual work needed)
- Redirects to dashboard after successful authentication

#### Updated Password Flow
- Simplified password signup (removed manual profile upsert)
- Profile creation now handled by database trigger
- Cleaner error handling

#### UI Improvements
- Both authentication methods displayed clearly
- Divider with "Or continue with password" text
- Professional Microsoft branding
- Loading states for both options

## How It Works Now

### For Users with Invitations

1. **Receive invitation link** → `/auth/accept-invite?token=xyz`
2. **Choose authentication method**:
   - **Option A: Microsoft OAuth**
     - Click "Continue with Microsoft"
     - Sign in with Microsoft account
     - Database trigger creates profile with invitation data
     - Redirect to dashboard

   - **Option B: Password**
     - Enter password (8+ chars) and confirm
     - Account created via `supabase.auth.signUp()`
     - Database trigger creates profile with invitation data
     - Redirect to dashboard

3. **Invitation automatically marked as "accepted"**

### For Users Without Invitations (Future)

- When a user signs up via Microsoft OAuth without an invitation
- Trigger creates a basic profile with:
  - Email from Microsoft
  - Name from Microsoft metadata
  - Default role: `lab_personnel`
  - QC disabled by default
- Admin must enable QC access and assign role

## Session Management

- Cookies automatically set via `/auth/callback` route
- Session persists across app reload
- Standard Supabase SSR cookie handling

## Testing Instructions

### Test 1: Password-Based Invitation Acceptance

1. Create invitation via admin panel
2. Copy invitation URL
3. Open in browser
4. Fill in password (min 8 chars)
5. Click "Create Account"
6. Should redirect to dashboard
7. Check `profiles` table - profile should exist with invitation data
8. Check `user_invitations` table - status should be "accepted"

### Test 2: Microsoft OAuth Invitation Acceptance

1. Create invitation via admin panel
2. Copy invitation URL
3. Open in browser
4. Click "Continue with Microsoft"
5. Sign in with Microsoft account matching invitation email
6. Should redirect to dashboard
7. Check `profiles` table - profile should exist with invitation data
8. Check `user_invitations` table - status should be "accepted"

### Test 3: Microsoft OAuth Without Invitation

1. Attempt to sign in with Microsoft (no invitation)
2. Profile should be created with basic info
3. `qc_enabled` should be `false`
4. Admin must grant access

## Configuration Requirements

### Supabase Dashboard

Ensure Microsoft OAuth is configured:

1. Go to **Authentication** → **Providers**
2. Enable **Azure (Microsoft)**
3. Set **Azure Tenant ID** (from Azure AD)
4. Set **Azure Client ID** (Application ID)
5. Set **Azure Client Secret** (from Azure AD)
6. Set **Redirect URL**: `https://your-project.supabase.co/auth/v1/callback`

### Azure AD Configuration

1. Register app in Azure AD
2. Add redirect URI: `https://your-project.supabase.co/auth/v1/callback`
3. Enable ID tokens
4. Set API permissions: `email`, `openid`, `profile`
5. Create client secret
6. Copy Client ID and Secret to Supabase

## Files Changed

### Database
- `database/migrations/087_add_profiles_insert_policy_and_trigger.sql` (NEW)

### Frontend
- `src/app/auth/accept-invite/page.tsx` (UPDATED)

## Security Considerations

### RLS Policies
- ✅ Users can only insert their own profile (checked via `auth.uid()`)
- ✅ Trigger runs with `SECURITY DEFINER` to bypass RLS for automatic profile creation
- ✅ Invitation reading is public (needed for accept-invite page)

### Invitation Security
- ✅ Tokens are UUIDs (cryptographically random)
- ✅ Invitations expire after 7 days
- ✅ Invitations can only be used once (status changes to "accepted")
- ✅ Email must match between Microsoft OAuth and invitation

## Troubleshooting

### Issue: "new row violates row-level security policy"
**Solution**: Migration 087 was successfully applied, this should be fixed

### Issue: Microsoft OAuth not working
**Check**:
- Azure AD app configuration (redirect URI)
- Supabase provider settings (Azure tenant, client ID, secret)
- Email claim in Azure AD tokens

### Issue: Profile not created after signup
**Check**:
- `handle_new_user()` trigger exists
- Check Supabase logs for trigger errors
- Verify invitation token is valid and not expired

### Issue: Invitation not marked as accepted
**Check**:
- Trigger is firing (check `auth.users` table)
- Invitation exists for the email
- Invitation status is "pending" and not expired

## Next Steps

1. Test both authentication flows (password and Microsoft OAuth)
2. Verify profile creation with invitation data
3. Test user can access dashboard after signup
4. Ensure admins can see new users in user management panel
5. Test invitation expiration (create invitation, wait 7 days, try to accept)

## Support

If users continue to face authentication issues:
1. Check Supabase logs for detailed error messages
2. Verify RLS policies with `\d+ profiles` in SQL editor
3. Test trigger manually with test user signup
4. Check Azure AD logs for OAuth flow errors
