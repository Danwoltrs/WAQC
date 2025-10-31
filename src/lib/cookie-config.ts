/**
 * Unified cookie configuration for Supabase authentication
 *
 * This ensures consistent cookie handling across:
 * - Client-side browser (supabase.ts)
 * - Server-side components (supabase-server.ts)
 * - Next.js middleware (middleware.ts)
 *
 * Critical for session persistence in production environments
 */

export const COOKIE_OPTIONS = {
  /**
   * Cookie path - must be '/' for site-wide access
   */
  path: '/',

  /**
   * SameSite attribute for CSRF protection
   * - 'lax': Best for OAuth flows, allows cookies on top-level navigation
   * - 'strict': More secure but breaks OAuth redirects
   * - 'none': Requires secure=true, used for cross-site requests
   */
  sameSite: 'lax' as const,

  /**
   * Secure flag - only send over HTTPS
   * Must be true in production, can be false in development (http://localhost)
   */
  secure: process.env.NODE_ENV === 'production',

  /**
   * Max age in seconds - 30 days (matches Supabase session duration)
   * This is critical for "Remember Me" functionality
   */
  maxAge: 60 * 60 * 24 * 30, // 30 days

  /**
   * HttpOnly flag - prevents JavaScript access (security measure)
   * Note: Supabase SDK needs access to auth cookies, so this is false
   */
  httpOnly: false,
}

/**
 * Session timeout configuration
 */
export const SESSION_CONFIG = {
  /**
   * Timeout for getSession() calls (milliseconds)
   * Increased to 15s for production environments with slower connections
   */
  getSessionTimeout: 15000,

  /**
   * Number of retry attempts for failed session fetches
   */
  retryAttempts: 3,

  /**
   * Base delay for exponential backoff (milliseconds)
   * Actual delay = baseDelay * 2^(attempt - 1)
   * - Attempt 1: immediate
   * - Attempt 2: 1000ms
   * - Attempt 3: 2000ms
   * - Attempt 4: 4000ms
   */
  retryBaseDelay: 1000,
}
