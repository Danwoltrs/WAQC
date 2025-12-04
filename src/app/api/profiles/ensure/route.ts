import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import type { Database } from '@/lib/database.types'

/**
 * POST /api/profiles/ensure
 *
 * Ensures a profile exists for the authenticated user.
 * Uses service role to bypass RLS policies.
 * This is called as a fallback when the database trigger didn't create a profile.
 */
export async function POST(request: NextRequest) {
  try {
    // Get the authenticated user from the request
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Create admin client to bypass RLS
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Check if profile already exists
    const { data: existingProfile, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, qc_role, qc_enabled, is_global_admin, laboratory_id')
      .eq('id', user.id)
      .single()

    if (existingProfile) {
      // Profile exists, return it
      return NextResponse.json({
        success: true,
        profile: existingProfile,
        created: false
      })
    }

    // Profile doesn't exist, create it
    console.log('[API] Creating profile for user:', user.id, user.email)

    // Check for pending invitation
    const { data: invitation } = await supabaseAdmin
      .from('user_invitations')
      .select('*')
      .ilike('email', user.email || '')
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Get default laboratory
    const { data: defaultLab } = await supabaseAdmin
      .from('laboratories')
      .select('id')
      .eq('code', 'SANTOS_HQ')
      .single()

    const isWolthersEmail = user.email?.endsWith('@wolthers.com') || false
    const isGlobalAdmin = ['daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com'].includes(user.email || '')

    let profileData: any

    if (invitation) {
      // Create profile from invitation
      const inv = invitation as any
      profileData = {
        id: user.id,
        email: user.email || '',
        first_name: inv.first_name || '',
        last_name: inv.last_name || '',
        full_name: `${inv.first_name || ''} ${inv.last_name || ''}`.trim() || user.email?.split('@')[0] || 'User',
        qc_role: inv.qc_role || 'lab_personnel',
        qc_enabled: inv.qc_enabled ?? true,
        is_cupper: inv.is_cupper ?? false,
        is_q_grader: inv.is_q_grader ?? false,
        is_global_admin: inv.qc_role === 'global_admin' || inv.qc_role === 'global_quality_admin',
        laboratory_id: inv.laboratory_id || defaultLab?.id || null,
      }

      // Mark invitation as accepted
      await supabaseAdmin
        .from('user_invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', inv.id)
    } else {
      // Create basic profile
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User'
      const nameParts = fullName.split(' ')

      profileData = {
        id: user.id,
        email: user.email || '',
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || '',
        full_name: fullName,
        qc_role: isGlobalAdmin ? 'global_admin' : 'lab_personnel',
        qc_enabled: isWolthersEmail,
        is_global_admin: isGlobalAdmin,
        laboratory_id: isWolthersEmail ? (defaultLab?.id || null) : null,
      }
    }

    const { data: newProfile, error: insertError } = await supabaseAdmin
      .from('profiles')
      .insert(profileData)
      .select('id, email, full_name, qc_role, qc_enabled, is_global_admin, laboratory_id')
      .single()

    if (insertError) {
      // Check if it's a duplicate key error (profile was created by trigger)
      if (insertError.code === '23505') {
        // Fetch the existing profile
        const { data: existingProfile } = await supabaseAdmin
          .from('profiles')
          .select('id, email, full_name, qc_role, qc_enabled, is_global_admin, laboratory_id')
          .eq('id', user.id)
          .single()

        if (existingProfile) {
          return NextResponse.json({
            success: true,
            profile: existingProfile,
            created: false
          })
        }
      }

      console.error('[API] Error creating profile:', insertError)
      return NextResponse.json(
        { error: 'Failed to create profile', details: insertError.message },
        { status: 500 }
      )
    }

    console.log('[API] Profile created successfully:', newProfile?.id)

    return NextResponse.json({
      success: true,
      profile: newProfile,
      created: true
    })

  } catch (error: any) {
    console.error('[API] Error in ensure profile:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
