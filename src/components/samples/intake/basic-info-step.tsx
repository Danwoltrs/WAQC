'use client'

import { useState, useEffect, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Smartphone, Camera, ChevronsUpDown, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { ClientAutoDetection } from '@/components/clients/client-auto-detection'
import { LinkQualityTemplateDialog } from './link-quality-template-dialog'
import { CreateClientDialog } from './create-client-dialog'
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
  importers = []
}: StepComponentProps) {
  const [isIOS, setIsIOS] = useState(false)
  const [showQRCode, setShowQRCode] = useState(false)
  const [buyerQualities, setBuyerQualities] = useState<any[]>([])
  const [loadingQualities, setLoadingQualities] = useState(false)
  const [showLinkTemplateDialog, setShowLinkTemplateDialog] = useState(false)
  const [selectedBuyerClient, setSelectedBuyerClient] = useState<any>(null)
  const [showCreateClientDialog, setShowCreateClientDialog] = useState(false)
  const [createClientType, setCreateClientType] = useState<'exporter' | 'buyer' | 'roaster'>('exporter')
  const [microOriginOpen, setMicroOriginOpen] = useState(false)

  // Buyers from importers table
  const buyers = useMemo(() => importers, [importers])

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

  // Load buyer's quality templates when buyer changes
  useEffect(() => {
    const loadBuyerQualities = async () => {
      if (!formData.buyer) {
        setBuyerQualities([])
        return
      }

      // Find the buyer (importer) by name - importers table uses 'name' field
      const buyerImporter = buyers.find((imp: any) => imp.name === formData.buyer)

      if (!buyerImporter) {
        setBuyerQualities([])
        setSelectedBuyerClient(null)
        return
      }

      // Importers have client_id that links to the actual client with quality specs
      const clientId = (buyerImporter as any).client_id
      if (!clientId) {
        setBuyerQualities([])
        setSelectedBuyerClient(buyerImporter)
        return
      }

      setSelectedBuyerClient({ ...buyerImporter, id: clientId })
      setLoadingQualities(true)
      try {
        const response = await fetch(`/api/clients/${clientId}/quality-specifications`)
        if (response.ok) {
          const data = await response.json()
          setBuyerQualities(data.specifications || [])
        }
      } catch (error) {
        console.error('Error loading buyer qualities:', error)
      } finally {
        setLoadingQualities(false)
      }
    }

    loadBuyerQualities()
  }, [formData.buyer, buyers])

  // Reload buyer qualities when link template dialog is closed successfully
  const handleQualityTemplateLinked = async () => {
    if (selectedBuyerClient) {
      setLoadingQualities(true)
      try {
        const response = await fetch(`/api/clients/${selectedBuyerClient.id}/quality-specifications`)
        if (response.ok) {
          const data = await response.json()
          setBuyerQualities(data.specifications || [])
        }
      } catch (error) {
        console.error('Error reloading buyer qualities:', error)
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  setCreateClientType('exporter')
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
                    setCreateClientType('exporter')
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

        {/* Buyer and Roaster row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="buyer">
              Buyer {(formData.sample_type === 'pss' || formData.sample_type === 'ss') && '*'}
            </Label>
            <Select
              value={formData.buyer === '' ? 'custom' : buyers.find((imp: any) => imp.name === formData.buyer) ? formData.buyer : 'custom'}
              onValueChange={(value) => {
                if (value === 'new') {
                  setCreateClientType('buyer')
                  setShowCreateClientDialog(true)
                } else if (value !== 'custom') {
                  updateFormData('buyer', value)
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={(formData.sample_type === 'pss' || formData.sample_type === 'ss') ? 'Select buyer (required)' : 'Select existing or type new'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Type custom name...</SelectItem>
                <SelectItem value="new">+ Create New Buyer</SelectItem>
                {buyers.length > 0 ? (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      Buyers & Importers
                    </div>
                    {buyers.map((importer: any) => (
                      <SelectItem key={importer.id} value={importer.name}>
                        {importer.name}
                      </SelectItem>
                    ))}
                  </>
                ) : (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No buyers registered
                  </div>
                )}
              </SelectContent>
            </Select>
            {(formData.buyer === '' || !buyers.find((imp: any) => imp.name === formData.buyer)) && (
              <Input
                id="buyer"
                value={formData.buyer}
                onChange={(e) => updateFormData('buyer', e.target.value)}
                placeholder="Enter buyer name"
              />
            )}
            {(formData.sample_type === 'pss' || formData.sample_type === 'ss') && (
              <p className="text-xs text-muted-foreground">
                Required for PSS/SS samples to assign quality specifications
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="roaster">Roaster</Label>
            <Select
              value={formData.roaster === '' ? 'custom' : roasters.find(c => (c.fantasy_name || c.company) === formData.roaster) ? formData.roaster : 'custom'}
              onValueChange={(value) => {
                if (value === 'new') {
                  setCreateClientType('roaster')
                  setShowCreateClientDialog(true)
                } else if (value !== 'custom') {
                  updateFormData('roaster', value)
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select existing or type new" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Type custom name...</SelectItem>
                <SelectItem value="new">+ Create New Roaster</SelectItem>
                {roasters.length > 0 ? (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      Roasters
                    </div>
                    {roasters.map((client) => (
                      <SelectItem key={client.id} value={client.fantasy_name || client.company}>
                        {client.fantasy_name || client.company}
                      </SelectItem>
                    ))}
                  </>
                ) : (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No roasters registered
                  </div>
                )}
              </SelectContent>
            </Select>
            {(formData.roaster === '' || !roasters.find(c => (c.fantasy_name || c.company) === formData.roaster)) && (
              <Input
                id="roaster"
                value={formData.roaster}
                onChange={(e) => updateFormData('roaster', e.target.value)}
                placeholder="Enter roaster name"
              />
            )}
          </div>
        </div>

        {/* Supplier row */}
        <div className="space-y-2">
          <Label htmlFor="supplier">Supplier Name (Optional)</Label>
          <Input
            id="supplier"
            value={formData.supplier}
            onChange={(e) => updateFormData('supplier', e.target.value)}
            placeholder="Farm or cooperative name"
          />
        </div>

      {/* Quality fields row - 2 columns (removed Quality Name) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Quality Specification - Show for PSS/SS with buyer selected (required) OR for type samples (optional) */}
        {formData.buyer && selectedBuyerClient && (formData.sample_type === 'pss' || formData.sample_type === 'ss' || formData.sample_type === 'type') ? (
          <div className="space-y-2">
          <Label htmlFor="quality_spec_id">
            Quality Specification {(formData.sample_type === 'pss' || formData.sample_type === 'ss') && '*'}
          </Label>
          {loadingQualities ? (
            <div className="text-sm text-muted-foreground">Loading buyer qualities...</div>
          ) : buyerQualities.length > 0 ? (
            <Select
              value={formData.quality_spec_id || 'none'}
              onValueChange={(value) => {
                if (value === 'none') {
                  updateFormData('quality_spec_id', '')
                  updateFormData('quality_name', '')
                } else {
                  updateFormData('quality_spec_id', value)
                  const selectedQuality = buyerQualities.find(q => q.id === value)
                  if (selectedQuality?.custom_name) {
                    updateFormData('quality_name', selectedQuality.custom_name)
                  }
                  if (selectedBuyerClient) {
                    updateFormData('client_id', selectedBuyerClient.id)
                  }
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  formData.sample_type === 'type'
                    ? "Select quality (optional)"
                    : "Select quality specification"
                } />
              </SelectTrigger>
              <SelectContent>
                {formData.sample_type === 'type' && (
                  <SelectItem value="none">None - Use custom quality name</SelectItem>
                )}
                {buyerQualities.map((quality) => (
                  <SelectItem key={quality.id} value={quality.id}>
                    {quality.custom_name || quality.quality_code || 'Unnamed Quality'}
                    {quality.origin && ` (${quality.origin})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : formData.sample_type !== 'type' ? (
            <div className="space-y-2">
              <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-900 dark:text-yellow-100">
                  No quality specifications found for this buyer.
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                  You need to link a quality template to this buyer before proceeding.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowLinkTemplateDialog(true)}
                disabled={!selectedBuyerClient}
              >
                + Link Quality Template to Buyer
              </Button>
            </div>
          ) : null}
          {buyerQualities.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {formData.sample_type === 'type'
                ? 'Optional: Select a quality template or leave blank to use custom quality name'
                : 'Select the quality specification that will be used to evaluate this sample'}
            </p>
          )}
          </div>
        ) : (
          <div></div>
        )}

        {/* Processing Method */}
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
      {selectedBuyerClient && (
        <LinkQualityTemplateDialog
          open={showLinkTemplateDialog}
          onOpenChange={setShowLinkTemplateDialog}
          clientId={selectedBuyerClient.id}
          clientName={selectedBuyerClient.name || selectedBuyerClient.fantasy_name || selectedBuyerClient.company}
          onSuccess={handleQualityTemplateLinked}
        />
      )}

      {/* Create Client Dialog */}
      <CreateClientDialog
        open={showCreateClientDialog}
        onOpenChange={setShowCreateClientDialog}
        clientType={createClientType}
        onSuccess={(clientName) => {
          // Update the appropriate field based on client type
          if (createClientType === 'exporter') {
            // When creating from Seller field, update seller; from Shipper field, update shipper
            // For now, default to seller since that's the primary use case
            updateFormData('seller', clientName)
          } else if (createClientType === 'buyer') {
            updateFormData('buyer', clientName)
          } else if (createClientType === 'roaster') {
            updateFormData('roaster', clientName)
          }
        }}
      />
    </div>
  )
}
