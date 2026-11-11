import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { recordStaffVersion } from '@/lib/quality-spec/record-version'
import { makePrivateCopy, QUALITY_NOT_CREATED, removeCreatedQuality } from '@/lib/quality-spec/private-copy'

/**
 * POST /api/client-qualities/[id]/duplicate
 *
 * Duplicate a client quality spec into an INDEPENDENT copy for the same client.
 * The copy gets its own private clone of the template (is_client_variant = true,
 * hidden from the global template pickers), so its quality parameters can be
 * edited for this one client without affecting the original template or any
 * other client. Assignment fields (code, cups, fee, description, notes) are
 * copied too; the name gets a unique "(copy)" suffix.
 *
 * The intake's "New quality specification" dialog edits the copy before it
 * exists, so the body may carry (both optional):
 *   custom_name  the copy's name ("15/16 FC"); 409 when the client already
 *                has a specification of that name
 *   template     edited template fields (parameters, description_en,
 *                methodology, cva_min_score, requires_descriptors), applied
 *                to the clone as it is inserted, so a failure never leaves an
 *                unedited copy
 *
 * Returns { client_quality } — the new spec, with its template relation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const askedName = typeof body?.custom_name === 'string' ? body.custom_name.trim() : ''
    const edits = body?.template && typeof body.template === 'object' ? body.template : {}
    if (edits.parameters !== undefined && (!edits.parameters || typeof edits.parameters !== 'object' || Array.isArray(edits.parameters))) {
      return NextResponse.json({ error: 'Parameters must be an object' }, { status: 400 })
    }

    // Source spec + its full template
    const { data: source, error: sourceError } = await (supabase as any)
      .from('client_qualities')
      .select('*, template:quality_templates(*)')
      .eq('id', id)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ error: 'Quality spec not found' }, { status: 404 })
    }

    const tpl = source.template
    if (!tpl) {
      return NextResponse.json({ error: 'Source template not found' }, { status: 404 })
    }

    // A name the caller asked for must be free; otherwise build a unique
    // "(copy)" name among the client's existing specs.
    const { data: siblings } = await (supabase as any)
      .from('client_qualities')
      .select('custom_name, template:quality_templates(name)')
      .eq('client_id', source.client_id)
    const used = new Set<string>(
      (siblings || []).map((s: any) => (s.custom_name || s.template?.name || '').toLowerCase())
    )
    const baseName = source.custom_name || tpl.name_en || tpl.name || 'Quality'
    let copyName = `${baseName} (copy)`
    let n = 2
    while (used.has(copyName.toLowerCase())) copyName = `${baseName} (copy ${n++})`
    if (askedName) {
      if (used.has(askedName.toLowerCase())) {
        return NextResponse.json(
          { error: `This client already has a specification named "${askedName}"` },
          { status: 409 }
        )
      }
      copyName = askedName
    }
    const parameters = edits.parameters ?? tpl.parameters ?? {}
    const description = typeof edits.description_en === 'string' ? edits.description_en : undefined
    const methodology = edits.methodology === 'cva' || edits.methodology === 'commodity' ? edits.methodology : undefined

    // 1) Clone the template as a private client variant (every parameter
    //    field, so the clone starts identical, then can diverge for this client).
    let copy: { templateId: string; created: boolean }
    try {
      copy = await makePrivateCopy(supabase as any, tpl.id, {
        name: copyName,
        parameters,
        description,
        methodology,
        ...(edits.cva_min_score !== undefined ? { cva_min_score: edits.cva_min_score } : {}),
        ...(edits.requires_descriptors !== undefined ? { requires_descriptors: !!edits.requires_descriptors } : {}),
        createdBy: user.id,
      })
    } catch (err) {
      console.error('Error cloning template for variant:', err)
      return NextResponse.json(
        { error: 'Failed to clone template', details: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      )
    }

    // 2) Create the new client quality spec pointing at the private clone.
    const { data: newSpec, error: specError } = await (supabase as any)
      .from('client_qualities')
      .insert({
        client_id: source.client_id,
        template_id: copy.templateId,
        custom_name: copyName,
        quality_code: source.quality_code || null,
        code_position: source.code_position || 'suffix',
        cups_per_sample: source.cups_per_sample ?? 5,
        discrepancy_threshold: source.discrepancy_threshold ?? null,
        description: source.description || null,
        notes: source.notes || null,
        custom_parameters: source.custom_parameters || {},
        fee_price: source.fee_price ?? null,
        fee_currency: source.fee_currency || null,
        fee_unit: source.fee_unit || null,
        is_active: true,
      })
      .select('*, template:quality_templates(id, name, version)')
      .single()

    if (specError || !newSpec) {
      // Roll back the orphaned clone so we don't leak a hidden template.
      await removeCreatedQuality(supabase as any, null, copy)
      console.error('Error creating duplicated client quality:', specError)
      return NextResponse.json(
        { error: 'Failed to duplicate quality spec', details: specError?.message },
        { status: 500 }
      )
    }

    try {
      await recordStaffVersion([newSpec.id], user.id, 'First version')
    } catch (err) {
      console.error('[POST /api/client-qualities/[id]/duplicate] first version not recorded; create undone:', err)
      await removeCreatedQuality(supabase as any, newSpec.id, copy)
      return NextResponse.json({ error: QUALITY_NOT_CREATED }, { status: 500 })
    }

    return NextResponse.json({ client_quality: newSpec }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/client-qualities/[id]/duplicate:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
