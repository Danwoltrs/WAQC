# Authentication & Session Persistence Fixes

## Issues Identified

### 1. Session Timeout (5 seconds is too short)
**Files affected:**
- `src/components/providers/auth-provider.tsx` (lines 197-204)
- `middleware.ts` (lines 84-92)

**Problem:** Production environments, especially with slower network conditions, cannot complete authentication within 5 seconds.

### 2. Cookie Configuration Mismatch
**Files affected:**
- `src/lib/supabase.ts` (client-side)
- `src/lib/supabase-server.ts` (server-side)
- `middleware.ts` (cookie handling)

**Problem:** Inconsistent cookie handling between client and server causes session state to not sync properly.

### 3. Race Condition in OAuth Flow
**File affected:**
- `src/components/auth/login-form.tsx` (lines 24-110)

**Problem:** AuthProvider checks for session before OAuth flow completes and cookies are set.

### 4. Middleware Blocking on Auth Check
**File affected:**
- `middleware.ts` (lines 82-93)

**Problem:** Every request waits for auth check, which times out and causes cascading failures.

## Recommended Fixes

### Fix 1: Increase Timeouts
```typescript
// auth-provider.tsx line 200
const result = await withTimeout(
  async () => await supabase.auth.getSession(),
  15000, // Increase from 5000 to 15000 (15 seconds)
  'Session fetch timeout'
)

// middleware.ts line 86
const timeoutPromise = new Promise<any>((_, reject) =>
  setTimeout(() => reject(new Error('Auth check timeout')), 15000) // Increase from 5000 to 15000
)
```

### Fix 2: Unified Cookie Handling
Create a single source of truth for cookie configuration:

```typescript
// src/lib/cookie-config.ts (NEW FILE)
export const COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 30, // 30 days
}
```

Use this in both client and server Supabase instances.

### Fix 3: Add OAuth Callback Route
Instead of handling OAuth in the login form component, create a dedicated callback route:

```typescript
// src/app/auth/callback-ms/route.ts (NEW FILE)
// This handles the MS OAuth redirect separately from the login page
// Sets cookies properly before redirecting to dashboard
```

### Fix 4: Remove Blocking Auth Check from Middleware
```typescript
// middleware.ts - Make auth check non-blocking
await Promise.race([userPromise, timeoutPromise]).catch((err) => {
  console.warn('Middleware auth check failed:', err.message)
  // Don't block - let the request proceed
})

// Always return response, don't wait for auth
return response
```

### Fix 5: Add Retry Logic to Auth Provider
```typescript
// auth-provider.tsx
const getSession = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await withTimeout(...)
      return result
    } catch (err) {
      if (i === retries - 1) throw err
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
}
```

## Priority Order

1. **HIGH**: Fix 1 (Increase timeouts) - Immediate relief
2. **HIGH**: Fix 4 (Non-blocking middleware) - Prevents cascading failures
3. **MEDIUM**: Fix 5 (Retry logic) - Improves reliability
4. **MEDIUM**: Fix 2 (Unified cookies) - Long-term stability
5. **LOW**: Fix 3 (Callback route) - Better architecture but optional

## Testing Plan

1. Test email+password login
2. Test MS OAuth login
3. Test session persistence after page refresh
4. Test session persistence after browser close/reopen
5. Test with slow network (throttle to 3G)
6. Test in production environment

## Rollback Plan

If fixes cause issues:
1. Revert timeout increases first
2. Check error logs for new error patterns
3. Verify cookies are being set correctly (check browser DevTools)
4. Confirm Supabase project settings match environment variables
