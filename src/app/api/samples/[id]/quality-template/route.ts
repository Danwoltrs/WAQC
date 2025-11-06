import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/samples/[id]/quality-template
 * Get the quality template for a sample's cupping session
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

    // Fetch sample with quality specification and template
    const { data: sample, error: sampleError } = await supabase
      .from('samples')
      .select(`
        id,
        tracking_number,
        sample_type,
        origin,
        quality_spec_id,
        quality_specifications!quality_spec_id (
          id,
          template_id,
          custom_parameters,
          quality_templates!template_id (
            id,
            name,
            parameters,
            cupping_discrepancy_threshold
          )
        )
      `)
      .eq('id', sampleId)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json(
        { error: 'Sample not found' },
        { status: 404 }
      )
    }

    // Extract template data
    const qualitySpec = sample.quality_specifications as any
    const template = qualitySpec?.quality_templates as any

    if (!qualitySpec || !template) {
      return NextResponse.json(
        { error: 'No quality template assigned to this sample' },
        { status: 404 }
      )
    }

    const customParams = qualitySpec.custom_parameters || {}
    const templateParams = template.parameters || {}

    // Extract cupping attributes with abbreviations
    let cuppingAttributes = []

    // Priority 1: custom_parameters.cupping_attributes (with abbreviations)
    if (customParams.cupping_attributes && Array.isArray(customParams.cupping_attributes)) {
      cuppingAttributes = customParams.cupping_attributes
    }
    // Priority 2: template.parameters.cupping_attributes
    else if (templateParams.cupping_attributes && Array.isArray(templateParams.cupping_attributes)) {
      cuppingAttributes = templateParams.cupping_attributes
    }
    // Priority 3: custom_parameters.attributes (legacy format)
    else if (customParams.attributes && Array.isArray(customParams.attributes)) {
      cuppingAttributes = customParams.attributes.map((attr: any) =>
        typeof attr === 'string' ? { attribute: attr } : attr
      )
    }
    // Priority 4: template.parameters.attributes (legacy)
    else if (templateParams.attributes && Array.isArray(templateParams.attributes)) {
      cuppingAttributes = templateParams.attributes.map((attr: any) =>
        typeof attr === 'string' ? { attribute: attr } : attr
      )
    }
    // Fallback: Default SCA attributes
    else {
      cuppingAttributes = [
        { attribute: 'Fragrance/Aroma', scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 }, abbreviation: 'Frag' },
        { attribute: 'Flavor', scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 }, abbreviation: 'Flav' },
        { attribute: 'Aftertaste', scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 }, abbreviation: 'Aftr' },
        { attribute: 'Acidity', scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 }, abbreviation: 'Acid' },
        { attribute: 'Body', scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 }, abbreviation: 'Body' },
        { attribute: 'Balance', scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 }, abbreviation: 'Bal' },
        { attribute: 'Uniformity', scale: { type: 'numeric', min: 0, max: 10, increment: 2 }, abbreviation: 'Unif' },
        { attribute: 'Clean Cup', scale: { type: 'numeric', min: 0, max: 10, increment: 2 }, abbreviation: 'Cln' },
        { attribute: 'Sweetness', scale: { type: 'numeric', min: 0, max: 10, increment: 2 }, abbreviation: 'Swt' },
        { attribute: 'Overall', scale: { type: 'numeric', min: 6, max: 10, increment: 0.25 }, abbreviation: 'Ovrl' },
      ]
    }

    // Build complete template response
    const qualityTemplate = {
      id: template.id,
      name: template.name,
      attributes: cuppingAttributes,
      defects: customParams.defects || templateParams.defects || [
        'Fermented', 'Phenolic', 'Earthy', 'Moldy', 'Musty',
        'Chemical', 'Medicinal', 'Rubber', 'Sour', 'Overripe',
      ],
      taint_threshold: customParams.taint_threshold || templateParams.taint_threshold || 3,
      max_intensity: customParams.max_intensity || templateParams.max_intensity || 7,
      cups_per_sample: customParams.cups_per_sample || templateParams.cups_per_sample || 5,
      scale_info: customParams.scale_info || templateParams.scale_info || '1-8, 0.25',
      discrepancy_threshold: template.cupping_discrepancy_threshold || 1.0,
    }

    return NextResponse.json({
      template: qualityTemplate,
      sample: {
        id: sample.id,
        tracking_number: sample.tracking_number,
        sample_type: sample.sample_type,
      },
    })
  } catch (error: any) {
    console.error('Error fetching quality template:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch quality template',
        details: error.message || String(error),
      },
      { status: 500 }
    )
  }
}
