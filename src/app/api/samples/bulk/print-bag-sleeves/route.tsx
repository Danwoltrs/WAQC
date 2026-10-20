import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { renderToStream } from '@react-pdf/renderer'
import { SampleBagSleeveLabelDocument, SampleBagSleeveLabelData } from '@/components/pdf/sample-bag-sleeve-label'
import { generateQRCode, getCertificatePageUrl } from '@/lib/qr-code'
import { bagSleeveContracts, bagSleeveHeadline, bagSleeveQualityDescription, bagSleeveTypeLine } from '@/lib/bag-sleeve-label'
import { loadSleeveContractQualities } from '@/lib/bag-sleeve-contract-quality'
import { resolveCompanyName } from '@/lib/sleeve-label-data'
import { selectInChunks } from '@/lib/supabase-in-chunks'
import { formatBulkQuantity } from '@/lib/bag-quantity'
import path from 'path'
import fs from 'fs'

/**
 * POST /api/samples/bulk/print-bag-sleeves
 * Generate bulk sample bag sleeve label PDFs (6 per A4 page)
 * Body: { sample_ids: string[], includeQrCode?: boolean }
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

    // Support both old format (sample_ids array with global includeQrCode) and new format (samples array with per-sample QR flags)
    let samplesConfig: Array<{ id: string; includeQrCode: boolean }>

    if (body.samples && Array.isArray(body.samples)) {
      // New format: array of {id, includeQrCode}. One sleeve per sample — a
      // contract sibling is a sample of its own and prints its own references.
      samplesConfig = body.samples
    } else if (body.sample_ids && Array.isArray(body.sample_ids)) {
      // Old format: array of IDs with global includeQrCode flag
      const { sample_ids, includeQrCode = false } = body
      samplesConfig = sample_ids.map((id: string) => ({ id, includeQrCode }))
    } else {
      return NextResponse.json({ error: 'samples array or sample_ids array is required' }, { status: 400 })
    }

    if (samplesConfig.length === 0) {
      return NextResponse.json({ error: 'At least one sample is required' }, { status: 400 })
    }

    const sample_ids = [...new Set(samplesConfig.map(s => s.id))]

    // Fetch samples with all required fields
    const { data: samples, error } = await supabase
      .from('samples')
      .select(`
        id,
        sample_type,
        created_at,
        hide_exporter_on_label,
        wolthers_contract_nr,
        buyer_contract_nr,
        exporter_contract_nr,
        roaster_contract_nr,
        bag_type,
        bag_count,
        bag_weight_kg,
        bags_quantity_mt,
        container_count,
        origin,
        container_nr,
        ico_number,
        exporter_sample_number,
        quality_spec_id,
        quality_name,
        contract_id,
        client_id,
        client:companies!samples_client_id_fkey(name, fantasy_name),
        exporter:companies!samples_exporter_id_fkey(name, fantasy_name),
        quality_spec:client_qualities(
          custom_name,
          quality_code,
          template:quality_templates(name_en, name_pt, name_es, description)
        ),
        laboratory:laboratories(name, address, city, state, zip_code, country, contact_phone, contact_email, vat_number)
      `)
      .in('id', sample_ids)

    if (error) {
      console.error('Error fetching samples for bag sleeves:', error)
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

    // Read logo file and convert to base64 (once for all labels, PNG for better PDF compatibility)
    let logoBase64: string
    try {
      const logoPath = path.join(process.cwd(), 'public', 'images', 'logos', 'wolthers-logo-black.png')
      const logoBuffer = fs.readFileSync(logoPath)
      logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`
    } catch (logoError) {
      console.error('Error reading logo file:', logoError)
      return NextResponse.json({ error: 'Failed to read logo file', details: String(logoError) }, { status: 500 })
    }

    // Official certificate numbers: the label prints one and the QR resolves to it.
    // Newest certificate per sample wins.
    const { data: certRows, error: certError } = await selectInChunks<{
      sample_id: string
      certificate_number: string | null
      created_at: string
    }>(sample_ids, chunk =>
      supabase
        .from('certificates')
        .select('sample_id, certificate_number, created_at')
        .in('sample_id', chunk)
        .order('created_at', { ascending: false }) as any
    )
    if (certError) {
      console.error('Error fetching certificates for bag sleeves:', certError)
      return NextResponse.json({
        error: 'Failed to fetch certificate numbers',
        details: certError.message || String(certError),
      }, { status: 500 })
    }
    const certNumberBySample: Record<string, string> = {}
    for (const row of [...(certRows || [])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
      const n = (row.certificate_number || '').trim()
      if (n && !certNumberBySample[row.sample_id]) certNumberBySample[row.sample_id] = n
    }

    // The contract's full quality text prints under the bold short name.
    const contractQualityBySample = await loadSleeveContractQualities(supabase as any, samples as any[])

    // Build a map of samples by ID for quick lookup
    const samplesById: Record<string, any> = {}
    for (const s of samples) samplesById[s.id] = s

    // Helper to build a label from a sample
    const buildLabel = async (sample: any, config: typeof samplesConfig[0]): Promise<SampleBagSleeveLabelData> => {
      const certNumber: string | undefined = certNumberBySample[sample.id]
      // The buyer's contract number leads; a lot without one leads with its own number.
      const headline = bagSleeveHeadline({
        buyer_contract_nr: sample.buyer_contract_nr,
        container_nr: sample.container_nr,
        ico_number: sample.ico_number,
        exporter_sample_number: sample.exporter_sample_number,
        certificate_number: certNumber,
      })

      // Get exporter name
      const exporterName = sample.exporter?.fantasy_name || sample.exporter?.name || 'N/A'

      // The quality's short name in bold, the contract's full text under it
      const qualitySpec = sample.quality_spec
      const template = qualitySpec?.template
      const clientQualityName: string | undefined = qualitySpec?.custom_name || sample.quality_name || undefined
      const qualityDescription = bagSleeveQualityDescription({
        contract_text: contractQualityBySample.get(sample.id),
        template_description: template?.description,
        template_name: template?.name_en || template?.name_pt || template?.name_es,
        short_name: clientQualityName,
      })

      // Format bags display. Bulk is containers, never "720 x 21600kg".
      let bagsDisplay = 'N/A'
      if (sample.bag_type === 'bulk') {
        bagsDisplay = formatBulkQuantity(sample) || 'N/A'
      } else if (sample.bag_count != null && sample.bag_weight_kg != null) {
        bagsDisplay = `${sample.bag_count} x ${sample.bag_weight_kg}kg`
      }
      if (bagsDisplay !== 'N/A') {
        const origin = sample.origin?.toLowerCase() || ''
        if (origin.includes('brazil')) bagsDisplay += ' (Brazil)'
        else if (origin) bagsDisplay += ` (${sample.origin})`
      }

      // The sample's own contract refs, whichever contract in the group it is
      const contracts = bagSleeveContracts(sample, headline)

      // Format date
      const dateObj = new Date(sample.created_at)
      const day = dateObj.getDate().toString().padStart(2, '0')
      const month = dateObj.toLocaleDateString('en-US', { month: 'short' })
      const year = dateObj.getFullYear()
      const date = `${day}/${month}/${year}`

      // Determine sample type display
      let sampleTypeDisplay: 'PSS' | 'SS' | 'Type Sample' = 'PSS'
      const sampleType = sample.sample_type?.toLowerCase()
      if (sampleType === 'type' || sampleType === 'stocklot') sampleTypeDisplay = 'Type Sample'
      else if (sampleType === 'ss') sampleTypeDisplay = 'SS'

      // Get laboratory information
      const lab = sample.laboratory
      const labInfo = lab ? {
        name: lab.name || 'Wolthers Coffee Quality Control',
        address: lab.address || '', city: lab.city || '', state: lab.state || '',
        zip_code: lab.zip_code || '', country: lab.country || '',
        phone: lab.contact_phone || '', fax: '', tax_id: lab.vat_number || '',
      } : {
        name: 'Wolthers Coffee Quality Control',
        address: '', city: '', state: '', zip_code: '', country: '',
        phone: '', fax: '', tax_id: '',
      }

      // QR only when asked for AND the sample has a certificate: the URL of its page.
      let qrCode: string | undefined
      if (config.includeQrCode && certNumber) {
        try {
          qrCode = await generateQRCode(
            getCertificatePageUrl(certNumber, resolveCompanyName(sample.client)),
            { width: 150, margin: 1 }
          )
        } catch (qrError) {
          console.error('Error generating QR code for', certNumber, ':', qrError)
        }
      }

      return {
        sample_type: sampleTypeDisplay,
        type_line: bagSleeveTypeLine(sampleTypeDisplay, sample.exporter_sample_number, headline),
        date, headline, certificate_number: certNumber,
        exporter: exporterName, hide_exporter: sample.hide_exporter_on_label || false,
        bags_display: bagsDisplay, client_quality_name: clientQualityName,
        quality_description: qualityDescription,
        ico_number: sample.ico_number,
        container_number: sample.container_nr,
        contracts, buyer_reference: undefined, logo_url: logoBase64,
        qr_code: qrCode, laboratory: labInfo,
      }
    }

    // Prepare label data for all config entries
    const labels: SampleBagSleeveLabelData[] = await Promise.all(
      samplesConfig
        .filter(cfg => samplesById[cfg.id])
        .map(cfg => buildLabel(samplesById[cfg.id], cfg))
    )

    // Generate PDF
    let pdfDocument, stream, buffer
    try {
      pdfDocument = <SampleBagSleeveLabelDocument labels={labels} />
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
        'Content-Disposition': `attachment; filename="bag-sleeves-${new Date().toISOString().split('T')[0]}.pdf"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error in POST /api/samples/bulk/print-bag-sleeves:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
