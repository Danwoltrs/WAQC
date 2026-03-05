'use client'

import Image from 'next/image'
import { Download, CheckCircle, XCircle, Clock } from 'lucide-react'
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer,
} from 'recharts'

interface CertificatePageClientProps {
  trackingNumber: string
  status: 'APPROVED' | 'REJECTED' | 'IN_PROGRESS'
  approvalDate: string | null
  origin: string
  qualityName: string | null
  screenSizes: Record<string, number> | null
  primaryDefects: number | null
  secondaryDefects: number | null
  totalDefects: number | null
  totalTaints: number
  totalFaults: number
  cleanCup: boolean | null
  uniformCup: boolean | null
  cuppingAttributes: Array<{ attribute: string; value: number; min?: number; max?: number }>
  pdfUrl: string
}

export function CertificatePageClient({
  trackingNumber,
  status,
  approvalDate,
  origin,
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
  pdfUrl,
}: CertificatePageClientProps) {
  const isApproved = status === 'APPROVED'
  const isInProgress = status === 'IN_PROGRESS'

  // Sort screen sizes: numbered screens descending, then Pan at the bottom always
  const sortedScreenSizes = screenSizes
    ? Object.entries(screenSizes)
        .sort(([a], [b]) => {
          const aIsPan = a.toLowerCase() === 'pan' || a.toLowerCase() === 'fundo' || a.toLowerCase() === 'bottom'
          const bIsPan = b.toLowerCase() === 'pan' || b.toLowerCase() === 'fundo' || b.toLowerCase() === 'bottom'
          if (aIsPan && !bIsPan) return 1
          if (!aIsPan && bIsPan) return -1
          if (aIsPan && bIsPan) return 0
          const numA = parseInt(a.replace(/\D/g, ''))
          const numB = parseInt(b.replace(/\D/g, ''))
          return numB - numA
        })
    : null

  const formattedDate = approvalDate
    ? new Date(approvalDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null

  // Guard: filter out Clean Cup / Uniform Cup from scored attributes (they are boolean, not numeric)
  const BOOLEAN_CUP_NAMES = ['clean cup', 'cleancup', 'clean_cup', 'uniform cup', 'uniformcup', 'uniform_cup', 'uniformity']
  const filteredCuppingAttributes = cuppingAttributes.filter(
    a => !BOOLEAN_CUP_NAMES.includes(a.attribute.toLowerCase())
  )

  // Determine radar chart scale from attribute values
  const maxValue = filteredCuppingAttributes.length > 0
    ? Math.ceil(Math.max(...filteredCuppingAttributes.map(a => a.value)))
    : 10

  // Determine consistent decimal places: if any score has decimals, all use the same precision
  const maxDecimals = filteredCuppingAttributes.reduce((max, a) => {
    const str = String(a.value)
    const dec = str.includes('.') ? str.split('.')[1].length : 0
    return Math.max(max, dec)
  }, 0)

  // Build display labels: "Attr (min-max) score"
  const radarData = filteredCuppingAttributes.map(a => {
    let limitsStr = ''
    if (a.min != null && a.max != null) {
      const mid = (a.min + a.max) / 2
      const range = (a.max - a.min) / 2
      limitsStr = Number.isInteger(range)
        ? `(${mid}+/-${range})`
        : `(${mid}+/-${range.toFixed(1)})`
    } else if (a.min != null) {
      limitsStr = `(>=${a.min})`
    } else if (a.max != null) {
      limitsStr = `(<=${a.max})`
    }
    return {
      ...a,
      label: a.attribute,
      limitsStr,
      scoreStr: maxDecimals > 0 ? a.value.toFixed(maxDecimals) : String(a.value),
    }
  })

  return (
    <div className="h-dvh bg-[#F9F9FA] dark:bg-[#2A2A2A] flex flex-col">
      {/* Fixed Header */}
      <div className="shrink-0 pt-6 pb-4 px-4">
        <div className="flex justify-center mb-3">
          <Image
            src="/images/logos/wolthers-logo-off-white.svg"
            alt="Wolthers"
            width={120}
            height={32}
            className="hidden dark:block"
            priority
          />
          <Image
            src="/images/logos/wolthers-logo-black.svg"
            alt="Wolthers"
            width={120}
            height={32}
            className="dark:hidden"
            priority
          />
        </div>
        <div className="w-full max-w-lg mx-auto flex items-center justify-between">
          <h2 className="text-xl font-semibold">{trackingNumber}</h2>
          {isInProgress ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#a9a454]/10 text-[#a9a454]">
              <Clock className="w-4 h-4" />
              <span className="font-semibold text-xs">IN PROGRESS</span>
            </div>
          ) : isApproved ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#22c55e]/10 text-[#22c55e]">
              <CheckCircle className="w-4 h-4" />
              <span className="font-semibold text-xs">APPROVED</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#ef4444]/10 text-[#ef4444]">
              <XCircle className="w-4 h-4" />
              <span className="font-semibold text-xs">REJECTED</span>
            </div>
          )}
        </div>
      </div>

      {/* In-progress state */}
      {isInProgress && (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-lg mx-auto">
            <div className="bg-white dark:bg-white/[0.04] rounded-[20px] px-6 py-10 shadow-sm border border-black/10 dark:border-white/[0.15] text-center">
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-[#a9a454]/10 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-[#a9a454]" />
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-2">Cupping & Grading in Progress</h3>
              <p className="text-sm text-muted-foreground">
                This sample is currently being evaluated. The certificate will be available once the quality assessment is complete.
              </p>
              {origin !== 'N/A' && (
                <div className="mt-6 pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
                  <p className="text-xs text-muted-foreground">Origin</p>
                  <p className="text-sm font-medium">{origin}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fixed Card Top */}
      {!isInProgress && <div className="shrink-0 px-4">
        <div className="w-full max-w-lg mx-auto">
          <div className="bg-white dark:bg-white/[0.04] rounded-t-[20px] px-6 pt-5 pb-4 shadow-sm border border-b-0 border-black/10 dark:border-white/[0.15]">
            <div className="flex justify-between items-start">
              {formattedDate && (
                <div>
                  <p className="text-xs text-muted-foreground">Certification Date</p>
                  <p className="text-sm font-medium">{formattedDate}</p>
                </div>
              )}
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Origin</p>
                <p className="text-sm font-medium">{origin}</p>
              </div>
            </div>
          </div>
        </div>
      </div>}

      {/* Scrollable Content */}
      {!isInProgress && <div className="flex-1 min-h-0 overflow-y-auto px-4 overscroll-none">
        <div className="w-full max-w-lg mx-auto min-h-full pb-8 bg-white dark:bg-white/[0.04] border-x border-black/10 dark:border-white/[0.15]">
          <div className="px-6">
            {/* Quality name */}
            {qualityName && (
              <div className="mb-4">
                <p className="text-xs text-muted-foreground">Quality</p>
                <p className="text-sm font-medium">{qualityName}</p>
              </div>
            )}

            {/* Defects row: Primary | Secondary = Total */}
            {totalDefects !== null && (
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-1">Total Defects</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-muted-foreground">
                    {primaryDefects ?? 0} primary
                  </span>
                  <span className="text-muted-foreground">|</span>
                  <span className="text-sm text-muted-foreground">
                    {secondaryDefects ?? 0} secondary
                  </span>
                  <span className="text-muted-foreground">=</span>
                  <span className="text-lg font-semibold">{totalDefects}</span>
                </div>
              </div>
            )}

            {/* Screen Size Distribution */}
            {sortedScreenSizes && sortedScreenSizes.length > 0 && (
              <div className="mb-4">
                <div className="space-y-1.5">
                  {sortedScreenSizes.map(([size, percent]) => {
                    const lower = size.toLowerCase()
                    const isPan = lower === 'pan' || lower === 'fundo' || lower === 'bottom'
                    const label = isPan
                      ? 'Pan'
                      : `Scr. ${size.replace(/\D/g, '') || size}`
                    return (
                    <div key={size} className="flex items-center gap-3">
                      <span className="text-xs font-medium w-12 text-right whitespace-nowrap">{label}</span>
                      <div className="flex-1 h-4 bg-black/[0.04] dark:bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(percent, 100)}%`,
                            backgroundColor: '#556b2f',
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium w-12">{percent.toFixed(1)}%</span>
                    </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Spider/Radar Chart for Cupping Attributes */}
            {filteredCuppingAttributes.length > 0 && (
              <>
                <div className="border-t border-black/[0.06] dark:border-white/[0.08] my-4" />
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-2">Cupping Profile</p>
                  <div className="w-full h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="60%">
                        <PolarGrid stroke="rgba(128,128,128,0.2)" />
                        <PolarAngleAxis
                          dataKey="label"
                          tick={(props: any) => {
                            const { x, y, payload, cx: chartCx, cy: chartCy } = props
                            const item = radarData.find(d => d.label === payload.value)
                            if (!item) return <text />
                            const dx = x - chartCx
                            const dy = y - chartCy
                            const anchor = Math.abs(dx) < 5 ? 'middle' : dx > 0 ? 'start' : 'end'
                            const offsetX = Math.abs(dx) < 5 ? 0 : dx > 0 ? 6 : -6
                            const offsetY = Math.abs(dx) < 5 ? (dy < 0 ? -8 : 8) : 0
                            return (
                              <g>
                                <text
                                  x={x + offsetX}
                                  y={y + offsetY}
                                  textAnchor={anchor}
                                  dominantBaseline="central"
                                  style={{ fontSize: 9 }}
                                  fill="rgba(128,128,128,0.6)"
                                >
                                  {item.label}
                                </text>
                                <text
                                  x={x + offsetX}
                                  y={y + offsetY + 12}
                                  textAnchor={anchor}
                                  dominantBaseline="central"
                                  style={{ fontSize: 10, fontWeight: 600 }}
                                  fill="#556b2f"
                                >
                                  {item.scoreStr}
                                </text>
                              </g>
                            )
                          }}
                        />
                        <PolarRadiusAxis
                          angle={90}
                          domain={[0, maxValue]}
                          tick={{ fill: 'rgba(128,128,128,0.4)', fontSize: 9 }}
                          tickCount={5}
                        />
                        <Radar
                          dataKey="value"
                          stroke="#556b2f"
                          fill="#556b2f"
                          fillOpacity={0.25}
                          strokeWidth={2}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Score list underneath */}
                  <div className="mt-2 space-y-1.5">
                    {radarData.map(item => (
                      <div key={item.label} className="flex items-center justify-between">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xs text-muted-foreground">{item.label}</span>
                          {item.limitsStr && (
                            <span className="text-[10px] text-muted-foreground/50">{item.limitsStr}</span>
                          )}
                        </div>
                        <span className="text-xs font-semibold" style={{ color: '#556b2f' }}>{item.scoreStr}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

          </div>
        </div>
      </div>}

      {/* Fixed Footer - Card bottom (Taints/Faults) + Download Button */}
      {!isInProgress && <div className="shrink-0 px-4 pb-6 bg-[#F9F9FA] dark:bg-[#2A2A2A]">
        <div className="w-full max-w-lg mx-auto">
          {/* Card bottom with rounded corners */}
          <div className="bg-white dark:bg-white/[0.04] rounded-b-[20px] px-6 pb-5 pt-0 border border-t-0 border-black/10 dark:border-white/[0.15]">
            <div className="border-t border-black/[0.06] dark:border-white/[0.08] pt-4" />
            <div className="flex justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Taints</p>
                <p className="text-sm font-medium">{totalTaints}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Faults</p>
                <p className="text-sm font-medium">{totalFaults}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Clean Cup</p>
                <p className={`text-sm font-medium ${cleanCup === true ? 'text-[#22c55e]' : cleanCup === false ? 'text-[#ef4444]' : ''}`}>
                  {cleanCup === true ? 'Yes' : cleanCup === false ? 'No' : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Uniform Cup</p>
                <p className={`text-sm font-medium ${uniformCup === true ? 'text-[#22c55e]' : uniformCup === false ? 'text-[#ef4444]' : ''}`}>
                  {uniformCup === true ? 'Yes' : uniformCup === false ? 'No' : '-'}
                </p>
              </div>
            </div>
          </div>
          <div className="h-3" />
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-[12px] bg-[#556b2f] text-white font-medium text-sm hover:bg-[#556b2f]/90 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Certificate PDF
          </a>
        </div>
      </div>}
    </div>
  )
}
