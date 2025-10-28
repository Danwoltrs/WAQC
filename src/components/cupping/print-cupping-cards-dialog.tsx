'use client'

import { useState, useEffect } from 'react'
import { PDFDownloadLink } from '@react-pdf/renderer'
import QRCode from 'qrcode'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ThermalCuppingCardDocument,
  ThermalCuppingCardData,
} from '@/components/pdf/thermal-cupping-card'
import { ThermalCuppingCardA4Document } from '@/components/pdf/thermal-cupping-card-a4'

// Sample interface (simplified)
interface Sample {
  id: string
  tracking_number: string
  sample_type?: 'pss' | 'ss' | 'type'
  ico_number?: string
  container_nr?: string
  client_id?: string
  quality_spec_id?: string
  laboratory_id?: string
  origin?: string
  exporter_legacy?: string
  // Relations loaded
  client?: {
    id: string
    company: string
  }
  laboratory?: {
    id: string
    name: string
    code: string
  }
  quality_spec?: {
    id: string
    template_id?: string
    custom_parameters?: any
    template?: {
      id: string
      name: string
      parameters?: any
    }
  }
}

interface PrintCuppingCardsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  samples: Sample[]
}

export function PrintCuppingCardsDialog({
  open,
  onOpenChange,
  samples,
}: PrintCuppingCardsDialogProps) {
  const [showQuality, setShowQuality] = useState(true)
  const [showBuyer, setShowBuyer] = useState(true)
  const [showExporter, setShowExporter] = useState(true)
  const [numCuppers, setNumCuppers] = useState('5')
  const [outputFormat, setOutputFormat] = useState<'thermal' | 'pdf'>('thermal')
  const [cardData, setCardData] = useState<ThermalCuppingCardData[] | null>(
    null
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [fullSamples, setFullSamples] = useState<Sample[]>([])
  const [loading, setLoading] = useState(false)

  // Load full sample data with relations when dialog opens
  useEffect(() => {
    if (open && samples.length > 0) {
      loadFullSampleData()
    } else if (!open) {
      // Reset states when dialog closes
      setCardData(null)
      setFullSamples([])
    }
  }, [open, samples])

  const loadFullSampleData = async () => {
    setLoading(true)
    try {
      const sampleIds = samples.map((s) => s.id)
      console.log('Loading full sample data for IDs:', sampleIds)

      const response = await fetch('/api/samples/bulk-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: sampleIds }),
      })

      if (response.ok) {
        const data = await response.json()
        console.log('Received sample details:', data.samples)
        setFullSamples(data.samples || [])
      } else {
        const errorText = await response.text()
        console.error('Failed to load sample details:', response.status, errorText)
        // Fallback to original samples if fetch fails
        setFullSamples(samples)
      }
    } catch (error) {
      console.error('Error loading sample details:', error)
      // Fallback to original samples if error occurs
      setFullSamples(samples)
    } finally {
      setLoading(false)
    }
  }

  // Generate QR codes and prepare card data
  const generateCards = async () => {
    setIsGenerating(true)
    try {
      const cards: ThermalCuppingCardData[] = []

      // Use fullSamples which have all relations loaded
      const samplesToUse = fullSamples.length > 0 ? fullSamples : samples

      for (const sample of samplesToUse) {
        // Get quality template attributes
        const template = sample.quality_spec?.template
        const customParams = sample.quality_spec?.custom_parameters || {}
        const templateParams = template?.parameters || {}

        // Extract cupping attributes from template
        // This is a simplified version - in reality, you'd parse the full template structure
        const attributes =
          customParams.cupping_attributes ||
          templateParams.cupping_attributes || [
            'Frag',
            'Arom',
            'Body',
            'Acid',
            'Swet',
            'Bal',
            'Fin',
          ]

        // Generate QR code
        const qrData = {
          sample_id: sample.id,
          tracking_number: sample.tracking_number,
          type: 'cupping_card',
        }
        const qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(qrData), {
          width: 200,
          margin: 1,
        })

        cards.push({
          sample_id: sample.id,
          sample_number: sample.tracking_number,
          tracking_number: sample.tracking_number,
          sample_type: sample.sample_type,
          ico_number: sample.ico_number,
          container_nr: sample.container_nr,
          quality_name: template?.name,
          buyer_name: sample.client?.company,
          exporter_name: sample.exporter_legacy,
          lab_name: sample.laboratory?.name,
          template_name: template?.name || 'Standard',
          template_scale_info:
            customParams.scale_info || templateParams.scale_info || '1-8, 0.25',
          attributes,
          num_cuppers: parseInt(numCuppers),
          qr_code: qrCodeDataUrl,
          // logo_url: '/logo.png', // Add if you have a logo
        })
      }

      setCardData(cards)
    } catch (error) {
      console.error('Error generating cards:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  // Handle print button click
  const handlePrint = () => {
    generateCards()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Print Cupping Cards</DialogTitle>
          <DialogDescription>
            Configure and print cupping cards for {samples.length} sample
            {samples.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Selected Samples Preview */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">
              Selected Samples: {samples.length}
            </Label>
            {loading ? (
              <div className="rounded-md border p-3 text-sm text-center text-muted-foreground">
                Loading sample details...
              </div>
            ) : fullSamples.length > 0 ? (
              <div className="max-h-[120px] overflow-y-auto rounded-md border p-3 text-sm">
                {fullSamples.map((sample) => (
                  <div
                    key={sample.id}
                    className="flex items-center justify-between border-b border-border/50 py-1 last:border-0"
                  >
                    <span className="font-medium">{sample.tracking_number}</span>
                    <span className="text-xs text-muted-foreground">
                      {sample.client?.company || 'No client'} |{' '}
                      {sample.quality_spec?.template?.name || 'No template'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="max-h-[120px] overflow-y-auto rounded-md border p-3 text-sm">
                {samples.map((sample) => (
                  <div
                    key={sample.id}
                    className="flex items-center justify-between border-b border-border/50 py-1 last:border-0"
                  >
                    <span className="font-medium">{sample.tracking_number}</span>
                    <span className="text-xs text-muted-foreground">
                      Loading...
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card Information Options */}
          <div className="space-y-4 rounded-md border p-4">
            <Label className="text-sm font-semibold">Card Information</Label>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-quality"
                  checked={showQuality}
                  onCheckedChange={(checked) =>
                    setShowQuality(checked as boolean)
                  }
                />
                <label
                  htmlFor="show-quality"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Show Quality Name
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-buyer"
                  checked={showBuyer}
                  onCheckedChange={(checked) =>
                    setShowBuyer(checked as boolean)
                  }
                />
                <label
                  htmlFor="show-buyer"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Show Buyer/Client
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-exporter"
                  checked={showExporter}
                  onCheckedChange={(checked) =>
                    setShowExporter(checked as boolean)
                  }
                />
                <label
                  htmlFor="show-exporter"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Show Exporter
                </label>
              </div>
            </div>
          </div>

          {/* Number of Cuppers */}
          <div className="space-y-2">
            <Label htmlFor="num-cuppers">Number of Cuppers (Rows on card)</Label>
            <Select value={numCuppers} onValueChange={setNumCuppers}>
              <SelectTrigger id="num-cuppers">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 Cuppers</SelectItem>
                <SelectItem value="4">4 Cuppers</SelectItem>
                <SelectItem value="5">5 Cuppers</SelectItem>
                <SelectItem value="6">6 Cuppers</SelectItem>
                <SelectItem value="7">7 Cuppers</SelectItem>
                <SelectItem value="8">8 Cuppers</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Output Format */}
          <div className="space-y-2">
            <Label>Output Format</Label>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="thermal"
                  name="output"
                  value="thermal"
                  checked={outputFormat === 'thermal'}
                  onChange={(e) =>
                    setOutputFormat(e.target.value as 'thermal' | 'pdf')
                  }
                  className="h-4 w-4"
                />
                <label htmlFor="thermal" className="text-sm">
                  Thermal Printer
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="pdf"
                  name="output"
                  value="pdf"
                  checked={outputFormat === 'pdf'}
                  onChange={(e) =>
                    setOutputFormat(e.target.value as 'thermal' | 'pdf')
                  }
                  className="h-4 w-4"
                />
                <label htmlFor="pdf" className="text-sm">
                  PDF (Letter size)
                </label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {cardData ? (
            <PDFDownloadLink
              document={
                outputFormat === 'thermal' ? (
                  <ThermalCuppingCardDocument
                    cards={cardData}
                    show_quality={showQuality}
                    show_buyer={showBuyer}
                    show_exporter={showExporter}
                  />
                ) : (
                  <ThermalCuppingCardA4Document
                    cards={cardData}
                    show_quality={showQuality}
                    show_buyer={showBuyer}
                    show_exporter={showExporter}
                  />
                )
              }
              fileName={`cupping-cards-${outputFormat}-${new Date().toISOString().split('T')[0]}.pdf`}
            >
              {({ loading }) => (
                <Button disabled={loading}>
                  {loading ? 'Generating...' : `Download ${samples.length} Cards`}
                </Button>
              )}
            </PDFDownloadLink>
          ) : (
            <Button onClick={handlePrint} disabled={isGenerating || loading}>
              {loading
                ? 'Loading...'
                : isGenerating
                ? 'Generating...'
                : `Print ${samples.length} Card${samples.length !== 1 ? 's' : ''}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
