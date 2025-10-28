import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Use SSR-compatible browser client with explicit cookie configuration
// This ensures cross-browser compatibility (Chrome, Safari, Edge, Firefox)
export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Use local storage for persistent sessions across browser restarts
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    // Automatically refresh session when user becomes active
    autoRefreshToken: true,
    // Persist session even if user closes browser
    persistSession: true,
    // Detect when user becomes active to refresh session
    detectSessionInUrl: true,
  },
  cookies: {
    get(name: string) {
      // Use document.cookie for client-side cookie access
      if (typeof document === 'undefined') return undefined
      const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'))
      return match ? decodeURIComponent(match[3]) : undefined
    },
    set(name: string, value: string, options: any) {
      // Use document.cookie for client-side cookie setting
      if (typeof document === 'undefined') return

      // Build cookie string with proper attributes for cross-browser compatibility
      const cookieOptions = {
        ...options,
        path: options?.path || '/',
        sameSite: options?.sameSite || 'lax', // 'lax' is better for OAuth flows than 'strict'
        secure: typeof window !== 'undefined' ? window.location.protocol === 'https:' : true,
      }

      let cookieString = `${name}=${encodeURIComponent(value)}`
      cookieString += `; path=${cookieOptions.path}`
      cookieString += `; SameSite=${cookieOptions.sameSite}`

      if (cookieOptions.secure) {
        cookieString += '; Secure'
      }

      if (cookieOptions.maxAge) {
        cookieString += `; Max-Age=${cookieOptions.maxAge}`
      } else if (cookieOptions.expires) {
        cookieString += `; Expires=${new Date(cookieOptions.expires).toUTCString()}`
      }

      if (cookieOptions.domain) {
        cookieString += `; Domain=${cookieOptions.domain}`
      }

      document.cookie = cookieString
    },
    remove(name: string, options: any) {
      // Remove cookie by setting expiration to past date
      if (typeof document === 'undefined') return

      const cookieOptions = {
        ...options,
        path: options?.path || '/',
      }

      let cookieString = `${name}=; path=${cookieOptions.path}; expires=Thu, 01 Jan 1970 00:00:00 GMT`

      if (cookieOptions.domain) {
        cookieString += `; Domain=${cookieOptions.domain}`
      }

      document.cookie = cookieString
    },
  },
})

// Re-export Database type for convenience
export type { Database } from './database.types'

// User roles for the coffee QC system
export type UserRole =
  | 'lab_personnel'
  | 'lab_finance_manager'
  | 'lab_quality_manager'
  | 'santos_hq_finance'
  | 'global_finance_admin'
  | 'global_quality_admin'
  | 'global_admin'
  | 'client'
  | 'supplier'
  | 'buyer'
