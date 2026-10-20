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
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PrintPreviewDialog } from '@/components/print/print-preview-dialog'

export type TinLabelSize = '4cm' | '2.5cm'

interface TinLabelSizeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleIds: string[]
  /**
   * Shown in the size step when the caller's selection collapsed — a
   * certificate selection dedupes to lots, so the sheet count is lower than
   * the number of rows ticked, and that needs saying before anything prints.
   */
  countNote?: string
  /**
   * When set, the size step is skipped: opening the dialog generates at this
   * size at once and goes straight to the preview.
   */
  size?: TinLabelSize
  onSuccess?: () => void
}

/**
 * Size, then preview, then print.
 *
 * Samples are stamped as printed only when Print is pressed, so opening a
 * preview to check something — or saving a copy — does not consume the batch.
 */
export function TinLabelSizeDialog({
  open,
  onOpenChange,
  sampleIds,
  countNote,
  size,
  onSuccess,
}: TinLabelSizeDialogProps) {
  const [step, setStep] = useState<'size' | 'preview'>('size')
  const [pickedSize, setSelectedSize] = useState<TinLabelSize>('4cm')
  const selectedSize = size ?? pickedSize
  // One automatic generation per open cycle (StrictMode runs effects twice).
  const autoStartedRef = useRef(false)
  // Bumped on close; a generation whose run id no longer matches belongs to a
  // finished open cycle and must not touch state or toast.
  const runIdRef = useRef(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [printedIds, setPrintedIds] = useState<string[]>([])
  const [hasPrinted, setHasPrinted] = useState(false)

  // Reset to the size step whenever the dialog reopens, and release the blob
  // URL so a long session does not accumulate them.
  useEffect(() => {
    if (!open) {
      autoStartedRef.current = false
      runIdRef.current += 1
      setIsGenerating(false)
      setStep('size')
      setPdfUrl(current => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      setPrintedIds([])
      setHasPrinted(false)
    }
  }, [open])

  const handleGenerate = async () => {
    if (sampleIds.length === 0) {
      toast.error('No samples selected')
      if (size) onOpenChange(false)
      return
    }

    const run = runIdRef.current
    const stale = () => runIdRef.current !== run
    setIsGenerating(true)
    try {
      const response = await fetch('/api/samples/bulk/print-tin-sleeves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: sampleIds, size: selectedSize }),
      })

      if (stale()) return
      if (!response.ok) {
        // Never assume JSON — a 502 from the edge returns an HTML body, and
        // parsing it blindly buries the real failure under "Unexpected token".
        const error = await response.json().catch(() => ({}))
        if (stale()) return
        throw new Error(error.details || error.error || 'Failed to generate tin labels')
      }

      const skipped = Number(response.headers.get('X-Skipped-Samples') || '0')
      if (skipped > 0) {
        toast.warning(
          `${skipped} sample${skipped === 1 ? '' : 's'} skipped — not certified yet, so there is no certificate number to print.`
        )
      }

      const blob = await response.blob()
      if (stale()) return
      setPdfUrl(URL.createObjectURL(blob))
      setPrintedIds(sampleIds)
      setStep('preview')
    } catch (error) {
      if (stale()) return
      console.error('Error generating tin labels:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate tin labels')
      if (size) onOpenChange(false)
    } finally {
      if (!stale()) setIsGenerating(false)
    }
  }

  useEffect(() => {
    if (!open || !size || autoStartedRef.current) return
    autoStartedRef.current = true
    void handleGenerate()
    // handleGenerate closes over the current props; it must run once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, size])

  // Runs only after the browser print dialog has actually opened. The browser
  // gives us no reliable signal that paper came out, so the stamp goes on here
  // rather than on close — the paper is already out by then, and it must not
  // wait for the operator to dismiss a dialog.
  const handlePrinted = async () => {
    setHasPrinted(true)
    try {
      const response = await fetch('/api/samples/tin-labels/mark-printed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: printedIds }),
      })
      if (!response.ok) {
        toast.warning('Printed, but these samples were not marked as printed. They will appear in the next batch.')
      }
    } catch {
      toast.warning('Printed, but these samples were not marked as printed. They will appear in the next batch.')
    }
  }

  // The preview stays open after a print so a jammed or mis-fed sheet can be
  // re-run without re-selecting rows and regenerating. onSuccess — which clears
  // the caller's selection and refreshes today's batch — therefore fires on
  // CLOSE, and only if something was actually printed.
  const handleOpenChange = (next: boolean) => {
    if (!next && hasPrinted) {
      onSuccess?.()
    }
    onOpenChange(next)
  }

  return (
    <>
      <Dialog open={open && step === 'size'} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          {size ? (
            <>
              <DialogHeader>
                <DialogTitle>Tin labels</DialogTitle>
                <DialogDescription className="flex items-center gap-2 pt-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {`Generating ${sampleIds.length} tin label${sampleIds.length === 1 ? '' : 's'} at ${size}…`}
                </DialogDescription>
              </DialogHeader>
            </>
          ) : (
          <>
          <DialogHeader>
            <DialogTitle>Select tin label size</DialogTitle>
            <DialogDescription>
              {countNote ||
                `Choose the label size for ${sampleIds.length} lot${sampleIds.length !== 1 ? 's' : ''}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-6">
            <RadioGroup
              value={selectedSize}
              onValueChange={(value) => setSelectedSize(value as TinLabelSize)}
              className="space-y-4"
            >
              <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="4cm" id="size-4cm" />
                <div className="flex-1">
                  <Label htmlFor="size-4cm" className="text-sm font-medium leading-none cursor-pointer">
                    4cm height (standard)
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">For standard-sized tin containers</p>
                </div>
              </div>

              <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="2.5cm" id="size-2.5cm" />
                <div className="flex-1">
                  <Label htmlFor="size-2.5cm" className="text-sm font-medium leading-none cursor-pointer">
                    2.5cm height (compact)
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">For smaller tin containers</p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isGenerating}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={isGenerating}>
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
        title="Print tin labels"
        subtitle={`${printedIds.length} lot${printedIds.length !== 1 ? 's' : ''} at ${selectedSize}. Check the sheet, then print.`}
        pdfUrl={pdfUrl}
        saveFileName={`tin-sleeves-${selectedSize}-${new Date().toISOString().split('T')[0]}.pdf`}
        onPrinted={handlePrinted}
      />
    </>
  )
}
