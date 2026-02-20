import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// createBrowserClient handles cookie-based session storage automatically
// No custom cookies config needed - the library handles cross-browser compatibility
export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)

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
