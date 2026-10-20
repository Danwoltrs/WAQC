import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { renderToStream } from '@react-pdf/renderer'
import { SampleBagSleeveLabelDocument, SampleBagSleeveLabelData } from '@/components/pdf/sample-bag-sleeve-label'
import { generateQRCode, getCertificatePageUrl } from '@/lib/qr-code'
import { bagSleeveContracts, bagSleeveHeadline, bagSleeveQualityDescription, bagSleeveTypeLine } from '@/lib/bag-sleeve-label'
import { loadSleeveContractQualities } from '@/lib/bag-sleeve-contract-quality'
import { resolveCompanyName } from '@/lib/sleeve-label-data'
import { trackingNumberToSlug } from '@/lib/utils'
import { formatBulkQuantity } from '@/lib/bag-quantity'
import { shownCertificateNumber } from '@/lib/sample-reference'
import path from 'path'
import fs from 'fs'

/**
 * GET /api/samples/[id]/print-bag-sleeve?includeQrCode=true
 * Generate a single sample bag sleeve label PDF (6 per A4 page)
 * Includes: Logo, Sample type, Date, lot identifier + certificate number, Exporter (conditional),
 * Bags, Quality (client name + full description), ICO/Container (SS only),
 * Contract references, Lab info at bottom, Optional QR code for certificate download
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

    // Check if QR code should be included (query parameter)
    const includeQrCode = request.nextUrl.searchParams.get('includeQrCode') === 'true'

    // Fetch sample with all required fields
    const { data: sample, error } = await supabase
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
      .eq('id', id)
      .single()

    if (error || !sample) {
      console.error('Error fetching sample for bag sleeve:', error)
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Newest certificate number for this sample
    const { data: certRows, error: certError } = await supabase
      .from('certificates')
      .select('sample_id, certificate_number, created_at')
      .eq('sample_id', id)
      .order('created_at', { ascending: false })
    if (certError) {
      console.error('Error fetching certificate for bag sleeve:', certError)
      return NextResponse.json({ error: 'Failed to fetch certificate number' }, { status: 500 })
    }
    // A legacy certificate issued under the internal SAN- lab number counts as
    // none: no "Certificate:" line, no certificate QR, not in the filename.
    const certNumber = shownCertificateNumber(
      (certRows || [])
        .map(r => (r.certificate_number || '').trim())
        .find(Boolean),
    ) ?? undefined
    // The buyer's contract number leads; a lot without one leads with its own number.
    const headline = bagSleeveHeadline({
      buyer_contract_nr: (sample as any).buyer_contract_nr,
      container_nr: (sample as any).container_nr,
      ico_number: (sample as any).ico_number,
      exporter_sample_number: (sample as any).exporter_sample_number,
      certificate_number: certNumber,
    })

    // Get exporter name (hide if hide_exporter_on_label is true)
    const hideExporter = (sample as any).hide_exporter_on_label || false
    const exporter = (sample as any).exporter
    const exporterName = hideExporter ? '-' : (exporter?.fantasy_name || exporter?.name || 'N/A')

    // The quality's short name in bold, the contract's full text under it
    const qualitySpec = (sample as any).quality_spec
    const template = qualitySpec?.template
    const clientQualityName: string | undefined = qualitySpec?.custom_name || (sample as any).quality_name || undefined
    const contractQuality = await loadSleeveContractQualities(supabase as any, [sample as any])
    const qualityDescription = bagSleeveQualityDescription({
      contract_text: contractQuality.get(id),
      template_description: template?.description,
      template_name: template?.name_en || template?.name_pt || template?.name_es,
      short_name: clientQualityName,
    })

    // Format bags display (origin-specific defaults: 60kg Brazil, 70kg others).
    // Bulk is containers, never "720 x 21600kg".
    let bagsDisplay = 'N/A'
    if ((sample as any).bag_type === 'bulk') {
      bagsDisplay = formatBulkQuantity(sample as any) || 'N/A'
    } else if ((sample as any).bag_count != null && (sample as any).bag_weight_kg != null) {
      bagsDisplay = `${(sample as any).bag_count} x ${(sample as any).bag_weight_kg}kg`
    }
    if (bagsDisplay !== 'N/A') {
      // Add origin indicator
      const origin = (sample as any).origin?.toLowerCase() || ''
      if (origin.includes('brazil')) {
        bagsDisplay += ' (Brazil)'
      } else if (origin) {
        bagsDisplay += ` (${(sample as any).origin})`
      }
    }

    // The sample's contract refs, minus the buyer's when it is the headline
    const contracts = bagSleeveContracts(sample as any, headline)

    // Read logo file and convert to base64 (PNG for better PDF compatibility)
    const logoPath = path.join(process.cwd(), 'public', 'images', 'logos', 'wolthers-logo-black.png')
    const logoBuffer = fs.readFileSync(logoPath)
    const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`

    // Get laboratory information
    const lab = (sample as any).laboratory
    const labInfo = lab ? {
      name: lab.name || 'Wolthers Coffee Quality Control',
      address: lab.address || '',
      city: lab.city || '',
      state: lab.state || '',
      zip_code: lab.zip_code || '',
      country: lab.country || '',
      phone: lab.contact_phone || '',
      fax: '',
      tax_id: lab.vat_number || '',
    } : {
      name: 'Wolthers Coffee Quality Control',
      address: '',
      city: '',
      state: '',
      zip_code: '',
      country: '',
      phone: '',
      fax: '',
      tax_id: '',
    }

    // Format date with short month (e.g., "28/Oct/2025")
    const dateObj = new Date((sample as any).created_at)
    const day = dateObj.getDate().toString().padStart(2, '0')
    const month = dateObj.toLocaleDateString('en-US', { month: 'short' })
    const year = dateObj.getFullYear()
    const date = `${day}/${month}/${year}`

    // Determine sample type display
    let sampleTypeDisplay: 'PSS' | 'SS' | 'Type Sample' = 'PSS'
    const sampleType = (sample as any).sample_type?.toLowerCase()
    if (sampleType === 'type' || sampleType === 'stocklot') {
      sampleTypeDisplay = 'Type Sample'
    } else if (sampleType === 'ss') {
      sampleTypeDisplay = 'SS'
    }

    // QR only when asked for AND the sample has a certificate: the URL of its page.
    let qrCode: string | undefined
    if (includeQrCode && certNumber) {
      try {
        qrCode = await generateQRCode(
          getCertificatePageUrl(certNumber, resolveCompanyName((sample as any).client)),
          { width: 150, margin: 1 }
        )
      } catch (qrError) {
        console.error('Error generating QR code:', qrError)
        // Continue without QR code if generation fails
      }
    }

    // Prepare label data
    const labelData: SampleBagSleeveLabelData = {
      sample_type: sampleTypeDisplay,
      type_line: bagSleeveTypeLine(sampleTypeDisplay, (sample as any).exporter_sample_number, headline),
      date,
      headline,
      certificate_number: certNumber,
      exporter: exporterName,
      hide_exporter: (sample as any).hide_exporter_on_label || false,
      bags_display: bagsDisplay,
      client_quality_name: clientQualityName,
      quality_description: qualityDescription,
      ico_number: (sample as any).ico_number,
      container_number: (sample as any).container_nr,
      contracts,
      buyer_reference: undefined,
      logo_url: logoBase64,
      qr_code: qrCode,
      laboratory: labInfo,
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
        'Content-Disposition': `attachment; filename="bag-sleeve-${trackingNumberToSlug(certNumber ?? headline)}.pdf"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error in GET /api/samples/[id]/print-bag-sleeve:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
