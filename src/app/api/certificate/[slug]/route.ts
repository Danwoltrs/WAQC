import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveSampleIdForSlug } from '@/lib/certificate-slug'

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
    const sampleId = await resolveSampleIdForSlug(supabase, slug)
    if (!sampleId) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    const { data: sample } = await supabase
      .from('samples')
      .select(`
        id,
        tracking_number,
        origin,
        workflow_stage,
        status,
        quality_spec_id,
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
  const isCertified = sample.workflow_stage === 'certified' || sample.workflow_stage === 'rejected'

  if (!isCertified) {
    return NextResponse.json({
      certified: false,
      tracking_number: sample.tracking_number,
      message: 'Sample has not been certified yet',
    })
  }

  // Get certificate record
  const { data: certificate } = await supabase
    .from('certificates')
    .select('id, certificate_number, status, is_rejected, created_at, pdf_url')
    .eq('sample_id', sample.id)
    .is('sample_contract_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Get quality assessment for screen sizes, defects, and cup status
  const { data: assessment } = await supabase
    .from('quality_assessments')
    .select('green_bean_data, clean_cup, uniform_cup')
    .eq('sample_id', sample.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const greenBean = assessment?.green_bean_data as any
  const screenSizes = greenBean?.screen_sizes || null
  const defects = greenBean?.defects
  // Grading saves as { primary, secondary, total }; certificate-data.ts uses { total_primary, total_secondary }
  const primaryDefects = defects?.total_primary ?? defects?.primary ?? null
  const secondaryDefects = defects?.total_secondary ?? defects?.secondary ?? null
  const totalDefects = defects?.total ?? (primaryDefects !== null && secondaryDefects !== null
    ? primaryDefects + secondaryDefects
    : null)

  // Get cupping scores for taints and faults
  const { data: cuppingScores } = await supabase
    .from('cupping_scores')
    .select('defects')
    .eq('sample_id', sample.id)

  let totalTaints = 0
  let totalFaults = 0
  if (cuppingScores) {
    for (const score of cuppingScores) {
      if (score.defects && typeof score.defects === 'object') {
        const d = score.defects as { taints?: unknown[]; faults?: unknown[] }
        if (Array.isArray(d.taints)) totalTaints += d.taints.length
        if (Array.isArray(d.faults)) totalFaults += d.faults.length
      }
    }
  }

  const qualitySpec = sample.quality_spec as any
  const qualityName = qualitySpec?.custom_name
    || qualitySpec?.template?.name_en
    || null

  return NextResponse.json({
    certified: true,
    tracking_number: sample.tracking_number,
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
