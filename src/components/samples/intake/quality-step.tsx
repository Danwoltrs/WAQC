'use client'

import { useState, useEffect, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ChevronsUpDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { LinkQualityTemplateDialog } from './link-quality-template-dialog'
import { StepComponentProps } from './types'
import { FieldBox, isPrefilled, PREFILLED_CONTROL } from './field-box'
import { SectionCard } from './section-card'
import { QualitySuggestion } from './quality-suggestion'
import { contractDisplayNumber } from '@/lib/contract-family'
import type { QualityMatch } from '@/lib/quality-matching'
import { ORIGINS, PROCESSING_METHODS, CERTIFICATIONS, microOriginOptions } from './constants'

// Generate crop year options: always include 23/24 through current+1, auto-add new year each July
function getCropYearOptions(): string[] {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() // 0-indexed (6 = July)
  // If we're in or past July, the current crop year starts this year (e.g. July 2026 => 26/27)
  // Otherwise, the current crop year started last year (e.g. March 2026 => 25/26)
  const latestStartYear = currentMonth >= 6 ? currentYear : currentYear - 1
  const startYear = 2023 // Always start from 23/24
  const options: string[] = []
  for (let y = startYear; y <= latestStartYear + 1; y++) {
    const short1 = String(y).slice(-2)
    const short2 = String(y + 1).slice(-2)
    options.push(`${short1}/${short2}`)
  }
  return options
}
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'

export function QualityStep({
  formData,
  updateFormData,
  clients,
  approvedPSSSamples,
  importers = [],
  qcClients = [],
  specialtyQualityIds,
  onSpecialtyQualities,
}: StepComponentProps) {
  const [importerQualities, setImporterQualities] = useState<any[]>([])
  const [loadingQualities, setLoadingQualities] = useState(false)
  const [showLinkTemplateDialog, setShowLinkTemplateDialog] = useState(false)
  // The contract's quality words a new specification starts from ("15/16 FC").
  const [newSpecName, setNewSpecName] = useState<string | undefined>(undefined)
  const [selectedImporterClient, setSelectedImporterClient] = useState<any>(null)
  const [microOriginOpen, setMicroOriginOpen] = useState(false)
  const [certificationOpen, setCertificationOpen] = useState(false)
  const [showAddCertDialog, setShowAddCertDialog] = useState(false)
  const [newCertification, setNewCertification] = useState('')
  const [customCertifications, setCustomCertifications] = useState<string[]>([])

  // Merged list of importers and QC clients for quality specs lookup
  const mergedImporterOptions = useMemo(() => {
    if (formData.importer_is_qc_client) {
      const clientOptions = qcClients.map(c => ({
        id: c.id,
        name: c.fantasy_name || c.company,
        type: 'client' as const,
        clientId: c.id
      }))
      const importerOptions = importers
        .filter((imp: any) => imp.client_id)
        .map((imp: any) => ({
          id: imp.id,
          name: imp.name,
          type: 'importer' as const,
          clientId: imp.client_id
        }))
      const seen = new Set<string>()
      return [...clientOptions, ...importerOptions].filter(opt => {
        const key = opt.name.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    } else {
      return importers.map((imp: any) => ({
        id: imp.id,
        name: imp.name,
        type: 'importer' as const,
        clientId: imp.client_id
      }))
    }
  }, [formData.importer_is_qc_client, qcClients, importers])

  // Get available micro-origins for selected origin
  const availableMicroOrigins = useMemo(() => {
    return microOriginOptions(formData.origin)
  }, [formData.origin])

  // Clear micro-origin when origin changes
  useEffect(() => {
    if (formData.micro_origin && availableMicroOrigins.length > 0) {
      const selectedMicroOrigins = formData.micro_origin.split(' | ').filter(Boolean)
      const validMicroOrigins = selectedMicroOrigins.filter(mo => availableMicroOrigins.includes(mo))
      if (validMicroOrigins.length !== selectedMicroOrigins.length) {
        updateFormData('micro_origin', validMicroOrigins.join(' | '))
      }
    }
  }, [formData.origin, formData.micro_origin, availableMicroOrigins, updateFormData])

  // Parse selected micro-origins from pipe-separated string
  const selectedMicroOrigins = useMemo(() => {
    if (!formData.micro_origin) return []
    return formData.micro_origin.split(' | ').filter(Boolean)
  }, [formData.micro_origin])

  // Toggle a micro-origin selection
  const toggleMicroOrigin = (region: string) => {
    const current = selectedMicroOrigins
    const isSelected = current.includes(region)
    let updated: string[]
    if (isSelected) {
      updated = current.filter(r => r !== region)
    } else {
      updated = [...current, region]
    }
    updateFormData('micro_origin', updated.join(' | '))
  }

  // All available certifications (predefined + custom)
  const allCertifications = useMemo(() => {
    return [...CERTIFICATIONS, ...customCertifications]
  }, [customCertifications])

  // Toggle a certification selection
  const toggleCertification = (cert: string) => {
    const current = formData.certifications || []
    const isSelected = current.includes(cert)
    let updated: string[]
    if (isSelected) {
      updated = current.filter(c => c !== cert)
    } else {
      updated = [...current, cert]
    }
    updateFormData('certifications', updated)
  }

  // Add new custom certification
  const handleAddCertification = () => {
    if (newCertification.trim() && !allCertifications.includes(newCertification.trim())) {
      setCustomCertifications(prev => [...prev, newCertification.trim()])
      // Also add it to the selection
      const current = formData.certifications || []
      updateFormData('certifications', [...current, newCertification.trim()])
      setNewCertification('')
      setShowAddCertDialog(false)
    }
  }

  // Load quality templates based on importer/QC client selection
  useEffect(() => {
    const loadImporterQualities = async () => {
      let clientIdForQualities: string | null = null

      if (formData.importer_is_qc_client) {
        if (formData.importer) {
          const selectedOption = mergedImporterOptions.find(opt => opt.name === formData.importer)
          if (selectedOption) {
            clientIdForQualities = selectedOption.clientId
            setSelectedImporterClient({ name: selectedOption.name, id: selectedOption.clientId })
          } else {
            setSelectedImporterClient(null)
          }
        } else {
          setImporterQualities([])
          setSelectedImporterClient(null)
          return
        }
      } else {
        if (formData.qc_client) {
          const qcClient = qcClients.find(c => (c.fantasy_name || c.company) === formData.qc_client)
          if (qcClient) {
            clientIdForQualities = qcClient.id
            setSelectedImporterClient({ name: formData.qc_client, id: qcClient.id })
          } else {
            setSelectedImporterClient(null)
          }
        } else {
          setImporterQualities([])
          setSelectedImporterClient(null)
          return
        }
      }

      if (!clientIdForQualities) {
        setImporterQualities([])
        return
      }

      setLoadingQualities(true)
      try {
        const response = await fetch(`/api/clients/${clientIdForQualities}/quality-specifications`)
        if (response.ok) {
          const data = await response.json()
          setImporterQualities(data.specifications || [])
        }
      } catch (error) {
        console.error('Error loading quality specifications:', error)
      } finally {
        setLoadingQualities(false)
      }
    }

    loadImporterQualities()
  }, [formData.importer, formData.qc_client, formData.importer_is_qc_client, mergedImporterOptions, qcClients])

  // Reload quality specs when link template dialog is closed successfully
  const handleQualityTemplateLinked = async () => {
    if (selectedImporterClient) {
      setLoadingQualities(true)
      try {
        const response = await fetch(`/api/clients/${selectedImporterClient.id}/quality-specifications`)
        if (response.ok) {
          const data = await response.json()
          setImporterQualities(data.specifications || [])
        }
      } catch (error) {
        console.error('Error reloading quality specifications:', error)
      } finally {
        setLoadingQualities(false)
      }
    }
  }

  // The specialty intake lists only CVA qualities, and tells the form about
  // each one it meets here (a client's own, or one just linked).
  const specialty = specialtyQualityIds !== undefined
  const isSpecialty = (q: { id: string; template?: { methodology?: string | null } | null }) =>
    !!specialtyQualityIds?.has(q.id) || q.template?.methodology === 'cva'
  const listedQualities = specialty ? importerQualities.filter(isSpecialty) : importerQualities
  useEffect(() => {
    if (!onSpecialtyQualities) return
    const ids = importerQualities.filter((q) => q.template?.methodology === 'cva').map((q) => q.id)
    if (ids.length > 0) onSpecialtyQualities(ids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importerQualities])

  const qualityMatch = specialty
    ? specialtyOnlyMatch(formData.contract_resolution?.quality_match, (id) => !!specialtyQualityIds?.has(id))
    : formData.contract_resolution?.quality_match

  const pre = (key: keyof typeof formData) => isPrefilled(formData, key)
  const tint = (key: keyof typeof formData) => cn('h-9 w-full', pre(key) && PREFILLED_CONTROL)
  const specRequired = specialty || formData.sample_type === 'pss' || formData.sample_type === 'ss'

  // The spec the form holds is always an option, even when it came from the
  // contract's buyer and the list is the QC client's: a select never shows
  // blank over a value it holds.
  const heldOffered = !specialty || !!specialtyQualityIds?.has(formData.quality_spec_id)
  const specOptions =
    formData.quality_spec_id && heldOffered && !listedQualities.some((q) => q.id === formData.quality_spec_id)
      ? [{ id: formData.quality_spec_id, custom_name: formData.quality_name || 'Selected specification' }, ...listedQualities]
      : listedQualities
  const pickQuality = (id: string, label: string | null) => {
    updateFormData('quality_spec_id', id)
    if (label) updateFormData('quality_name', label)
    if (selectedImporterClient) updateFormData('client_id', selectedImporterClient.id)
  }

  return (
    <SectionCard section="quality" label="Quality">
      {/* What the sys contract says about the coffee: the specification, the
          region, how it was processed, its certifications and crop, prefilled
          from the contract (contract-intake-mapping) and tagged until edited.
          Lab and origin sit in the wizard's footer (lab-origin-pickers). */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <FieldBox label="Quality specification" field="quality_spec" required={specRequired} prefilled={pre('quality_spec_id')}>
          {loadingQualities ? (
            <div className="flex h-9 items-center text-sm text-muted-foreground">Loading specifications...</div>
          ) : specOptions.length > 0 ? (
            <Select
              // An empty value shows the placeholder; there is no "none" item
              // here, and a value with no item showed a blank field.
              value={formData.quality_spec_id}
              onValueChange={(value) => {
                if (value === 'none') {
                  updateFormData('quality_spec_id', '')
                  updateFormData('quality_name', '')
                } else {
                  pickQuality(value, specOptions.find(q => q.id === value)?.custom_name ?? null)
                }
              }}
            >
              <SelectTrigger className={tint('quality_spec_id')}>
                <SelectValue placeholder="Select quality" />
              </SelectTrigger>
              <SelectContent>
                {specOptions.map((quality) => (
                  <SelectItem key={quality.id} value={quality.id}>
                    {quality.custom_name || quality.quality_code || 'Unnamed'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : selectedImporterClient ? (
            <div className="flex items-center gap-2">
              <div className="flex h-9 flex-1 items-center rounded-md border border-yellow-200 bg-yellow-50 px-3 text-xs dark:border-yellow-800 dark:bg-yellow-950/20">
                {specialty ? 'No specialty specifications for this client' : 'No specifications for this client'}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewSpecName(formData.contract_resolution?.quality_match?.source_text ?? undefined)
                  setShowLinkTemplateDialog(true)
                }}
                className="text-xs"
              >
                + Link template
              </Button>
            </div>
          ) : (
            <Select disabled>
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Pick the importer or QC client first" />
              </SelectTrigger>
              <SelectContent />
            </Select>
          )}
        </FieldBox>

        <FieldBox label="Micro-origin" prefilled={pre('micro_origin')}>
          {availableMicroOrigins.length > 0 ? (
            <Popover open={microOriginOpen} onOpenChange={setMicroOriginOpen}>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={microOriginOpen}
                        className={cn('h-9 w-full justify-between font-normal', pre('micro_origin') && PREFILLED_CONTROL)}
                        disabled={!formData.origin}
                      >
                        {selectedMicroOrigins.length > 0 ? (
                          <span className="truncate text-sm">
                            {selectedMicroOrigins.join(', ')}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Select regions...</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  {selectedMicroOrigins.length > 0 && (
                    <TooltipContent side="top" className="max-w-[300px]">
                      <p className="text-xs">{selectedMicroOrigins.join(', ')}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search..." />
                  <CommandList>
                    <CommandEmpty>No region found.</CommandEmpty>
                    <CommandGroup>
                      {availableMicroOrigins.map((region) => (
                        <CommandItem
                          key={region}
                          value={region}
                          onSelect={() => toggleMicroOrigin(region)}
                        >
                          <Checkbox
                            checked={selectedMicroOrigins.includes(region)}
                            className="mr-2"
                          />
                          {region}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : (
            <Input
              value={formData.micro_origin}
              onChange={(e) => updateFormData('micro_origin', e.target.value)}
              placeholder={formData.origin ? "Enter micro-origin" : "Select origin first"}
              disabled={!formData.origin}
              className={tint('micro_origin')}
            />
          )}
        </FieldBox>

        <FieldBox label="Processing method" prefilled={pre('processing_method')}>
          <Select
            value={formData.processing_method || 'none'}
            onValueChange={(value) => updateFormData('processing_method', value === 'none' ? '' : value)}
          >
            <SelectTrigger className={tint('processing_method')}>
              <SelectValue placeholder="Select method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select...</SelectItem>
              {PROCESSING_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {method === 'Semi-Washed' ? 'Semi-Washed (Pulped Natural)' : method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBox>

        <FieldBox label="Certifications" prefilled={pre('certifications')}>
          <Popover open={certificationOpen} onOpenChange={setCertificationOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={certificationOpen}
                className={cn('h-9 w-full justify-between font-normal', pre('certifications') && PREFILLED_CONTROL)}
              >
                {(formData.certifications?.length || 0) > 0 ? (
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {formData.certifications.slice(0, 3).map((cert) => (
                      <Badge key={cert} variant="secondary" className="rounded-sm text-xs">
                        {cert}
                      </Badge>
                    ))}
                    {formData.certifications.length > 3 && (
                      <Badge variant="secondary" className="rounded-sm text-xs">
                        +{formData.certifications.length - 3}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Select...</span>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search..." />
                <CommandList>
                  <CommandEmpty>No certification found.</CommandEmpty>
                  <CommandGroup>
                    {allCertifications.map((cert) => (
                      <CommandItem
                        key={cert}
                        value={cert}
                        onSelect={() => toggleCertification(cert)}
                      >
                        <Checkbox
                          checked={formData.certifications?.includes(cert)}
                          className="mr-2"
                        />
                        {cert}
                      </CommandItem>
                    ))}
                    <CommandItem
                      onSelect={() => setShowAddCertDialog(true)}
                      className="text-primary"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add new certification
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </FieldBox>

        <FieldBox label="Crop year" prefilled={pre('crop_year')}>
          <Select
            value={formData.crop_year || 'none'}
            onValueChange={(value) => updateFormData('crop_year', value === 'none' ? '' : value)}
          >
            <SelectTrigger className={tint('crop_year')}>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select...</SelectItem>
              {(formData.crop_year && !getCropYearOptions().includes(formData.crop_year)
                ? [formData.crop_year, ...getCropYearOptions()]
                : getCropYearOptions()
              ).map((cy) => (
                <SelectItem key={cy} value={cy}>{cy}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBox>
      </div>

      {/* What the contract says about the quality, full width under the
          fields: a button under the specification dropdown, the note beside
          it (Daniel 2026-09-29), so it adds one short row, not three. */}
      <div className="mt-3 empty:hidden">
        <QualitySuggestion
          match={qualityMatch}
          currentSpecId={formData.quality_spec_id}
          contractLabel={formData.selected_contract ? `#${contractDisplayNumber(formData.selected_contract)}` : null}
          autoSelected={isPrefilled(formData, 'quality_spec_id')}
          onUse={pickQuality}
          currentSpecLabel={specOptions.find((q) => q.id === formData.quality_spec_id)?.custom_name ?? null}
          onCreate={selectedImporterClient ? (name) => {
            setNewSpecName(name)
            setShowLinkTemplateDialog(true)
          } : undefined}
        />
      </div>

      {/* Hide exporter checkbox (only for type samples) */}
      {formData.sample_type === 'type' && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            id="hide_exporter"
            checked={formData.hide_exporter_on_label}
            onCheckedChange={(checked) => updateFormData('hide_exporter_on_label', checked as boolean)}
            className="h-3.5 w-3.5"
          />
          Hide exporter on labels
        </label>
      )}

      {/* Link Quality Template Dialog */}
      {selectedImporterClient && (
        <LinkQualityTemplateDialog
          open={showLinkTemplateDialog}
          onOpenChange={(open) => {
            setShowLinkTemplateDialog(open)
            if (!open) setNewSpecName(undefined)
          }}
          clientId={selectedImporterClient.id}
          clientName={selectedImporterClient.name}
          specialtyOnly={specialty}
          initialName={newSpecName}
          initialOrigin={formData.origin || undefined}
          suggestedSpecId={formData.quality_spec_id || qualityMatch?.spec_id || qualityMatch?.suggestions?.[0]?.spec_id}
          contractDescription={formData.selected_contract?.quality_full_text}
          onSuccess={(specification) => {
            handleQualityTemplateLinked()
            // The specialty intake's dialog offers only CVA starting points,
            // so what it made is specialty before the reload can say so.
            if (specification?.id && specialty) onSpecialtyQualities?.([specification.id])
            // A specification made for this contract's words is this sample's.
            if (specification?.id) pickQuality(specification.id, specification.custom_name)
          }}
        />
      )}

      {/* Add New Certification Dialog */}
      <Dialog open={showAddCertDialog} onOpenChange={setShowAddCertDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add New Certification</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Certification Name</Label>
              <Input
                value={newCertification}
                onChange={(e) => setNewCertification(e.target.value)}
                placeholder="e.g., UTZ Certified"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCertDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCertification} disabled={!newCertification.trim()}>
              Add Certification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  )
}

/**
 * The contract's quality match as the specialty intake may use it: a match or
 * a suggestion that is not specialty is no help there, so it is dropped, and
 * a confident match left with nothing reads as no match.
 */
function specialtyOnlyMatch(match: QualityMatch | null | undefined, isSpecialty: (specId: string) => boolean) {
  if (!match) return match
  const specId = match.spec_id && isSpecialty(match.spec_id) ? match.spec_id : null
  return {
    ...match,
    spec_id: specId,
    spec_label: specId ? match.spec_label : null,
    matched: match.matched && !!specId,
    confidence: match.confidence === 'high' && !specId ? 'none' as const : match.confidence,
    suggestions: (match.suggestions ?? []).filter((x) => isSpecialty(x.spec_id)),
  }
}
