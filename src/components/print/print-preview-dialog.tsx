'use client'

import { useRef, type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, Loader2, Printer } from 'lucide-react'

/**
 * Fullscreen, following the pattern of INTAKE_DIALOG_CONTENT_CLASS. Radix
 * supplies Esc, the focus trap and the X at right-4 top-4, so nothing here is
 * hand-rolled — which is also why the header carries pr-14.
 */
export const PRINT_PREVIEW_CONTENT_CLASS =
  '!flex flex-col gap-0 p-0 w-screen h-[100dvh] max-w-none rounded-none border-0 overflow-hidden'

export interface PrintPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string
  /** Blob or API URL for the PDF. Null while it is still being produced. */
  pdfUrl: string | null
  loading?: boolean
  error?: string | null
  /** Filename for the default Save action. Ignored when onSave is supplied. */
  saveFileName: string
  /** Extra controls under the title — the cupping-card document switcher. */
  headerExtra?: ReactNode
  /** Extra footer buttons, left of Save — Send Email on certificate previews. */
  footerExtra?: ReactNode
  /** Replaces the default anchor download. */
  onSave?: () => void
  /**
   * Fired once the browser print dialog has been opened — NEVER by Save.
   * Callers hang their side effects here (stamping tin labels as printed,
   * committing a cupping stage advance), so saving a copy to check something
   * cannot consume a batch.
   */
  onPrinted?: () => void
}

export function PrintPreviewDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  pdfUrl,
  loading = false,
  error = null,
  saveFileName,
  headerExtra,
  footerExtra,
  onSave,
  onPrinted,
}: PrintPreviewDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const ready = !!pdfUrl && !loading && !error

  const handlePrint = () => {
    // Fire the physical print FIRST — it must never be gated on anything, so a
    // slow side effect on a laggy lab connection cannot delay or swallow it.
    try {
      const frame = iframeRef.current
      if (!frame?.contentWindow) throw new Error('preview not ready')
      frame.contentWindow.focus()
      frame.contentWindow.print()
    } catch (err) {
      console.error('Unable to trigger print on the preview:', err)
      // Fall back to a tab the user can print by hand.
      if (pdfUrl) window.open(pdfUrl, '_blank')
    }
    onPrinted?.()
  }

  const handleSave = () => {
    if (onSave) {
      onSave()
      return
    }
    if (!pdfUrl) return
    const a = document.createElement('a')
    a.href = pdfUrl
    a.download = saveFileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={PRINT_PREVIEW_CONTENT_CLASS}>
        <DialogHeader className="flex-shrink-0 border-b px-6 py-4 pr-14 text-left">
          <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
          {subtitle ? (
            <DialogDescription className="text-xs">{subtitle}</DialogDescription>
          ) : null}
          {headerExtra ? <div className="pt-2">{headerExtra}</div> : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 bg-muted/20">
          {ready && pdfUrl ? (
            <iframe
              ref={iframeRef}
              src={pdfUrl}
              title={title}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {error ? (
                `Could not build the preview: ${error}`
              ) : (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparing preview...
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2 border-t px-6 py-4">
          {footerExtra}
          <Button variant="outline" onClick={handleSave} disabled={!ready}>
            <Download className="mr-2 h-4 w-4" />
            Save PDF
          </Button>
          <Button onClick={handlePrint} disabled={!ready}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
