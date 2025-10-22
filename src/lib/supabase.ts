import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Use SSR-compatible browser client that stores auth in cookies
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

export type Laboratory = {
  id: string
  name: string
  location: string
  type: 'hq' | 'regional' | 'third_party'
  address: string
  storage_config?: StorageConfiguration
  created_at: string
  updated_at: string
}

export type StorageConfiguration = {
  shelves: number
  columns_per_shelf: number
  rows_per_shelf: number
  tins_per_position: number
  naming_pattern: string
  total_positions: number
