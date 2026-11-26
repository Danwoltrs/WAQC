import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/database.types'
import { recordStaffVersion } from '@/lib/quality-spec/record-version'
import { loadSettingsLab } from '@/lib/qc-settings/user-lab'
import { canWriteLab, loadLabScope } from '@/lib/auth/lab-scope'
import { loadHqLabId } from '@/lib/qc-settings/lab-row'
import { makePrivateCopy, QUALITY_NOT_CREATED, removeCreatedQuality } from '@/lib/quality-spec/private-copy'

type ClientQuality = Database['public']['Tables']['client_qualities']['Row']
type ClientQualityInsert = Database['public']['Tables']['client_qualities']['Insert']
type ClientQualityUpdate = Database['public']['Tables']['client_qualities']['Update']

/**
 * GET /api/clients/[id]/quality-specifications
 * Get the quality specifications a laboratory holds for a client. The
 * laboratory is `?laboratory_id=` (the intake passes the sample's) or else the
 * user's own settings laboratory. A laboratory with none gets none, never
 * another laboratory's.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: clientId } = await params

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const labId = request.nextUrl.searchParams.get('laboratory_id')?.trim()
      || await loadSettingsLab(supabase as any, user.id)

    // Get active client quality specifications with template details
    const { data: specifications, error } = await supabase
      .from('client_qualities')
      .select(`
        *,
        template:quality_templates(*)
      `)
      .eq('client_id', clientId)
      .eq('laboratory_id', labId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching client quality specifications:', error)
      return NextResponse.json({
        error: 'Failed to fetch quality specifications'
      }, { status: 500 })
    }

    return NextResponse.json({ specifications })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/quality-specifications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/clients/[id]/quality-specifications
 * Assign a quality specification template to a client
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: clientId } = await params
    const body = await request.json()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate required fields
    if (!body.template_id) {
      return NextResponse.json({
        error: 'Missing required field: template_id'
      }, { status: 400 })
    }

    // A spec belongs to one laboratory. The intake names the sample's
    // (`laboratory_id`), which the user must be allowed to write in (their
    // own, HQ for a user with none, or any for a global admin); without one
    // it is the user's settings laboratory.
    const bodyLabId = typeof body.laboratory_id === 'string' ? body.laboratory_id.trim() : ''
    let labId: string
    if (bodyLabId) {
      const [scope, hqLabId] = await Promise.all([loadLabScope(supabase as any, user.id), loadHqLabId(supabase as any)])
      if (!canWriteLab(scope, bodyLabId, hqLabId)) {
        return NextResponse.json({
          error: 'A quality specification can only be made in your own laboratory'
        }, { status: 403 })
      }
      labId = bodyLabId
    } else {
      labId = await loadSettingsLab(supabase as any, user.id)
    }

    // Check if template exists
    const { data: template, error: templateError } = await supabase
      .from('quality_templates')
      .select('id')
      .eq('id', body.template_id)
      .single()

    if (templateError || !template) {
      return NextResponse.json({
        error: 'Invalid template_id: template not found'
      }, { status: 404 })
    }

    // Check for duplicate (same client, template, and origin). Each spec
    // reads a private copy, so a spec on a copy of this template counts too.
    let duplicateQuery = (supabase as any)
      .from('client_qualities')
      .select('id, template_id, template:quality_templates!client_qualities_template_id_fkey(template_parent_id)')
      .eq('client_id', clientId)
      .eq('laboratory_id', labId)

    if (body.origin) {
      duplicateQuery = duplicateQuery.eq('origin', body.origin)
    } else {
      duplicateQuery = duplicateQuery.is('origin', null)
    }

    const { data: held } = await duplicateQuery
    const existing = ((held ?? []) as Array<{ template_id: string | null; template?: { template_parent_id?: string | null } | null }>)
      .find((cq) => cq.template_id === body.template_id || cq.template?.template_parent_id === body.template_id)

    if (existing) {
      return NextResponse.json({
        error: 'This template is already assigned to this client' + (body.origin ? ` for origin: ${body.origin}` : '')
      }, { status: 409 })
    }

    // The spec reads its own private copy of the chosen template, on the spec's laboratory.
    let copy: { templateId: string; created: boolean }
    try {
      copy = await makePrivateCopy(supabase as any, body.template_id, { createdBy: user.id }, labId)
    } catch (err) {
      console.error('Error copying the template for a new quality specification:', err)
      return NextResponse.json({
        error: 'Failed to create quality specification',
        details: err instanceof Error ? err.message : String(err)
      }, { status: 500 })
    }

    // Prepare client quality data
    const qualityData: ClientQualityInsert = {
      client_id: clientId,
      laboratory_id: labId,
      template_id: copy.templateId,
      origin: body.origin || null,
      custom_parameters: body.custom_parameters || {},
      // The name and code the dialog asks for were dropped until 2026-09-29,
      // so a spec made for a contract's words ("15/16 FC") showed the
      // template's name instead.
      custom_name: typeof body.custom_name === 'string' && body.custom_name.trim() ? body.custom_name.trim() : null,
      quality_code: typeof body.quality_code === 'string' && body.quality_code.trim() ? body.quality_code.trim() : null,
      ...(typeof body.is_active === 'boolean' ? { is_active: body.is_active } : {}),
    }

    // Insert client quality specification
    const { data: specification, error: insertError } = await supabase
      .from('client_qualities')
      .insert(qualityData)
      .select(`
        *,
        template:quality_templates(*)
      `)
      .single()

    if (insertError) {
      await removeCreatedQuality(supabase as any, null, copy)
      console.error('Error creating client quality specification:', insertError)
      return NextResponse.json({
        error: 'Failed to create quality specification',
        details: insertError.message
      }, { status: 500 })
    }

    try {
      await recordStaffVersion([(specification as { id: string }).id], user.id, 'First version')
    } catch (err) {
      console.error('[POST /api/clients/[id]/quality-specifications] first version not recorded; create undone:', err)
      await removeCreatedQuality(supabase as any, (specification as { id: string }).id, copy)
      return NextResponse.json({ error: QUALITY_NOT_CREATED }, { status: 500 })
    }

    return NextResponse.json({ specification }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/clients/[id]/quality-specifications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
