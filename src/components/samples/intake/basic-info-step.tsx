'use client'

import { useState, useEffect, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Smartphone, Camera } from 'lucide-react'
import { ClientAutoDetection } from '@/components/clients/client-auto-detection'
import { LinkQualityTemplateDialog } from './link-quality-template-dialog'
import { CreateClientDialog } from './create-client-dialog'
import { StepComponentProps } from './types'
import { ORIGINS, PROCESSING_METHODS } from './constants'

export function BasicInfoStep({
  formData,
  updateFormData,
  clients,
  laboratories,
  filteredClients,
  approvedPSSSamples
}: StepComponentProps) {
  const [isIOS, setIsIOS] = useState(false)
  const [showQRCode, setShowQRCode] = useState(false)
  const [buyerQualities, setBuyerQualities] = useState<any[]>([])
  const [loadingQualities, setLoadingQualities] = useState(false)
  const [showLinkTemplateDialog, setShowLinkTemplateDialog] = useState(false)
  const [selectedBuyerClient, setSelectedBuyerClient] = useState<any>(null)
  const [showCreateClientDialog, setShowCreateClientDialog] = useState(false)
  const [createClientType, setCreateClientType] = useState<'exporter' | 'buyer' | 'roaster'>('exporter')

  // Memoize filtered client lists to prevent unnecessary re-renders
  const exporters = useMemo(() =>
    clients.filter(c =>
      c.client_types?.some(type =>
        type === 'exporter' || type === 'producer_exporter' || type === 'cooperative'
      )
    ), [clients]
  )

  const buyers = useMemo(() =>
    clients.filter(c =>
      c.client_types?.some(type =>
        type === 'importer_buyer' || type === 'roaster' || type === 'roaster_final_buyer'
      )
    ), [clients]
  )

  const roasters = useMemo(() =>
    clients.filter(c =>
      c.client_types?.some(type =>
        type === 'roaster' || type === 'roaster_final_buyer'
      )
    ), [clients]
  )

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

      // Find the buyer client - match against fantasy_name first, then company
      const buyerClient = buyers.find(c =>
        (c.fantasy_name || c.company) === formData.buyer
      )

      if (!buyerClient) {
        setBuyerQualities([])
        setSelectedBuyerClient(null)
        return
      }

      setSelectedBuyerClient(buyerClient)
      setLoadingQualities(true)
      try {
        const response = await fetch(`/api/clients/${buyerClient.id}/quality-specifications`)
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="laboratory_id">Laboratory *</Label>
          <Select
            value={formData.laboratory_id}
            onValueChange={(value) => updateFormData('laboratory_id', value)}
            disabled={laboratories.length === 1}
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
          {laboratories.length === 1 && (
            <p className="text-xs text-muted-foreground">
              Your assigned laboratory
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="origin">Origin *</Label>
          <Select
            value={formData.origin}
            onValueChange={(value) => updateFormData('origin', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select origin" />
            </SelectTrigger>
            <SelectContent>
              {ORIGINS.map((origin) => (
                <SelectItem key={origin} value={origin}>
                  {origin}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="exporter">Exporter *</Label>
          <Select
            value={formData.exporter === '' ? 'custom' : exporters.find(c => (c.fantasy_name || c.company) === formData.exporter) ? formData.exporter : 'custom'}
            onValueChange={(value) => {
              if (value === 'new') {
                setCreateClientType('exporter')
                setShowCreateClientDialog(true)
              } else if (value !== 'custom') {
                updateFormData('exporter', value)
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select existing or type new" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Type custom name...</SelectItem>
              <SelectItem value="new">+ Create New Exporter</SelectItem>
              {exporters.length > 0 ? (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    Exporters
                  </div>
                  {exporters.map((client) => (
                    <SelectItem key={client.id} value={client.fantasy_name || client.company}>
                      {client.fantasy_name || client.company}
                    </SelectItem>
                  ))}
                </>
              ) : (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  No exporters registered
                </div>
              )}
            </SelectContent>
          </Select>
          {(formData.exporter === '' || !exporters.find(c => (c.fantasy_name || c.company) === formData.exporter)) && (
            <Input
              id="exporter"
              value={formData.exporter}
              onChange={(e) => updateFormData('exporter', e.target.value)}
              placeholder="Enter exporter name"
            />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="buyer">
            Buyer {(formData.sample_type === 'pss' || formData.sample_type === 'ss') && '*'}
          </Label>
          <Select
            value={formData.buyer === '' ? 'custom' : buyers.find(c => (c.fantasy_name || c.company) === formData.buyer) ? formData.buyer : 'custom'}
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
                  {buyers.map((client) => (
                    <SelectItem key={client.id} value={client.fantasy_name || client.company}>
                      {client.fantasy_name || client.company}
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
          {(formData.buyer === '' || !buyers.find(c => (c.fantasy_name || c.company) === formData.buyer)) && (
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

      <div className="space-y-2">
        <Label htmlFor="supplier">Supplier Name</Label>
        <Input
          id="supplier"
          value={formData.supplier}
          onChange={(e) => updateFormData('supplier', e.target.value)}
          placeholder="Farm or cooperative name (optional)"
        />
      </div>

      {/* Show helper message if buyer selected but sample type not PSS/SS yet */}
      {formData.buyer && selectedBuyerClient && formData.sample_type && formData.sample_type !== 'pss' && formData.sample_type !== 'ss' && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            Quality specifications are only required for PSS and SS sample types.
          </p>
        </div>
      )}

      {/* Quality Specification - Only show for PSS/SS with buyer selected AND has a buyer client match */}
      {(formData.sample_type === 'pss' || formData.sample_type === 'ss') && formData.buyer && selectedBuyerClient && (
        <div className="space-y-2">
          <Label htmlFor="quality_spec_id">
            Quality Specification *
          </Label>
          {loadingQualities ? (
            <div className="text-sm text-muted-foreground">Loading buyer qualities...</div>
          ) : buyerQualities.length > 0 ? (
            <Select
              value={formData.quality_spec_id}
              onValueChange={(value) => {
                updateFormData('quality_spec_id', value)
                // Auto-fill quality_name with custom_name from the selected quality
                const selectedQuality = buyerQualities.find(q => q.id === value)
                if (selectedQuality?.custom_name) {
                  updateFormData('quality_name', selectedQuality.custom_name)
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select quality specification" />
              </SelectTrigger>
              <SelectContent>
                {buyerQualities.map((quality) => (
                  <SelectItem key={quality.id} value={quality.id}>
                    {quality.custom_name || quality.quality_code || 'Unnamed Quality'}
                    {quality.origin && ` (${quality.origin})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
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
          )}
          {buyerQualities.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Select the quality specification that will be used to evaluate this sample
            </p>
          )}
        </div>
      )}

      {/* Quality Name - For type samples or when no buyer is selected */}
      {(formData.sample_type === 'type' || !formData.buyer || (!formData.sample_type)) && (
        <div className="space-y-2">
          <Label htmlFor="quality_name">Quality Name</Label>
          <Input
            id="quality_name"
            value={formData.quality_name}
            onChange={(e) => updateFormData('quality_name', e.target.value)}
            placeholder="e.g., Alfenas Dulce, Specialty Blend (optional)"
          />
          <p className="text-xs text-muted-foreground">
            Custom quality name for this sample
          </p>
        </div>
      )}

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

      {/* Client Auto-Detection */}
      <ClientAutoDetection
        metadata={{
          exporter: formData.exporter,
          buyer: formData.buyer,
          roaster: formData.roaster,
          origin: formData.origin,
          supplier: formData.supplier,
          wolthers_contract_nr: formData.wolthers_contract_nr,
          exporter_contract_nr: formData.exporter_contract_nr,
          buyer_contract_nr: formData.buyer_contract_nr,
          roaster_contract_nr: formData.roaster_contract_nr
        }}
        onClientSelect={(clientId) => {
          // Find the selected client and auto-fill buyer field
          const selectedClient = clients.find(c => c.id === clientId)
          if (selectedClient) {
            // Set client_id
            updateFormData('client_id', clientId)
            // Auto-fill buyer field with the selected client
            const clientName = selectedClient.fantasy_name || selectedClient.company || selectedClient.name
            updateFormData('buyer', clientName)
          }
        }}
        autoSelect={true}
      />

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
          clientName={selectedBuyerClient.fantasy_name || selectedBuyerClient.company}
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
            updateFormData('exporter', clientName)
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
