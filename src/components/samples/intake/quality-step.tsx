'use client'

import { useState, useEffect, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ChevronsUpDown, X, Plus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { LinkQualityTemplateDialog } from './link-quality-template-dialog'
import { StepComponentProps } from './types'
import { ORIGINS, PROCESSING_METHODS, MICRO_ORIGINS, CERTIFICATIONS } from './constants'
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
  laboratories,
  approvedPSSSamples,
  importers = [],
  qcClients = []
}: StepComponentProps) {
  const [importerQualities, setImporterQualities] = useState<any[]>([])
  const [loadingQualities, setLoadingQualities] = useState(false)
  const [showLinkTemplateDialog, setShowLinkTemplateDialog] = useState(false)
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

  // Get supported origins for selected laboratory (or single available lab)
  const supportedOrigins = useMemo(() => {
    let labToUse = null

    if (formData.laboratory_id) {
      labToUse = laboratories.find(lab => lab.id === formData.laboratory_id)
    } else if (laboratories.length === 1) {
      labToUse = laboratories[0]
    }

    if (!labToUse || !labToUse.supported_origins || labToUse.supported_origins.length === 0) {
      return laboratories.length > 1 ? [] : ORIGINS
    }

    const labOrigins = labToUse.supported_origins || []
    return ORIGINS.filter(origin => labOrigins.includes(origin))
  }, [formData.laboratory_id, laboratories])

  // Auto-select origin if there's only one supported origin
  useEffect(() => {
    if (supportedOrigins.length === 1 && formData.origin !== supportedOrigins[0]) {
      updateFormData('origin', supportedOrigins[0])
    }
    if (formData.origin && supportedOrigins.length > 0 && !supportedOrigins.includes(formData.origin)) {
      updateFormData('origin', supportedOrigins.length === 1 ? supportedOrigins[0] : '')
    }
  }, [supportedOrigins, formData.origin, updateFormData])

  // Get available micro-origins for selected origin
  const availableMicroOrigins = useMemo(() => {
    if (!formData.origin) return []
    return MICRO_ORIGINS[formData.origin] || []
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

  return (
    <div className="space-y-4">
      {/* Row 1: Sample Type, Origin, Micro-Origin */}
      <div className="flex gap-3 items-end">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Sample Type *</Label>
          <Select
            value={formData.sample_type}
            onValueChange={(value) => updateFormData('sample_type', value as any)}
          >
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pss">PSS (Pre-Shipment Sample)</SelectItem>
              <SelectItem value="ss">SS (Shipment Sample)</SelectItem>
              <SelectItem value="type">Type Sample</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Origin *</Label>
          <Select
            value={formData.origin}
            onValueChange={(value) => updateFormData('origin', value)}
            disabled={supportedOrigins.length <= 1}
          >
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue placeholder={supportedOrigins.length === 0 ? "Select lab first" : "Select origin"} />
            </SelectTrigger>
            <SelectContent>
              {supportedOrigins.map((origin) => (
                <SelectItem key={origin} value={origin}>
                  {origin}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Micro-Origin</Label>
          {availableMicroOrigins.length > 0 ? (
            <Popover open={microOriginOpen} onOpenChange={setMicroOriginOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={microOriginOpen}
                  className="w-[200px] justify-between h-9 font-normal"
                  disabled={!formData.origin}
                >
                  {selectedMicroOrigins.length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-w-[160px]">
                      {selectedMicroOrigins.slice(0, 2).map((region) => (
                        <Badge key={region} variant="secondary" className="text-xs">
                          {region}
                        </Badge>
                      ))}
                      {selectedMicroOrigins.length > 2 && (
                        <Badge variant="secondary" className="text-xs">
                          +{selectedMicroOrigins.length - 2}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">Select regions...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-0" align="start">
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
              className="w-[200px] h-9"
            />
          )}
        </div>
      </div>

      {/* Row 2: Processing Method, Certifications, Quality Specification */}
      <div className="flex gap-3 items-end">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Processing Method</Label>
          <Select
            value={formData.processing_method || 'none'}
            onValueChange={(value) => updateFormData('processing_method', value === 'none' ? '' : value)}
          >
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Select method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select...</SelectItem>
              {PROCESSING_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Certifications</Label>
          <Popover open={certificationOpen} onOpenChange={setCertificationOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={certificationOpen}
                className="w-[180px] justify-between h-9 font-normal"
              >
                {(formData.certifications?.length || 0) > 0 ? (
                  <div className="flex flex-wrap gap-1 max-w-[140px]">
                    {formData.certifications.slice(0, 2).map((cert) => (
                      <Badge key={cert} variant="secondary" className="text-xs">
                        {cert}
                      </Badge>
                    ))}
                    {formData.certifications.length > 2 && (
                      <Badge variant="secondary" className="text-xs">
                        +{formData.certifications.length - 2}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs">Select...</span>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0" align="start">
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
                      <Plus className="h-4 w-4 mr-2" />
                      Add new certification
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Quality Specification {(formData.sample_type === 'pss' || formData.sample_type === 'ss') && '*'}</Label>
          {loadingQualities ? (
            <div className="text-sm text-muted-foreground py-2">Loading...</div>
          ) : importerQualities.length > 0 ? (
            <Select
              value={formData.quality_spec_id || 'none'}
              onValueChange={(value) => {
                if (value === 'none') {
                  updateFormData('quality_spec_id', '')
                  updateFormData('quality_name', '')
                } else {
                  updateFormData('quality_spec_id', value)
                  const selectedQuality = importerQualities.find(q => q.id === value)
                  if (selectedQuality?.custom_name) {
                    updateFormData('quality_name', selectedQuality.custom_name)
                  }
                  if (selectedImporterClient) {
                    updateFormData('client_id', selectedImporterClient.id)
                  }
                }
              }}
            >
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Select quality" />
              </SelectTrigger>
              <SelectContent>
                {importerQualities.map((quality) => (
                  <SelectItem key={quality.id} value={quality.id}>
                    {quality.custom_name || quality.quality_code || 'Unnamed'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : selectedImporterClient ? (
            <div className="flex gap-2 items-center">
              <div className="p-2 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs">
                No specs for this client
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowLinkTemplateDialog(true)}
                className="text-xs h-9"
              >
                + Link Template
              </Button>
            </div>
          ) : (
            <Select disabled>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Select importer first" />
              </SelectTrigger>
              <SelectContent />
            </Select>
          )}
        </div>
        {/* Laboratory - only show if user has multiple labs */}
        {laboratories.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Laboratory *</Label>
            <Select
              value={formData.laboratory_id}
              onValueChange={(value) => updateFormData('laboratory_id', value)}
            >
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Select lab" />
              </SelectTrigger>
              <SelectContent>
                {laboratories.map((lab) => (
                  <SelectItem key={lab.id} value={lab.id}>
                    {lab.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Hide exporter checkbox (only for type samples) */}
      {formData.sample_type === 'type' && (
        <div className="flex items-center space-x-2">
          <Checkbox
            id="hide_exporter"
            checked={formData.hide_exporter_on_label}
            onCheckedChange={(checked) => updateFormData('hide_exporter_on_label', checked as boolean)}
            className="h-3 w-3"
          />
          <Label htmlFor="hide_exporter" className="text-xs cursor-pointer text-muted-foreground">
            Hide exporter on labels
          </Label>
        </div>
      )}

      {/* SS Sample: Link to PSS */}
      {formData.sample_type === 'ss' && (
        <div className="space-y-2 bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <Label>Link to Approved Pre-Shipment Sample</Label>
          <Select
            value={formData.linked_pss_sample_id}
            onValueChange={(value) => updateFormData('linked_pss_sample_id', value)}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select approved PSS sample..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No linked sample</SelectItem>
              {approvedPSSSamples.length > 0 ? (
                approvedPSSSamples.map((sample) => (
                  <SelectItem key={sample.id} value={sample.id}>
                    {sample.tracking_number} - {sample.origin}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="no-samples" disabled>
                  No approved PSS samples
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Link Quality Template Dialog */}
      {selectedImporterClient && (
        <LinkQualityTemplateDialog
          open={showLinkTemplateDialog}
          onOpenChange={setShowLinkTemplateDialog}
          clientId={selectedImporterClient.id}
          clientName={selectedImporterClient.name}
          onSuccess={handleQualityTemplateLinked}
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
    </div>
  )
}
