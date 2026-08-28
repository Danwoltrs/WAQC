import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveSampleIdForSlug, resolvePublicReference } from '@/lib/certificate-slug'
import { excludeCvaScores, excludeCvaSessions } from '@/lib/cupping-protocol-scope'
import { labSourceId } from '@/lib/sample-group'
import {
  screenGramsToPercent,
  resolveDefectCounts,
  resolveTaintFaultCounts,
  type CuppingScoreRow,
} from '@/lib/quality-resolvers'

// Use service role to bypass RLS for public access
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/certificate/[slug]
 * Public endpoint - returns certificate summary JSON for a sample.
 * No authentication required.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    // The slug is the OFFICIAL certificate number on tins printed since the
    // label rebuild, and the internal tracking number on everything before it.
    // The public page keeps the pretty /certificate/<buyer>/<number> path; this
    // internal endpoint takes the buyer as a query param so the /pdf child route
    // below it stays legal (Next.js forbids a static segment after a catch-all).
    const buyer = request.nextUrl.searchParams.get('buyer')
    const sampleId = await resolveSampleIdForSlug(supabase, slug, buyer)
    if (!sampleId) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    const { data: sample } = await supabase
      .from('samples')
      .select(`
        id,
        lab_source_sample_id,
        tracking_number,
        origin,
        workflow_stage,
        status,
        quality_spec_id,
        sample_type,
        container_nr,
        exporter_sample_number,
        buyer_contract_nr,
        wolthers_contract_nr,
        quality_spec:client_qualities(custom_name, quality_code, template:quality_templates(name_en))
      `)
      .eq('id', sampleId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    return buildResponse(sample)
  } catch (error) {
    console.error('Error in GET /api/certificate/[slug]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function buildResponse(sample: any) {
  // Never the internal SAN- lab number — same rule as the certificate page.
  const publicReference = resolvePublicReference({
    sampleType: sample.sample_type,
    containerNr: sample.container_nr,
    exporterSampleNumber: sample.exporter_sample_number,
    buyerContractNr: sample.buyer_contract_nr,
    wolthersContractNr: sample.wolthers_contract_nr,
  })

  const isCertified = sample.workflow_stage === 'certified' || sample.workflow_stage === 'rejected'

  if (!isCertified) {
    return NextResponse.json({
      certified: false,
      public_reference: publicReference.reference,
      message: 'Sample has not been certified yet',
    })
  }

  // Get certificate record — the certificate belongs to this sample row, whether
  // it is the lab unit or a contract sibling (one certificate per sample).
  const { data: certificate } = await supabase
    .from('certificates')
    .select('id, certificate_number, status, is_rejected, created_at, pdf_url')
    .eq('sample_id', sample.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Lab data (assessment, cupping scores, session) lives on the lab unit; a
  // contract sibling points at it and was never cupped itself.
  const labSampleId = labSourceId(sample)

  // Get quality assessment for screen sizes, defects, and cup status
  const { data: assessment } = await supabase
    .from('quality_assessments')
    .select('green_bean_data, clean_cup, uniform_cup')
    .eq('sample_id', labSampleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const greenBean = assessment?.green_bean_data as any
  // Stored in grams. This endpoint has always published them as percentages,
  // so the numbers it returns change here — from raw grams to real percentages.
  const screenSizes = screenGramsToPercent(greenBean?.screen_sizes)
  const defects = greenBean?.defects
  // One reading, shared with the approval gate. The total is always the
  // computed sum — a stored defects.total is never honoured, because the gate
  // has never honoured it.
  const defectCounts = resolveDefectCounts(defects)
  const primaryDefects = defectCounts?.primary ?? null
  const secondaryDefects = defectCounts?.secondary ?? null
  const totalDefects = defectCounts?.total ?? null

  // Get cupping scores for taints and faults — same reading as the approval
  // gate: a designated master cupper's record is authoritative, otherwise the
  // max across cuppers (two cuppers flagging the same taint is one taint, not
  // two).
  const { data: cuppingScores } = await excludeCvaScores(supabase
    .from('cupping_scores')
    .select('scores, defects, cupper_id')
    .eq('sample_id', labSampleId))

  const scoreRows = (cuppingScores || []) as unknown as CuppingScoreRow[]

  let masterCupperId: string | null = null
  if (scoreRows.length > 0) {
    // Commodity sessions only: a CVA session designates no master cupper, so
    // letting it win here silently demotes the master cupper's reading.
    const { data: session } = await excludeCvaSessions((supabase as any)
      .from('cupping_sessions')
      .select('master_cupper_id')
      .contains('sample_ids', [labSampleId])
      .in('status', ['setup', 'active', 'review', 'completed']))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    masterCupperId = session?.master_cupper_id || null
  }

  const { taints: totalTaints, faults: totalFaults } =
    resolveTaintFaultCounts(scoreRows, masterCupperId)

  const qualitySpec = sample.quality_spec as any
  const qualityName = qualitySpec?.custom_name
    || qualitySpec?.template?.name_en
    || null

  return NextResponse.json({
    certified: true,
    public_reference: publicReference.reference,
    certificate_number: certificate?.certificate_number || null,
    status: certificate?.is_rejected ? 'REJECTED' : 'APPROVED',
    approval_date: certificate?.created_at || null,
    origin: sample.origin,
    quality_name: qualityName,
    screen_distribution: screenSizes,
    primary_defects: primaryDefects,
    secondary_defects: secondaryDefects,
    total_defects: totalDefects,
    taints: totalTaints,
    faults: totalFaults,
    clean_cup: assessment?.clean_cup ?? null,
    uniform_cup: assessment?.uniform_cup ?? null,
    has_pdf: !!certificate?.pdf_url,
  })
}
