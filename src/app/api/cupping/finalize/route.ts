import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Create admin client with service role key (bypasses RLS)
const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

/**
 * POST /api/cupping/finalize
 * Finalize cupping scores for a session:
 * 1. Update session status to 'completed'
 * 2. Update sample workflow_stage to 'certified' or 'rejected'
 * 3. Create certificate record for approved samples
 *
 * Body: {
 *   session_id: string,
 *   sample_id: string,
 *   decision: 'approved' | 'rejected',
 *   notes?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { session_id, sample_id, decision, notes } = body

    if (!session_id || !sample_id || !decision) {
      return NextResponse.json({
        error: 'session_id, sample_id, and decision are required'
      }, { status: 400 })
    }

    if (!['approved', 'rejected'].includes(decision)) {
      return NextResponse.json({
        error: 'decision must be either "approved" or "rejected"'
      }, { status: 400 })
    }

    // Get user profile for permission check
    const { data: profile, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('id, is_master_cupper, is_global_admin, is_q_grader, qc_role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get the session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('cupping_sessions')
      .select('*')
      .eq('id', session_id)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Verify sample is in session
    if (!session.sample_ids?.includes(sample_id)) {
      return NextResponse.json({
        error: 'Sample is not part of this session'
      }, { status: 400 })
    }

    // Permission check: must be master cupper, Q-grader, or global admin
    const canFinalize = profile.is_global_admin ||
                        profile.is_master_cupper ||
                        profile.is_q_grader ||
                        session.cupper_ids?.includes(user.id)

    if (!canFinalize) {
      return NextResponse.json({
        error: 'You do not have permission to finalize this session'
      }, { status: 403 })
    }

    // Get the sample
    const { data: sample, error: sampleError } = await supabaseAdmin
      .from('samples')
      .select('id, tracking_number, client_id, workflow_stage, status')
      .eq('id', sample_id)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Determine workflow_stage based on decision
    const newWorkflowStage = decision === 'approved' ? 'certified' : 'rejected'

    // Update sample status and workflow_stage
    const { error: sampleUpdateError } = await supabaseAdmin
      .from('samples')
      .update({
        status: decision,
        workflow_stage: newWorkflowStage,
        updated_at: new Date().toISOString()
      })
      .eq('id', sample_id)

    if (sampleUpdateError) {
      console.error('Error updating sample:', sampleUpdateError)
      return NextResponse.json({
        error: 'Failed to update sample status',
        details: sampleUpdateError.message
      }, { status: 500 })
    }

    // Create certificate for approved samples
    let certificate = null
    if (decision === 'approved') {
      // Check if certificate already exists
      const { data: existingCert } = await supabaseAdmin
        .from('certificates')
        .select('id, certificate_number')
        .eq('sample_id', sample_id)
        .single()

      if (!existingCert) {
        // Generate certificate number
        const certificateNumber = await generateCertificateNumber()

        // Get client info for issued_to
        const { data: client } = await supabaseAdmin
          .from('clients')
          .select('name, company, fantasy_name')
          .eq('id', sample.client_id)
          .single()

        const issuedTo = client?.fantasy_name || client?.company || client?.name || 'Unknown Client'

        // Create certificate
        const { data: newCert, error: certError } = await supabaseAdmin
          .from('certificates')
          .insert({
            sample_id: sample_id,
            certificate_number: certificateNumber,
            issued_to: issuedTo,
            issued_by: user.id,
            status: 'issued',
          })
          .select('id, certificate_number, created_at')
          .single()

        if (certError) {
          console.error('Error creating certificate:', certError)
          // Don't fail the entire request, just log the error
        } else {
          certificate = newCert
        }
      } else {
        certificate = existingCert
      }
    }

    // Check if all samples in session are finalized
    const remainingSamples = session.sample_ids.filter((id: string) => id !== sample_id)
    let allFinalized = true

    if (remainingSamples.length > 0) {
      const { data: otherSamples } = await supabaseAdmin
        .from('samples')
        .select('id, workflow_stage')
        .in('id', remainingSamples)

      allFinalized = otherSamples?.every(
        (s: any) => s.workflow_stage === 'certified' || s.workflow_stage === 'rejected'
      ) || false
    }

    // Update session status if all samples are finalized
    if (allFinalized) {
      const { error: sessionUpdateError } = await supabaseAdmin
        .from('cupping_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', session_id)

      if (sessionUpdateError) {
        console.error('Error updating session status:', sessionUpdateError)
      }
    }

    // Log to audit trail
    try {
      await supabaseAdmin
        .from('cupping_audit_log')
        .insert({
          session_id,
          sample_id,
          action: 'finalized',
          performed_by: user.id,
          details: {
            decision,
            notes,
            certificate_number: certificate?.certificate_number,
            finalized_at: new Date().toISOString()
          },
          laboratory_id: session.laboratory_id
        })
    } catch (auditError) {
      console.error('Error logging audit:', auditError)
    }

    return NextResponse.json({
      success: true,
      message: `Sample ${decision === 'approved' ? 'approved and certified' : 'rejected'}`,
      sample: {
        id: sample_id,
        tracking_number: sample.tracking_number,
        status: decision,
        workflow_stage: newWorkflowStage
      },
      certificate,
      session_completed: allFinalized
    })
  } catch (error) {
    console.error('Error in POST /api/cupping/finalize:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Generate a unique certificate number
 * Format: WAQC-YYYY-NNNNNN (e.g., WAQC-2024-000001)
 */
async function generateCertificateNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `WAQC-${year}-`

  // Get the latest certificate number for this year
  const { data: latestCert } = await supabaseAdmin
    .from('certificates')
    .select('certificate_number')
    .like('certificate_number', `${prefix}%`)
    .order('certificate_number', { ascending: false })
    .limit(1)
    .single()

  let nextNumber = 1
  if (latestCert?.certificate_number) {
    const match = latestCert.certificate_number.match(/WAQC-\d{4}-(\d+)/)
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1
    }
  }

  return `${prefix}${nextNumber.toString().padStart(6, '0')}`
}
