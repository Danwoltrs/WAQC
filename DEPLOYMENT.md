# Deployment Configuration Guide

## Vercel Environment Variables

Add these environment variables in your Vercel project settings (Settings → Environment Variables):

### Required Variables

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://ojyonxplpmhvcgaycznc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qeW9ueHBscG1odmNnYXljem5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2OTcwMjQsImV4cCI6MjA2OTI3MzAyNH0.yw_s7ydtABkUJiK_2HqDI2ewbC8tSIW5MJuD_Vwxpak

# Production URL
NEXTAUTH_URL=https://qc.wolthers.com

# NextAuth Configuration (if using NextAuth)
NEXTAUTH_SECRET=your-nextauth-secret-here
```

### Optional Variables (Already Added)

```bash
# Supabase Service Role (for server-side operations)
SUPABASE_URL=https://ojyonxplpmhvcgaycznc.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Microsoft Azure AD OAuth
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=1c7d360a-xxxx
AZURE_AD_CLIENT_SECRET=WBB8Qxxx
NEXT_PUBLIC_AZURE_AD_TENANT_ID=b8218fxxx

# Resend API (for email)
RESEND_API_KEY=re_aiU9XXRX_L6UHS5a6xhMxxx
```

**Important:** Set these for all environments (Production, Preview, Development)

---

## Azure AD Configuration

### 1. Redirect URIs

Go to Azure Portal → App Registrations → Your App → Authentication → Add these redirect URIs:

**Web Redirect URIs:**
```
https://qc.wolthers.com/auth/callback
https://ojyonxplpmhvcgaycznc.supabase.co/auth/v1/callback
```

**For development (localhost):**
```
http://localhost:3000/auth/callback
http://localhost:3002/auth/callback
```

### 2. Front-channel Logout URL

```
https://qc.wolthers.com/auth/signout
```

### 3. Implicit Grant and Hybrid Flows

Ensure these are **enabled**:
- ✅ Access tokens (used for implicit flows)
- ✅ ID tokens (used for implicit and hybrid flows)

---

## Supabase Configuration

### 1. Authentication → URL Configuration

**Site URL:**
```
https://qc.wolthers.com
```

**Redirect URLs (Add all of these):**
```
https://qc.wolthers.com
https://qc.wolthers.com/auth/callback
http://localhost:3000/auth/callback
http://localhost:3002/auth/callback
```

### 2. Authentication → Providers → Azure (Microsoft)

**Settings:**
- ✅ Enable Azure provider
- **Client ID:** `1c7d360a-xxxx` (from Azure AD)
- **Client Secret:** `WBB8Qxxx` (from Azure AD)
- **Azure Tenant ID:** `b8218fxxx`

---

## Troubleshooting OAuth Endless Loop

If you encounter an endless redirect loop on production:

### Check These Items:

1. **Vercel Environment Variables**
   - Verify `NEXTAUTH_URL=https://qc.wolthers.com` is set
   - Ensure all Supabase variables are correct
   - Clear and redeploy if needed

2. **Azure AD Redirect URIs**
   - Must include `https://qc.wolthers.com/auth/callback`
   - Must include `https://ojyonxplpmhvcgaycznc.supabase.co/auth/v1/callback`

3. **Supabase Redirect URLs**
   - Must include `https://qc.wolthers.com/auth/callback`
   - Must include `https://qc.wolthers.com`

4. **Browser Cookies**
   - Clear browser cookies for qc.wolthers.com
   - Try incognito/private browsing mode

5. **Check Vercel Logs**
   - Go to Vercel → Your Project → Deployments → Latest → Functions
   - Look for errors in `/auth/callback` function logs
   - Check for "Error exchanging code for session" messages

### Common Issues:

**Issue:** Redirects back to login page immediately
- **Solution:** Check that cookies are being set properly in the callback route
- **Solution:** Verify the callback URL in Azure AD exactly matches the production URL

**Issue:** "No session created" error
- **Solution:** Verify Supabase Azure provider is enabled and configured correctly
- **Solution:** Check that the Azure AD app has proper API permissions

**Issue:** CORS or cookie errors
- **Solution:** Ensure Supabase Site URL is set to `https://qc.wolthers.com`
- **Solution:** Check that cookies are SameSite=Lax and Secure=true in production

---

## Deployment Checklist

Before deploying to production:

- [ ] All environment variables added to Vercel
- [ ] Azure AD redirect URIs include production URL
- [ ] Supabase redirect URLs include production URL
- [ ] Supabase Site URL set to production domain
- [ ] Test OAuth flow in production after deployment
- [ ] Clear browser cookies and test in incognito mode
- [ ] Check Vercel function logs for any errors

---

## Local Development

For local development, ensure `.env.local` has:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ojyonxplpmhvcgaycznc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXTAUTH_URL=http://localhost:3000
```

And that Azure AD + Supabase have localhost callback URLs configured.
