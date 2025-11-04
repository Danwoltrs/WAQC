# Session Persistence & Login Behavior Guide

**Date**: 2025-10-31
**Application**: Wolthers Coffee Quality Control System

## Overview

The application supports two authentication methods with **persistent sessions** that keep users logged in across browser restarts and tabs.

## Authentication Methods

### 1. Microsoft OAuth (Azure AD)
- Users sign in with their Microsoft/Outlook account
- Single sign-on (SSO) experience
- No password storage required

### 2. Email + Password
- Traditional username/password authentication
- Managed by Supabase Auth
- Passwords securely hashed with bcrypt

## Session Persistence: YES ✅

**Both authentication methods provide persistent sessions:**

### Storage Mechanism

1. **Primary**: localStorage
   - Session tokens stored in browser's localStorage
   - Persists across browser restarts
   - Cleared only when user explicitly logs out or clears browser data

2. **Secondary**: Cookies
   - Used for server-side session validation
   - SameSite=Lax for OAuth compatibility
   - Secure flag in production (HTTPS only)

### Session Duration

- **Access Token**: Expires after 1 hour
- **Refresh Token**: Valid for **7 days** (Supabase default)
- **Auto-refresh**: Enabled - tokens refresh automatically before expiry

**Note**: Supabase default is 7 days, but can be extended to 30 days in project settings.

## Auto-Refresh Strategy

The app uses **proactive token refresh** to keep sessions alive:

### 1. Scheduled Refresh
```javascript
// Refreshes 5 minutes before access token expires
setTimeout(() => refreshSession(), timeUntilExpiry - 5mins)
```

### 2. Hourly Backup Refresh
```javascript
// Every hour to maintain long-term persistence
setInterval(() => refreshSession(), 60 * 60 * 1000)
```

### 3. On Tab Focus
```javascript
// When user returns to tab after 5+ minutes
if (timeSinceActivity > 5mins) {
  refreshSession()
}
```

### 4. Automatic (Supabase Built-in)
- Supabase SDK automatically refreshes when user interacts with the app
- `autoRefreshToken: true` in configuration

## User Experience

### First-Time Login

**Microsoft OAuth:**
1. User clicks "Continue with Microsoft"
2. Redirects to Microsoft login
3. User enters Microsoft credentials (if not already signed in)
4. Redirects back to app → Dashboard

**Email + Password:**
1. User enters email and password
2. Clicks "Sign In"
3. Immediately redirects to Dashboard

### Returning Users

**Both Methods:**
- User opens browser → **Automatically logged in**
- No credentials needed
- Instant access to dashboard
- Works across:
  - Browser restarts
  - Multiple tabs
  - Different windows
  - Computer restarts

### Session Expiry Scenarios

#### Scenario 1: User is active (normal use)
- **Result**: Session stays alive indefinitely
- Auto-refresh keeps renewing tokens
- User never logged out

#### Scenario 2: User leaves tab open for days
- **Result**: Hourly refresh keeps session alive
- User returns → still logged in
- **Limitation**: After 7 days of complete inactivity, must re-login

#### Scenario 3: User closes browser and returns after 2 days
- **Result**: localStorage persists → still logged in
- Access token expired but refresh token valid
- Auto-refresh gets new access token
- Seamless experience

#### Scenario 4: User closes browser and returns after 8+ days
- **Result**: Refresh token expired → must re-login
- Redirected to login page
- Clean, expected behavior

#### Scenario 5: User explicitly logs out
- **Result**: All tokens cleared
- localStorage cleared
- Cookies cleared
- Must re-login next time

## Extending Session Duration to 30 Days

To extend refresh token validity from 7 to 30 days:

### Supabase Dashboard Settings

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/ojyonxplpmhvcgaycznc)
2. Navigate to **Authentication** → **Settings**
3. Find **JWT expiration** section
4. Change **Refresh Token Lifetime** from `604800` (7 days) to `2592000` (30 days)
5. Click **Save**

**Calculation:**
- 7 days = 604,800 seconds
- 30 days = 2,592,000 seconds

### Result After Change

- Users can stay logged in for **30 days** without activity
- Hourly refresh keeps session alive for users who leave tabs open
- Better UX for infrequent users

## Security Considerations

### Tokens Never Sent to Server
- Access tokens only used for API calls
- Refresh tokens stored in localStorage (not accessible to server)
- Tokens never logged or exposed in URLs

### Automatic Logout Triggers
- User clicks "Sign Out" button
- User clears browser data/cache
- Refresh token expires (after 7 or 30 days)
- Invalid/tampered token detected

### Cookie Security
- `Secure` flag in production (HTTPS only)
- `SameSite=Lax` prevents CSRF attacks while allowing OAuth
- `HttpOnly` NOT set (allows JavaScript access for token management)
- `path=/` scoped to entire application

## Troubleshooting

### Issue: User logged out unexpectedly

**Possible Causes:**
1. Refresh token expired (after 7+ days of inactivity)
2. Browser cache/localStorage cleared
3. Supabase project settings changed
4. Network issues during refresh attempt

**Solution:**
- User simply logs in again
- Session re-established
- Normal persistence resumes

### Issue: OAuth login fails

**Check:**
1. Azure AD redirect URLs configured correctly
2. Supabase OAuth settings include production domain
3. Cookies enabled in browser
4. No browser extensions blocking third-party cookies

### Issue: Session not persisting after browser restart

**Check:**
1. Browser not in "Incognito/Private" mode
2. Browser settings allow localStorage
3. Environment variables set correctly in production
4. Network connection stable during token refresh

## Browser Compatibility

**Tested and working:**
- ✅ Chrome/Edge (Chromium)
- ✅ Safari (macOS/iOS)
- ✅ Firefox
- ✅ Opera

**Known Issues:**
- ⚠️ Private/Incognito mode: Session NOT persisted (expected behavior)
- ⚠️ Brave (strict mode): May block cookies/localStorage (user must allow)

## Comparison with Other Apps

### Gmail/Google
- Similar behavior: stays logged in for weeks
- Uses OAuth2 refresh tokens
- Our implementation follows same pattern

### Microsoft 365
- Stays logged in "forever" with periodic refreshes
- Our hourly refresh mimics this behavior

### Banking Apps
- Shorter sessions (15-30 minutes) for security
- Our 7-30 day sessions appropriate for internal tool

## Summary

✅ **Users will stay logged in** - Both Microsoft OAuth and Email+Password
✅ **No repeated logins required** - Session persists across restarts
✅ **Automatic token refresh** - 3 layers of redundancy
✅ **Cross-browser compatible** - Works on all modern browsers
✅ **Secure** - Follows OAuth2 best practices

**Default Session Duration**: 7 days (can be extended to 30 days)
**Recommended Setting**: 30 days for internal lab personnel
**User Experience**: "Set it and forget it" - login once, stay logged in

---

*For questions or issues, contact: anderson@wolthers.com*
