'use client'

import { useState, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { CreateClientDialog } from './create-client-dialog'
import { StepComponentProps } from './types'

export function SupplyChainStep({
  formData,
  updateFormData,
  clients,
  exporters = [],
  importers = [],
  qcClients = []
}: StepComponentProps) {
  const [showCreateClientDialog, setShowCreateClientDialog] = useState(false)
  const [createClientType, setCreateClientType] = useState<'exporter' | 'importer' | 'roaster'>('exporter')

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

  // Roasters from clients table
  const roasters = useMemo(() =>
    clients.filter(c =>
      c.client_types?.some(type =>
        type === 'roaster' || type === 'roaster_final_buyer'
      )
    ), [clients]
  )

  return (
    <div className="space-y-6">
      {/* Row 1: Seller with checkbox and contract ref */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Seller *</Label>
          <div className="flex items-center gap-1.5 ml-4">
            <Checkbox
              id="same_seller_shipper"
              checked={formData.same_seller_shipper}
              onCheckedChange={(checked) => {
                updateFormData('same_seller_shipper', checked as boolean)
                if (checked) {
                  updateFormData('shipper', '')
                  updateFormData('shipper_contract_nr', '')
                }
              }}
            />
            <Label htmlFor="same_seller_shipper" className="text-xs cursor-pointer text-muted-foreground">
              Same as shipper
            </Label>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
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
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select seller" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Type custom name...</SelectItem>
                <SelectItem value="new">+ Create New Seller</SelectItem>
                {exporters.length > 0 && (
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
                )}
              </SelectContent>
            </Select>
            {(formData.seller === '' || !exporters.find((exp: any) => exp.name === formData.seller)) && (
              <Input
                value={formData.seller}
                onChange={(e) => updateFormData('seller', e.target.value)}
                placeholder="Enter seller name"
                className="w-[180px]"
              />
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Contract Ref. Nr.</Label>
            <Input
              value={formData.seller_contract_nr}
              onChange={(e) => updateFormData('seller_contract_nr', e.target.value)}
              placeholder="Seller contract ref."
              className="w-[180px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Sample Ref. Nr.</Label>
            <Input
              value={formData.exporter_sample_number}
              onChange={(e) => updateFormData('exporter_sample_number', e.target.value)}
              placeholder="Seller sample ref."
              className="w-[180px]"
            />
          </div>
        </div>
      </div>

      {/* Row 2: Shipper (only if not same as seller) */}
      {!formData.same_seller_shipper && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Shipper *</Label>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
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
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select shipper" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Type custom name...</SelectItem>
                  <SelectItem value="new">+ Create New Shipper</SelectItem>
                  {exporters.length > 0 && (
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
                  )}
                </SelectContent>
              </Select>
              {(formData.shipper === '' || !exporters.find((exp: any) => exp.name === formData.shipper)) && (
                <Input
                  value={formData.shipper}
                  onChange={(e) => updateFormData('shipper', e.target.value)}
                  placeholder="Enter shipper name"
                  className="w-[180px]"
                />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Contract Ref. Nr.</Label>
              <Input
                value={formData.shipper_contract_nr}
                onChange={(e) => updateFormData('shipper_contract_nr', e.target.value)}
                placeholder="Shipper contract ref."
                className="w-[180px]"
              />
            </div>
            <div></div>
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t pt-4" />

      {/* Row 3: Importer with QC Client checkbox and contract ref */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Importer</Label>
          <div className="flex items-center gap-1.5 ml-4">
            <Checkbox
              id="importer_is_qc_client"
              checked={formData.importer_is_qc_client}
              onCheckedChange={(checked) => {
                updateFormData('importer_is_qc_client', checked as boolean)
                if (checked) {
                  updateFormData('qc_client', '')
                  updateFormData('qc_client_contract_nr', '')
                }
              }}
            />
            <Label htmlFor="importer_is_qc_client" className="text-xs cursor-pointer text-muted-foreground">
              QC Client
            </Label>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Select
              value={formData.importer === '' ? 'custom' : mergedImporterOptions.find(opt => opt.name === formData.importer) ? formData.importer : 'custom'}
              onValueChange={(value) => {
                if (value === 'new') {
                  setCreateClientType('importer')
                  setShowCreateClientDialog(true)
                } else if (value !== 'custom') {
                  updateFormData('importer', value)
                }
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select importer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Type custom name...</SelectItem>
                <SelectItem value="new">+ Create New Importer</SelectItem>
                {mergedImporterOptions.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      {formData.importer_is_qc_client ? 'QC Clients & Importers' : 'Importers'}
                    </div>
                    {mergedImporterOptions.map((option) => (
                      <SelectItem key={option.id} value={option.name}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            {(formData.importer === '' || !mergedImporterOptions.find(opt => opt.name === formData.importer)) && (
              <Input
                value={formData.importer}
                onChange={(e) => updateFormData('importer', e.target.value)}
                placeholder="Enter importer name"
                className="w-[180px]"
              />
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Contract Ref. Nr.</Label>
            <Input
              value={formData.importer_contract_nr}
              onChange={(e) => updateFormData('importer_contract_nr', e.target.value)}
              placeholder="Importer contract ref."
              className="w-[180px]"
            />
          </div>
          <div></div>
        </div>
      </div>

      {/* Row 4: QC Client (only if not same as importer) */}
      {!formData.importer_is_qc_client && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">QC Client</Label>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Select
                value={formData.qc_client || 'none'}
                onValueChange={(value) => {
                  if (value === 'none') {
                    updateFormData('qc_client', '')
                  } else {
                    updateFormData('qc_client', value)
                  }
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select QC client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select QC client...</SelectItem>
                  {qcClients.map((client) => (
                    <SelectItem key={client.id} value={client.fantasy_name || client.company}>
                      {client.fantasy_name || client.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Contract Ref. Nr.</Label>
              <Input
                value={formData.qc_client_contract_nr}
                onChange={(e) => updateFormData('qc_client_contract_nr', e.target.value)}
                placeholder="QC client contract ref."
                className="w-[180px]"
              />
            </div>
            <div></div>
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t pt-4" />

      {/* Row 5: Supplier Name (optional) */}
      <div className="space-y-3">
        <Label className="text-sm font-medium text-muted-foreground">Supplier Name (Optional)</Label>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Input
              value={formData.supplier}
              onChange={(e) => updateFormData('supplier', e.target.value)}
              placeholder="Farm or cooperative"
              className="w-[180px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Contract Ref. Nr.</Label>
            <Input
              value={formData.supplier_contract_nr}
              onChange={(e) => updateFormData('supplier_contract_nr', e.target.value)}
              placeholder="Supplier contract ref."
              className="w-[180px]"
            />
          </div>
          <div></div>
        </div>
      </div>

      {/* Row 6: Roaster (optional) */}
      <div className="space-y-3">
        <Label className="text-sm font-medium text-muted-foreground">Roaster (Optional)</Label>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Select
              value={formData.roaster || ''}
              onValueChange={(value) => {
                if (value === 'new') {
                  setCreateClientType('roaster')
                  setShowCreateClientDialog(true)
                } else if (value === 'none') {
                  updateFormData('roaster', '')
                } else {
                  updateFormData('roaster', value)
                }
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select roaster" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No roaster</SelectItem>
                <SelectItem value="new">+ Create New Roaster</SelectItem>
                {roasters.length > 0 && (
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
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Contract Ref. Nr.</Label>
            <Input
              value={formData.roaster_contract_nr}
              onChange={(e) => updateFormData('roaster_contract_nr', e.target.value)}
              placeholder="Roaster contract ref."
              className="w-[180px]"
            />
          </div>
          <div></div>
        </div>
      </div>

      {/* Create Client Dialog */}
      <CreateClientDialog
        open={showCreateClientDialog}
        onOpenChange={setShowCreateClientDialog}
        clientType={createClientType}
        onSuccess={(clientName) => {
          if (createClientType === 'exporter') {
            updateFormData('seller', clientName)
          } else if (createClientType === 'importer') {
            updateFormData('importer', clientName)
          } else if (createClientType === 'roaster') {
            updateFormData('roaster', clientName)
          }
        }}
      />
    </div>
  )
}
