'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Printer, Loader2, Download } from 'lucide-react'
import { toast } from 'sonner'

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
  const [isGenerating, setIsGenerating] = useState(false)

  const handlePrintLabels = async () => {
    if (sampleIds.length === 0) {
      toast.error('No samples selected')
      return
    }

    setIsGenerating(true)

    try {
      const response = await fetch('/api/samples/bulk/print-labels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sample_ids: sampleIds }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate labels')
      }

      // Get the PDF blob
      const blob = await response.blob()

      // Create a download link
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `sample-labels-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast.success(`Generated labels for ${sampleIds.length} sample(s)`)
      onSuccess?.()
      onOpenChange(false)
    } catch (error) {
      console.error('Error generating labels:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to generate labels'
      )
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePrint = async () => {
    if (sampleIds.length === 0) {
      toast.error('No samples selected')
      return
    }

    setIsGenerating(true)

    try {
      const response = await fetch('/api/samples/bulk/print-labels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sample_ids: sampleIds }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate labels')
      }

      // Get the PDF blob
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)

      // Open in new window for printing
      const printWindow = window.open(url, '_blank')
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print()
        })
      }

      toast.success(`Prepared labels for ${sampleIds.length} sample(s)`)
      onSuccess?.()
    } catch (error) {
      console.error('Error printing labels:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to print labels'
      )
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Print Sample Labels</DialogTitle>
          <DialogDescription>
            Generate printable labels for {sampleIds.length} selected sample
            {sampleIds.length !== 1 ? 's' : ''}. Labels are formatted for 4cm
            height with cut guides on A4 paper (fits 7 labels per page).
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
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handlePrintLabels}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </>
            )}
          </Button>
          <Button onClick={handlePrint} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
