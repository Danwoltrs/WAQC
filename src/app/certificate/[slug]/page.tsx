import { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { slugToTrackingNumber } from '@/lib/utils'
import { CertificatePageClient } from './certificate-page-client'

// Use service role for server-side data fetching
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

interface PageProps {
  params: Promise<{ slug: string }>
}

async function getCertificateInfo(slug: string) {
  const trackingNumber = slugToTrackingNumber(slug)

  // Find sample
  let sample: any = null
  const sampleSelect = `
    id,
    tracking_number,
    origin,
    workflow_stage,
    status,
    quality_spec:client_qualities(custom_name, quality_code, template:quality_templates(name_en, parameters))
  `
  const { data: directMatch } = await supabase
    .from('samples')
    .select(sampleSelect)
    .eq('tracking_number', trackingNumber)
    .is('deleted_at', null)
    .maybeSingle()

  if (directMatch) {
    sample = directMatch
  } else {
    const { data: fallback } = await supabase
      .from('samples')
      .select(sampleSelect)
      .ilike('tracking_number', trackingNumber)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    sample = fallback
  }

  if (!sample) return null

  const isCertified = sample.workflow_stage === 'certified' || sample.workflow_stage === 'rejected'
  if (!isCertified) return { sample, certified: false }

  // Get certificate
  const { data: certificate } = await supabase
    .from('certificates')
    .select('id, certificate_number, status, is_rejected, created_at, pdf_url')
    .eq('sample_id', sample.id)
    .is('sample_contract_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Get quality assessment (green bean + cup status)
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

  const cleanCup = assessment?.clean_cup ?? null
  const uniformCup = assessment?.uniform_cup ?? null

  // Get cupping scores for taints, faults, and attribute averages
  const { data: cuppingScores } = await supabase
    .from('cupping_scores')
    .select('scores, defects')
    .eq('sample_id', sample.id)

  let totalTaints = 0
  let totalFaults = 0
  const attributeScoresMap: Record<string, number[]> = {}

  if (cuppingScores) {
    for (const score of cuppingScores) {
      if (score.defects && typeof score.defects === 'object') {
        const d = score.defects as { taints?: unknown[]; faults?: unknown[] }
        if (Array.isArray(d.taints)) totalTaints += d.taints.length
        if (Array.isArray(d.faults)) totalFaults += d.faults.length
      }
      // Collect attribute scores for averaging
      if (score.scores && typeof score.scores === 'object') {
        for (const [attr, value] of Object.entries(score.scores as Record<string, unknown>)) {
          if (typeof value !== 'number') continue
          const lower = attr.toLowerCase()
          // Skip non-chart attributes
          if (['taints', 'taint', 'faults', 'fault', 'clean cup', 'cleancup', 'clean_cup',
               'uniformity', 'uniform cup', 'uniformcup', 'uniform_cup'].includes(lower)) continue
          if (!attributeScoresMap[attr]) attributeScoresMap[attr] = []
          attributeScoresMap[attr].push(value)
        }
      }
    }
  }

  // Build cupping attribute validation lookup from quality template
  const qualitySpec = sample.quality_spec as any
  const qualityName = qualitySpec?.custom_name || qualitySpec?.template?.name_en || null
  const templateParams = qualitySpec?.template?.parameters as {
    cupping_attributes?: Array<{
      attribute: string
      validation_rule?: { min_value?: number; max_value?: number }
      scale?: { min?: number; max?: number }
    }>
  } | undefined

  const attrLimitsMap: Record<string, { min?: number; max?: number }> = {}
  if (templateParams?.cupping_attributes) {
    for (const ca of templateParams.cupping_attributes) {
      if (ca.validation_rule) {
        attrLimitsMap[ca.attribute.toLowerCase()] = {
          min: ca.validation_rule.min_value,
          max: ca.validation_rule.max_value,
        }
      }
    }
  }

  // Average cupping attributes and attach limits
  const standardOrder = [
    'Fragrance/Aroma', 'Fragrance', 'Aroma', 'Flavor', 'Aftertaste',
    'Acidity', 'Body', 'Balance', 'Sweetness', 'Overall',
  ]
  const cuppingAttributes: Array<{
    attribute: string
    value: number
    min?: number
    max?: number
  }> = Object.entries(attributeScoresMap)
    .sort(([a], [b]) => {
      const aIdx = standardOrder.findIndex(s => a.toLowerCase().includes(s.toLowerCase()))
      const bIdx = standardOrder.findIndex(s => b.toLowerCase().includes(s.toLowerCase()))
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b)
      if (aIdx === -1) return 1
      if (bIdx === -1) return -1
      return aIdx - bIdx
    })
    .map(([attr, scores]) => {
      const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      const limits = attrLimitsMap[attr.toLowerCase()]
      return {
        attribute: attr,
        value: avg,
        min: limits?.min,
        max: limits?.max,
      }
    })

  return {
    sample,
    certified: true,
    certificate,
    qualityName,
    screenSizes,
    primaryDefects,
    secondaryDefects,
    totalDefects,
    totalTaints,
    totalFaults,
    cleanCup,
    uniformCup,
    cuppingAttributes,
  }
}

/** Build a compact screen summary like "17/18 5%, 14-16 65%, 13 30%, Pan 2%" */
function buildScreenSummary(screenSizes: Record<string, number> | null): string {
  if (!screenSizes) return ''

  // Parse screen sizes into numeric keys
  const entries: Array<{ key: string; num: number; pct: number }> = []
  let panPct = 0

  for (const [key, pct] of Object.entries(screenSizes)) {
    if (pct === 0) continue
    const lower = key.toLowerCase()
    if (lower === 'pan' || lower === 'fundo' || lower === 'bottom') {
      panPct += pct
    } else {
      const num = parseInt(key.replace(/\D/g, ''))
      if (!isNaN(num)) {
        entries.push({ key, num, pct })
      }
    }
  }

  entries.sort((a, b) => b.num - a.num)

  // Group consecutive screens into ranges
  const groups: Array<{ label: string; pct: number }> = []
  let i = 0
  while (i < entries.length) {
    let j = i
    let groupPct = entries[i].pct
    // Group consecutive numbers
    while (j + 1 < entries.length && entries[j].num - entries[j + 1].num === 1) {
      j++
      groupPct += entries[j].pct
    }
    if (groupPct === 0) { i = j + 1; continue }

    if (i === j) {
      groups.push({ label: String(entries[i].num), pct: groupPct })
    } else if (j - i === 1) {
      groups.push({ label: `${entries[i].num}/${entries[j].num}`, pct: groupPct })
    } else {
      groups.push({ label: `${entries[j].num}-${entries[i].num}`, pct: groupPct })
    }
    i = j + 1
  }

  if (panPct > 0) {
    groups.push({ label: 'Pan', pct: panPct })
  }

  return groups.map(g => `${g.label} ${g.pct.toFixed(0)}%`).join(', ')
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const info = await getCertificateInfo(slug)

  if (!info || !info.certified) {
    return {
      title: 'Certificate - Wolthers Coffee QC',
      description: 'Coffee quality certificate',
    }
  }

  const status = info.certificate?.is_rejected ? 'REJECTED' : 'APPROVED'
  const trackingNumber = info.sample.tracking_number
  const screenSummary = buildScreenSummary(info.screenSizes)

  // Build rich description for iPhone camera preview
  const parts: string[] = [status]
  if (info.qualityName) parts.push(info.qualityName)
  if (info.sample.origin) parts.push(info.sample.origin)
  if (info.totalDefects !== null) parts.push(`Defects: ${info.totalDefects}`)
  if (screenSummary) parts.push(`Screen: ${screenSummary}`)

  const description = `${trackingNumber} | ${parts.join(' | ')}`

  return {
    title: `${trackingNumber} - ${status}`,
    description,
    openGraph: {
      title: `${trackingNumber} - ${status}`,
      description,
      siteName: 'Wolthers Coffee QC',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: `${trackingNumber} - ${status}`,
      description,
    },
  }
}

export default async function CertificatePage({ params }: PageProps) {
  const { slug } = await params
  const info = await getCertificateInfo(slug)

  // If sample not found, show 404
  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F9FA] dark:bg-[#2A2A2A]">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">Certificate Not Found</h1>
          <p className="text-muted-foreground">The requested certificate could not be found.</p>
        </div>
      </div>
    )
  }

  // If not certified, show in-progress page
  if (!info.certified) {
    return (
      <CertificatePageClient
        trackingNumber={info.sample.tracking_number}
        status="IN_PROGRESS"
        approvalDate={null}
        origin={info.sample.origin || 'N/A'}
        qualityName={null}
        screenSizes={null}
        primaryDefects={null}
        secondaryDefects={null}
        totalDefects={null}
        totalTaints={0}
        totalFaults={0}
        cleanCup={null}
        uniformCup={null}
        cuppingAttributes={[]}
        pdfUrl=""
      />
    )
  }

  const status = info.certificate?.is_rejected ? 'REJECTED' : 'APPROVED'
  const pdfUrl = `/api/certificate/${slug}/pdf`

  return (
    <CertificatePageClient
      trackingNumber={info.sample.tracking_number}
      status={status}
      approvalDate={info.certificate?.created_at || null}
      origin={info.sample.origin || 'N/A'}
      qualityName={info.qualityName ?? null}
      screenSizes={info.screenSizes ?? null}
      primaryDefects={info.primaryDefects ?? null}
      secondaryDefects={info.secondaryDefects ?? null}
      totalDefects={info.totalDefects ?? null}
      totalTaints={info.totalTaints ?? 0}
      totalFaults={info.totalFaults ?? 0}
      cleanCup={info.cleanCup ?? null}
      uniformCup={info.uniformCup ?? null}
      cuppingAttributes={info.cuppingAttributes ?? []}
      pdfUrl={pdfUrl}
    />
  )
}
