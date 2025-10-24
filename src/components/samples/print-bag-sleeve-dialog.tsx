'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Printer } from 'lucide-react'

interface PrintBagSleeveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedSamples: Set<string>
  onSuccess?: () => void
}

export function PrintBagSleeveDialog({ open, onOpenChange, selectedSamples, onSuccess }: PrintBagSleeveDialogProps) {
  const [includeQrCode, setIncludeQrCode] = useState(false)
  const [printing, setPrinting] = useState(false)

  const handlePrint = async () => {
    if (selectedSamples.size === 0) {
      alert('Please select at least one sample')
      return
    }

    setPrinting(true)

    try {
      const response = await fetch('/api/samples/bulk/print-bag-sleeves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sample_ids: Array.from(selectedSamples),
          includeQrCode
        })
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `bag-sleeves-${new Date().toISOString().split('T')[0]}.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)

        onOpenChange(false)
        onSuccess?.()
      } else {
        const error = await response.json()
        console.error('Failed to generate bag sleeve labels:', error)
        alert(`Failed to generate bag sleeve labels.\n\n${error.error}${error.details ? '\n\nDetails: ' + error.details : ''}`)
      }
    } catch (error) {
      console.error('Error printing bag sleeve labels:', error)
      alert(`Error generating bag sleeve labels.\n\n${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setPrinting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Print Bag Sleeve Labels</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {selectedSamples.size} sample{selectedSamples.size !== 1 ? 's' : ''} selected
            </p>
            <p className="text-sm text-muted-foreground">
              Format: 6 labels per A4 page (2×3 grid)
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-qr"
                checked={includeQrCode}
                onCheckedChange={(checked) => setIncludeQrCode(checked === true)}
              />
              <Label htmlFor="include-qr" className="text-sm font-normal cursor-pointer">
                Include QR code for certificate download
              </Label>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handlePrint} disabled={printing}>
              <Printer className="h-4 w-4 mr-2" />
              {printing ? 'Generating...' : 'Print Labels'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
