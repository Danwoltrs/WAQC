'use client'

import { sampleIdentifier, type SampleLabelSource } from '@/lib/sample-reference'

function Tag({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded px-1 py-px text-[9px] font-sans font-semibold uppercase tracking-wider bg-muted text-muted-foreground/80">
      {children}
    </span>
  )
}

/**
 * The samples list's Reference cell, for a lot and for each of its contracts:
 * the certificate number once issued, else the lot's own identifier (CTR /
 * ICO / SMP), which stays beneath a certificate number. A sample with neither
 * shows a dash; the SAN- lab number is never shown.
 */
export function SampleReferenceCell({
  sample,
  onOpen,
  child,
}: {
  sample: SampleLabelSource
  onOpen: () => void
  /** A contract row under its lot: a step smaller and lighter. */
  child?: boolean
}) {
  const certificateNumber = sample.certificate_id ? sample.certificate_number || null : null
  const identifier = sampleIdentifier(sample)
  const title = certificateNumber || identifier?.value || undefined
  return (
    <div className="min-w-0">
      <button
        onClick={onOpen}
        className={`block w-full text-left font-mono font-semibold hover:underline truncate ${
          child ? 'text-[12.5px] text-foreground/85' : 'text-[13px] tracking-tight text-foreground'
        }`}
        title={title}
      >
        {certificateNumber ? (
          certificateNumber
        ) : identifier ? (
          <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
            <Tag>{identifier.tag}</Tag>
            <span className="truncate">{identifier.value}</span>
          </span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </button>
      {certificateNumber && identifier && (
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono truncate">
          <Tag>{identifier.tag}</Tag>
          <span className="truncate">{identifier.value}</span>
        </div>
      )}
    </div>
  )
}
