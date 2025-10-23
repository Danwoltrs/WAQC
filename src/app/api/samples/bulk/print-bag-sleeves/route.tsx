import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { renderToStream } from '@react-pdf/renderer'
import { SampleBagSleeveLabelDocument, SampleBagSleeveLabelData } from '@/components/pdf/sample-bag-sleeve-label'
import path from 'path'
import fs from 'fs'

/**
 * POST /api/samples/bulk/print-bag-sleeves
 * Generate bulk sample bag sleeve label PDFs (4 per A4 page)
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
      return NextResponse.json({ error: 'sample_ids array is required' }, { status: 400 })
    }

    // Fetch samples with all required fields
    const { data: samples, error } = await supabase
      .from('samples')
      .select(`
        id,
        tracking_number,
        sample_type,
        created_at,
        hide_exporter_on_label,
        wolthers_contract_nr,
        buyer_contract_nr,
        exporter_contract_nr,
        roaster_contract_nr,
        bag_type,
        number_of_bags,
        bag_weight_kg,
        origin,
        container_nr,
        oic_number,
        quality_spec_id,
        client_id,
        buyer_reference,
        exporter:exporters(name),
        supplier:suppliers(name),
        quality_specification:quality_specifications(
          name,
          description,
          processing_method
        ),
        clients (
          id,
          client_quality_names
        )
      `)
      .in('id', sample_ids)

    if (error) {
      console.error('Error fetching samples for bag sleeves:', error)
      return NextResponse.json({ error: 'Failed to fetch samples' }, { status: 500 })
    }

    if (!samples || samples.length === 0) {
      return NextResponse.json({ error: 'No samples found' }, { status: 404 })
    }

    // Read logo file and convert to base64 (once for all labels)
    const logoPath = path.join(process.cwd(), 'public', 'images', 'logos', 'wolthers-logo-black.svg')
    const logoBuffer = fs.readFileSync(logoPath)
    const logoBase64 = `data:image/svg+xml;base64,${logoBuffer.toString('base64')}`

    // Prepare label data for all samples
    const labels: SampleBagSleeveLabelData[] = samples.map((sample: any) => {
      // Get exporter name
      const exporterName = sample.exporter?.name || sample.supplier?.name || 'N/A'

      // Get client quality name
      const clientQualityNames = sample.clients?.client_quality_names || {}
      const clientQualityName = clientQualityNames[sample.tracking_number]

      // Get full quality description
      const qualitySpec = sample.quality_specification
      let qualityDescription = 'N/A'
      if (qualitySpec) {
        const parts = []
        if (qualitySpec.name) parts.push(qualitySpec.name)
        if (qualitySpec.processing_method) parts.push(qualitySpec.processing_method)
        qualityDescription = parts.join(' - ')
      }

      // Format bags display (origin-specific defaults)
      let bagsDisplay = 'N/A'
      if (sample.number_of_bags && sample.bag_weight_kg) {
        bagsDisplay = `${sample.number_of_bags} x ${sample.bag_weight_kg}kg`

        // Add origin indicator
        const origin = sample.origin?.toLowerCase() || ''
        if (origin.includes('brazil')) {
          bagsDisplay += ' (Brazil)'
        } else if (origin) {
          bagsDisplay += ` (${sample.origin})`
        }
      }

      // Collect contracts with types
      const contracts: Array<{ type: string; value: string }> = []
      if (sample.wolthers_contract_nr) {
        contracts.push({ type: 'Wolthers', value: sample.wolthers_contract_nr })
      }
      if (sample.buyer_contract_nr) {
        contracts.push({ type: 'Buyer', value: sample.buyer_contract_nr })
      }
      if (sample.exporter_contract_nr) {
        contracts.push({ type: 'Exporter', value: sample.exporter_contract_nr })
      }
      if (sample.roaster_contract_nr) {
        contracts.push({ type: 'Roaster', value: sample.roaster_contract_nr })
      }

      // Format date
      const date = new Date(sample.created_at).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })

      // Determine sample type display
      let sampleTypeDisplay: 'PSS' | 'SS' | 'Type Sample' = 'PSS'
      if (sample.sample_type === 'Stocklot') {
        sampleTypeDisplay = 'Type Sample'
      } else if (sample.sample_type === 'SS') {
        sampleTypeDisplay = 'SS'
      }

      return {
        sample_type: sampleTypeDisplay,
        date,
        tracking_number: sample.tracking_number,
        exporter: exporterName,
        hide_exporter: sample.hide_exporter_on_label || false,
        bags_display: bagsDisplay,
        client_quality_name: clientQualityName,
        quality_description: qualityDescription,
        ico_number: sample.oic_number,
        container_number: sample.container_nr,
        contracts,
        buyer_reference: sample.buyer_reference,
        logo_url: logoBase64,
      }
    })

    // Generate PDF
    const pdfDocument = <SampleBagSleeveLabelDocument labels={labels} />
    const stream = await renderToStream(pdfDocument)

    // Convert stream to buffer
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk))
    }
    const buffer = Buffer.concat(chunks)

    // Return PDF as response
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="bag-sleeves-${new Date().toISOString().split('T')[0]}.pdf"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error in POST /api/samples/bulk/print-bag-sleeves:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
