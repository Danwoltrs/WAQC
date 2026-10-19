'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PrintPreviewDialog } from '@/components/print/print-preview-dialog'
import type { BagSleeveEntry } from '@/lib/print-selection'

interface PrintBagSleevesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fully resolved by the caller, including each entry's own includeQrCode. */
  entries: BagSleeveEntry[]
  /**
   * 'rows' (default) reports the caller's per-row QR selection read-only —
   * /samples has a QR checkbox column and that stays authoritative.
   * 'toggle' offers a batch-wide checkbox, default on, for a caller without
   * such a column.
   */
  qrMode?: 'toggle' | 'rows'
  /**
   * No config step: opening the dialog generates at once with the entries as
   * given (each its own includeQrCode) and goes straight to the preview.
   * /certificates sets the QR per row in its list, so there is nothing to ask.
   */
  autoStart?: boolean
  onSuccess?: () => void
}

export function PrintBagSleevesDialog({
  open,
  onOpenChange,
  entries,
  qrMode = 'rows',
  autoStart = false,
  onSuccess,
}: PrintBagSleevesDialogProps) {
  const [step, setStep] = useState<'config' | 'preview'>('config')
  const [includeQr, setIncludeQr] = useState(true)
  // One automatic generation per open cycle (StrictMode runs effects twice).
  const autoStartedRef = useRef(false)
  // Bumped on close; a generation whose run id no longer matches belongs to a
  // finished open cycle and must not touch state or toast.
  const runIdRef = useRef(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [hasPrinted, setHasPrinted] = useState(false)

  useEffect(() => {
    if (!open) {
      autoStartedRef.current = false
      runIdRef.current += 1
      setIsGenerating(false)
      setStep('config')
      setIncludeQr(true)
      setPdfUrl(current => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      setHasPrinted(false)
    }
  }, [open])

  const qrRowCount = entries.filter(e => e.includeQrCode).length

  const handleGenerate = async () => {
    if (entries.length === 0) {
      toast.error('No samples selected')
      if (autoStart) onOpenChange(false)
      return
    }

    const payload =
      qrMode === 'toggle' && !autoStart
        ? entries.map(e => ({ ...e, includeQrCode: includeQr }))
        : entries

    const run = runIdRef.current
    const stale = () => runIdRef.current !== run
    setIsGenerating(true)
    try {
      const response = await fetch('/api/samples/bulk/print-bag-sleeves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ samples: payload }),
      })

      if (stale()) return
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        if (stale()) return
        throw new Error(error.details || error.error || 'Failed to generate bag sleeves')
      }

      const blob = await response.blob()
      if (stale()) return
      setPdfUrl(URL.createObjectURL(blob))
      setStep('preview')
    } catch (error) {
      if (stale()) return
      console.error('Error generating bag sleeves:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate bag sleeves')
      if (autoStart) onOpenChange(false)
    } finally {
      if (!stale()) setIsGenerating(false)
    }
  }

  useEffect(() => {
    if (!open || !autoStart || autoStartedRef.current) return
    autoStartedRef.current = true
    void handleGenerate()
    // handleGenerate closes over the current props; it must run once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoStart])

  // The preview stays open after a print so a jammed or mis-fed sheet can be
  // re-run without re-ticking every row and regenerating. onSuccess — which
  // clears the caller's selection — therefore fires on CLOSE, and only if
  // something was actually printed.
  const handlePrinted = () => {
    setHasPrinted(true)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && hasPrinted) {
      onSuccess?.()
    }
    onOpenChange(next)
  }

  return (
    <>
      <Dialog open={open && step === 'config'} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          {autoStart ? (
            <DialogHeader>
              <DialogTitle>Print bag sleeves</DialogTitle>
              <DialogDescription className="flex items-center gap-2 pt-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {`Generating ${entries.length} bag sleeve${entries.length === 1 ? '' : 's'}…`}
              </DialogDescription>
            </DialogHeader>
          ) : (
          <>
          <DialogHeader>
            <DialogTitle>Print bag sleeves</DialogTitle>
            <DialogDescription>
              {entries.length} sleeve{entries.length !== 1 ? 's' : ''} — 6 per A4 sheet.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {qrMode === 'toggle' ? (
              <div className="flex items-start gap-3 rounded-md border p-4">
                <Checkbox
                  id="bag-sleeve-qr"
                  className="h-3.5 w-3.5 rounded-[3px]"
                  checked={includeQr}
                  onCheckedChange={(checked) => setIncludeQr(checked === true)}
                />
                <div className="flex-1">
                  <Label htmlFor="bag-sleeve-qr" className="text-sm font-medium leading-none cursor-pointer">
                    Include QR code
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Prints the certificate QR on every sleeve in this batch.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                QR codes: {qrRowCount} of {entries.length} sleeve{entries.length !== 1 ? 's' : ''}.
                Use the QR column in the list to change this.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isGenerating}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={isGenerating || entries.length === 0}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </DialogFooter>
          </>
          )}
        </DialogContent>
      </Dialog>

      <PrintPreviewDialog
        open={open && step === 'preview'}
        onOpenChange={(next) => { if (!next) handleOpenChange(false) }}
        title="Print bag sleeves"
        subtitle={`${entries.length} sleeve${entries.length !== 1 ? 's' : ''}, 6 per A4 sheet. Check the sheet, then print.`}
        pdfUrl={pdfUrl}
        saveFileName={`bag-sleeves-${new Date().toISOString().split('T')[0]}.pdf`}
        onPrinted={handlePrinted}
      />
    </>
  )
}
