import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/supabase'

type QualityTemplateInsert = Database['public']['Tables']['quality_templates']['Insert']

/**
 * POST /api/quality-templates/[id]/clone
 * Clone an existing quality template
 */
export async function POST(
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

    // Get the template to clone
    const { data: sourceTemplate, error: fetchError } = await supabase
      .from('quality_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !sourceTemplate) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Prepare cloned template data
    const clonedData: QualityTemplateInsert = {
      // Multi-language fields
      name_en: body.name_en || `${(sourceTemplate as any).name_en} (Copy)`,
      name_pt: body.name_pt || `${(sourceTemplate as any).name_pt} (Cópia)`,
      name_es: body.name_es || `${(sourceTemplate as any).name_es} (Copia)`,
      description_en: body.description_en || (sourceTemplate as any).description_en,
      description_pt: body.description_pt || (sourceTemplate as any).description_pt,
      description_es: body.description_es || (sourceTemplate as any).description_es,
      // Sample size
      sample_size_grams: body.sample_size_grams || (sourceTemplate as any).sample_size_grams || 300,
      // Template inheritance - set parent reference
      template_parent_id: id,
      // Lab/global sharing - inherit or customize
      laboratory_id: body.laboratory_id !== undefined ? body.laboratory_id : (sourceTemplate as any).laboratory_id,
      is_global: body.is_global !== undefined ? body.is_global : false,
      // Quality thresholds
      defect_thresholds_primary: (sourceTemplate as any).defect_thresholds_primary,
      defect_thresholds_secondary: (sourceTemplate as any).defect_thresholds_secondary,
      moisture_standard: (sourceTemplate as any).moisture_standard,
      // Cupping scale configuration
      cupping_scale_type: (sourceTemplate as any).cupping_scale_type,
      cupping_scale_min: (sourceTemplate as any).cupping_scale_min,
      cupping_scale_max: (sourceTemplate as any).cupping_scale_max,
      cupping_scale_increment: (sourceTemplate as any).cupping_scale_increment,
      // Taint/fault thresholds
      max_taints_allowed: (sourceTemplate as any).max_taints_allowed,
      max_faults_allowed: (sourceTemplate as any).max_faults_allowed,
      taint_fault_rule_type: (sourceTemplate as any).taint_fault_rule_type,
      // Screen size requirements
      screen_size_requirements: (sourceTemplate as any).screen_size_requirements,
      // Backward compatibility
      name: body.name_en || `${(sourceTemplate as any).name_en} (Copy)`,
      description: body.description_en || (sourceTemplate as any).description_en,
      version: 1,
      parameters: (sourceTemplate as any).parameters || {},
      created_by: user.id,
      is_active: body.is_active !== undefined ? body.is_active : true
    }

    // Insert cloned template
    const { data: clonedTemplate, error: insertError } = await supabase
      .from('quality_templates')
      // @ts-expect-error - Supabase type inference issue with insert
      .insert(clonedData)
      .select()
      .single()

    if (insertError) {
      console.error('Error cloning template:', insertError)
      return NextResponse.json({
        error: 'Failed to clone template',
        details: insertError.message
      }, { status: 500 })
    }

    // Create initial version record for cloned template
    await supabase
      .from('template_versions')
      // @ts-expect-error - Supabase type inference issue with insert
      .insert({
        template_id: (clonedTemplate as any).id,
        version_number: 1,
        parameters: (clonedTemplate as any).parameters,
        changes_description: `Cloned from template: ${(sourceTemplate as any).name_en}`,
        created_by: user.id
      })

    return NextResponse.json({ template: clonedTemplate }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/quality-templates/[id]/clone:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
