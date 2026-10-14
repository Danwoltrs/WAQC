// src/lib/portal/team-names.ts
import type { SupabaseClient } from '@supabase/supabase-js'

/** How team routes name the people they log (one home for staff and portal routes). */

export async function selfName(admin: SupabaseClient<any>, userId: string): Promise<string> {
  const { data } = await admin.from('user_profiles').select('full_name, email').eq('id', userId).maybeSingle()
  return data?.full_name || data?.email || 'Your colleague'
}

export async function targetEmail(admin: SupabaseClient<any>, userId: string): Promise<string> {
  const { data } = await admin.from('user_profiles').select('email').eq('id', userId).maybeSingle()
  return data?.email ?? userId
}
