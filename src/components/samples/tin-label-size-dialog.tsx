'use client'

import { useState, useEffect } from 'react'
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
  onSuccess,
}: TinLabelSizeDialogProps) {
  const [step, setStep] = useState<'size' | 'preview'>('size')
  const [selectedSize, setSelectedSize] = useState<TinLabelSize>('4cm')
  const [isGenerating, setIsGenerating] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [printedIds, setPrintedIds] = useState<string[]>([])

  // Reset to the size step whenever the dialog reopens, and release the blob
  // URL so a long session does not accumulate them.
  useEffect(() => {
    if (!open) {
      setStep('size')
      setPdfUrl(current => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      setPrintedIds([])
    }
  }, [open])

  const handleGenerate = async () => {
    if (sampleIds.length === 0) {
      toast.error('No samples selected')
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch('/api/samples/bulk/print-tin-sleeves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: sampleIds, size: selectedSize }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate tin labels')
      }

      const skipped = Number(response.headers.get('X-Skipped-Samples') || '0')
      if (skipped > 0) {
        toast.warning(
          `${skipped} sample${skipped === 1 ? '' : 's'} skipped — not certified yet, so there is no certificate number to print.`
        )
      }

      const blob = await response.blob()
      setPdfUrl(URL.createObjectURL(blob))
      setPrintedIds(sampleIds)
      setStep('preview')
    } catch (error) {
      console.error('Error generating tin labels:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate tin labels')
    } finally {
      setIsGenerating(false)
    }
  }

  // Runs only after the browser print dialog has opened. The browser gives us
  // no reliable signal that paper came out, so the stamp goes on once the
  // dialog has been opened. A jammed print is recovered by selecting those rows
  // and using Tin Label again.
  const handlePrinted = async () => {
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

    onSuccess?.()
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open && step === 'size'} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
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
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
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
        </DialogContent>
      </Dialog>

      <PrintPreviewDialog
        open={open && step === 'preview'}
        onOpenChange={(next) => { if (!next) onOpenChange(false) }}
        title="Print tin labels"
        subtitle={`${printedIds.length} lot${printedIds.length !== 1 ? 's' : ''} at ${selectedSize}. Check the sheet, then print.`}
        pdfUrl={pdfUrl}
        saveFileName={`tin-sleeves-${selectedSize}-${new Date().toISOString().split('T')[0]}.pdf`}
        onPrinted={handlePrinted}
      />
    </>
  )
}
