import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * A service-role Supabase client for server code that must read past RLS,
 * e.g. the sys `contracts` table, which carries RESTRICTIVE deny policies.
 * Same env handling and options as `portalServiceClient` (qc-portal-gate.ts).
 * Server only: never import this from a client component.
 */
export function serviceRoleClient(): SupabaseClient<any> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role is not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
