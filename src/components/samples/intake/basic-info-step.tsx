'use client'

import { useState, useEffect, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Smartphone, Camera, ChevronsUpDown, X } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { ClientAutoDetection } from '@/components/clients/client-auto-detection'
import { LinkQualityTemplateDialog } from './link-quality-template-dialog'
import { AddClientModal, AddClientRole } from '@/components/clients/add-client-modal'
import { StepComponentProps } from './types'
import { ORIGINS, PROCESSING_METHODS, MICRO_ORIGINS } from './constants'

export function BasicInfoStep({
  formData,
  updateFormData,
  clients,
  laboratories,
  filteredClients,
  approvedPSSSamples,
  exporters = [],
  importers = [],
  qcClients = []
}: StepComponentProps) {
  const [isIOS, setIsIOS] = useState(false)
  const [showQRCode, setShowQRCode] = useState(false)
  const [importerQualities, setImporterQualities] = useState<any[]>([])
  const [loadingQualities, setLoadingQualities] = useState(false)
  const [showLinkTemplateDialog, setShowLinkTemplateDialog] = useState(false)
  const [selectedImporterClient, setSelectedImporterClient] = useState<any>(null)
  const [showCreateClientDialog, setShowCreateClientDialog] = useState(false)
  const [createClientRole, setCreateClientRole] = useState<AddClientRole>('exporter')
  const [microOriginOpen, setMicroOriginOpen] = useState(false)

  // Merged list of importers and QC clients for the importer dropdown when importer_is_qc_client is true
  const mergedImporterOptions = useMemo(() => {
    if (formData.importer_is_qc_client) {
      // Merge: QC clients + importers with linked client_id
      const clientOptions = qcClients.map(c => ({
        id: c.id,
        name: c.fantasy_name || c.company,
        type: 'client' as const,
        clientId: c.id
      }))
      const importerOptions = importers
        .filter((imp: any) => imp.client_id) // Only importers linked to clients
        .map((imp: any) => ({
          id: imp.id,
          name: imp.name,
          type: 'importer' as const,
          clientId: imp.client_id
        }))
      // Deduplicate by name
      const seen = new Set<string>()
      return [...clientOptions, ...importerOptions].filter(opt => {
        const key = opt.name.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    } else {
      // Only show importers table
      return importers.map((imp: any) => ({
        id: imp.id,
        name: imp.name,
        type: 'importer' as const,
        clientId: imp.client_id
      }))
    }
  }, [formData.importer_is_qc_client, qcClients, importers])

  // Roasters from clients table (keep existing filter for roasters since no separate roasters table)
  const roasters = useMemo(() =>
    clients.filter(c =>
      c.client_types?.some(type =>
        type === 'roaster' || type === 'roaster_final_buyer'
      )
    ), [clients]
  )

  // Get supported origins for selected laboratory (or single available lab)
  const supportedOrigins = useMemo(() => {
    // Determine which lab to use: selected lab or single available lab
    let labToUse = null

    if (formData.laboratory_id) {
      labToUse = laboratories.find(lab => lab.id === formData.laboratory_id)
    } else if (laboratories.length === 1) {
      // If only one lab available, use it even if not yet selected in form
      labToUse = laboratories[0]
    }

    if (!labToUse || !labToUse.supported_origins || labToUse.supported_origins.length === 0) {
      // No lab selected and multiple labs available - return empty to force lab selection first
      // Or lab has no supported_origins configured - return all as fallback
      return laboratories.length > 1 ? [] : ORIGINS
    }

    // Filter ORIGINS to only show supported ones
    const labOrigins = labToUse.supported_origins || []
    return ORIGINS.filter(origin => labOrigins.includes(origin))
  }, [formData.laboratory_id, laboratories])

  // Auto-select origin if there's only one supported origin
  useEffect(() => {
    if (supportedOrigins.length === 1 && formData.origin !== supportedOrigins[0]) {
      updateFormData('origin', supportedOrigins[0])
    }
    // Clear origin if it's not in supported origins (e.g., lab changed)
    if (formData.origin && supportedOrigins.length > 0 && !supportedOrigins.includes(formData.origin)) {
      updateFormData('origin', supportedOrigins.length === 1 ? supportedOrigins[0] : '')
    }
  }, [supportedOrigins, formData.origin, updateFormData])

  // Get available micro-origins for selected origin
  const availableMicroOrigins = useMemo(() => {
    if (!formData.origin) return []
    return MICRO_ORIGINS[formData.origin] || []
  }, [formData.origin])

  // Clear micro-origin when origin changes (check if any selected micro-origins are invalid)
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

  // Detect iOS
  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase()
    setIsIOS(/iphone|ipad|ipod/.test(userAgent))
  }, [])

  // Load quality templates based on importer/QC client selection
  useEffect(() => {
    const loadImporterQualities = async () => {
      // Determine which client ID to use for quality specs
      let clientIdForQualities: string | null = null

      if (formData.importer_is_qc_client) {
        // Importer IS the QC client - find the client ID
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
        // QC client is separate - use qc_client field
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

  const handleMobileScan = () => {
    // Generate QR code URL that mobile app can scan
    const currentUrl = window.location.origin
    const qrCodeUrl = `${currentUrl}/samples/intake/mobile-scan`
    setShowQRCode(true)
  }

  return (
    <div className="space-y-4">
      {/* iOS Mobile Scan Option */}
      {isIOS && (
        <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Scan Sample Sleeve with Mobile
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Use your iPhone camera to scan sample information
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleMobileScan}
              className="border-blue-300 dark:border-blue-700"
            >
              <Camera className="h-4 w-4 mr-2" />
              Scan Now
            </Button>
          </div>
        </div>
      )}

      {/* Step 1: Select Sample Type First */}
      <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">
          Step 1: Select Sample Type
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="sample_type">Sample Type *</Label>
            <Select
              value={formData.sample_type}
              onValueChange={(value) => updateFormData('sample_type', value as any)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pss">PSS (Pre-Shipment Sample)</SelectItem>
                <SelectItem value="ss">SS (Shipment Sample)</SelectItem>
                <SelectItem value="type">Type Sample</SelectItem>
              </SelectContent>
            </Select>
            {formData.sample_type === 'type' && (
              <div className="flex items-center space-x-2 pt-1">
                <Checkbox
                  id="hide_exporter"
                  checked={formData.hide_exporter_on_label}
                  onCheckedChange={(checked) => updateFormData('hide_exporter_on_label', checked as boolean)}
                />
                <Label htmlFor="hide_exporter" className="text-xs cursor-pointer">
                  Hide exporter name on labels
                </Label>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="origin">Origin *</Label>
            <Select
              value={formData.origin}
              onValueChange={(value) => updateFormData('origin', value)}
              disabled={supportedOrigins.length <= 1}
            >
              <SelectTrigger>
                <SelectValue placeholder={supportedOrigins.length === 0 ? "Select laboratory first" : "Select origin"} />
              </SelectTrigger>
              <SelectContent>
                {supportedOrigins.map((origin) => (
                  <SelectItem key={origin} value={origin}>
                    {origin}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {supportedOrigins.length === 0 && laboratories.length > 1 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Select a laboratory below to see available origins
              </p>
            )}
            {supportedOrigins.length === 1 && (
              <p className="text-xs text-muted-foreground">
                This laboratory only handles {supportedOrigins[0]} origins
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="processing_method">Processing Method</Label>
            <Select
              value={formData.processing_method}
              onValueChange={(value) => updateFormData('processing_method', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select method (optional)" />
              </SelectTrigger>
              <SelectContent>
                {PROCESSING_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {/* Quality Specification - first column */}
          <div className="space-y-2">
            <Label htmlFor="quality_spec_id">Quality Specification *</Label>
            {loadingQualities ? (
              <div className="text-sm text-muted-foreground py-2">Loading qualities...</div>
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
                <SelectTrigger>
                  <SelectValue placeholder="Select quality specification" />
                </SelectTrigger>
                <SelectContent>
                  {importerQualities.map((quality) => (
                    <SelectItem key={quality.id} value={quality.id}>
                      {quality.custom_name || quality.quality_code || 'Unnamed Quality'}
                      {quality.origin && ` (${quality.origin})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : selectedImporterClient ? (
              <div className="space-y-2">
                <div className="p-2 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-xs text-yellow-900 dark:text-yellow-100">
                    No quality specs for this client
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLinkTemplateDialog(true)}
                  className="w-full text-xs"
                >
                  + Link Quality Template
                </Button>
              </div>
            ) : (
              <Select disabled>
                <SelectTrigger>
                  <SelectValue placeholder="Select importer first" />
                </SelectTrigger>
                <SelectContent />
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              Select the quality specification that will be used to evaluate this sample
            </p>
          </div>
          {/* Micro-Origin - second column */}
          <div className="space-y-2">
            <Label htmlFor="micro_origin">Micro-Origin</Label>
            {availableMicroOrigins.length > 0 ? (
              <Popover open={microOriginOpen} onOpenChange={setMicroOriginOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={microOriginOpen}
                    className="w-full justify-between h-auto min-h-10 font-normal"
                    disabled={!formData.origin}
                  >
                    {selectedMicroOrigins.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {selectedMicroOrigins.map((region) => (
                          <Badge
                            key={region}
                            variant="secondary"
                            className="mr-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleMicroOrigin(region)
                            }}
                          >
                            {region}
                            <X className="ml-1 h-3 w-3 cursor-pointer" />
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Select micro-origin(s)...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search regions..." />
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
                id="micro_origin"
                value={formData.micro_origin}
                onChange={(e) => updateFormData('micro_origin', e.target.value)}
                placeholder={formData.origin ? "Enter micro-origin" : "Select origin first"}
                disabled={!formData.origin}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Select one or more regions for blends
            </p>
          </div>
          {/* Exporter Sample Number - third column */}
          <div className="space-y-2">
            <Label htmlFor="exporter_sample_number">Exporter Sample Number</Label>
            <Input
              id="exporter_sample_number"
              value={formData.exporter_sample_number}
              onChange={(e) => updateFormData('exporter_sample_number', e.target.value)}
              placeholder="Exporter's sample ID"
            />
            <p className="text-xs text-muted-foreground">
              Container-specific ID from exporter
            </p>
          </div>
        </div>
      </div>

      {/* Show message if sample type not selected */}
      {!formData.sample_type && (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-900 dark:text-yellow-100">
            Please select a sample type above to continue with sample registration.
          </p>
        </div>
      )}

      {/* Rest of form - only show after sample type is selected */}
      {formData.sample_type && (
        <>
          {/* Only show laboratory selector if user has access to multiple labs */}
          {laboratories.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="laboratory_id">Laboratory *</Label>
              <Select
                value={formData.laboratory_id}
                onValueChange={(value) => updateFormData('laboratory_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select laboratory" />
                </SelectTrigger>
                <SelectContent>
                  {laboratories.map((lab) => (
                    <SelectItem key={lab.id} value={lab.id}>
                      {lab.name} - {lab.location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Seller row with checkbox */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Seller field with checkbox on same row */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="seller">Seller *</Label>
              <Checkbox
                id="same_seller_shipper"
                checked={formData.same_seller_shipper}
                onCheckedChange={(checked) => {
                  updateFormData('same_seller_shipper', checked as boolean)
                  if (checked) {
                    updateFormData('shipper', '')
                  }
                }}
                className="ml-2"
              />
              <Label htmlFor="same_seller_shipper" className="text-sm cursor-pointer text-muted-foreground">
                Same as shipper
              </Label>
            </div>
            <Select
              value={formData.seller === '' ? 'custom' : exporters.find((exp: any) => exp.name === formData.seller) ? formData.seller : 'custom'}
              onValueChange={(value) => {
                if (value === 'new') {
                  setCreateClientRole('exporter')
                  setShowCreateClientDialog(true)
                } else if (value !== 'custom') {
                  updateFormData('seller', value)
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select seller" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Type custom name...</SelectItem>
                <SelectItem value="new">+ Create New Seller</SelectItem>
                {exporters.length > 0 ? (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      Sellers / Exporters
                    </div>
                    {exporters.map((exporter: any) => (
                      <SelectItem key={exporter.id} value={exporter.name}>
                        {exporter.name}
                      </SelectItem>
                    ))}
                  </>
                ) : (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No sellers registered
                  </div>
                )}
              </SelectContent>
            </Select>
            {(formData.seller === '' || !exporters.find((exp: any) => exp.name === formData.seller)) && (
              <Input
                id="seller"
                value={formData.seller}
                onChange={(e) => updateFormData('seller', e.target.value)}
                placeholder="Enter seller name (e.g., Louis Dreyfus)"
              />
            )}
            <p className="text-xs text-muted-foreground">
              The trading company that sold the coffee
            </p>
          </div>

          {/* Shipper field - only show if not same as seller */}
          {!formData.same_seller_shipper && (
            <div className="space-y-2">
              <Label htmlFor="shipper">Shipper *</Label>
              <Select
                value={formData.shipper === '' ? 'custom' : exporters.find((exp: any) => exp.name === formData.shipper) ? formData.shipper : 'custom'}
                onValueChange={(value) => {
                  if (value === 'new') {
                    setCreateClientRole('exporter')
                    setShowCreateClientDialog(true)
                  } else if (value !== 'custom') {
                    updateFormData('shipper', value)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select shipper" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Type custom name...</SelectItem>
                  <SelectItem value="new">+ Create New Shipper</SelectItem>
                  {exporters.length > 0 ? (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Shippers / Exporters
                      </div>
                      {exporters.map((exporter: any) => (
                        <SelectItem key={exporter.id} value={exporter.name}>
                          {exporter.name}
                        </SelectItem>
                      ))}
                    </>
                  ) : (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No shippers registered
                    </div>
                  )}
                </SelectContent>
              </Select>
              {(formData.shipper === '' || !exporters.find((exp: any) => exp.name === formData.shipper)) && (
                <Input
                  id="shipper"
                  value={formData.shipper}
                  onChange={(e) => updateFormData('shipper', e.target.value)}
                  placeholder="Enter shipper name (e.g., COOXUPE)"
                />
              )}
              <p className="text-xs text-muted-foreground">
                The actual exporter that shipped the coffee
              </p>
            </div>
          )}
        </div>

        {/* Importer row with QC Client checkbox */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="importer">
                Importer {(formData.sample_type === 'pss' || formData.sample_type === 'ss') && '*'}
              </Label>
              <Checkbox
                id="importer_is_qc_client"
                checked={formData.importer_is_qc_client}
                onCheckedChange={(checked) => {
                  updateFormData('importer_is_qc_client', checked as boolean)
                  if (checked) {
                    updateFormData('qc_client', '')
                  }
                }}
                className="ml-2"
              />
              <Label htmlFor="importer_is_qc_client" className="text-sm cursor-pointer text-muted-foreground">
                QC Client
              </Label>
            </div>
            <SearchableSelect
              options={mergedImporterOptions.map(o => ({ value: o.name, label: o.name }))}
              value={formData.importer || ''}
              onValueChange={(value) => updateFormData('importer', value)}
              placeholder={(formData.sample_type === 'pss' || formData.sample_type === 'ss') ? 'Select importer (required)' : 'Select importer'}
              searchPlaceholder="Search importers..."
              allowCreate
              onCreateNew={() => {
                setCreateClientRole('importer')
                setShowCreateClientDialog(true)
              }}
              createLabel="+ Create New Importer"
            />
            {(formData.sample_type === 'pss' || formData.sample_type === 'ss') && (
              <p className="text-xs text-muted-foreground">
                {formData.importer_is_qc_client
                  ? 'Required - Importer is also the QC client'
                  : 'Required for PSS/SS samples'}
              </p>
            )}
          </div>

          {/* QC Client field - only show when importer_is_qc_client is false */}
          {!formData.importer_is_qc_client && (
            <div className="space-y-2">
              <Label htmlFor="qc_client">
                QC Client {(formData.sample_type === 'pss' || formData.sample_type === 'ss') && '*'}
              </Label>
              <SearchableSelect
                options={qcClients.map(c => ({ value: c.fantasy_name || c.company, label: c.fantasy_name || c.company }))}
                value={formData.qc_client || ''}
                onValueChange={(value) => updateFormData('qc_client', value)}
                placeholder="Select QC client"
                searchPlaceholder="Search QC clients..."
                allowCreate
                createLabel="+ Create New QC Client"
                onCreateNew={() => {
                  setCreateClientRole('qc_client')
                  setShowCreateClientDialog(true)
                }}
              />
              <p className="text-xs text-muted-foreground">
                The client who commissioned the quality control
              </p>
            </div>
          )}

        </div>

        {/* Supplier Name and Roaster row - side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Supplier Name (left) - text input */}
          <div className="space-y-2">
            <Label htmlFor="supplier">Supplier Name (Optional)</Label>
            <Input
              id="supplier"
              value={formData.supplier}
              onChange={(e) => updateFormData('supplier', e.target.value)}
              placeholder="Farm or cooperative name"
            />
          </div>

          {/* Roaster (right) - database dropdown only */}
          <div className="space-y-2">
            <Label htmlFor="roaster">Roaster (Optional)</Label>
            <SearchableSelect
              options={roasters.map(r => ({ value: r.fantasy_name || r.company, label: r.fantasy_name || r.company }))}
              value={formData.roaster || ''}
              onValueChange={(value) => updateFormData('roaster', value)}
              placeholder="Select roaster"
              searchPlaceholder="Search roasters..."
              allowCreate
              onCreateNew={() => {
                setCreateClientRole('roaster')
                setShowCreateClientDialog(true)
              }}
              createLabel="+ Create New Roaster"
            />
          </div>
        </div>

      {formData.sample_type === 'ss' && (
        <div className="space-y-2 bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <Label htmlFor="linked_pss_sample_id">
            Link to Approved Pre-Shipment Sample
            <span className="ml-2 text-xs text-muted-foreground">(Recommended for Shipment Samples)</span>
          </Label>
          <Select
            value={formData.linked_pss_sample_id}
            onValueChange={(value) => updateFormData('linked_pss_sample_id', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select approved PSS sample..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No linked sample</SelectItem>
              {approvedPSSSamples.length > 0 ? (
                approvedPSSSamples.map((sample) => (
                  <SelectItem key={sample.id} value={sample.id}>
                    {sample.tracking_number} - {sample.origin} ({sample.supplier || 'No supplier'})
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="no-samples" disabled>
                  No approved PSS samples available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {formData.linked_pss_sample_id && (
            <p className="text-xs text-muted-foreground">
              This shipment sample will be linked to the selected pre-shipment sample for tracking.
            </p>
          )}
        </div>
      )}

      </div>
        </>
      )}

      {filteredClients.length > 0 && !formData.client_id && (
        <div className="space-y-2">
          <Label>Quick Selection</Label>
          <div className="flex gap-2 flex-wrap">
            {filteredClients.map((client) => (
              <Badge
                key={client.id}
                variant="outline"
                className="cursor-pointer hover:bg-primary/10"
                onClick={() => updateFormData('client_id', client.id)}
              >
                {client.company}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Link Quality Template Dialog */}
      {selectedImporterClient && (
        <LinkQualityTemplateDialog
          open={showLinkTemplateDialog}
          onOpenChange={setShowLinkTemplateDialog}
          clientId={selectedImporterClient.id}
          clientName={selectedImporterClient.name || selectedImporterClient.fantasy_name || selectedImporterClient.company}
          onSuccess={handleQualityTemplateLinked}
        />
      )}

      {/* Create Client Modal */}
      <AddClientModal
        open={showCreateClientDialog}
        onOpenChange={setShowCreateClientDialog}
        defaultRole={createClientRole}
        onSuccess={(clientName) => {
          if (createClientRole === 'exporter') {
            updateFormData('seller', clientName)
          } else if (createClientRole === 'importer') {
            updateFormData('importer', clientName)
          } else if (createClientRole === 'roaster') {
            updateFormData('roaster', clientName)
          } else if (createClientRole === 'qc_client') {
            updateFormData('qc_client', clientName)
          }
        }}
      />
    </div>
  )
}
