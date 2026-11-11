import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/database.types'
import {
  CLIENT_QUALITY_SPEC_FIELDS,
  recordStaffVersion,
  specFieldsPresent,
  SPEC_VERSION_NOT_RECORDED,
  cancelledChangesForResponse,
} from '@/lib/quality-spec/record-version'
import { makePrivateCopy, removeCreatedQuality } from '@/lib/quality-spec/private-copy'

type ClientQualityUpdate = Database['public']['Tables']['client_qualities']['Update']

/**
 * GET /api/client-qualities/[id]
 * Get a single client quality assignment by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const { data: clientQuality, error } = await supabase
      .from('client_qualities')
      .select(`
        *,
        client:companies!client_qualities_client_id_fkey(id, name, company:name),
        template:quality_templates(id, name, version, parameters, methodology, cva_min_score, cupping_scale_min, cupping_scale_max)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Client quality not found' }, { status: 404 })
      }
      console.error('Error fetching client quality:', error)
      return NextResponse.json({ error: 'Failed to fetch client quality' }, { status: 500 })
    }

    return NextResponse.json({ client_quality: clientQuality })
  } catch (error) {
    console.error('Error in GET /api/client-qualities/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/client-qualities/[id]
 * Update a client quality assignment
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    // Check if exists and get client_id, and the template it reads now
    const { data: existing, error: fetchError } = await (supabase as any)
      .from('client_qualities')
      .select('id, client_id, quality_code, template_id')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Client quality not found' }, { status: 404 })
    }

    if (!existing.client_id) {
      return NextResponse.json({ error: 'Invalid client quality record' }, { status: 400 })
    }

    // Prepare update data
    const updateData: any = {}
    const allowedFields = ['template_id', 'custom_parameters', 'custom_name', 'quality_code', 'code_position', 'is_active', 'notes', 'fee_price', 'fee_currency', 'fee_unit', 'cups_per_sample', 'discrepancy_threshold', 'description']

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    if (updateData.description && typeof updateData.description === 'string') {
      updateData.description = updateData.description.replace(/\.+$/, '')
    }

    // A template change points the quality at a fresh private copy of the
    // chosen template, never at the template itself (its own copy is kept
    // when that is what was sent).
    let copy: { templateId: string; created: boolean } | null = null
    if (updateData.template_id && updateData.template_id !== existing.template_id) {
      try {
        copy = await makePrivateCopy(supabase as any, updateData.template_id, { createdBy: user.id, forClientQualityId: id })
      } catch (err) {
        console.error('Error copying the template for client quality:', err)
        return NextResponse.json({
          error: 'Failed to update client quality',
          details: err instanceof Error ? err.message : String(err)
        }, { status: 500 })
      }
      updateData.template_id = copy.templateId
    }

    // Update client quality
    const { data: clientQuality, error: updateError } = await supabase
      .from('client_qualities')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        client:companies!client_qualities_client_id_fkey(id, name, company:name),
        template:quality_templates(id, name, version, parameters)
      `)
      .single()

    if (updateError) {
      if (copy) await removeCreatedQuality(supabase as any, null, copy)
      console.error('Error updating client quality:', updateError)
      return NextResponse.json({
        error: 'Failed to update client quality',
        details: updateError.message
      }, { status: 500 })
    }

    // Any spec field named records a version (the RPC dedupes a save that
    // changed nothing); a quality with no template has no spec to version.
    let recorded: Awaited<ReturnType<typeof recordStaffVersion>> | undefined
    if (specFieldsPresent(updateData, CLIENT_QUALITY_SPEC_FIELDS) && (clientQuality as any)?.template_id) {
      try {
        recorded = await recordStaffVersion([id], user.id)
      } catch (err) {
        console.error('[PATCH /api/client-qualities/[id]] spec version not recorded:', err)
        return NextResponse.json({ error: SPEC_VERSION_NOT_RECORDED }, { status: 500 })
      }
    }

    return NextResponse.json({ client_quality: clientQuality, cancelledClientChanges: cancelledChangesForResponse(recorded) })
  } catch (error) {
    console.error('Error in PATCH /api/client-qualities/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/client-qualities/[id]
 * Delete or deactivate a client quality assignment
 * If the quality spec is in use by samples, it will be deactivated instead of deleted
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Check if quality spec is in use by samples
    const { count } = await supabase
      .from('samples')
      .select('*', { count: 'exact', head: true })
      .eq('quality_spec_id', id)

    if (count && count > 0) {
      // Deactivate instead of delete to preserve data integrity
      const { error: updateError } = await supabase
        .from('client_qualities')
        .update({ is_active: false })
        .eq('id', id)

      if (updateError) {
        console.error('Error deactivating client quality:', updateError)
        return NextResponse.json({
          error: 'Failed to deactivate quality specification',
          details: updateError.message
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        deactivated: true,
        message: `Quality specification has been deactivated (${count} sample(s) still using it)`
      })
    }

    // Delete client quality if no samples are using it
    const { error: deleteError } = await supabase
      .from('client_qualities')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting client quality:', deleteError)
      return NextResponse.json({
        error: 'Failed to delete client quality',
        details: deleteError.message
      }, { status: 500 })
    }

    return NextResponse.json({ success: true, deleted: true })
  } catch (error) {
    console.error('Error in DELETE /api/client-qualities/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
