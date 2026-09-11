import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveSampleIdForSlug, resolvePublicReference } from '@/lib/certificate-slug'
import { excludeCvaScores, excludeCvaSessions } from '@/lib/cupping-protocol-scope'
import { labSourceId } from '@/lib/sample-group'
import {
  resolveDefectCounts,
  resolveTaintFaultCounts,
  type ResolvedDefects,
  type CuppingScoreRow,
} from '@/lib/quality-resolvers'
import { fetchIssuedValues } from '@/lib/tolerance/fetch'
import { resolvePublicCertificateNumbers } from '@/app/certificate/[...path]/certificate-view-model'

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
    .select('*')
    .eq('sample_id', labSampleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const greenBean = assessment?.green_bean_data as any
  const defects = greenBean?.defects

  // This endpoint is UNAUTHENTICATED and service-role: it is the machine-
  // readable twin of the page a buyer reaches by scanning the tin, and it is
  // documented as public. It must therefore publish exactly the numbers that
  // page publishes — including the ISSUED values when the lot was approved
  // with comments. Deriving here (screenGramsToPercent + resolveDefectCounts on
  // the raw data) is precisely the independent-derivation divergence this
  // feature exists to close, and here it leaked real out-of-spec measurements
  // to anyone holding the slug.
  //
  // resolvePublicCertificateNumbers is the page's own resolver, called with the
  // page's own arguments, so the tin and this payload cannot disagree. Screens
  // are stored in grams; the resolver publishes percentages, as this endpoint
  // has always done.
  const issuedValues = await fetchIssuedValues(supabase, sample.id, labSampleId)
  const publicNumbers = resolvePublicCertificateNumbers(greenBean, issuedValues)
  const screenSizes = publicNumbers.screenPercentages

  // One reading, shared with the approval gate. The total is always the
  // computed sum — a stored defects.total is never honoured, because the gate
  // has never honoured it. A decision's issued split supersedes it, matching
  // what the PDF and the page print for the same lot.
  const defectCounts = resolveDefectCounts(defects)
  const issuedDefects = issuedValues?.defects ?? null
  const primaryDefects = issuedDefects ? issuedDefects.primary : defectCounts?.primary ?? null
  const secondaryDefects = issuedDefects ? issuedDefects.secondary : defectCounts?.secondary ?? null
  const totalDefects = publicNumbers.totalDefects

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

  // Prefer the list the validator settled on, exactly as the PDF, the public
  // page and the approval gate do (mig 20260910000000) — otherwise a taint the
  // panel removed reappears in this payload alone.
  const { taints: totalTaints, faults: totalFaults } = resolveTaintFaultCounts(
    scoreRows,
    masterCupperId,
    (assessment as { resolved_defects?: ResolvedDefects | null } | null)?.resolved_defects ?? null,
  )

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
