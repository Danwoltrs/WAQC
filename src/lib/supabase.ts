import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Use SSR-compatible browser client with explicit configuration
// This ensures compatibility across all browsers (Chrome, Edge, Safari, Firefox)
export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'wolthers-qc-auth',
  },
  global: {
    headers: {
      'X-Client-Info': 'wolthers-qc-web',
    },
  },
  db: {
    schema: 'public',
  },
  // Increase default timeout to handle slower connections
  realtime: {
    timeout: 30000,
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
