import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/database.types'
import { recordStaffVersion } from '@/lib/quality-spec/record-version'
import { makePrivateCopy, QUALITY_NOT_CREATED, removeCreatedQuality } from '@/lib/quality-spec/private-copy'

type ClientQuality = Database['public']['Tables']['client_qualities']['Row']
type ClientQualityInsert = Database['public']['Tables']['client_qualities']['Insert']

/**
 * GET /api/client-qualities
 * List client quality assignments with optional filtering
 * Query params: client_id, template_id, origin, is_active
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const client_id = searchParams.get('client_id')
    const template_id = searchParams.get('template_id')
    const origin = searchParams.get('origin')
    const is_active = searchParams.get('is_active')

    // Build query
    let query = supabase
      .from('client_qualities')
      .select(`
        *,
        client:companies!client_qualities_client_id_fkey(id, name, fantasy_name, company:name),
        template:quality_templates(id, name, name_en, version, template_parent_id)
      `)
      .order('created_at', { ascending: false })

    // Apply filters
    if (client_id) query = query.eq('client_id', client_id)
    if (template_id) query = query.eq('template_id', template_id)
    if (origin) query = query.eq('origin', origin)
    if (is_active === 'true') query = query.eq('is_active', true)
    else if (is_active === 'false') query = query.eq('is_active', false)

    const { data: clientQualities, error } = await query

    if (error) {
      console.error('Error fetching client qualities:', error)
      return NextResponse.json({
        error: 'Failed to fetch client qualities',
        details: error.message,
        code: error.code,
        hint: error.hint
      }, { status: 500 })
    }

    return NextResponse.json({ client_qualities: clientQualities })
  } catch (error) {
    console.error('Error in GET /api/client-qualities:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/client-qualities
 * Assign a quality template to a client
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

    // Validate required fields
    if (!body.client_id || !body.template_id) {
      return NextResponse.json({
        error: 'Missing required fields: client_id, template_id'
      }, { status: 400 })
    }

    // Validate custom_name uniqueness for this client if provided
    if (body.custom_name) {
      const { data: existingName } = await supabase
        .from('client_qualities')
        .select('id')
        .eq('client_id', body.client_id)
        .eq('custom_name', body.custom_name.trim())
        .eq('is_active', true)
        .single()

      if (existingName) {
        return NextResponse.json({
          error: `Custom name "${body.custom_name.trim()}" is already in use for this client`
        }, { status: 400 })
      }
    }

    // Auto-populate description from template if not provided
    let description: string | null = null
    if (body.description) {
      description = typeof body.description === 'string'
        ? body.description.replace(/\.+$/, '')
        : body.description
    } else {
      const { data: template } = await supabase
        .from('quality_templates')
        .select('description')
        .eq('id', body.template_id)
        .single()

      if (template?.description) {
        description = template.description.replace(/\.+$/, '')
      }
    }

    // The quality reads its own private copy of the chosen template.
    let copy: { templateId: string; created: boolean }
    try {
      copy = await makePrivateCopy(supabase as any, body.template_id, { createdBy: user.id })
    } catch (err) {
      console.error('Error copying the template for a new client quality:', err)
      return NextResponse.json({
        error: 'Failed to create client quality',
        details: err instanceof Error ? err.message : String(err)
      }, { status: 500 })
    }

    // Prepare client quality data
    const clientQualityData: any = {
      client_id: body.client_id,
      template_id: copy.templateId,
      custom_parameters: body.custom_parameters || {},
      custom_name: body.custom_name || null,
      quality_code: body.quality_code || null,
      code_position: body.code_position || 'suffix',
      cups_per_sample: body.cups_per_sample || 10,
      is_active: body.is_active !== undefined ? body.is_active : true,
      notes: body.notes || null,
      fee_price: body.fee_price ?? null,
      fee_currency: body.fee_currency || null,
      fee_unit: body.fee_unit || null,
      description
    }

    // Insert client quality assignment
    const { data: clientQuality, error: insertError } = await supabase
      .from('client_qualities')
      .insert(clientQualityData)
      .select(`
        *,
        client:companies!client_qualities_client_id_fkey(id, name, company:name),
        template:quality_templates(id, name, version, parameters)
      `)
      .single()

    if (insertError) {
      await removeCreatedQuality(supabase as any, null, copy)
      console.error('Error creating client quality:', insertError)
      return NextResponse.json({
        error: 'Failed to create client quality',
        details: insertError.message
      }, { status: 500 })
    }

    // No version, no quality: a half-created one would be judged by no spec.
    try {
      await recordStaffVersion([(clientQuality as { id: string }).id], user.id, 'First version')
    } catch (err) {
      console.error('[POST /api/client-qualities] first version not recorded; create undone:', err)
      await removeCreatedQuality(supabase as any, (clientQuality as { id: string }).id, copy)
      return NextResponse.json({ error: QUALITY_NOT_CREATED }, { status: 500 })
    }

    return NextResponse.json({ client_quality: clientQuality }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/client-qualities:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
