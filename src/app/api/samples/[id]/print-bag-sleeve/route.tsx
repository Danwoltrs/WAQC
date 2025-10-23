import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { renderToStream } from '@react-pdf/renderer'
import { SampleBagSleeveLabelDocument, SampleBagSleeveLabelData } from '@/components/pdf/sample-bag-sleeve-label'
import path from 'path'
import fs from 'fs'

/**
 * GET /api/samples/[id]/print-bag-sleeve
 * Generate a single sample bag sleeve label PDF (4 per A4 page)
 * Includes: Logo, Sample type, Date, Tracking number, Exporter (conditional),
 * Bags, Quality (client name + full description), ICO/Container (SS only),
 * Contract references, Lab info at bottom
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

    // Await params (Next.js 15)
    const { id } = await params

    // Fetch sample with all required fields
    const { data: sample, error } = await supabase
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
        bags,
        bag_weight_kg,
        origin,
        container_nr,
        ico_number,
        quality_spec_id,
        client_id,
        exporter:exporters(name),
        quality_spec:client_qualities(custom_name, quality_code)
      `)
      .eq('id', id)
      .single()

    if (error || !sample) {
      console.error('Error fetching sample for bag sleeve:', error)
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Get exporter name
    const exporterName = (sample as any).exporter?.name || 'N/A'

    // Get full quality description
    const qualitySpec = (sample as any).quality_spec
    let qualityDescription = 'N/A'
    if (qualitySpec) {
      const parts = []
      if (qualitySpec.custom_name) parts.push(qualitySpec.custom_name)
      if (qualitySpec.quality_code) parts.push(qualitySpec.quality_code)
      qualityDescription = parts.join(' - ')
    }

    // Format bags display (origin-specific defaults: 60kg Brazil, 70kg others)
    let bagsDisplay = 'N/A'
    if ((sample as any).bags && (sample as any).bag_weight_kg) {
      bagsDisplay = `${(sample as any).bags} x ${(sample as any).bag_weight_kg}kg`

      // Add origin indicator
      const origin = (sample as any).origin?.toLowerCase() || ''
      if (origin.includes('brazil')) {
        bagsDisplay += ' (Brazil)'
      } else if (origin) {
        bagsDisplay += ` (${(sample as any).origin})`
      }
    }

    // Collect contracts with types
    const contracts: Array<{ type: string; value: string }> = []
    if ((sample as any).wolthers_contract_nr) {
      contracts.push({ type: 'Wolthers', value: (sample as any).wolthers_contract_nr })
    }
    if ((sample as any).buyer_contract_nr) {
      contracts.push({ type: 'Buyer', value: (sample as any).buyer_contract_nr })
    }
    if ((sample as any).exporter_contract_nr) {
      contracts.push({ type: 'Exporter', value: (sample as any).exporter_contract_nr })
    }
    if ((sample as any).roaster_contract_nr) {
      contracts.push({ type: 'Roaster', value: (sample as any).roaster_contract_nr })
    }

    // Read logo file and convert to base64
    const logoPath = path.join(process.cwd(), 'public', 'images', 'logos', 'wolthers-logo-black.svg')
    const logoBuffer = fs.readFileSync(logoPath)
    const logoBase64 = `data:image/svg+xml;base64,${logoBuffer.toString('base64')}`

    // Format date
    const date = new Date((sample as any).created_at).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })

    // Determine sample type display
    let sampleTypeDisplay: 'PSS' | 'SS' | 'Type Sample' = 'PSS'
    if ((sample as any).sample_type === 'Stocklot') {
      sampleTypeDisplay = 'Type Sample'
    } else if ((sample as any).sample_type === 'SS') {
      sampleTypeDisplay = 'SS'
    }

    // Prepare label data
    const labelData: SampleBagSleeveLabelData = {
      sample_type: sampleTypeDisplay,
      date,
      tracking_number: (sample as any).tracking_number,
      exporter: exporterName,
      hide_exporter: (sample as any).hide_exporter_on_label || false,
      bags_display: bagsDisplay,
      client_quality_name: undefined,
      quality_description: qualityDescription,
      ico_number: (sample as any).ico_number,
      container_number: (sample as any).container_nr,
      contracts,
      buyer_reference: undefined,
      logo_url: logoBase64,
    }

    // Generate PDF
    const pdfDocument = <SampleBagSleeveLabelDocument labels={[labelData]} />
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
        'Content-Disposition': `attachment; filename="bag-sleeve-${(sample as any).tracking_number}.pdf"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error in GET /api/samples/[id]/print-bag-sleeve:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
