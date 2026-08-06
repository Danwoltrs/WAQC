import { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import {
  resolveSampleIdForSlug,
  resolvePublicReference,
  resolveLotReference,
  resolveContractReference,
} from '@/lib/certificate-slug'
import { evaluateSampleCompliance } from '@/lib/compliance'
import {
  screenGramsToPercent,
  resolveDefectCounts,
  resolveTaintFaultCounts,
  resolveFinalScores,
  isFlavorDescriptor,
  type CuppingScoreRow,
} from '@/lib/quality-resolvers'
import { resolveCompanyName } from '@/lib/sleeve-label-data'
import { resolveFlavorDescriptor } from '@/lib/certificate-data'
import { buildChecklistRows, screenDirection } from '@/lib/certificate-checklist'
import type { CertificateView, AttributeRail, ScreenBar } from './_components/types'
import { Verdict } from './_components/verdict'
import { LotIdentity } from './_components/lot-identity'
import { SpecChecklist } from './_components/spec-checklist'
import { CertificateDetail } from './_components/certificate-detail'
import { CertificateFooter } from './_components/certificate-footer'

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
  // The slug is the OFFICIAL certificate number on tins printed since the label
  // rebuild, and the internal tracking number on everything printed before it.
  const sampleId = await resolveSampleIdForSlug(supabase, slug)
  if (!sampleId) return null

  const sampleSelect = `
    id,
    tracking_number,
    origin,
    workflow_stage,
    status,
    sample_type,
    container_nr,
    exporter_sample_number,
    buyer_contract_nr,
    wolthers_contract_nr,
    quality_spec_id,
    bag_count,
    bag_weight_kg,
    bag_type,
    bags_quantity_mt,
    exporter:companies!samples_exporter_id_fkey(name, fantasy_name),
    seller:companies!samples_seller_id_fkey(name, fantasy_name),
    quality_spec:client_qualities(custom_name, quality_code, template:quality_templates(name_en, parameters))
  `
  const { data: sampleRow } = await supabase
    .from('samples')
    .select(sampleSelect)
    .eq('id', sampleId)
    .is('deleted_at', null)
    .maybeSingle()

  const sample: any = sampleRow
  if (!sample) return null

  // The page shows the counterparty's own identifier, never samples.tracking_number.
  const referenceSource = {
    sampleType: sample.sample_type,
    containerNr: sample.container_nr,
    exporterSampleNumber: sample.exporter_sample_number,
    buyerContractNr: sample.buyer_contract_nr,
    wolthersContractNr: sample.wolthers_contract_nr,
  }
  const publicReference = resolvePublicReference(referenceSource)
  const lotReference = resolveLotReference(referenceSource)
  const contract = resolveContractReference(referenceSource)

  const isCertified = sample.workflow_stage === 'certified' || sample.workflow_stage === 'rejected'
  if (!isCertified) {
    return { sample, publicReference, lotReference, contract, certified: false as const }
  }

  // Get certificate
  const { data: certificate } = await supabase
    .from('certificates')
    .select(
      'id, certificate_number, status, is_rejected, created_at, pdf_url, compliance_violations, override_comment',
    )
    .eq('sample_id', sample.id)
    .is('sample_contract_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Get quality assessment (green bean + cup status).
  const { data: assessment } = await supabase
    .from('quality_assessments')
    .select('green_bean_data, clean_cup, uniform_cup')
    .eq('sample_id', sample.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const greenBean = assessment?.green_bean_data as any
  const defects = greenBean?.defects
  // One reading, shared with the approval gate. The total is always the
  // computed sum — a stored defects.total is never honoured, because the gate
  // has never honoured it.
  const defectCounts = resolveDefectCounts(defects)
  const totalDefects = defectCounts?.total ?? null

  const cleanCup = assessment?.clean_cup ?? null
  const uniformCup = assessment?.uniform_cup ?? null

  // Get cupping scores for taints, faults, and attribute averages
  const { data: cuppingScores } = await supabase
    .from('cupping_scores')
    .select('scores, defects, cupper_id')
    .eq('sample_id', sample.id)

  // Taints and faults come from the same reading the approval gate uses. The
  // page used to prefer quality_assessments.resolved_defects, which could show
  // "0 taints" beside a checklist row failing on taints.
  const scoreRows = (cuppingScores || []) as unknown as CuppingScoreRow[]

  let masterCupperId: string | null = null
  if (scoreRows.length > 0) {
    const { data: session } = await (supabase as any)
      .from('cupping_sessions')
      .select('master_cupper_id')
      .contains('sample_ids', [sample.id])
      .in('status', ['setup', 'active', 'review', 'completed', 'finalized'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    masterCupperId = session?.master_cupper_id || null
  }

  // resolveTaintFaultCounts always returns numbers (0 when nothing was
  // flagged), so a never-cupped lot must be told apart here — the footer
  // shows a dash for no data, matching how Clean/Uniform already behave,
  // rather than a confident "0" that implies it was checked.
  const hasCuppingData = scoreRows.length > 0
  const { taints: totalTaints, faults: totalFaults } =
    resolveTaintFaultCounts(scoreRows, masterCupperId)
  const finalScores = resolveFinalScores(scoreRows, masterCupperId)

  // Build cupping attribute validation lookup from quality template
  const qualitySpec = sample.quality_spec as any
  const qualityName = qualitySpec?.custom_name || qualitySpec?.template?.name_en || null
  const templateParams = qualitySpec?.template?.parameters as {
    cupping_attributes?:
      | Array<{
          attribute: string
          validation_rule?: { min_value?: number; max_value?: number }
          scale?: { min?: number; max?: number }
        }>
      | Record<string, { min?: number; max?: number }>
  } | undefined

  const attrLimitsMap: Record<string, { min?: number; max?: number }> = {}
  const attrScaleMap: Record<string, { scaleMin?: number; scaleMax?: number }> = {}
  const cuppingAttrs = templateParams?.cupping_attributes
  if (Array.isArray(cuppingAttrs)) {
    for (const ca of cuppingAttrs) {
      if (ca.validation_rule) {
        attrLimitsMap[ca.attribute.toLowerCase()] = {
          min: ca.validation_rule.min_value,
          max: ca.validation_rule.max_value,
        }
      }
      if (ca.scale) {
        attrScaleMap[ca.attribute.toLowerCase()] = {
          scaleMin: ca.scale.min,
          scaleMax: ca.scale.max,
        }
      }
    }
  } else if (cuppingAttrs && typeof cuppingAttrs === 'object') {
    // Record<string, {min, max}> shape (see compliance-criteria.ts) — carries
    // limits directly and no scale, so scales fall back to the 0–5 default.
    for (const [attr, limits] of Object.entries(cuppingAttrs)) {
      if (limits && typeof limits === 'object') {
        attrLimitsMap[attr.toLowerCase()] = { min: limits.min, max: limits.max }
      }
    }
  }

  // The cup profile category ("Strictly Soft", "Hard"). A master-cupper edit in
  // green_bean_data.cup_profile wins; otherwise the most common descriptor
  // across cuppers. Same resolver the PDF certificate uses, so the printed and
  // scanned certificates can never disagree.
  const flavorDescriptors = scoreRows
    .flatMap(row => Object.entries((row.scores || {}) as Record<string, unknown>))
    .filter(([attr, value]) => isFlavorDescriptor(attr) && typeof value === 'string')
    .map(([, value]) => (value as string).trim())
    .filter(Boolean)
  const cupProfile = resolveFlavorDescriptor(greenBean?.cup_profile, flavorDescriptors)

  // Boolean cup judgements are not scored attributes and must not get a rail.
  const BOOLEAN_CUP_NAMES = [
    'clean cup', 'cleancup', 'clean_cup',
    'uniform cup', 'uniformcup', 'uniform_cup', 'uniformity',
    'taints', 'taint', 'faults', 'fault',
  ]

  const standardOrder = [
    'Fragrance/Aroma', 'Fragrance', 'Aroma', 'Flavor', 'Aftertaste',
    'Acidity', 'Body', 'Balance', 'Sweetness', 'Overall',
  ]

  const attributes: AttributeRail[] = Object.entries(finalScores)
    .filter(([attr]) => !BOOLEAN_CUP_NAMES.includes(attr.toLowerCase()))
    // Defence in depth: resolveFinalScores already drops non-numeric values, so
    // a text descriptor cannot reach here — but a template that stores the
    // profile as a coded number would, and would get an axis with a meaningless
    // score on it.
    .filter(([attr]) => !isFlavorDescriptor(attr))
    .sort(([a], [b]) => {
      const ai = standardOrder.findIndex(s => a.toLowerCase().includes(s.toLowerCase()))
      const bi = standardOrder.findIndex(s => b.toLowerCase().includes(s.toLowerCase()))
      if (ai === -1 && bi === -1) return a.localeCompare(b)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
    .map(([attr, score]) => {
      const limits = attrLimitsMap[attr.toLowerCase()]
      const scale = attrScaleMap[attr.toLowerCase()]
      return {
        attribute: attr,
        score: Math.round(score * 100) / 100,
        min: limits?.min ?? null,
        max: limits?.max ?? null,
        scaleMin: scale?.scaleMin ?? 0,
        scaleMax: scale?.scaleMax ?? 5,
      }
    })

  const criteria = await evaluateSampleCompliance(supabase, sample.id, sample.quality_spec_id ?? null)
  const rows = buildChecklistRows(criteria, { cleanCup, uniformCup })

  // F1: evaluateSampleCompliance returns [] for three different states — no
  // quality spec, a template that failed to load, and a genuine evaluation
  // that produced no criteria. A sample WITH a spec that yields nothing means
  // the template did not load; saying nothing is honest, but it must be
  // visible in the logs rather than looking like a clean bill of health.
  if (sample.quality_spec_id && criteria.length === 0) {
    console.warn(
      `[certificate] sample ${sample.id} has quality_spec_id ${sample.quality_spec_id} but produced no compliance criteria — template may have failed to load`,
    )
  }

  // Screens: grams in storage, percentages everywhere else. A screen dims
  // when it fails a MINIMUM constraint — never merely for exceeding a
  // maximum, which would visually read as "too low" for the opposite
  // problem. `screenDirection` reads the criterion's key suffix, the same
  // structural signal certificate-checklist.ts uses for its own limit
  // formatting.
  const screenPercentages = screenGramsToPercent(greenBean?.screen_sizes)
  const failingMinScreens = new Set(
    criteria
      .filter(c => c.key.startsWith('screen_') && !c.passed && screenDirection(c.key) === 'min')
      .map(c => c.label),
  )
  const screens: ScreenBar[] = screenPercentages
    ? Object.entries(screenPercentages)
        .sort(([a], [b]) => {
          const pan = (s: string) => ['pan', 'fundo', 'bottom'].includes(s.toLowerCase())
          if (pan(a) !== pan(b)) return pan(a) ? 1 : -1
          return parseInt(b.replace(/\D/g, '') || '0') - parseInt(a.replace(/\D/g, '') || '0')
        })
        .map(([size, percent]) => {
          const isPan = ['pan', 'fundo', 'bottom'].includes(size.toLowerCase())
          return {
            label: isPan ? 'Pan' : `Scr. ${size.replace(/\D/g, '') || size}`,
            percent,
            // Pan dims unconditionally — a deliberate visual choice, not a
            // spec judgement.
            dim: isPan || failingMinScreens.has(`Screen ${size}`),
          }
        })
    : []

  // A template can configure several screen constraints (e.g. a minimum on
  // one screen and a maximum on another, or both on the same one) — state
  // all of them rather than only the first the engine happened to emit.
  const screenCriteria = criteria.filter(c => c.key.startsWith('screen_'))
  const screenSpecNote = screenCriteria.length > 0
    ? `Spec requires ${screenCriteria
        .map(c => {
          const actual = typeof c.actual === 'number' ? c.actual.toFixed(1) : c.actual
          return `${c.sublabel} on ${c.label.toLowerCase()} (this lot: ${actual}%)`
        })
        .join('; ')}.`
    : null

  return {
    sample,
    publicReference,
    lotReference,
    contract,
    certified: true as const,
    certificate,
    qualityName,
    screenSizes: screenPercentages,
    totalDefects,
    totalTaints: hasCuppingData ? totalTaints : null,
    totalFaults: hasCuppingData ? totalFaults : null,
    cleanCup,
    uniformCup,
    rows,
    screens,
    screenSpecNote,
    attributes,
    cupProfile,
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
  // Public reference — never the internal SAN- lab number.
  const trackingNumber = info.publicReference.reference
  const screenSummary = buildScreenSummary((info.screenSizes ?? null) as Record<string, number> | null)

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

/**
 * Slim and sticky — the old header ate ~15% of the viewport before any content.
 *
 * Carries the certificate and contract numbers so they stay on screen the whole
 * way down: someone reading the checklist half a page below still needs to know
 * which lot they are looking at, and scrolling back up to check is exactly the
 * friction this page exists to remove.
 *
 * Before a certificate exists there are no numbers to carry, so it falls back
 * to the "Verified certificate" line it has always shown.
 */
function CertificateHeader({
  certificateNumber = null,
  contract = null,
}: {
  certificateNumber?: string | null
  contract?: { label: string; value: string } | null
}) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-2.5 bg-[#262625] border-b border-[#3f3f3c]">
      {/* eslint-disable-next-line @next/next/no-img-element -- a static brand
          mark in a server component; next/image buys nothing and adds a
          client-side loader to an otherwise fully static page. */}
      <img
        src="/images/logos/wolthers-logo-green.svg"
        alt="Wolthers Associates"
        className="h-[26px] w-auto shrink-0"
      />
      {certificateNumber ? (
        <div className="min-w-0 text-right">
          <div className="flex items-center justify-end gap-[5px] text-[12px] font-semibold text-[#f2efe6]">
            <span
              className="w-1.5 h-1.5 rounded-full bg-[#5fae63] shrink-0"
              aria-hidden="true"
            />
            <span className="sr-only">Verified certificate</span>
            <span className="truncate">{certificateNumber}</span>
          </div>
          {contract && (
            <div className="text-[10.5px] text-[#7c7a73] truncate">
              {contract.label} {contract.value}
            </div>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-[#7c7a73] flex items-center gap-[5px] shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#5fae63]" aria-hidden="true" />
          Verified certificate
        </div>
      )}
    </div>
  )
}

/** "334 bags · 20.0 MT", or whichever half is known. */
function formatQuantity(sample: {
  bag_count?: number | null
  bags_quantity_mt?: number | null
}): string | null {
  const parts: string[] = []
  if (sample.bag_count) parts.push(`${sample.bag_count} bags`)
  if (sample.bags_quantity_mt) parts.push(`${sample.bags_quantity_mt.toFixed(1)} MT`)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** "60 kg jute bags" */
function formatBagType(sample: {
  bag_weight_kg?: number | null
  bag_type?: string | null
}): string | null {
  const parts: string[] = []
  if (sample.bag_weight_kg) parts.push(`${sample.bag_weight_kg} kg`)
  if (sample.bag_type) parts.push(sample.bag_type.replace(/_/g, ' '))
  return parts.length > 0 ? parts.join(' ') : null
}

export default async function CertificatePage({ params }: PageProps) {
  const { slug } = await params
  const info = await getCertificateInfo(slug)

  if (!info) {
    return (
      <main className="min-h-dvh bg-[#262625] text-[#f2efe6] flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold mb-2">Certificate not found</h1>
          <p className="text-sm text-[#a8a69d]">
            The requested certificate could not be found.
          </p>
        </div>
      </main>
    )
  }

  // Per the spec: surface the samples that reached the page with nothing a
  // counterparty would recognise, so intake can fill the missing field in.
  if (info.publicReference.reference === 'Reference pending') {
    console.warn(`[certificate] no public reference for sample ${info.sample.id} (slug ${slug})`)
  }

  if (!info.certified) {
    return (
      <main className="min-h-dvh bg-[#262625] text-[#f2efe6]">
        <CertificateHeader />
        <div className="mx-auto w-full max-w-[420px] px-4 py-10 text-center">
          <div className="text-[10px] tracking-[0.12em] uppercase text-[#7c7a73] font-semibold mb-1">
            {info.publicReference.eyebrow}
          </div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] mb-4">
            {info.publicReference.reference}
          </h1>
          <p className="text-sm text-[#a8a69d]">
            This sample is still being evaluated. The certificate appears here once
            the quality assessment is complete.
          </p>
        </div>
      </main>
    )
  }

  const sample = info.sample
  const view: CertificateView = {
    certificateNumber: info.certificate?.certificate_number ?? null,
    contract: info.contract,
    lotReference: info.lotReference,
    reference: info.publicReference.reference,
    eyebrow: info.publicReference.eyebrow,
    status: info.certificate?.is_rejected ? 'REJECTED' : 'APPROVED',
    qualityName: info.qualityName ?? null,
    exporter: resolveCompanyName(sample.seller) || resolveCompanyName(sample.exporter),
    origin: sample.origin || null,
    quantity: formatQuantity(sample),
    certifiedDate: info.certificate?.created_at
      ? new Date(info.certificate.created_at).toLocaleDateString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
        })
      : null,
    bagType: formatBagType(sample),
    rows: info.rows,
    screens: info.screens,
    screenSpecNote: info.screenSpecNote,
    attributes: info.attributes,
    cupProfile: info.cupProfile,
    taints: info.totalTaints,
    faults: info.totalFaults,
    cleanCup: info.cleanCup,
    uniformCup: info.uniformCup,
    pdfUrl: `/api/certificate/${slug}/pdf`,
    complianceViolations: info.certificate?.compliance_violations ?? null,
    overrideComment: info.certificate?.override_comment ?? null,
  }

  return (
    <main className="min-h-dvh bg-[#262625] text-[#f2efe6]">
      <div className="mx-auto w-full max-w-[420px] pb-[104px]">
        <CertificateHeader
          certificateNumber={view.certificateNumber}
          contract={view.contract}
        />
        <Verdict view={view} />
        <LotIdentity view={view} />
        <SpecChecklist view={view} />
        <CertificateDetail view={view} />
        <CertificateFooter view={view} />
      </div>
    </main>
  )
}
