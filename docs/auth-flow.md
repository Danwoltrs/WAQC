# Authentication Flow Documentation

This document describes the authentication and profile-loading flow in the WAQC application.

## Supported Authentication Methods

### 1. Microsoft OAuth (MS Entra / Azure AD)

Users can sign in with their Microsoft work or school accounts.

**Flow:**
1. User clicks "Continue with Microsoft" on the login form
2. Supabase redirects to Microsoft login
3. After successful Microsoft login, user is redirected to `/auth/callback`
4. The callback route exchanges the authorization code for a Supabase session
5. If the user doesn't have a profile, one is created from invitation data or user metadata
6. User is redirected to the dashboard

### 2. Email/Password

Users can sign in with email and password.

**Flow:**
1. User enters email address
2. User enters password
3. Supabase validates credentials and creates a session
4. The AuthProvider detects the session and fetches the user profile
5. User sees the dashboard

## Profile Loading

After successful authentication, the application loads the user's profile from the `profiles` table.

### Profile Fetch Strategy

1. **Single attempt with 10-second timeout** - No retries to avoid noisy logs
2. **Immediate API fallback** - If the direct Supabase query fails, immediately try `/api/profiles/ensure`
3. **Temporary profile fallback** - If all fetches fail, create a minimal temporary profile so the user can access the dashboard

### Profile Caching

- Profiles are cached in localStorage for 24 hours
- On page load, if a cached profile exists and auth tokens are present, the app skips the loading screen
- This prevents the "flash of loading screen" on page refresh

## Session Management

### Token Refresh

- Sessions are automatically refreshed 5 minutes before expiry
- A backup hourly refresh maintains 30-day session persistence
- When user returns to a tab after being away >5 minutes, the session is refreshed

### Session Persistence

- Sessions are stored in localStorage via Supabase's SSR client
- Cookies are also set for server-side access
- Sessions persist across browser restarts

## Timeout Configuration

All timeout values are centralized in the auth-provider:

| Operation | Timeout | Location |
|-----------|---------|----------|
| Session fetch | 10s | `getSession()` in auth-provider.tsx |
| Profile fetch | 10s | `fetchProfile()` in auth-provider.tsx |
| Auth callback profile creation | 10s | `/auth/callback/route.ts` |
| Absolute max auth initialization | 20s | `absoluteMaxTimeout` in auth-provider.tsx |
| getUser fallback | 2s | `fetchProfile()` fallback path |

## Key Files

| File | Purpose |
|------|---------|
| `src/components/providers/auth-provider.tsx` | Main auth context, profile loading, session management |
| `src/app/auth/callback/route.ts` | OAuth callback handler, profile creation |
| `src/app/api/profiles/ensure/route.ts` | API endpoint to create/fetch profile (bypasses RLS) |
| `src/lib/supabase.ts` | Browser-side Supabase client configuration |
| `src/lib/supabase-server.ts` | Server-side Supabase client factory |
| `middleware.ts` | Next.js middleware for cookie management |

## Debugging Tips

### Common Issues

1. **Stuck on loading screen**
   - Check browser console for errors
   - Try running `window.clearWAQCSession()` in console and refresh

2. **Profile not loading**
   - Check that the profile exists in the `profiles` table
   - Verify RLS policies allow the user to read their profile

3. **OAuth redirect fails**
   - Check that the redirect URL is configured in Supabase and Azure AD
   - Verify the `NEXT_PUBLIC_SUPABASE_URL` environment variable

### Console Utilities

- `window.clearWAQCSession()` - Clears all session data and profile cache. Use when authentication is broken.

## Error Handling

- **Network errors**: Display a dedicated network error screen with retry button
- **Profile not found**: Automatically create a profile via the `/api/profiles/ensure` endpoint
- **Timeout errors**: Fall back to temporary profile so user can still access the app

## Role-Based Access

After profile load, permissions are calculated based on:
- `qc_role` from the profile (e.g., `lab_personnel`, `global_admin`)
- `laboratory_id` and laboratory type

Users without `qc_enabled` see a message explaining how to request access.
