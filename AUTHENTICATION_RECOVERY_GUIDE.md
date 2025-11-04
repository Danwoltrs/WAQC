# Authentication Recovery Guide

## Quick Fix for "Session fetch timeout" Errors

If you're experiencing persistent authentication timeouts in Chrome (or any browser), follow these steps:

### Option 1: Browser Console (Fastest)

1. **Open Chrome DevTools** (F12 or Cmd+Option+I on Mac)
2. **Go to the Console tab**
3. **Type the following and press Enter:**
   ```javascript
   window.clearWAQCSession()
   ```
4. **Refresh the page** (F5 or Cmd+R)
5. **Try logging in again**

### Option 2: Manual Cleanup

1. **Open Chrome DevTools** (F12)
2. **Go to the Application tab**
3. **In the left sidebar, expand "Local Storage"**
4. **Click on your domain (e.g., `http://localhost:3000`)**
5. **Delete all keys that start with `sb-`** (these are Supabase auth keys)
6. **Also delete these keys if present:**
   - `waqc_profile_cache`
   - `waqc_profile_cache_timestamp`
   - `waqc_last_activity`
7. **Go to "Session Storage" in the left sidebar**
8. **Clear all session storage items**
9. **Refresh the page and try logging in again**

### Option 3: Use the Recovery Tool

1. **Open the file: `clear-local-auth.html`** in your browser
2. **Click the "Clear All Authentication Data" button**
3. **Return to the application and try logging in**

---

## Understanding the Issue

### What Causes Session Timeouts?

The "Session fetch timeout" error occurs when:

1. **Corrupted session data** - Old or invalid auth tokens in localStorage/cookies
2. **Chrome's strict policies** - Chrome enforces stricter cookie and storage rules
3. **Network issues** - Slow or blocked connections to Supabase
4. **Race conditions** - Session validation happens before OAuth flow completes

### What the Fix Does

The updated authentication system now:

1. **Automatically clears corrupted sessions** on retry attempts
2. **Increases timeout to 20 seconds** for slower networks
3. **Retries 3 times** with exponential backoff (1s, 2s, 4s delays)
4. **Forces clean state** if all retries fail
5. **Provides better logging** to diagnose issues

---

## Detailed Troubleshooting

### Step 1: Check Console Logs

Open DevTools Console (F12) and look for these patterns:

**✓ Good - Authentication working:**
```
[Auth] Attempting to get session (attempt 1/3)...
[Auth] ✓ Session retrieved successfully for user: xxxxx
[Auth] Fetching profile data...
[Auth] ✓ Profile data fetched successfully
```

**⚠ Warning - Retrying with cleanup:**
```
[Auth] ✗ Error getting session (attempt 1/3): Session fetch timeout
[Auth] Retry attempt 2/3 for getSession
[Auth] Clearing potentially corrupted session data before retry
[Auth] Removing stale auth key: sb-xxxxx
```

**❌ Bad - All retries failed:**
```
[Auth] ✗ Error getting session (attempt 3/3): Session fetch timeout
[Auth] All retry attempts failed - forcing clean state
[Auth] Cleared all session data, ready for fresh login
```

### Step 2: Network Analysis

1. **Open DevTools Network tab** (F12 → Network)
2. **Try logging in again**
3. **Look for requests to Supabase** (domains ending in `.supabase.co`)
4. **Check for:**
   - ❌ Failed requests (red)
   - ⏸ Pending requests (spinning icon)
   - ⏱ Slow requests (>10s)

**Common Issues:**

- **Request blocked by CORS** → Check Supabase project settings
- **Request stuck pending** → Network/firewall issue
- **Request returns 401/403** → Check API keys in `.env.local`
- **Request times out** → Increase timeout or check network

### Step 3: Cookie Inspection

1. **Open DevTools Application tab** (F12 → Application)
2. **Click "Cookies" in the left sidebar**
3. **Look for your domain**
4. **Check for cookies with:**
   - Name starting with `sb-`
   - Value that's a long base64 string (JWT token)
   - `HttpOnly`, `Secure`, `SameSite` attributes

**Verify:**
- [ ] Cookies are being set after login
- [ ] Cookies have correct domain
- [ ] Cookies are not expired
- [ ] No duplicate cookies with conflicting values

### Step 4: Check Supabase Connection

Open browser console and test direct connection:

```javascript
// Test if Supabase is reachable
fetch('https://ojyonxplpmhvcgaycznc.supabase.co/rest/v1/')
  .then(r => console.log('✓ Supabase reachable:', r.status))
  .catch(e => console.error('✗ Supabase unreachable:', e))
```

### Step 5: Verify Environment Variables

Check that `.env.local` has correct values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ojyonxplpmhvcgaycznc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

**To verify in browser:**
```javascript
console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log('Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 20) + '...')
```

---

## Chrome-Specific Issues

### Issue: Third-Party Cookies Blocked

**Symptom:** Authentication works in Incognito but not regular mode

**Fix:**
1. Go to `chrome://settings/cookies`
2. Check if "Block third-party cookies" is enabled
3. Add exception for `.supabase.co`

### Issue: Extensions Interfering

**Symptom:** Auth works in one browser but not Chrome

**Fix:**
1. Disable all extensions
2. Try authentication again
3. Re-enable extensions one by one to find culprit

**Common problem extensions:**
- Privacy Badger
- uBlock Origin (in aggressive mode)
- Cookie AutoDelete
- Any VPN extensions

### Issue: Browser Cache Corruption

**Symptom:** Nothing works, even after clearing storage

**Fix:**
1. **Hard refresh:** Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. **Clear all site data:**
   - DevTools → Application → Clear storage → "Clear site data"
3. **Reset Chrome settings:**
   - `chrome://settings/resetProfileSettings`

---

## Prevention Tips

### For Developers

1. **Regular cleanup:** Clear localStorage weekly during development
2. **Use Incognito:** Test in Incognito mode to avoid cache issues
3. **Monitor timeouts:** If you see timeout warnings, increase timeout values
4. **Check logs:** Keep console open to catch issues early

### For End Users

1. **Stay updated:** Keep Chrome updated to latest version
2. **Avoid cache buildup:** Clear browser cache monthly
3. **Report issues early:** If you see timeouts, report immediately
4. **Use the recovery tool:** Bookmark `clear-local-auth.html` for quick recovery

---

## Emergency Recovery

If nothing else works:

1. **Clear browser cache completely:**
   - `chrome://settings/clearBrowserData`
   - Select "All time"
   - Check: Cookies, Cached images, Site settings
   - Click "Clear data"

2. **Reset Chrome:**
   - `chrome://settings/resetProfileSettings`

3. **Try a different browser:**
   - Firefox, Safari, or Edge
   - If it works there, the issue is Chrome-specific

4. **Contact support:**
   - Email: daniel@wolthers.com
   - Include: Browser version, console logs, network tab screenshot

---

## For System Administrators

### Firewall Rules

Ensure the following domains are whitelisted:

- `*.supabase.co` (all Supabase domains)
- `login.microsoftonline.com` (for Microsoft OAuth)
- `graph.microsoft.com` (for user profile data)

### Proxy Configuration

If using a corporate proxy, configure:

```
# Allow WebSocket connections for Supabase Realtime
*.supabase.co:443  ALLOW
*.supabase.co:80   ALLOW
```

### Content Security Policy

If CSP headers are enforced, add:

```
connect-src 'self' *.supabase.co login.microsoftonline.com graph.microsoft.com;
```

---

## Technical Details

### What Gets Cleared

When you call `window.clearWAQCSession()`, the following is removed:

1. **Supabase auth tokens** (`sb-*` keys in localStorage)
2. **Profile cache** (`waqc_profile_cache`)
3. **Cache timestamp** (`waqc_profile_cache_timestamp`)
4. **Activity tracking** (`waqc_last_activity`)
5. **All sessionStorage** (temporary session data)

### What Doesn't Get Cleared

- **Cookies** (handled automatically by Supabase)
- **IndexedDB** (not used for auth)
- **Service Workers** (not used for auth)

### Timeout Values

- **Session fetch:** 20 seconds per attempt
- **Profile fetch:** 20 seconds
- **Total maximum wait:** 60 seconds (3 × 20s with retries)
- **Exponential backoff:** 1s, 2s, 4s between retries

---

## Success Indicators

After fixing the issue, you should see:

1. ✓ Login completes in <5 seconds
2. ✓ No timeout errors in console
3. ✓ Session persists after browser refresh
4. ✓ Session persists after browser close/reopen
5. ✓ Profile loads without fallback messages

---

## Still Having Issues?

If problems persist after trying all steps:

1. **Capture diagnostics:**
   ```javascript
   // Run in console and save output
   console.log({
     localStorage: JSON.stringify(localStorage),
     cookies: document.cookie,
     userAgent: navigator.userAgent,
     supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
   })
   ```

2. **Take screenshots:**
   - Console tab showing all errors
   - Network tab showing Supabase requests
   - Application tab showing localStorage

3. **Contact support** with:
   - Browser and version
   - Operating system
   - Diagnostics output
   - Screenshots
   - Steps to reproduce

---

**Last Updated:** 2025-01-04
**Version:** 2.0 (Enhanced Recovery)
