import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/samples/[id]/quality-spec
 * Get quality spec info for a sample, including whether validation rules exist
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

    const { id: sampleId } = await params

    // Get sample with quality spec and template info
    const { data: sample, error: sampleError } = await (supabase as any)
      .from('samples')
      .select(`
        id,
        quality_spec_id,
        quality_spec:client_qualities(
          id,
          custom_name,
          template:quality_templates(
            id,
            name,
            parameters
          )
        )
      `)
      .eq('id', sampleId)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({
        error: 'Sample not found'
      }, { status: 404 })
    }

    // Determine if quality spec has validation rules
    let hasValidationRules = false
    let qualitySpecName: string | null = null

    if (sample.quality_spec) {
      qualitySpecName = sample.quality_spec.custom_name || null

      if (sample.quality_spec.template) {
        const parameters = sample.quality_spec.template.parameters

        // Check if there are any validation rules defined
        if (parameters && typeof parameters === 'object') {
          hasValidationRules = Boolean(
            parameters.cupping_attributes ||
            parameters.defect_limits ||
            parameters.screen_sizes
          )
        }
      }
    }

    return NextResponse.json({
      has_validation_rules: hasValidationRules,
      quality_spec_name: qualitySpecName,
      quality_spec_id: sample.quality_spec_id
    })
  } catch (error) {
    console.error('Error in GET /api/samples/[id]/quality-spec:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
