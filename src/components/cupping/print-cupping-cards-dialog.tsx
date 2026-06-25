'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { pdf } from '@react-pdf/renderer'
import { Printer, Download } from 'lucide-react'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'
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
import { CvaDescriptiveFormDocument } from '@/components/pdf/cva-descriptive-card'
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
  exporter_sample_number?: string | null
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
      methodology?: string // 'cva' = specialty CVA — prints on the SCA Descriptive Form
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
  // CVA forms: one full set per cupper (name pre-filled) or a single blank set
  const [cvaCopies, setCvaCopies] = useState<'per-cupper' | 'single'>('per-cupper')
  const [cardData, setCardData] = useState<ThermalCuppingCardData[] | null>(
    null
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [fullSamples, setFullSamples] = useState<Sample[]>([])
  const [loading, setLoading] = useState(false)
  const [isReadyForDownload, setIsReadyForDownload] = useState(false)
  const [subContracts, setSubContracts] = useState<any[]>([])
  // In-dialog print viewer: cards are rendered to a blob and shown in an iframe
  // for direct printing — they are NOT auto-saved to disk (saving is opt-in).
  const [activeDocIndex, setActiveDocIndex] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const toggleVisibility = (key: keyof SampleVisibilitySettings) => {
    const newValue = !visibility[key]
    const updated = updateVisibilitySetting(key, newValue)
    setVisibility(updated)
  }

  // Locally resolved cuppers (fetched from session if not passed as prop)
  const [resolvedCuppers, setResolvedCuppers] = useState<Cupper[]>([])
  const effectiveCuppers = assignedCuppers.length > 0 ? assignedCuppers : resolvedCuppers

  // Load full sample data with relations when dialog opens
  useEffect(() => {
    if (open && samples.length > 0 && fullSamples.length === 0) {
      loadFullSampleData()
      // If no cuppers were passed, try to fetch them from the cupping session
      if (assignedCuppers.length === 0) {
        fetchCuppersFromSession()
      }
    } else if (!open) {
      // Reset states when dialog closes
      setCardData(null)
      setFullSamples([])
      setResolvedCuppers([])
      setIsReadyForDownload(false)
      setActiveDocIndex(0)
      setPreviewUrl(null)
      setPreviewError(null)
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
        setSubContracts(data.sub_contracts || [])
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

  // Fetch cuppers from the cupping session for these samples
  const fetchCuppersFromSession = async () => {
    try {
      const params = new URLSearchParams()
      samples.forEach(s => params.append('sample_ids', s.id))
      const response = await fetch(`/api/cupping/session-cuppers?${params}`)
      if (response.ok) {
        const data = await response.json()
        if (data.cuppers && data.cuppers.length > 0) {
          setResolvedCuppers(data.cuppers)
        }
      }
    } catch (error) {
      console.error('Error fetching cuppers from session:', error)
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

          // Find sub-contracts for this sample
          const sampleSubContracts = subContracts.filter(sc => sc.sample_id === sample.id)
          const subContractNrs = sampleSubContracts
            .map(sc => sc.wolthers_contract_nr)
            .filter((nr): nr is string => !!nr && nr !== sample.wolthers_contract_nr)

          // Format print date as DD MMM YYYY
          const now = new Date()
          const printDate = now.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }).toUpperCase()

          const cardData = {
            sample_id: sample.id,
            sample_number: sample.tracking_number,
            tracking_number: sample.tracking_number,
            sample_type: sample.sample_type,
            ico_number: sample.ico_number,
            container_nr: sample.container_nr,
            wolthers_contract_nr: sample.wolthers_contract_nr,
            sub_contract_nrs: subContractNrs.length > 0 ? subContractNrs : undefined,
            print_date: printDate,
            exporter_sample_number: sample.exporter_sample_number,
            quality_name: sample.quality_spec?.custom_name || template?.name,
            buyer_name: sample.client?.fantasy_name || sample.client?.company,
            exporter_name: sample.exporter?.client?.fantasy_name || sample.exporter?.name || sample.exporter_legacy,
            lab_name: sample.laboratory?.name,
            template_name: template?.name || 'Standard',
            template_scale_info:
              customParams.scale_info || templateParams.scale_info || '1-8, 0.25',
            attributes,
            num_cuppers: effectiveCuppers.length > 0 ? effectiveCuppers.length : parseInt(numCuppers),
            cuppers: effectiveCuppers.length > 0 ? effectiveCuppers.map(c => c.full_name.split(' ')[0]) : undefined,
            qr_code: qrCodeDataUrl,
            is_cva: template?.methodology === 'cva',
            // logo_url: '/logo.png', // Add if you have a logo
          }

          console.log(`Card data for ${sample.tracking_number}:`, cardData)
          cards.push(cardData)

          // PSS sub-contracts share the same physical sample — only 1 cupping card needed (the mother card).
          // SS duplicates are separate sample records and each gets their own card via the outer loop.
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

  // Whether the selection contains CVA (specialty) samples — they always print
  // on the SCA Descriptive Form (A4), regardless of the chosen output format.
  const cvaSampleCount = useMemo(
    () => fullSamples.filter(s => s.quality_spec?.template?.methodology === 'cva').length,
    [fullSamples]
  )
  const allCva = fullSamples.length > 0 && cvaSampleCount === fullSamples.length

  // Memoize the PDF documents to prevent constant regeneration.
  // CVA samples go to the SCA Descriptive Form; the rest keep the classic card.
  const documents = useMemo(() => {
    if (!isReadyForDownload || !cardData || cardData.length === 0) {
      return []
    }

    const dateStamp = new Date().toISOString().split('T')[0]
    const standardCards = cardData.filter(c => !c.is_cva)
    const cvaCards = cardData.filter(c => c.is_cva)
    const docs: { key: string; fileName: string; count: number; label: string; document: React.ReactElement<any> }[] = []

    if (standardCards.length > 0) {
      docs.push({
        key: 'standard',
        fileName: `cupping-cards-${outputFormat}-${dateStamp}.pdf`,
        count: standardCards.length,
        label: `${standardCards.length} Card${standardCards.length !== 1 ? 's' : ''}`,
        document:
          outputFormat === 'thermal' ? (
            <ThermalCuppingCardDocument
              cards={standardCards}
              show_quality={visibility.showQuality}
              show_buyer={visibility.showBuyer}
              show_supplier={visibility.showSupplier}
              show_exporter={visibility.showExporter}
            />
          ) : (
            <ThermalCuppingCardA4Document
              cards={standardCards}
              show_quality={visibility.showQuality}
              show_buyer={visibility.showBuyer}
              show_supplier={visibility.showSupplier}
              show_exporter={visibility.showExporter}
            />
          ),
      })
    }

    if (cvaCards.length > 0) {
      docs.push({
        key: 'cva',
        fileName: `cva-descriptive-forms-${dateStamp}.pdf`,
        count: cvaCards.length,
        label: `${cvaCards.length} CVA Form${cvaCards.length !== 1 ? 's' : ''}`,
        document: (
          <CvaDescriptiveFormDocument
            cards={cvaCards}
            cupper_names={
              cvaCopies === 'per-cupper' && effectiveCuppers.length > 0
                ? effectiveCuppers.map(c => c.full_name.split(' ')[0])
                : undefined
            }
            num_copies={
              cvaCopies === 'single'
                ? 1
                : effectiveCuppers.length > 0
                ? undefined
                : parseInt(numCuppers)
            }
            show_quality={visibility.showQuality}
            show_buyer={visibility.showBuyer}
            show_exporter={visibility.showExporter}
          />
        ),
      })
    }

    return docs
  }, [isReadyForDownload, cardData, outputFormat, effectiveCuppers, numCuppers, cvaCopies, visibility.showQuality, visibility.showBuyer, visibility.showSupplier, visibility.showExporter])

  // Once cards are generated we switch the dialog into a print-preview viewer.
  const showPreview = isReadyForDownload && documents.length > 0
  const activeDoc = documents[activeDocIndex] ?? documents[0]

  // Render the active document to a blob URL for the iframe preview (and for the
  // optional "Save PDF" link). Nothing is downloaded automatically.
  useEffect(() => {
    if (!showPreview || !activeDoc) {
      setPreviewUrl(null)
      return
    }
    let cancelled = false
    let createdUrl: string | null = null
    setPreviewLoading(true)
    setPreviewError(null)
    setPreviewUrl(null)
    pdf(activeDoc.document)
      .toBlob()
      .then((blob) => {
        if (cancelled) return
        createdUrl = URL.createObjectURL(blob)
        setPreviewUrl(createdUrl)
        setPreviewLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to render cupping card preview:', err)
        setPreviewError(err instanceof Error ? err.message : 'Unknown error')
        setPreviewLoading(false)
      })
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [showPreview, activeDoc])

  // Trigger the browser print dialog for the previewed PDF without saving it.
  const handlePrintPreview = () => {
    const frame = iframeRef.current
    if (!frame) return
    try {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    } catch (err) {
      console.error('Unable to trigger print on preview:', err)
      // Fallback: open the PDF in a new tab where the user can print manually.
      if (previewUrl) window.open(previewUrl, '_blank')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={showPreview ? 'sm:max-w-[920px]' : 'sm:max-w-[600px]'}>
        <DialogHeader>
          <DialogTitle>Print Cupping Cards</DialogTitle>
          <DialogDescription>
            {showPreview
              ? `Review and print ${samples.length} cupping card${samples.length !== 1 ? 's' : ''} — saving is optional.`
              : `Configure and print cupping cards for ${samples.length} sample${samples.length !== 1 ? 's' : ''}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {showPreview ? (
            <div className="flex flex-col gap-3">
              {documents.length > 1 && (
                <div className="flex items-center gap-2">
                  {documents.map((doc, i) => (
                    <button
                      key={doc.key}
                      type="button"
                      onClick={() => setActiveDocIndex(i)}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                        i === activeDocIndex
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-accent'
                      )}
                    >
                      {doc.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="relative h-[68vh] w-full overflow-hidden rounded-md border bg-muted/20">
                {previewUrl && !previewLoading ? (
                  <iframe
                    ref={iframeRef}
                    src={previewUrl}
                    title="Cupping cards preview"
                    className="h-full w-full"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                    {previewError
                      ? `Could not build preview: ${previewError}`
                      : 'Preparing preview…'}
                  </div>
                )}
              </div>
            </div>
          ) : (
          <>
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
                    <span className="font-medium">
                      {sample.tracking_number}
                      {sample.quality_spec?.template?.methodology === 'cva' && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          CVA
                        </span>
                      )}
                    </span>
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
          {effectiveCuppers.length === 0 && (
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
          {effectiveCuppers.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Assigned Cuppers: {effectiveCuppers.length}
              </Label>
              <div className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  {effectiveCuppers.map((cupper, index) => (
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

          {/* CVA samples always print on the SCA Descriptive Form (A4 portrait) */}
          {cvaSampleCount > 0 && (
            <div className="space-y-3 rounded-md border bg-muted/40 p-3">
              <p className="text-sm text-muted-foreground">
                {allCva
                  ? `All ${cvaSampleCount} sample${cvaSampleCount !== 1 ? 's' : ''} are Specialty CVA — they print on the SCA Descriptive Form (A4).`
                  : `${cvaSampleCount} Specialty CVA sample${cvaSampleCount !== 1 ? 's' : ''} will print on the SCA Descriptive Form (A4). The output format below applies to the remaining samples only.`}
              </p>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="cva-per-cupper"
                    name="cva-copies"
                    value="per-cupper"
                    checked={cvaCopies === 'per-cupper'}
                    disabled={isReadyForDownload}
                    onChange={() => setCvaCopies('per-cupper')}
                    className="h-4 w-4"
                  />
                  <label htmlFor="cva-per-cupper" className="text-sm">
                    One sheet per cupper (name pre-filled on each copy)
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="cva-single"
                    name="cva-copies"
                    value="single"
                    checked={cvaCopies === 'single'}
                    disabled={isReadyForDownload}
                    onChange={() => setCvaCopies('single')}
                    className="h-4 w-4"
                  />
                  <label htmlFor="cva-single" className="text-sm">
                    Single copy (Name left blank)
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Output Format (classic cards only) */}
          {!allCva && (
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
          )}
          </>
          )}
        </div>

        <DialogFooter>
          {showPreview ? (
            <div className="flex w-full items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <div className="flex items-center gap-2">
                {previewUrl ? (
                  <Button variant="outline" asChild>
                    <a href={previewUrl} download={activeDoc?.fileName}>
                      <Download className="mr-2 h-4 w-4" />
                      Save PDF
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    <Download className="mr-2 h-4 w-4" />
                    Save PDF
                  </Button>
                )}
                <Button onClick={handlePrintPreview} disabled={!previewUrl}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handlePrint} disabled={isGenerating || loading}>
                {loading
                  ? 'Loading...'
                  : isGenerating
                  ? 'Generating...'
                  : `Print ${samples.length} Card${samples.length !== 1 ? 's' : ''}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
