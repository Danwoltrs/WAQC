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
  resolveCompanyName,
  groupSleeveQuantity,
  orderSleeveCertificates,
  type SleeveCertificateRow,
  type SleeveQuantityRow,
} from '@/lib/sleeve-label-data'
import { fetchGroup, resolveLabSourceId, type GroupMember } from '@/lib/sample-group'
import path from 'path'
import fs from 'fs'

/**
 * GET /api/samples/[id]/print-tin-sleeve
 * Generate a single tin sleeve label PDF (4cm height, centered)
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

    // One tin per PHYSICAL sample: asked for a contract sibling, print its
    // lot's label — the lab unit carries the identity the tin is read by.
    const labUnitId = await resolveLabSourceId(supabase, id)

    // Fetch sample with all required fields
    const { data: sample, error } = await supabase
      .from('samples')
      .select(`
        id,
        sample_type,
        workflow_stage,
        container_nr,
        ico_number,
        exporter_sample_number,
        buyer_contract_nr,
        exporter_contract_nr,
        wolthers_contract_nr,
        bag_type,
        bag_count,
        bag_weight_kg,
        bags_quantity_mt,
        equivalent_60kg_bags,
        container_count,
        quality_name,
        hide_exporter_on_label,
        exporter:companies!samples_exporter_id_fkey(name, fantasy_name),
        seller:companies!samples_seller_id_fkey(name, fantasy_name),
        client:companies!samples_client_id_fkey(name, fantasy_name),
        roaster:companies!samples_roaster_id_fkey(name, fantasy_name),
        quality_spec:client_qualities(
          custom_name,
          template:quality_templates(name_en, name_pt, name_es)
        )
      `)
      .eq('id', labUnitId)
      .single()

    if (error || !sample) {
      console.error('Error fetching sample for tin sleeve:', error)
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // The label prints the OFFICIAL certificate number, which is only minted at
    // certification. Anything earlier has no number to print.
    const PRINTABLE_STAGES = ['certified', 'rejected']
    if (!PRINTABLE_STAGES.includes((sample as any).workflow_stage)) {
      return NextResponse.json({
        error: 'This sample is not certified yet. Tin labels carry the certificate number, which is issued at certification.',
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

    // The whole contract group, lab unit first: sibling tonnage rolls up into
    // the foot quantity (one tin covers the whole lot), contract_ordinal fixes
    // the order of the certificate numbers in the Cert. field, and each member
    // carries its own wolthers_contract_nr. A sibling removed on its own is
    // soft-deleted alone, so it drops out here.
    const members = (await fetchGroup(supabase, labUnitId))
      .filter(m => m.deleted_at == null) as Array<GroupMember & SleeveQuantityRow>

    // Every certificate in the group (lab unit first, then each sibling's) is
    // comma-joined into the Cert. field. Rows with a null certificate_number
    // are kept rather than filtered out in SQL so orderSleeveCertificates
    // decides what to print.
    const { data: certRows, error: certError } = await supabase
      .from('certificates')
      .select('sample_id, certificate_number, created_at')
      .in('sample_id', members.map(m => m.id))
      .order('created_at', { ascending: true })

    if (certError) {
      console.error('Error fetching certificates for tin sleeve:', certError)
      return NextResponse.json({
        error: 'Failed to fetch certificate numbers',
        details: certError.message || String(certError),
      }, { status: 500 })
    }

    const { numbers: certNumbers, certifiedAt } = orderSleeveCertificates(
      (certRows || []) as SleeveCertificateRow[],
      members,
    )

    const s = sample as any

    const fields = buildSleeveLabelFields({
      sampleType: toSleeveSampleType(s.sample_type),
      containerNr: s.container_nr,
      icoNumber: s.ico_number,
      exporterSampleNumber: s.exporter_sample_number,
      certificateNumbers: certNumbers,
      certifiedAt,
      sellerName: s.hide_exporter_on_label
        ? null
        : (resolveCompanyName(s.seller) || resolveCompanyName(s.exporter)),
      sellerRef: s.exporter_contract_nr,
      clientName: resolveCompanyName(s.client),
      clientRef: s.buyer_contract_nr,
      wolthersContractNrs: members.map(m => m.wolthers_contract_nr),
      roasterName: resolveCompanyName(s.roaster),
      quality: resolveQualityName(s.quality_spec, s.quality_name),
      ...groupSleeveQuantity(members),
    })

    // URL only. The old multi-line text payload made phones show text instead
    // of opening the page, and pushed QR density past what a 27mm print scans
    // reliably.
    const qrCode = certNumbers[0]
      ? await generateQRCode(getCertificatePageUrl(certNumbers[0], resolveCompanyName(s.client)), { width: 400, margin: 1 })
      : undefined

    // This route has no size parameter and never had one; omitting `size`
    // makes the document fall back to '4cm', matching prior behavior.
    const labels: TinSleeveLabelData[] = [
      { ...fields, qr_code: qrCode, logo_url: logoBase64 },
    ]

    // Generate PDF
    let pdfDocument, stream, buffer
    try {
      pdfDocument = <TinSleeveLabelDocument labels={labels} />
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
        'Content-Disposition': `attachment; filename="tin-sleeve-${id}.pdf"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error in GET /api/samples/[id]/print-tin-sleeve:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
