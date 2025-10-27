import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { renderToStream } from '@react-pdf/renderer'
import { SampleBagSleeveLabelDocument, SampleBagSleeveLabelData } from '@/components/pdf/sample-bag-sleeve-label'
import { generateQRCode, getCertificateDownloadUrl } from '@/lib/qr-code'
import path from 'path'
import fs from 'fs'

/**
 * GET /api/samples/[id]/print-bag-sleeve?includeQrCode=true
 * Generate a single sample bag sleeve label PDF (6 per A4 page)
 * Includes: Logo, Sample type, Date, Tracking number, Exporter (conditional),
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
        tracking_number,
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
        origin,
        container_nr,
        ico_number,
        quality_spec_id,
        quality_name,
        client_id,
        exporter:exporters(name),
        quality_spec:client_qualities(
          custom_name,
          quality_code,
          template:quality_templates(name_en, name_pt, name_es)
        ),
        laboratory:laboratories(name, address, city, state, zip_code, country, contact_phone, contact_email, vat_number)
      `)
      .eq('id', id)
      .single()

    if (error || !sample) {
      console.error('Error fetching sample for bag sleeve:', error)
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Get exporter name (hide if hide_exporter_on_label is true)
    const hideExporter = (sample as any).hide_exporter_on_label || false
    const exporterName = hideExporter ? '-' : ((sample as any).exporter?.name || 'N/A')

    // Get client quality name and full quality description
    const qualitySpec = (sample as any).quality_spec
    const directQualityName = (sample as any).quality_name
    let clientQualityName: string | undefined
    let qualityDescription = 'N/A'

    if (qualitySpec) {
      // Client quality name is the custom_name if it exists
      clientQualityName = qualitySpec.custom_name || undefined

      // Quality description comes from the template
      if (qualitySpec.template) {
        qualityDescription = qualitySpec.template.name_en || qualitySpec.template.name_pt || qualitySpec.template.name_es || 'N/A'
      }
    } else if (directQualityName) {
      // For type samples or samples without quality_spec, use quality_name directly
      clientQualityName = directQualityName
      qualityDescription = directQualityName
    }

    // Format bags display (origin-specific defaults: 60kg Brazil, 70kg others)
    let bagsDisplay = 'N/A'
    if ((sample as any).bag_count != null && (sample as any).bag_weight_kg != null) {
      bagsDisplay = `${(sample as any).bag_count} x ${(sample as any).bag_weight_kg}kg`

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

    // Generate QR code if requested
    let qrCode: string | undefined
    if (includeQrCode) {
      try {
        const certificateUrl = getCertificateDownloadUrl(id)
        qrCode = await generateQRCode(certificateUrl, {
          width: 150,
          margin: 1,
        })
      } catch (qrError) {
        console.error('Error generating QR code:', qrError)
        // Continue without QR code if generation fails
      }
    }

    // Prepare label data
    const labelData: SampleBagSleeveLabelData = {
      sample_type: sampleTypeDisplay,
      date,
      tracking_number: (sample as any).tracking_number,
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
        'Content-Disposition': `attachment; filename="bag-sleeve-${(sample as any).tracking_number}.pdf"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error in GET /api/samples/[id]/print-bag-sleeve:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
