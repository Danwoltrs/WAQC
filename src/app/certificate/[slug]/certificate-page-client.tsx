'use client'

import { Download, CheckCircle, XCircle, Calendar, MapPin, Coffee, FileText } from 'lucide-react'

interface CertificatePageClientProps {
  trackingNumber: string
  status: 'APPROVED' | 'REJECTED'
  approvalDate: string | null
  origin: string
  qualityName: string | null
  screenSizes: Record<string, number> | null
  totalDefects: number | null
  pdfUrl: string
}

export function CertificatePageClient({
  trackingNumber,
  status,
  approvalDate,
  origin,
  qualityName,
  screenSizes,
  totalDefects,
  pdfUrl,
}: CertificatePageClientProps) {
  const isApproved = status === 'APPROVED'

  // Sort screen sizes by key for display
  const sortedScreenSizes = screenSizes
    ? Object.entries(screenSizes)
        .sort(([a], [b]) => {
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
      {/* Header */}
      <div className="w-full max-w-lg mb-6 text-center">
        <h1 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Wolthers Quality Control
        </h1>
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
        {/* Details Grid */}
        <div className="space-y-4">
          {formattedDate && (
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Certification Date</p>
                <p className="text-sm font-medium">{formattedDate}</p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Origin</p>
              <p className="text-sm font-medium">{origin}</p>
            </div>
          </div>

          {qualityName && (
            <div className="flex items-start gap-3">
              <Coffee className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Quality</p>
                <p className="text-sm font-medium">{qualityName}</p>
              </div>
            </div>
          )}

          {totalDefects !== null && (
            <div className="flex items-start gap-3">
              <FileText className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Total Defects</p>
                <p className="text-sm font-medium">{totalDefects}</p>
              </div>
            </div>
          )}
        </div>

        {/* Screen Size Distribution */}
        {sortedScreenSizes && sortedScreenSizes.length > 0 && (
          <div className="mt-6">
            <p className="text-xs text-muted-foreground mb-3">Screen Size Distribution</p>
            <div className="space-y-2">
              {sortedScreenSizes.map(([size, percent]) => (
                <div key={size} className="flex items-center gap-3">
                  <span className="text-xs font-medium w-16 text-right">{size}</span>
                  <div className="flex-1 h-5 bg-black/[0.04] dark:bg-white/[0.06] rounded-full overflow-hidden">
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
              ))}
            </div>
          </div>
        )}

        {/* Download Button */}
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-[12px] bg-[#556b2f] text-white font-medium text-sm hover:bg-[#556b2f]/90 transition-colors"
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
