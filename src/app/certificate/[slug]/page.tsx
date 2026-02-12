import { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { slugToTrackingNumber, trackingNumberToSlug } from '@/lib/utils'
import { redirect } from 'next/navigation'
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
    quality_spec:client_qualities(custom_name, quality_code, template:quality_templates(name_en))
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
  const primaryDefects = defects?.total_primary ?? null
  const secondaryDefects = defects?.total_secondary ?? null
  const totalDefects = primaryDefects !== null && secondaryDefects !== null
    ? primaryDefects + secondaryDefects
    : null

  const cleanCup = assessment?.clean_cup ?? null
  const uniformCup = assessment?.uniform_cup ?? null

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
  const qualityName = qualitySpec?.custom_name || qualitySpec?.template?.name_en || null

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
  if (info.totalDefects !== null) parts.push(`Defects: ${info.totalDefects}`)
  if (screenSummary) parts.push(`Screen: ${screenSummary}`)

  const description = `${trackingNumber} | ${parts.join(' | ')}`

  return {
    title: `${trackingNumber} - ${status}`,
    description,
    openGraph: {
      title: `${trackingNumber} - ${status}`,
      description,
      type: 'website',
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

  // If not certified, redirect to authenticated sample page
  if (!info.certified) {
    redirect(`/samples/${trackingNumberToSlug(info.sample.tracking_number)}`)
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
      pdfUrl={pdfUrl}
    />
  )
}
