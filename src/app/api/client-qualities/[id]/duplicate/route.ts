import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

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

    // Build a unique "(copy)" name among the client's existing specs.
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

    // 1) Clone the template as a private client variant (copies every parameter
    //    field so the clone starts identical, then can diverge for this client).
    const clonedTemplate: Record<string, any> = {
      name_en: copyName,
      name_pt: copyName,
      name_es: copyName,
      description_en: tpl.description_en,
      description_pt: tpl.description_pt,
      description_es: tpl.description_es,
      sample_size_grams: tpl.sample_size_grams ?? 300,
      template_parent_id: tpl.id,
      is_client_variant: true,
      is_global: false,
      laboratory_id: tpl.laboratory_id ?? null,
      assigned_laboratories: tpl.assigned_laboratories ?? [],
      defect_thresholds_primary: tpl.defect_thresholds_primary,
      defect_thresholds_secondary: tpl.defect_thresholds_secondary,
      moisture_standard: tpl.moisture_standard,
      cupping_scale_type: tpl.cupping_scale_type,
      cupping_scale_min: tpl.cupping_scale_min,
      cupping_scale_max: tpl.cupping_scale_max,
      cupping_scale_increment: tpl.cupping_scale_increment,
      max_taints_allowed: tpl.max_taints_allowed,
      max_faults_allowed: tpl.max_faults_allowed,
      taint_fault_rule_type: tpl.taint_fault_rule_type,
      screen_size_requirements: tpl.screen_size_requirements,
      methodology: tpl.methodology ?? 'commodity',
      cva_min_score: tpl.cva_min_score ?? null,
      requires_descriptors: tpl.requires_descriptors ?? false,
      name: copyName,
      description: tpl.description_en || tpl.description || '',
      version: 1,
      parameters: tpl.parameters || {},
      created_by: user.id,
      is_active: true,
    }

    const { data: newTemplate, error: cloneError } = await (supabase as any)
      .from('quality_templates')
      .insert(clonedTemplate)
      .select()
      .single()

    if (cloneError || !newTemplate) {
      console.error('Error cloning template for variant:', cloneError)
      return NextResponse.json(
        { error: 'Failed to clone template', details: cloneError?.message },
        { status: 500 }
      )
    }

    // Initial version record for the clone (best-effort).
    await (supabase as any)
      .from('template_versions')
      .insert({
        template_id: newTemplate.id,
        version_number: 1,
        parameters: newTemplate.parameters,
        changes_description: `Client variant cloned from: ${tpl.name_en || tpl.name}`,
        created_by: user.id,
      })

    // 2) Create the new client quality spec pointing at the private clone.
    const { data: newSpec, error: specError } = await (supabase as any)
      .from('client_qualities')
      .insert({
        client_id: source.client_id,
        template_id: newTemplate.id,
        custom_name: copyName,
        quality_code: source.quality_code || null,
        code_position: source.code_position || 'suffix',
        cups_per_sample: source.cups_per_sample ?? 5,
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
      await (supabase as any).from('quality_templates').delete().eq('id', newTemplate.id)
      console.error('Error creating duplicated client quality:', specError)
      return NextResponse.json(
        { error: 'Failed to duplicate quality spec', details: specError?.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ client_quality: newSpec }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/client-qualities/[id]/duplicate:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
