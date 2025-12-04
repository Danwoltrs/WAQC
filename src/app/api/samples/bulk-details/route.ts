import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * POST /api/samples/bulk-details
 * Fetch multiple samples with complete relations for cupping card printing
 * Body: { sample_ids: string[] }
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
    const { sample_ids } = body

    if (!sample_ids || !Array.isArray(sample_ids) || sample_ids.length === 0) {
      return NextResponse.json(
        { error: 'sample_ids must be a non-empty array' },
        { status: 400 }
      )
    }

    // Fetch samples with all necessary relations for cupping cards
    // Exclude soft-deleted samples
    const { data: samples, error } = await supabase
      .from('samples')
      .select(`
        id,
        tracking_number,
        sample_type,
        ico_number,
        container_nr,
        origin,
        exporter_legacy,
        client_id,
        quality_spec_id,
        laboratory_id,
        client:clients!samples_client_id_fkey(
          id,
          company
        ),
        laboratory:laboratories!samples_laboratory_id_fkey(
          id,
          name,
          code
        ),
        quality_spec:client_qualities!samples_quality_spec_id_fkey(
          id,
          template_id,
          custom_parameters,
          template:quality_templates!client_qualities_template_id_fkey(
            id,
            name,
            parameters
          )
        )
      `)
      .in('id', sample_ids)
      .is('deleted_at', null)

    if (error) {
      console.error('Error fetching sample details:', error)
      return NextResponse.json(
        { error: 'Failed to fetch sample details', details: error.message },
        { status: 500 }
      )
    }

    console.log('Fetched samples count:', samples?.length || 0)
    if (samples && samples.length > 0) {
      console.log('Sample 0 client:', samples[0].client)
      console.log('Sample 0 quality_spec:', samples[0].quality_spec)
      console.log('Sample 0 laboratory:', samples[0].laboratory)
    }

    return NextResponse.json({
      samples: samples || []
    })
  } catch (error: any) {
    console.error('Error in POST /api/samples/bulk-details:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message || String(error)
      },
      { status: 500 }
    )
  }
}
