'use client'

import { useState, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { CreateClientDialog } from './create-client-dialog'
import { StepComponentProps } from './types'

// Seller/Shipper entity types - clients with these types can be sellers
const SELLER_CLIENT_TYPES = ['producer', 'producer_exporter', 'cooperative', 'exporter']

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

  // Sellers: clients with producer, producer_exporter, cooperative, or exporter type
  const sellerOptions = useMemo(() => {
    return clients
      .filter(c =>
        c.fantasy_name &&
        c.client_types?.some(type => SELLER_CLIENT_TYPES.includes(type))
      )
      .map(c => ({
        id: c.id,
        name: c.fantasy_name!
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [clients])

  // Importers: QC clients with fantasy_name only
  const mergedImporterOptions = useMemo(() => {
    if (formData.importer_is_qc_client) {
      // Only QC clients with fantasy_name
      return qcClients
        .filter(c => c.fantasy_name)
        .map(c => ({
          id: c.id,
          name: c.fantasy_name!,
          type: 'client' as const,
          clientId: c.id
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    } else {
      return importers.map((imp: any) => ({
        id: imp.id,
        name: imp.name,
        type: 'importer' as const,
        clientId: imp.client_id
      }))
    }
  }, [formData.importer_is_qc_client, qcClients, importers])

  const roasters = useMemo(() =>
    clients.filter(c =>
      c.client_types?.some(type =>
        type === 'roaster' || type === 'roaster_final_buyer'
      )
    ), [clients]
  )

  return (
    <div className="space-y-4">
      {/* Seller Row */}
      <div className="grid grid-cols-[180px_160px_140px_160px] gap-3 items-end">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Label className="text-xs text-muted-foreground">Seller *</Label>
            <div className="flex items-center gap-1">
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
                className="h-3 w-3"
              />
              <Label htmlFor="same_seller_shipper" className="text-[10px] cursor-pointer text-muted-foreground">
                =Shipper
              </Label>
            </div>
          </div>
          <Select
            value={formData.seller || 'none'}
            onValueChange={(value) => {
              if (value === 'new') {
                setCreateClientType('exporter')
                setShowCreateClientDialog(true)
              } else if (value === 'none') {
                updateFormData('seller', '')
              } else {
                updateFormData('seller', value)
              }
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select seller" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select...</SelectItem>
              <SelectItem value="new">+ Create New</SelectItem>
              {sellerOptions.map((option) => (
                <SelectItem key={option.id} value={option.name}>{option.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Contract Ref.</Label>
          <Input
            value={formData.seller_contract_nr}
            onChange={(e) => updateFormData('seller_contract_nr', e.target.value)}
            placeholder="Contract ref."
            className="h-9"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Sample Ref.</Label>
          <Input
            value={formData.exporter_sample_number}
            onChange={(e) => updateFormData('exporter_sample_number', e.target.value)}
            placeholder="Sample ref."
            className="h-9"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Wolthers Contract</Label>
          <Input
            value={formData.wolthers_contract_nr}
            onChange={(e) => updateFormData('wolthers_contract_nr', e.target.value)}
            placeholder="Wolthers ref."
            className="h-9"
          />
        </div>
      </div>

      {/* Shipper Row (only if not same as seller) */}
      {!formData.same_seller_shipper && (
        <div className="grid grid-cols-[180px_160px_140px] gap-3 items-end">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Shipper *</Label>
            <Select
              value={formData.shipper || 'none'}
              onValueChange={(value) => {
                if (value === 'new') {
                  setCreateClientType('exporter')
                  setShowCreateClientDialog(true)
                } else if (value === 'none') {
                  updateFormData('shipper', '')
                } else {
                  updateFormData('shipper', value)
                }
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select shipper" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select...</SelectItem>
                <SelectItem value="new">+ Create New</SelectItem>
                {sellerOptions.map((option) => (
                  <SelectItem key={option.id} value={option.name}>{option.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block invisible">Contract Ref.</Label>
            <Input
              value={formData.shipper_contract_nr}
              onChange={(e) => updateFormData('shipper_contract_nr', e.target.value)}
              placeholder="Contract ref."
              className="h-9"
            />
          </div>
          <div></div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t" />

      {/* Importer Row */}
      <div className="grid grid-cols-[180px_160px_140px] gap-3 items-end">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Label className="text-xs text-muted-foreground">Importer</Label>
            <div className="flex items-center gap-1">
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
                className="h-3 w-3"
              />
              <Label htmlFor="importer_is_qc_client" className="text-[10px] cursor-pointer text-muted-foreground">
                =QC Client
              </Label>
            </div>
          </div>
          <Select
            value={formData.importer || 'none'}
            onValueChange={(value) => {
              if (value === 'new') {
                setCreateClientType('importer')
                setShowCreateClientDialog(true)
              } else if (value === 'none') {
                updateFormData('importer', '')
              } else {
                updateFormData('importer', value)
              }
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select importer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select...</SelectItem>
              <SelectItem value="new">+ Create New</SelectItem>
              {mergedImporterOptions.length > 0 && mergedImporterOptions.map((option) => (
                <SelectItem key={option.id} value={option.name}>{option.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block invisible">Contract Ref.</Label>
          <Input
            value={formData.importer_contract_nr}
            onChange={(e) => updateFormData('importer_contract_nr', e.target.value)}
            placeholder="Contract ref."
            className="h-9"
          />
        </div>
        <div></div>
      </div>

      {/* QC Client Row (only if not same as importer) */}
      {!formData.importer_is_qc_client && (
        <div className="grid grid-cols-[180px_160px_140px] gap-3 items-end">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">QC Client</Label>
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
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select QC client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select...</SelectItem>
                {qcClients.filter(c => c.fantasy_name).map((client) => (
                  <SelectItem key={client.id} value={client.fantasy_name!}>
                    {client.fantasy_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block invisible">Contract Ref.</Label>
            <Input
              value={formData.qc_client_contract_nr}
              onChange={(e) => updateFormData('qc_client_contract_nr', e.target.value)}
              placeholder="Contract ref."
              className="h-9"
            />
          </div>
          <div></div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t" />

      {/* Supplier Row */}
      <div className="grid grid-cols-[180px_160px_140px] gap-3 items-end">
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Supplier</Label>
          <Input
            value={formData.supplier}
            onChange={(e) => updateFormData('supplier', e.target.value)}
            placeholder="Farm / cooperative"
            className="h-9"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block invisible">Contract Ref.</Label>
          <Input
            value={formData.supplier_contract_nr}
            onChange={(e) => updateFormData('supplier_contract_nr', e.target.value)}
            placeholder="Contract ref."
            className="h-9"
          />
        </div>
        <div></div>
      </div>

      {/* Roaster Row */}
      <div className="grid grid-cols-[180px_160px_140px] gap-3 items-end">
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Roaster</Label>
          <Select
            value={formData.roaster || 'none'}
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
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select roaster" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select...</SelectItem>
              <SelectItem value="new">+ Create New</SelectItem>
              {roasters.filter(c => c.fantasy_name).map((client) => (
                <SelectItem key={client.id} value={client.fantasy_name!}>
                  {client.fantasy_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block invisible">Contract Ref.</Label>
          <Input
            value={formData.roaster_contract_nr}
            onChange={(e) => updateFormData('roaster_contract_nr', e.target.value)}
            placeholder="Contract ref."
            className="h-9"
          />
        </div>
        <div></div>
      </div>

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
