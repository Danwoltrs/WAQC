import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'
import { excludeCvaScores, excludeCvaSessions } from '@/lib/cupping-protocol-scope'
import {
  parseCertificatePath,
  resolveSampleIdForSlug,
  resolvePublicReference,
} from '@/lib/certificate-slug'
import {
  screenGramsToPercent,
  resolveDefectCounts,
  resolveTaintFaultCounts,
  type CuppingScoreRow,
} from '@/lib/quality-resolvers'

export const runtime = 'nodejs'
export const alt = 'Wolthers Coffee QC Certificate'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export default async function OGImage({ params }: { params: Promise<{ path: string[] }> }) {
  const parsed = parseCertificatePath((await params).path)
  const slug = parsed?.numberSlug ?? ''

  // The slug is the OFFICIAL certificate number on tins printed since the label
  // rebuild, and the internal tracking number on everything printed before it.
  const sampleId = parsed && (await resolveSampleIdForSlug(supabase, slug, parsed.buyerSlug))

  let sample: any = null
  if (sampleId) {
    const { data } = await supabase
      .from('samples')
      .select(`
        id, tracking_number, origin, sample_type, container_nr,
        exporter_sample_number, buyer_contract_nr, wolthers_contract_nr,
        quality_spec:client_qualities(custom_name, quality_code, template:quality_templates(name_en))
      `)
      .eq('id', sampleId)
      .is('deleted_at', null)
      .maybeSingle()
    sample = data
  }

  if (!sample) {
    return new ImageResponse(
      (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#2A2A2A', color: '#fff', fontSize: 32 }}>
          Certificate Not Found
        </div>
      ),
      { ...size }
    )
  }

  // The card shows the counterparty's own identifier, never the internal
  // SAN- lab number.
  const { reference } = resolvePublicReference({
    sampleType: sample.sample_type,
    containerNr: sample.container_nr,
    exporterSampleNumber: sample.exporter_sample_number,
    buyerContractNr: sample.buyer_contract_nr,
    wolthersContractNr: sample.wolthers_contract_nr,
  })

  // Certificate
  const { data: certificate } = await supabase
    .from('certificates')
    .select('is_rejected, created_at')
    .eq('sample_id', sample.id)
    .is('sample_contract_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Quality assessment
  const { data: assessment } = await supabase
    .from('quality_assessments')
    .select('green_bean_data, clean_cup, uniform_cup')
    .eq('sample_id', sample.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const greenBean = assessment?.green_bean_data as any
  // Stored in grams, rendered as percentages.
  const screenSizes = screenGramsToPercent(greenBean?.screen_sizes as Record<string, number> | null)
  const defects = greenBean?.defects
  // One reading, shared with the approval gate. The total is always the
  // computed sum — a stored defects.total is never honoured, because the gate
  // has never honoured it.
  const defectCounts = resolveDefectCounts(defects)
  const primaryDefects = defectCounts?.primary ?? null
  const secondaryDefects = defectCounts?.secondary ?? null
  const totalDefects = defectCounts?.total ?? null

  const isRejected = certificate?.is_rejected === true
  const status = isRejected ? 'REJECTED' : 'APPROVED'
  const statusColor = isRejected ? '#ef4444' : '#22c55e'

  const qualitySpec = sample.quality_spec as any
  const qualityName = qualitySpec?.custom_name || qualitySpec?.template?.name_en || null

  const formattedDate = certificate?.created_at
    ? new Date(certificate.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null

  // Build sorted screen sizes for display (top 5 + Pan)
  const screenEntries: Array<{ label: string; pct: number }> = []
  if (screenSizes) {
    for (const [key, pct] of Object.entries(screenSizes)) {
      if (pct === 0) continue
      const lower = key.toLowerCase()
      const isPan = lower === 'pan' || lower === 'fundo' || lower === 'bottom'
      const label = isPan ? 'Pan' : `Scr. ${key.replace(/\D/g, '') || key}`
      const num = isPan ? -1 : parseInt(key.replace(/\D/g, ''))
      screenEntries.push({ label, pct })
    }
    // Sort: numbered descending, Pan last
    screenEntries.sort((a, b) => {
      if (a.label === 'Pan') return 1
      if (b.label === 'Pan') return -1
      const numA = parseInt(a.label.replace(/\D/g, ''))
      const numB = parseInt(b.label.replace(/\D/g, ''))
      return numB - numA
    })
  }

  // Cupping scores for taints/faults — same reading as the approval gate: a
  // designated master cupper's record is authoritative, otherwise the max
  // across cuppers (two cuppers flagging the same taint is one taint, not two).
  const { data: cuppingScores } = await excludeCvaScores(supabase
    .from('cupping_scores')
    .select('scores, defects, cupper_id')
    .eq('sample_id', sample.id))

  const scoreRows = (cuppingScores || []) as unknown as CuppingScoreRow[]

  let masterCupperId: string | null = null
  if (scoreRows.length > 0) {
    // Commodity sessions only: a CVA session designates no master cupper, so
    // letting it win here silently demotes the master cupper's reading.
    const { data: session } = await excludeCvaSessions((supabase as any)
      .from('cupping_sessions')
      .select('master_cupper_id')
      .contains('sample_ids', [sample.id])
      .in('status', ['setup', 'active', 'review', 'completed']))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    masterCupperId = session?.master_cupper_id || null
  }

  const { taints: totalTaints, faults: totalFaults } =
    resolveTaintFaultCounts(scoreRows, masterCupperId)

  const cleanCup = assessment?.clean_cup
  const uniformCup = assessment?.uniform_cup

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: '#2A2A2A',
          color: '#ffffff',
          fontFamily: 'Inter, sans-serif',
          padding: '48px',
        }}
      >
        {/* Left side - main info */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
          {/* Top: branding + public reference */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 18, color: 'rgba(255,255,255,0.5)', marginBottom: 8, letterSpacing: 2 }}>
              WOLTHERS COFFEE QC
            </div>
            <div style={{ display: 'flex', fontSize: 42, fontWeight: 700, marginBottom: 12 }}>
              {reference}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 20,
                fontWeight: 600,
                color: statusColor,
                marginBottom: 24,
              }}
            >
              {status}
            </div>
          </div>

          {/* Middle: details grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Date + Origin + Quality */}
            <div style={{ display: 'flex', gap: 40 }}>
              {formattedDate && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Date</div>
                  <div style={{ fontSize: 18, fontWeight: 500 }}>{formattedDate}</div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Origin</div>
                <div style={{ fontSize: 18, fontWeight: 500 }}>{sample.origin || 'N/A'}</div>
              </div>
              {qualityName && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Quality</div>
                  <div style={{ fontSize: 18, fontWeight: 500 }}>{qualityName}</div>
                </div>
              )}
            </div>

            {/* Defects row */}
            {totalDefects !== null && (
              <div style={{ display: 'flex', gap: 40 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Total Defects</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 28, fontWeight: 700 }}>{totalDefects}</span>
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
                      ({primaryDefects ?? 0} primary | {secondaryDefects ?? 0} secondary)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom stats */}
            <div style={{ display: 'flex', gap: 32 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Taints</div>
                <div style={{ fontSize: 18, fontWeight: 500 }}>{totalTaints}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Faults</div>
                <div style={{ fontSize: 18, fontWeight: 500 }}>{totalFaults}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Clean Cup</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: cleanCup === true ? '#22c55e' : cleanCup === false ? '#ef4444' : 'rgba(255,255,255,0.5)' }}>
                  {cleanCup === true ? 'Yes' : cleanCup === false ? 'No' : '-'}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Uniform Cup</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: uniformCup === true ? '#22c55e' : uniformCup === false ? '#ef4444' : 'rgba(255,255,255,0.5)' }}>
                  {uniformCup === true ? 'Yes' : uniformCup === false ? 'No' : '-'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - screen distribution bars */}
        {screenEntries.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 340,
              marginLeft: 48,
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
              Screen Distribution
            </div>
            {screenEntries.map(({ label, pct }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', width: 55, justifyContent: 'flex-end', fontSize: 13, fontWeight: 500 }}>
                  {label}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flex: 1,
                    height: 16,
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      height: '100%',
                      background: '#556b2f',
                      borderRadius: 8,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', width: 44, fontSize: 13, fontWeight: 500 }}>
                  {pct.toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    { ...size }
  )
}
