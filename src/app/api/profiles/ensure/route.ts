import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { ensureWaqcProfile } from '@/lib/auth/ensure-profile'

/**
 * POST /api/profiles/ensure
 *
 * Fallback when the sign-up trigger did not create a profile. Applies the
 * shared rule (src/lib/auth/new-profile.ts): clients and strangers get none,
 * and the answer is then `{ success: true, profile: null }`.
 */
export async function POST() {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { profile, created } = await ensureWaqcProfile(supabaseAdmin, user)
    return NextResponse.json({ success: true, profile, created })
  } catch (error: any) {
    console.error('[API] profiles/ensure failed:', error)
    return NextResponse.json({ error: 'Failed to ensure profile' }, { status: 500 })
  }
}
