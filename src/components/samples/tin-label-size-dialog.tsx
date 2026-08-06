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
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Loader2, Download } from 'lucide-react'
import { toast } from 'sonner'

export type TinLabelSize = '4cm' | '2.5cm'

interface TinLabelSizeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleIds: string[]
  onSuccess?: () => void
}

export function TinLabelSizeDialog({
  open,
  onOpenChange,
  sampleIds,
  onSuccess,
}: TinLabelSizeDialogProps) {
  const [selectedSize, setSelectedSize] = useState<TinLabelSize>('4cm')
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerate = async () => {
    if (sampleIds.length === 0) {
      toast.error('No samples selected')
      return
    }

    setIsGenerating(true)

    try {
      const response = await fetch('/api/samples/bulk/print-tin-sleeves', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sample_ids: sampleIds,
          size: selectedSize,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate tin labels')
      }

      // Get the PDF blob
      const blob = await response.blob()
      const skipped = Number(response.headers.get('X-Skipped-Samples') || '0')
      if (skipped > 0) {
        toast.warning(
          `${skipped} sample${skipped === 1 ? '' : 's'} skipped — not certified yet, so there is no certificate number to print.`
        )
      }
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `tin-labels-${selectedSize}-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      // The printed count is the selection minus whatever the route skipped —
      // reporting the full selection contradicts the warning above.
      const printed = sampleIds.length - skipped
      toast.success(`Generated ${selectedSize} tin labels for ${printed} sample(s)`)
      onSuccess?.()
      onOpenChange(false)
    } catch (error) {
      console.error('Error generating tin labels:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to generate tin labels'
      )
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Select Tin Label Size</DialogTitle>
          <DialogDescription>
            Choose the label size for {sampleIds.length} selected sample
            {sampleIds.length !== 1 ? 's' : ''}. Labels will be centered for better appearance on tin containers.
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
                <Label
                  htmlFor="size-4cm"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  4cm Height (Standard)
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  For standard-sized tin containers
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="2.5cm" id="size-2.5cm" />
              <div className="flex-1">
                <Label
                  htmlFor="size-2.5cm"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  2.5cm Height (Compact)
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  For smaller tin containers
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Generate PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
