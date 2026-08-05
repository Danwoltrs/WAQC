import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { renderToStream } from '@react-pdf/renderer'
import { TinSleeveLabelDocument, TinSleeveLabelData } from '@/components/pdf/tin-sleeve-label'
import { generateQRCode, getCertificatePageUrl } from '@/lib/qr-code'
import {
  buildSleeveLabelFields,
  toSleeveSampleType,
  resolveQualityName,
} from '@/lib/sleeve-label-data'
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
        sample_type,
        workflow_stage,
        container_nr,
        exporter_sample_number,
        buyer_contract_nr,
        exporter_contract_nr,
        bag_type,
        bag_count,
        bag_weight_kg,
        bags_quantity_mt,
        equivalent_60kg_bags,
        quality_name,
        exporter:companies!samples_exporter_id_fkey(name),
        seller:companies!samples_seller_id_fkey(name),
        client:companies!samples_client_id_fkey(name),
        roaster:companies!samples_roaster_id_fkey(name),
        quality_spec:client_qualities(
          custom_name,
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

    // The label prints the OFFICIAL certificate number, which is only minted at
    // certification. Anything earlier has no number to print.
    const PRINTABLE_STAGES = ['certified', 'rejected']
    const printable = (samples as any[]).filter(s => PRINTABLE_STAGES.includes(s.workflow_stage))
    const skipped = samples.length - printable.length

    if (printable.length === 0) {
      return NextResponse.json({
        error: 'No certified samples selected. Tin labels carry the certificate number, which is issued at certification.',
      }, { status: 400 })
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

    const printableIds = printable.map(s => s.id)

    // One label per mother sample; every certificate belonging to it (mother
    // first, then each sub-contract's) is comma-joined into the Cert. field.
    const { data: certRows, error: certError } = await supabase
      .from('certificates')
      .select('sample_id, sample_contract_id, certificate_number, created_at')
      .in('sample_id', printableIds)
      .not('certificate_number', 'is', null)
      .order('created_at', { ascending: true })

    if (certError) {
      console.error('Error fetching certificates for tin sleeves:', certError)
      return NextResponse.json({
        error: 'Failed to fetch certificate numbers',
        details: certError.message || String(certError),
      }, { status: 500 })
    }

    const certsBySample: Record<string, { numbers: string[]; certifiedAt: string | null }> = {}
    for (const row of (certRows || []) as Array<{
      sample_id: string
      sample_contract_id: string | null
      certificate_number: string
      created_at: string
    }>) {
      const entry = certsBySample[row.sample_id] || { numbers: [], certifiedAt: null }
      // Mother certificate leads and sets the certified date.
      if (row.sample_contract_id === null) {
        entry.numbers.unshift(row.certificate_number)
        entry.certifiedAt = row.created_at
      } else {
        entry.numbers.push(row.certificate_number)
        if (!entry.certifiedAt) entry.certifiedAt = row.created_at
      }
      certsBySample[row.sample_id] = entry
    }

    const labelsWithQR: TinSleeveLabelData[] = await Promise.all(
      printable.map(async (sample: any) => {
        const certs = certsBySample[sample.id] || { numbers: [], certifiedAt: null }

        const fields = buildSleeveLabelFields({
          sampleType: toSleeveSampleType(sample.sample_type),
          containerNr: sample.container_nr,
          exporterSampleNumber: sample.exporter_sample_number,
          certificateNumbers: certs.numbers,
          certifiedAt: certs.certifiedAt,
          sellerName: sample.seller?.name || sample.exporter?.name || null,
          sellerRef: sample.exporter_contract_nr,
          clientName: sample.client?.name || null,
          clientRef: sample.buyer_contract_nr,
          roasterName: sample.roaster?.name || null,
          quality: resolveQualityName(sample.quality_spec, sample.quality_name),
          bagCount: sample.bag_count,
          bagWeightKg: sample.bag_weight_kg,
          bagType: sample.bag_type,
          quantityMt: sample.bags_quantity_mt,
          equivalent60kgBags: sample.equivalent_60kg_bags,
        })

        // URL only. The old multi-line text payload made phones show text
        // instead of opening the page, and pushed QR density past what a 27mm
        // print scans reliably.
        const qrCode = certs.numbers[0]
          ? await generateQRCode(getCertificatePageUrl(certs.numbers[0]), { width: 400, margin: 1 })
          : undefined

        return { ...fields, qr_code: qrCode, logo_url: logoBase64, size: size as '4cm' | '2.5cm' }
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
        'X-Skipped-Samples': String(skipped),
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
