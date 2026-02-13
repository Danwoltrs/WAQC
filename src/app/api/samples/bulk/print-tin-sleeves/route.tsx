import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { renderToStream } from '@react-pdf/renderer'
import { TinSleeveLabelDocument, TinSleeveLabelData } from '@/components/pdf/tin-sleeve-label'
import { generateQRCode, fetchCertificateQRData, buildCertificateQRText } from '@/lib/qr-code'
import path from 'path'
import fs from 'fs'

/**
 * POST /api/samples/bulk/print-tin-sleeves
 * Generate bulk tin sleeve label PDFs (4cm or 2.5cm height, centered)
 * Body: { sample_ids: string[], size?: '4cm' | '2.5cm' }
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
    const { sample_ids, size = '4cm' } = body

    if (!sample_ids || !Array.isArray(sample_ids) || sample_ids.length === 0) {
      return NextResponse.json({ error: 'sample_ids array is required' }, { status: 400 })
    }

    // Validate size parameter
    if (size !== '4cm' && size !== '2.5cm') {
      return NextResponse.json({ error: 'size must be either "4cm" or "2.5cm"' }, { status: 400 })
    }

    // Fetch samples with all required fields
    const { data: samples, error } = await supabase
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
        bag_count,
        bag_weight_kg,
        bags_quantity_mt,
        equivalent_60kg_bags,
        quality_spec_id,
        client_id,
        exporter:exporters!samples_exporter_id_fkey(name),
        quality_spec:client_qualities(
          custom_name,
          quality_code,
          template:quality_templates(name_en, name_pt, name_es)
        )
      `)
      .in('id', sample_ids)

    if (error) {
      console.error('Error fetching samples for tin sleeves:', error)
      return NextResponse.json({
        error: 'Failed to fetch samples',
        details: error.message || String(error),
        code: error.code,
        hint: error.hint
      }, { status: 500 })
    }

    if (!samples || samples.length === 0) {
      return NextResponse.json({ error: 'No samples found' }, { status: 404 })
    }

    // Read logo file and convert to base64 (PNG for better PDF compatibility)
    let logoBase64: string
    try {
      const logoPath = path.join(process.cwd(), 'public', 'images', 'logos', 'wolthers-logo-black.png')
      const logoBuffer = fs.readFileSync(logoPath)
      logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`
    } catch (logoError) {
      console.error('Error reading logo file:', logoError)
      return NextResponse.json({ error: 'Failed to read logo file', details: String(logoError) }, { status: 500 })
    }

    // Bag type mapping
    const bagTypeMap: Record<string, string> = {
      jute_bag: 'Jute Bags',
      pp_bag: 'PP Bags',
      big_bag: 'Big Bags (1 M/T)',
      bulk: 'Bulk',
    }

    // Generate QR codes and prepare label data for all samples
    const labelsWithQR: TinSleeveLabelData[] = await Promise.all(
      samples.map(async (sample: any) => {
        // Get exporter name
        const exporterName = sample.exporter?.name || 'N/A'

        // Get client quality name and full quality description
        const qualitySpec = sample.quality_spec
        let clientQualityName: string | undefined
        let qualityDescription = 'N/A'

        if (qualitySpec) {
          // Client quality name is the custom_name if it exists
          clientQualityName = qualitySpec.custom_name || undefined

          // Quality description comes from the template
          if (qualitySpec.template) {
            qualityDescription = qualitySpec.template.name_en || qualitySpec.template.name_pt || qualitySpec.template.name_es || 'N/A'
          }
        }

        // Format packaging
        const packaging = bagTypeMap[sample.bag_type] || 'N/A'

        // Format bags display with quantity and MT
        let bagsDisplay = 'N/A'
        const bagCount = sample.bag_count
        const bagWeight = sample.bag_weight_kg
        const bagType = sample.bag_type
        const quantityMT = sample.bags_quantity_mt
        const equivalent60kg = sample.equivalent_60kg_bags

        if (bagType === 'bulk' && equivalent60kg) {
          // For bulk: "equiv. 360 bags in 60 kg | 21.6 MT"
          const mt = quantityMT || (equivalent60kg * 60 / 1000)
          bagsDisplay = `equiv. ${Math.round(equivalent60kg)} bags in 60 kg | ${mt.toFixed(1)} MT`
        } else if (bagCount != null && bagWeight != null) {
          // For regular bags: "320 bags in 60 kg jute bags | 19.2 MT"
          const bagTypeName = bagType === 'jute_bag' ? 'jute bags' : bagType === 'pp_bag' ? 'PP bags' : 'bags'
          const mt = quantityMT || (bagCount * bagWeight / 1000)
          bagsDisplay = `${bagCount} bags in ${bagWeight} kg ${bagTypeName} | ${mt.toFixed(1)} MT`
        }

        // Collect contracts
        const contracts: string[] = []
        if (sample.wolthers_contract_nr) contracts.push(sample.wolthers_contract_nr)
        if (sample.buyer_contract_nr) contracts.push(sample.buyer_contract_nr)
        if (sample.exporter_contract_nr) contracts.push(sample.exporter_contract_nr)
        if (sample.roaster_contract_nr) contracts.push(sample.roaster_contract_nr)

        // Generate QR code with certificate summary text
        const qrData = await fetchCertificateQRData(supabase, sample.id, sample.tracking_number)
        const qrContent = buildCertificateQRText(qrData)
        const qrCode = await generateQRCode(qrContent, {
          width: 200,
          margin: 1,
        })

        // Format date with short month (e.g., "28/Oct/2025")
        const dateObj = new Date(sample.created_at)
        const day = dateObj.getDate().toString().padStart(2, '0')
        const month = dateObj.toLocaleDateString('en-US', { month: 'short' })
        const year = dateObj.getFullYear()
        const date = `${day}/${month}/${year}`

        // Map sample_type to display format
        const sampleTypeMap: Record<string, 'PSS' | 'Stocklot' | 'SS' | 'Type Sample'> = {
          'pss': 'PSS',
          'ss': 'SS',
          'type': 'Type Sample',
          'stocklot': 'Stocklot'
        }
        const displaySampleType = sampleTypeMap[sample.sample_type?.toLowerCase() || 'pss'] || 'PSS'

        return {
          date,
          tracking_number: sample.tracking_number,
          sample_type: displaySampleType,
          exporter: exporterName,
          client_quality_name: clientQualityName,
          quality_description: qualityDescription,
          contracts,
          packaging,
          bags_display: bagsDisplay,
          qr_code: qrCode,
          logo_url: logoBase64,
          size: size as '4cm' | '2.5cm',
        }
      })
    )

    // Generate PDF
    let pdfDocument, stream, buffer
    try {
      pdfDocument = <TinSleeveLabelDocument labels={labelsWithQR} />
      stream = await renderToStream(pdfDocument)

      // Convert stream to buffer
      const chunks: Buffer[] = []
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk))
      }
      buffer = Buffer.concat(chunks)
    } catch (pdfError) {
      console.error('Error generating PDF:', pdfError)
      return NextResponse.json({ error: 'Failed to generate PDF', details: String(pdfError) }, { status: 500 })
    }

    // Return PDF as response
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="tin-sleeves-${size}-${new Date().toISOString().split('T')[0]}.pdf"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error in POST /api/samples/bulk/print-tin-sleeves:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
