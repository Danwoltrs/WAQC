# Azure OAuth Setup with Supabase

## Overview

We've switched from custom MSAL to **Supabase's built-in Azure OAuth** for faster, more reliable authentication.

## Why This Change?

**Before (Custom MSAL):**
- ❌ Custom `/api/auth/azure-signin` endpoint failing with `ERR_NETWORK_CHANGED`
- ❌ Network timeouts and fetch failures
- ❌ Complex custom implementation
- ❌ Slow authentication flow

**After (Supabase Native OAuth):**
- ✅ Direct Azure AD authentication
- ✅ No custom endpoints to fail
- ✅ Built-in session management
- ✅ Much faster and more reliable
- ✅ Automatic user creation

## Configuration Steps

### 1. Get Azure AD Credentials

From your Azure AD App Registration (created Oct 2024):
- **Application (client) ID**: `0cb5605e-296c-426d-bbba-d6d6d582fe33`
- **Directory (tenant) ID**: `b8218f6f-5191-4a79-8937-fac3bd38ee1c`
- **Client Secret**: `050f1031-c96b-4727-9317-4d9db9ab2cbf` (created Jan 2025)

### 2. Configure Supabase Azure Provider (IMPORTANT - DO THIS NOW)

1. Go to https://supabase.com/dashboard/project/ojyonxplpmhvcgaycznc/auth/providers
2. Find "Azure" in the list
3. Click to expand Azure settings
4. Fill in EXACTLY as shown:
   - **Enabled**: ON (toggle to green)
   - **Client ID**: `0cb5605e-296c-426d-bbba-d6d6d582fe33`
   - **Client Secret**: `050f1031-c96b-4727-9317-4d9db9ab2cbf`
   - **Azure Tenant ID**: `b8218f6f-5191-4a79-8937-fac3bd38ee1c`

5. Click "Save"

**✅ Updated Jan 2025**: These credentials match the Azure AD app "Wolthers QC System" created with proper Supabase redirect URIs.

### 3. Configure Azure AD Redirect URIs

Your Azure AD App Registration needs these redirect URIs:

**For Development:**
```
http://localhost:3000/auth/callback
https://ojyonxplpmhvcgaycznc.supabase.co/auth/v1/callback
```

**For Production:**
```
https://qc.wolthers.com/auth/callback
https://ojyonxplpmhvcgaycznc.supabase.co/auth/v1/callback
```

**To add these:**
1. Go to Azure Portal → Azure Active Directory → App registrations
2. Find app with Client ID: `0cb5605e-296c-426d-bbba-d6d6d582fe33`
3. Click "Authentication" in the left menu
4. Under "Platform configurations" → Click **"Add a platform"** → Select **"Web"**
5. Add all the URIs above (the SPA platform won't work for OAuth 2.0 code flow)
6. Click "Save"

**⚠️ IMPORTANT**: Make sure redirect URIs are added as **Web** platform type, NOT "Single-page application" (SPA).

**⚠️ IMPORTANT**: The Supabase callback URI (`https://ojyonxplpmhvcgaycznc.supabase.co/auth/v1/callback`) is REQUIRED. This is where Azure redirects after authentication.

### 4. Test the Flow

1. Clear browser cache and cookies
2. Go to https://qc.wolthers.com
3. Click "Continue with Microsoft"
4. You'll be redirected to Microsoft login
5. After logging in, you'll be redirected back to the dashboard

**Expected Flow:**
```
qc.wolthers.com
  → Click "Continue with Microsoft"
  → Supabase OAuth initiates
  → Microsoft login page
  → You authenticate
  → Microsoft redirects to: qc.wolthers.com/auth/callback
  → Supabase processes callback
  → Creates/updates user
  → Redirects to dashboard
  → You're logged in!
```

### 5. Verify Session Persistence

After logging in:
- Open DevTools → Application → Storage
- Check for cookies: `sb-*`
- Check localStorage: Should have several KB of data
- Refresh page (F5) → Should stay logged in
- Close browser, reopen → Should stay logged in

## Troubleshooting

### "Failed to fetch" or Network Errors
**Cause**: Old custom endpoint still being cached
**Fix**: Hard refresh with `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)

### "Invalid client credentials" or "Application not found"
**Cause**: Client ID or Secret is wrong in Supabase
**Fix**:
1. Verify Client ID in Supabase matches .env.local: `0cb5605e-296c-426d-bbba-d6d6d582fe33`
2. Verify Client Secret in Supabase: `050f1031-c96b-4727-9317-4d9db9ab2cbf`
3. Verify Tenant ID: `b8218f6f-5191-4a79-8937-fac3bd38ee1c`

### "Redirect URI mismatch"
**Cause**: Azure app doesn't allow the Supabase callback URL
**Fix**: Add `https://ojyonxplpmhvcgaycznc.supabase.co/auth/v1/callback` to Azure app redirect URLs (see step 3 above)

### Still seeing 0 B storage
**Cause**: Authentication not completing successfully
**Fix**:
1. Check browser console for specific errors
2. Verify Azure provider is enabled in Supabase
3. Check that client secret is correct
4. Try email+password login to isolate issue

## Environment Variables

Your `.env.local` should have (no changes needed):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://ojyonxplpmhvcgaycznc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Azure AD (for reference - actual credentials stored in Supabase Dashboard)
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=0cb5605e-296c-426d-bbba-d6d6d582fe33
NEXT_PUBLIC_AZURE_AD_TENANT_ID=b8218f6f-5191-4a79-8937-fac3bd38ee1c
AZURE_AD_CLIENT_SECRET=050f1031-c96b-4727-9317-4d9db9ab2cbf
```

**Note**: With Supabase OAuth, the Azure credentials are stored in Supabase Dashboard, NOT in your `.env` file. This is more secure.

## What Changed in Code

### Before (Custom):
```typescript
// Old custom MSAL flow
await signInWithAzureADRedirect()
const response = await handleAzureADRedirect()
await fetch('/api/auth/azure-signin', { email, name })
await supabase.auth.signInWithPassword({ email, tempPassword })
```

### After (Supabase Native):
```typescript
// New Supabase OAuth - much simpler!
await supabase.auth.signInWithOAuth({
  provider: 'azure',
  options: {
    scopes: 'email profile openid',
    redirectTo: `${window.location.origin}/auth/callback`,
  },
})
```

## Security Benefits

1. **No exposed secrets**: Client secret stored in Supabase, not in code
2. **No custom endpoints**: Reduces attack surface
3. **Built-in PKCE**: Supabase handles OAuth security automatically
4. **Session management**: Automatic token refresh and session persistence
5. **Audit trail**: All auth events logged in Supabase

## Summary of Required Actions

**IMMEDIATE (Do this now):**
1. ✅ Go to https://supabase.com/dashboard/project/ojyonxplpmhvcgaycznc/auth/providers
2. ✅ Configure Azure provider with credentials from step 2 above
3. ✅ Verify Azure AD redirect URIs include `https://ojyonxplpmhvcgaycznc.supabase.co/auth/v1/callback`

**THEN:**
4. Test login at http://localhost:3000 (or https://qc.wolthers.com if deployed)
5. Verify storage shows data (not 0 B) after login
6. Test session persistence by refreshing and closing/reopening browser

**Current Status (Updated Jan 31, 2025):**
- ✅ Local .env.local updated with correct credentials
- ✅ Azure AD app has Supabase callback URI configured
- ⏳ Waiting for Supabase dashboard configuration
- ⚠️ Need to change redirect URI platform from SPA to Web in Azure

---

**Need Help?**
- Check Supabase docs: https://supabase.com/docs/guides/auth/social-login/auth-azure
- Azure AD docs: https://docs.microsoft.com/en-us/azure/active-directory/develop/

**Deployed:** [Wait for Vercel deployment]
**Status:** ⏳ Awaiting Supabase Azure configuration
