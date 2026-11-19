'use client'

import { useEffect, useRef, useState } from 'react'
import { PrintPreviewDialog } from '@/components/print/print-preview-dialog'

interface PrintCertificatesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The samples whose certificates to print: lab units and contract siblings alike. */
  sampleIds: string[]
  /** Fires on close, and only when something was actually printed. */
  onSuccess?: () => void
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * "Print certificate" from the Samples page: the certificates of the chosen
 * samples as one PDF, a page each, in the shared print preview. Samples that
 * have no certificate yet are left out and counted in the subtitle. Built by
 * the same renderer as a single certificate (no second template).
 */
export function PrintCertificatesDialog({ open, onOpenChange, sampleIds, onSuccess }: PrintCertificatesDialogProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [printed, setPrinted] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [hasPrinted, setHasPrinted] = useState(false)
  // Bumped on every open and close: a response from an earlier cycle is dropped.
  const runIdRef = useRef(0)
  const idsKey = sampleIds.join(',')

  useEffect(() => {
    const run = ++runIdRef.current
    setPdfUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    setError(null)
    setPrinted(0)
    setSkipped(0)
    setHasPrinted(false)
    if (!open) {
      setLoading(false)
      return
    }
    const stale = () => runIdRef.current !== run
    setLoading(true)
    ;(async () => {
      try {
        const response = await fetch('/api/samples/bulk/print-certificates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sample_ids: idsKey ? idsKey.split(',') : [] }),
        })
        if (stale()) return
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          if (stale()) return
          throw new Error(body?.error || 'The certificates could not be generated')
        }
        const blob = await response.blob()
        if (stale()) return
        setPrinted(Number(response.headers.get('X-Printed-Certificates')) || 0)
        setSkipped(Number(response.headers.get('X-Skipped-Samples')) || 0)
        setPdfUrl(URL.createObjectURL(blob))
      } catch (e) {
        if (!stale()) setError(e instanceof Error ? e.message : 'The certificates could not be generated')
      } finally {
        if (!stale()) setLoading(false)
      }
    })()
  }, [open, idsKey])

  const handleOpenChange = (next: boolean) => {
    if (!next && hasPrinted) onSuccess?.()
    onOpenChange(next)
  }

  const subtitle = loading
    ? 'Generating the certificates…'
    : pdfUrl
      ? `${plural(printed, 'certificate')}, one page each.${skipped > 0 ? ` ${plural(skipped, 'selected sample')} left out: no certificate yet.` : ''}`
      : undefined

  return (
    <PrintPreviewDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={sampleIds.length === 1 ? 'Print certificate' : 'Print certificates'}
      subtitle={subtitle}
      pdfUrl={pdfUrl}
      loading={loading}
      error={error}
      saveFileName={`certificates-${new Date().toISOString().split('T')[0]}.pdf`}
      onPrinted={() => setHasPrinted(true)}
    />
  )
}
