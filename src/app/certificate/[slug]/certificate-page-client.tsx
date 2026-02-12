'use client'

import Image from 'next/image'
import { Download, CheckCircle, XCircle } from 'lucide-react'

interface CertificatePageClientProps {
  trackingNumber: string
  status: 'APPROVED' | 'REJECTED'
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
  pdfUrl,
}: CertificatePageClientProps) {
  const isApproved = status === 'APPROVED'

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

  return (
    <div className="min-h-screen bg-[#F9F9FA] dark:bg-[#2A2A2A] flex flex-col items-center px-4 py-8">
      {/* Header with logo */}
      <div className="w-full max-w-lg mb-4 flex flex-col items-center">
        <Image
          src="/images/logos/wolthers-logo-off-white.svg"
          alt="Wolthers"
          width={120}
          height={32}
          className="mb-3 hidden dark:block"
          priority
        />
        <Image
          src="/images/logos/wolthers-logo-black.svg"
          alt="Wolthers"
          width={120}
          height={32}
          className="mb-3 dark:hidden"
          priority
        />
        <h2 className="text-xl font-semibold">{trackingNumber}</h2>
      </div>

      {/* Status Badge */}
      <div className="mb-6">
        {isApproved ? (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#22c55e]/10 text-[#22c55e]">
            <CheckCircle className="w-5 h-5" />
            <span className="font-semibold text-sm">APPROVED</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#ef4444]/10 text-[#ef4444]">
            <XCircle className="w-5 h-5" />
            <span className="font-semibold text-sm">REJECTED</span>
          </div>
        )}
      </div>

      {/* Main Card */}
      <div className="w-full max-w-lg bg-white dark:bg-white/[0.04] rounded-[20px] p-6 shadow-sm border border-black/10 dark:border-white/[0.15]">
        {/* Top row: Date left, Origin right */}
        <div className="flex justify-between items-start mb-4">
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

        {/* Separator */}
        <div className="border-t border-black/[0.06] dark:border-white/[0.08] my-4" />

        {/* Taints & Faults */}
        <div className="flex justify-between mb-4">
          <div>
            <p className="text-xs text-muted-foreground">Taints</p>
            <p className="text-sm font-medium">{totalTaints}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Faults</p>
            <p className="text-sm font-medium">{totalFaults}</p>
          </div>
          {/* Clean Cup & Uniform Cup */}
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

        {/* Download Button */}
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

      {/* Footer */}
      <p className="mt-6 text-xs text-muted-foreground text-center">
        Wolthers Coffee Quality Control
      </p>
    </div>
  )
}
