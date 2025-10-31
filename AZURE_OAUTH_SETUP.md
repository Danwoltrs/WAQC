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

From your Azure AD App Registration (screenshot #4):
- **Application (client) ID**: `0cb5605e-296c-426d-bbba-d6d6d582fe33`
- **Directory (tenant) ID**: `b8218f6f-5191-4a79-8937-fac3bd38ee1c`
- **Client Secret**: You'll need to create one in Azure portal

### 2. Create Client Secret (If Not Done)

1. Go to Azure Portal → App registrations → Wolthers QC System
2. Click "Certificates & secrets"
3. Click "+ New client secret"
4. Description: "Supabase OAuth"
5. Expires: 24 months (or your preference)
6. Click "Add"
7. **COPY THE SECRET VALUE IMMEDIATELY** (you won't see it again)

### 3. Configure Supabase Azure Provider

1. Go to Supabase Dashboard → Authentication → Providers
2. Find "Azure" in the list
3. Click to expand Azure settings
4. Fill in:
   - **Enabled**: ON (toggle to green)
   - **Client ID**: `0cb5605e-296c-426d-bbba-d6d6d582fe33`
   - **Client Secret**: [paste the secret you copied]
   - **Azure Tenant ID**: `b8218f6f-5191-4a79-8937-fac3bd38ee1c`

5. Click "Save"

### 4. Verify Redirect URLs

Your Azure App should have these redirect URLs (already configured based on screenshot #1):

```
✅ https://qc.wolthers.com/auth/callback
✅ https://qc.wolthers.com
✅ https://qc.wolthers.com/**
```

Supabase will automatically use: `https://qc.wolthers.com/auth/callback`

### 5. Test the Flow

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

### 6. Verify Session Persistence

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

### "Invalid client credentials"
**Cause**: Client ID or Secret is wrong
**Fix**:
1. Verify Client ID in Supabase matches Azure: `0cb5605e-296c-426d-bbba-d6d6d582fe33`
2. Regenerate client secret in Azure if needed
3. Update secret in Supabase

### "Redirect URI mismatch"
**Cause**: Azure app doesn't allow the Supabase callback URL
**Fix**: Add `https://qc.wolthers.com/auth/callback` to Azure app redirect URLs

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

# Azure AD (OPTIONAL - only needed if you add custom MSAL features later)
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=0cb5605e-296c-426d-bbba-d6d6d582fe33
NEXT_PUBLIC_AZURE_AD_TENANT_ID=b8218f6f-5191-4a79-8937-fac3bd38ee1c
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

## Next Steps

1. Configure Azure provider in Supabase (see step 3 above)
2. Wait for deployment to finish (~2-3 minutes)
3. Test login at https://qc.wolthers.com
4. Verify storage shows data (not 0 B)
5. Test session persistence

---

**Need Help?**
- Check Supabase docs: https://supabase.com/docs/guides/auth/social-login/auth-azure
- Azure AD docs: https://docs.microsoft.com/en-us/azure/active-directory/develop/

**Deployed:** [Wait for Vercel deployment]
**Status:** ⏳ Awaiting Supabase Azure configuration
