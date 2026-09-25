/**
 * Server-only service-role Supabase client, or null when the environment is
 * not configured (tests, local renders). Used for reads RLS deliberately
 * closes to users — e.g. a lot's issued values, whose table has no read policy.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function serviceRoleClient(): SupabaseClient<any> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
