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
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PrintPreviewDialog } from '@/components/print/print-preview-dialog'

interface PrintLabelsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleIds: string[]
  onSuccess?: () => void
}

export function PrintLabelsDialog({
  open,
  onOpenChange,
  sampleIds,
  onSuccess,
}: PrintLabelsDialogProps) {
  const [step, setStep] = useState<'config' | 'preview'>('config')
  const [isGenerating, setIsGenerating] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [hasPrinted, setHasPrinted] = useState(false)

  useEffect(() => {
    if (!open) {
      setStep('config')
      setPdfUrl(current => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      setHasPrinted(false)
    }
  }, [open])

  const handleGenerate = async () => {
    if (sampleIds.length === 0) {
      toast.error('No samples selected')
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch('/api/samples/bulk/print-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: sampleIds }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.details || error.error || 'Failed to generate labels')
      }

      const blob = await response.blob()
      setPdfUrl(URL.createObjectURL(blob))
      setStep('preview')
    } catch (error) {
      console.error('Error generating labels:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate labels')
    } finally {
      setIsGenerating(false)
    }
  }

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
          <DialogHeader>
            <DialogTitle>Print Sample Labels</DialogTitle>
            <DialogDescription>
              Generate printable labels for {sampleIds.length} selected sample
              {sampleIds.length !== 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <span>QR codes will be generated for sample tracking</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span>
                  Type-specific fields: Exporter, Quality, Contracts, Container/OIC (SS), Bags
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="h-2 w-2 rounded-full bg-purple-500" />
                <span>Format: 4cm x A4 with cut guides (fits 7 labels per page)</span>
              </div>
            </div>
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
        </DialogContent>
      </Dialog>

      <PrintPreviewDialog
        open={open && step === 'preview'}
        onOpenChange={(next) => { if (!next) handleOpenChange(false) }}
        title="Print sample labels"
        subtitle={`${sampleIds.length} label${sampleIds.length !== 1 ? 's' : ''}, 7 per A4 sheet. Check the sheet, then print.`}
        pdfUrl={pdfUrl}
        saveFileName={`sample-labels-${new Date().toISOString().split('T')[0]}.pdf`}
        onPrinted={handlePrinted}
      />
    </>
  )
}
