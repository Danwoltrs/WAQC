'use client'

import { useState, useEffect, useMemo } from 'react'
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
import {
  getVisibilitySettings,
  updateVisibilitySetting,
  SampleVisibilitySettings
} from '@/lib/sample-visibility'

// Sample interface (simplified)
interface Sample {
  id: string
  tracking_number: string
  sample_type?: 'pss' | 'ss' | 'type'
  ico_number?: string
  container_nr?: string
  wolthers_contract_nr?: string
  exporter_sample_number?: string
  exporter_id?: string
  client_id?: string
  quality_spec_id?: string
  laboratory_id?: string
  origin?: string
  exporter_legacy?: string
  // Relations loaded
  client?: {
    id: string
    company: string
    fantasy_name?: string
  }
  exporter?: {
    id: string
    name: string
    client?: {
      fantasy_name?: string
      company?: string
    }
  }
  laboratory?: {
    id: string
    name: string
    code: string
  }
  quality_spec?: {
    id: string
    template_id?: string
    custom_name?: string
    custom_parameters?: any
    template?: {
      id: string
      name: string
      parameters?: any
    }
  }
}

interface Cupper {
  id: string
  full_name: string
  email: string
}

interface PrintCuppingCardsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  samples: Sample[]
  assignedCuppers?: Cupper[]
  onSuccess?: () => void
}

export function PrintCuppingCardsDialog({
  open,
  onOpenChange,
  samples,
  assignedCuppers = [],
  onSuccess,
}: PrintCuppingCardsDialogProps) {
  const [visibility, setVisibility] = useState<SampleVisibilitySettings>(() => getVisibilitySettings())
  const [numCuppers, setNumCuppers] = useState('5')
  const [outputFormat, setOutputFormat] = useState<'thermal' | 'pdf'>('pdf')
  const [cardData, setCardData] = useState<ThermalCuppingCardData[] | null>(
    null
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [fullSamples, setFullSamples] = useState<Sample[]>([])
  const [loading, setLoading] = useState(false)
  const [isReadyForDownload, setIsReadyForDownload] = useState(false)
  const [pdfKey, setPdfKey] = useState(0) // Force PDF regeneration only when needed

  const toggleVisibility = (key: keyof SampleVisibilitySettings) => {
    const newValue = !visibility[key]
    const updated = updateVisibilitySetting(key, newValue)
    setVisibility(updated)
  }

  // Load full sample data with relations when dialog opens
  useEffect(() => {
    if (open && samples.length > 0 && fullSamples.length === 0) {
      loadFullSampleData()
    } else if (!open) {
      // Reset states when dialog closes
      setCardData(null)
      setFullSamples([])
      setIsReadyForDownload(false)
    }
  }, [open, samples.length])

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

  // Move samples to cupping stage and mark as roasted (for PSS/SS/Type samples)
  const updateSampleStatuses = async (sampleIds: string[]) => {
    try {
      console.log('🔄 Moving samples to cupping stage:', sampleIds)

      const response = await fetch('/api/samples/bulk/move-to-cupping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: sampleIds }),
      })

      console.log('📡 Response status:', response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json()
        console.error('❌ Failed to move samples to cupping:', errorData)

        // Handle partial success (207 status)
        if (response.status === 207) {
          console.warn('⚠️ Some samples failed to update:', errorData.failures)
          alert(`Warning: ${errorData.failures?.length || 0} samples failed to update. Check console for details.`)
          return false
        }

        alert(`Failed to update sample status: ${errorData.error || 'Unknown error'}`)
        return false
      }

      const data = await response.json()
      console.log('✅ Successfully moved samples to analysis stage:', data)
      console.log('📊 Results:', data.results)

      return true
    } catch (error) {
      console.error('❌ Error moving samples to cupping stage:', error)
      alert(`Error updating sample status: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  // Generate QR codes and prepare card data
  const generateCards = async () => {
    setIsGenerating(true)
    setIsReadyForDownload(false)
    setCardData(null) // Clear previous card data

    try {
      const cards: ThermalCuppingCardData[] = []

      // Use fullSamples which have all relations loaded
      const samplesToUse = fullSamples.length > 0 ? fullSamples : samples

      console.log('Generating cards for samples:', samplesToUse.length)
      console.log('First sample data:', samplesToUse[0])

      for (const sample of samplesToUse) {
        try {
          // Get quality template attributes
          const template = sample.quality_spec?.template
          const customParams = sample.quality_spec?.custom_parameters || {}
          const templateParams = template?.parameters || {}

          console.log(`Processing sample ${sample.tracking_number}:`, {
            template_name: template?.name,
            customParams,
            templateParams
          })

          // Extract cupping attributes with abbreviations from template
          let cuppingAttributes = []

          // Strategy 1: Check custom_parameters.cupping_attributes (new format with abbreviations)
          if (customParams.cupping_attributes && Array.isArray(customParams.cupping_attributes)) {
            cuppingAttributes = customParams.cupping_attributes
          }
          // Strategy 2: Check template.parameters.cupping_attributes (new format with abbreviations)
          else if (templateParams.cupping_attributes && Array.isArray(templateParams.cupping_attributes)) {
            cuppingAttributes = templateParams.cupping_attributes
          }
          // Strategy 3: Check for attributes array directly (legacy format - just strings)
          else if (customParams.attributes && Array.isArray(customParams.attributes)) {
            cuppingAttributes = customParams.attributes.map((attr: any) =>
              typeof attr === 'string' ? { attribute: attr } : attr
            )
          }
          else if (templateParams.attributes && Array.isArray(templateParams.attributes)) {
            cuppingAttributes = templateParams.attributes.map((attr: any) =>
              typeof attr === 'string' ? { attribute: attr } : attr
            )
          }
          // Strategy 4: Parse from methodology-specific parameters
          else if (templateParams.scaa_attributes || templateParams.sca_attributes) {
            const attrs = templateParams.scaa_attributes || templateParams.sca_attributes
            cuppingAttributes = Array.isArray(attrs) ? attrs.map((attr: any) =>
              typeof attr === 'string' ? { attribute: attr } : attr
            ) : []
          }
          // Fallback: Default SCA attributes
          else {
            cuppingAttributes = [
              { attribute: 'Frag' },
              { attribute: 'Arom' },
              { attribute: 'Body' },
              { attribute: 'Acid' },
              { attribute: 'Swet' },
              { attribute: 'Bal' },
              { attribute: 'Fin' },
            ]
          }

          // Build attributes array with user-defined abbreviations
          const attributes = cuppingAttributes.map((attr: any) => {
            if (typeof attr === 'string') {
              return { name: attr, abbreviation: undefined }
            }
            return {
              name: attr.attribute || attr.name || 'Unknown',
              abbreviation: attr.abbreviation || undefined
            }
          })

          console.log(`Extracted attributes for ${sample.tracking_number}:`, attributes)
          console.log(`Generating QR code for sample ${sample.tracking_number}`)

          // Generate QR code with template ID for reliable attribute matching
          // Format: WAQC:sample_id:tracking_number:template_id (template_id helps OCR use correct attributes)
          const templateId = template?.id || ''
          const qrContent = `WAQC:${sample.id}:${sample.tracking_number}:${templateId}`
          const qrCodeDataUrl = await QRCode.toDataURL(qrContent, {
            width: 250,  // Slightly larger for better scanning
            margin: 2,   // More margin for edge detection
            errorCorrectionLevel: 'H',  // Highest error correction (30% damage tolerance)
          })

          const cardData = {
            sample_id: sample.id,
            sample_number: sample.tracking_number,
            tracking_number: sample.tracking_number,
            sample_type: sample.sample_type,
            ico_number: sample.ico_number,
            container_nr: sample.container_nr,
            wolthers_contract_nr: sample.wolthers_contract_nr,
            exporter_sample_number: sample.exporter_sample_number,
            quality_name: sample.quality_spec?.custom_name || template?.name,
            buyer_name: sample.client?.fantasy_name || sample.client?.company,
            exporter_name: sample.exporter?.client?.fantasy_name || sample.exporter?.name || sample.exporter_legacy,
            lab_name: sample.laboratory?.name,
            template_name: template?.name || 'Standard',
            template_scale_info:
              customParams.scale_info || templateParams.scale_info || '1-8, 0.25',
            attributes,
            num_cuppers: assignedCuppers.length > 0 ? assignedCuppers.length : parseInt(numCuppers),
            cuppers: assignedCuppers.length > 0 ? assignedCuppers.map(c => c.full_name.split(' ')[0]) : undefined,
            qr_code: qrCodeDataUrl,
            // logo_url: '/logo.png', // Add if you have a logo
          }

          console.log(`Card data for ${sample.tracking_number}:`, cardData)
          cards.push(cardData)
        } catch (sampleError) {
          console.error(`Error generating card for sample ${sample.tracking_number}:`, sampleError)
          // Continue with other samples even if one fails
        }
      }

      if (cards.length === 0) {
        throw new Error('No cards were generated successfully')
      }

      setCardData(cards)

      // Update sample statuses to 'cupping' after successful card generation
      const sampleIds = samplesToUse.map(s => s.id)
      const updateSuccess = await updateSampleStatuses(sampleIds)

      if (updateSuccess && onSuccess) {
        // Call success callback to refresh the samples list
        onSuccess()
      }

      setIsReadyForDownload(true)
      setPdfKey(prev => prev + 1) // Increment key to trigger PDF regeneration
      console.log('✅ Cards generated successfully:', cards.length)
      console.log('📊 Card data ready for PDF:', cards)
    } catch (error) {
      console.error('❌ Error generating cards:', error)
      setCardData(null)
      setIsReadyForDownload(false)

      // Show error to user
      alert(`Failed to generate cupping cards: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsGenerating(false)
    }
  }

  // Handle print button click
  const handlePrint = () => {
    // Ensure we have full sample data before generating
    if (loading || fullSamples.length === 0) {
      console.warn('Cannot generate cards: sample data still loading')
      return
    }
    setIsReadyForDownload(false)
    generateCards()
  }

  // Memoize the PDF document to prevent constant regeneration
  const pdfDocument = useMemo(() => {
    if (!isReadyForDownload || !cardData || cardData.length === 0) {
      return null
    }

    return outputFormat === 'thermal' ? (
      <ThermalCuppingCardDocument
        cards={cardData}
        show_quality={visibility.showQuality}
        show_buyer={visibility.showBuyer}
        show_supplier={visibility.showSupplier}
        show_exporter={visibility.showExporter}
      />
    ) : (
      <ThermalCuppingCardA4Document
        cards={cardData}
        show_quality={visibility.showQuality}
        show_buyer={visibility.showBuyer}
        show_supplier={visibility.showSupplier}
        show_exporter={visibility.showExporter}
      />
    )
  }, [isReadyForDownload, cardData, outputFormat, visibility.showQuality, visibility.showBuyer, visibility.showSupplier, visibility.showExporter])

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
                  checked={visibility.showQuality}
                  disabled={isReadyForDownload}
                  onCheckedChange={() => toggleVisibility('showQuality')}
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
                  checked={visibility.showBuyer}
                  disabled={isReadyForDownload}
                  onCheckedChange={() => toggleVisibility('showBuyer')}
                />
                <label
                  htmlFor="show-buyer"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Show Importer/Client
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-supplier"
                  checked={visibility.showSupplier}
                  disabled={isReadyForDownload}
                  onCheckedChange={() => toggleVisibility('showSupplier')}
                />
                <label
                  htmlFor="show-supplier"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Show Supplier
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-exporter"
                  checked={visibility.showExporter}
                  disabled={isReadyForDownload}
                  onCheckedChange={() => toggleVisibility('showExporter')}
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

          {/* Number of Cuppers - Only show if no cuppers are assigned */}
          {assignedCuppers.length === 0 && (
            <div className="space-y-2">
              <Label htmlFor="num-cuppers">Number of Cuppers (Rows on card)</Label>
              <Select value={numCuppers} onValueChange={setNumCuppers} disabled={isReadyForDownload}>
                <SelectTrigger id="num-cuppers" disabled={isReadyForDownload}>
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
          )}

          {/* Show assigned cuppers summary */}
          {assignedCuppers.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Assigned Cuppers: {assignedCuppers.length}
              </Label>
              <div className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  {assignedCuppers.map((cupper, index) => (
                    <span
                      key={cupper.id}
                      className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                    >
                      {cupper.full_name.split(' ')[0]}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

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
                  disabled={isReadyForDownload}
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
                  disabled={isReadyForDownload}
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
          {isReadyForDownload && pdfDocument ? (
            <PDFDownloadLink
              key={pdfKey}
              document={pdfDocument}
              fileName={`cupping-cards-${outputFormat}-${new Date().toISOString().split('T')[0]}.pdf`}
            >
              {({ loading, error }) => {
                if (error) {
                  console.error('🔴 PDFDownloadLink error:', error)
                  console.error('Card data at error time:', cardData)
                  console.error('Output format:', outputFormat)
                }
                return (
                  <Button
                    disabled={loading || !!error}
                    onClick={() => {
                      // Auto-close dialog after PDF download starts
                      if (!loading && !error) {
                        setTimeout(() => {
                          onOpenChange(false)
                        }, 500)
                      }
                    }}
                  >
                    {loading ? 'Generating PDF...' : error ? `Error - ${error.message || 'Try Again'}` : `Download ${cardData ? cardData.length : 0} Card${cardData && cardData.length !== 1 ? 's' : ''}`}
                  </Button>
                )
              }}
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
