import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { renderToStream } from '@react-pdf/renderer'
import { TinSleeveLabelDocument, TinSleeveLabelData } from '@/components/pdf/tin-sleeve-label'
import { generateQRCode, getSampleTrackingUrl } from '@/lib/qr-code'
import path from 'path'
import fs from 'fs'

/**
 * GET /api/samples/[id]/print-tin-sleeve
 * Generate a single tin sleeve label PDF (4cm height)
 * Includes: Date, Sample tracking, Exporter, Quality (client name + full description),
 * Contracts, Packaging, Bags with bulk indicator, QR code, Logo
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
        wolthers_contract_nr,
        buyer_contract_nr,
        exporter_contract_nr,
        roaster_contract_nr,
        bag_type,
        number_of_bags,
        bag_weight_kg,
        equivalent_60kg_bags,
        quality_spec_id,
        client_id,
        exporter:exporters(name),
        quality_spec:client_qualities(custom_name, quality_code)
      `)
      .eq('id', id)
      .single()

    if (error || !sample) {
      console.error('Error fetching sample for tin sleeve:', error)
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

    // Format packaging type
    const bagTypeMap: Record<string, string> = {
      jute_bag: 'Jute Bags',
      pp_bag: 'PP Bags',
      big_bag: 'Big Bags (1 M/T)',
      bulk: 'Bulk',
    }
    const packaging = bagTypeMap[(sample as any).bag_type] || 'N/A'

    // Format bags display (with bulk indicator if applicable)
    let bagsDisplay = 'N/A'
    if ((sample as any).bag_type === 'bulk' && (sample as any).equivalent_60kg_bags) {
      bagsDisplay = `Bulk (equiv. ${Math.round((sample as any).equivalent_60kg_bags)} bags)`
    } else if ((sample as any).number_of_bags && (sample as any).bag_weight_kg) {
      bagsDisplay = `${(sample as any).number_of_bags} x ${(sample as any).bag_weight_kg}kg`
    }

    // Collect contracts
    const contracts: string[] = []
    if ((sample as any).wolthers_contract_nr) contracts.push((sample as any).wolthers_contract_nr)
    if ((sample as any).buyer_contract_nr) contracts.push((sample as any).buyer_contract_nr)
    if ((sample as any).exporter_contract_nr) contracts.push((sample as any).exporter_contract_nr)
    if ((sample as any).roaster_contract_nr) contracts.push((sample as any).roaster_contract_nr)

    // Generate QR code
    const trackingUrl = getSampleTrackingUrl((sample as any).tracking_number)
    const qrCode = await generateQRCode(trackingUrl, {
      width: 200,
      margin: 1,
    })

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

    // Prepare label data
    const labelData: TinSleeveLabelData = {
      date,
      tracking_number: (sample as any).tracking_number,
      sample_type: ((sample as any).sample_type || 'PSS') as any,
      exporter: exporterName,
      client_quality_name: undefined,
      quality_description: qualityDescription,
      contracts,
      packaging,
      bags_display: bagsDisplay,
      qr_code: qrCode,
      logo_url: logoBase64,
    }

    // Generate PDF
    const pdfDocument = <TinSleeveLabelDocument labels={[labelData]} />
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
        'Content-Disposition': `attachment; filename="tin-sleeve-${(sample as any).tracking_number}.pdf"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error in GET /api/samples/[id]/print-tin-sleeve:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
