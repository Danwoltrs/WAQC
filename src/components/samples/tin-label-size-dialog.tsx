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
import { Loader2, Printer } from 'lucide-react'
import { toast } from 'sonner'

export type TinLabelSize = '4cm' | '2.5cm'

interface TinLabelSizeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleIds: string[]
  onSuccess?: () => void
}

/**
 * Size, then preview, then print.
 *
 * Labels are never downloaded — the lab prints them, and a Downloads folder of
 * near-identical PDFs helps nobody. Samples are stamped as printed only when
 * Print is pressed, so opening a preview to check something does not consume
 * the batch.
 */
export function TinLabelSizeDialog({
  open,
  onOpenChange,
  sampleIds,
  onSuccess,
}: TinLabelSizeDialogProps) {
  const [step, setStep] = useState<'size' | 'preview'>('size')
  const [selectedSize, setSelectedSize] = useState<TinLabelSize>('4cm')
  const [isGenerating, setIsGenerating] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [printedIds, setPrintedIds] = useState<string[]>([])
  const iframeRef = useRef<HTMLIFrameElement>(null)

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

  const handlePrint = async () => {
    const frame = iframeRef.current
    if (!frame?.contentWindow) {
      toast.error('The preview is still loading. Try again in a moment.')
      return
    }

    try {
      frame.contentWindow.focus()
      frame.contentWindow.print()
    } catch (error) {
      console.error('Error opening the print dialog:', error)
      toast.error('Could not open the print dialog.')
      return
    }

    // The browser gives us no reliable signal that paper came out, so the
    // stamp goes on once the dialog has been opened. A jammed print is
    // recovered by selecting those rows and using Tin Label again.
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={step === 'preview' ? 'sm:max-w-3xl' : 'sm:max-w-[425px]'}>
        <DialogHeader>
          <DialogTitle>
            {step === 'size' ? 'Select tin label size' : 'Print tin labels'}
          </DialogTitle>
          <DialogDescription>
            {step === 'size'
              ? `Choose the label size for ${sampleIds.length} sample${sampleIds.length !== 1 ? 's' : ''}.`
              : `${printedIds.length} sample${printedIds.length !== 1 ? 's' : ''} at ${selectedSize}. Check the sheet, then print.`}
          </DialogDescription>
        </DialogHeader>

        {step === 'size' ? (
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
        ) : (
          <div className="h-[60vh] w-full overflow-hidden rounded-md border bg-muted">
            {pdfUrl && (
              <iframe
                ref={iframeRef}
                src={pdfUrl}
                title="Tin label preview"
                className="h-full w-full"
              />
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancel
          </Button>
          {step === 'size' ? (
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
          ) : (
            <Button onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
