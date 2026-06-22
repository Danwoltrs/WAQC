'use client'

/**
 * Full-screen report preview modal.
 *
 * Generates the report PDF on open (fetches /api/reports/weekly-ss), turns
 * the response into a blob URL, and embeds it in an <iframe>. From here the
 * user can download or open the send modal.
 *
 * The blob URL is revoked when the modal closes so we don't leak memory on
 * repeat opens.
 */

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Download, Send, X, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { SendReportModal } from './send-report-modal'

export interface ReportKind {
  reportType: 'weekly_ss' | 'biweekly'
  previewEndpoint: string  // GET, streams the PDF
  sendEndpoint: string     // POST, emails it
  label: string            // human label for titles/subjects
}

export const WEEKLY_SS_KIND: ReportKind = {
  reportType: 'weekly_ss',
  previewEndpoint: '/api/reports/weekly-ss',
  sendEndpoint: '/api/reports/weekly-ss/send',
  label: 'Weekly SS Certificates',
}

export const BIWEEKLY_KIND: ReportKind = {
  reportType: 'biweekly',
  previewEndpoint: '/api/reports/biweekly',
  sendEndpoint: '/api/reports/biweekly/send',
  label: 'Bi-Weekly Performance',
}

interface PreviewReportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: ReportKind
  clientId: string
  clientName: string
  startDate: string
  endDate: string
}

export function PreviewReportModal({
  open,
  onOpenChange,
  kind,
  clientId,
  clientName,
  startDate,
  endDate,
}: PreviewReportModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [filename, setFilename] = useState<string>('report.pdf')
  const [sendModalOpen, setSendModalOpen] = useState(false)

  // Fetch the PDF whenever the modal opens with valid params. Re-runs on
  // param change so editing the form and re-opening picks up new data.
  useEffect(() => {
    if (!open) return
    if (!clientId || !startDate || !endDate) return

    let cancelled = false
    let lastObjectUrl: string | null = null

    async function fetchPdf() {
      setLoading(true)
      setError(null)
      setPdfUrl(null)
      setPdfBlob(null)
      try {
        const params = new URLSearchParams({
          client_id: clientId,
          start_date: new Date(startDate).toISOString(),
          // End is exclusive — include the selected end day in the window.
          end_date: new Date(new Date(endDate).getTime() + 86400000).toISOString(),
        })
        const res = await fetch(`${kind.previewEndpoint}?${params.toString()}`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({} as any))
          throw new Error(data?.error || `Failed to load report (HTTP ${res.status})`)
        }
        const cd = res.headers.get('Content-Disposition') || ''
        const filenameMatch = cd.match(/filename="([^"]+)"/)
        const blob = await res.blob()
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        lastObjectUrl = url
        setPdfUrl(url)
        setPdfBlob(blob)
        if (filenameMatch?.[1]) setFilename(filenameMatch[1])
      } catch (err: any) {
        if (cancelled) return
        setError(err?.message || 'Failed to load report')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchPdf()

    return () => {
      cancelled = true
      if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl)
    }
  }, [open, kind.previewEndpoint, clientId, startDate, endDate])

  // Belt-and-suspenders: also revoke the previous URL when state changes.
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDownload = () => {
    if (!pdfBlob) return
    const a = document.createElement('a')
    const url = URL.createObjectURL(pdfBlob)
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast({ title: 'Downloaded', description: filename })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* Override default Dialog max-width — we want near-full-screen so the
            PDF preview is actually readable. */}
        {/* `[&>button]:hidden` hides Radix's built-in close X (top-right of
            DialogContent) — we render our own X inside the header row so the
            Download / Send / Close controls all line up. */}
        <DialogContent className="max-w-[1400px] w-[95vw] h-[92vh] p-0 gap-0 flex flex-col [&>button]:hidden">
          <DialogHeader className="px-5 py-2 border-b flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-sm">
                {kind.label} · {clientName}
              </DialogTitle>
              <span className="text-xs text-muted-foreground">{startDate} → {endDate}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={!pdfBlob || loading}
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button
                size="sm"
                onClick={() => setSendModalOpen(true)}
                disabled={!pdfBlob || loading}
                className="bg-[#556b2f] hover:bg-[#556b2f]/90"
              >
                <Send className="w-4 h-4 mr-2" />
                Send by email
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="px-2"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </DialogHeader>

          {/* Preview area — iframe takes all remaining vertical space */}
          <div className="flex-1 bg-[#f3f3f3] dark:bg-[#1f1f1f] overflow-hidden">
            {loading && (
              <div className="h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-sm">Generating report…</span>
                </div>
              </div>
            )}
            {error && !loading && (
              <div className="h-full flex items-center justify-center p-6">
                <div className="max-w-md flex items-start gap-3 text-sm text-[#ef4444] bg-[#ef4444]/10 rounded-md p-4">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Could not load the report</p>
                    <p className="mt-1 text-[#ef4444]/90">{error}</p>
                  </div>
                </div>
              </div>
            )}
            {pdfUrl && !loading && !error && (
              <iframe
                src={pdfUrl}
                className="w-full h-full border-0"
                title="Report preview"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Send modal — overlays on top of the preview. Closing it returns
          the user to the preview, which they can then close themselves. */}
      <SendReportModal
        open={sendModalOpen}
        onOpenChange={setSendModalOpen}
        kind={kind}
        clientId={clientId}
        clientName={clientName}
        startDate={startDate}
        endDate={endDate}
        onSent={() => {
          // After a successful send the user is usually done — close the
          // whole preview too so they're back at the form.
          setSendModalOpen(false)
          onOpenChange(false)
        }}
      />
    </>
  )
}
