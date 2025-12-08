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

  const roasters = useMemo(() =>
    clients.filter(c =>
      c.client_types?.some(type =>
        type === 'roaster' || type === 'roaster_final_buyer'
      )
    ), [clients]
  )

  return (
    <div className="space-y-5">
      {/* Header Row with column titles */}
      <div className="grid grid-cols-[140px_180px_160px_140px] gap-3 items-end">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Seller *</Label>
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
              className="h-3.5 w-3.5"
            />
            <Label htmlFor="same_seller_shipper" className="text-[10px] cursor-pointer text-muted-foreground">
              =Shipper
            </Label>
          </div>
        </div>
        <div>
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
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select seller" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Type custom...</SelectItem>
              <SelectItem value="new">+ Create New</SelectItem>
              {exporters.length > 0 && exporters.map((exporter: any) => (
                <SelectItem key={exporter.id} value={exporter.name}>{exporter.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(formData.seller === '' || !exporters.find((exp: any) => exp.name === formData.seller)) && (
            <Input
              value={formData.seller}
              onChange={(e) => updateFormData('seller', e.target.value)}
              placeholder="Seller name"
              className="h-9 mt-1"
            />
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Contract Ref.</Label>
          <Input
            value={formData.seller_contract_nr}
            onChange={(e) => updateFormData('seller_contract_nr', e.target.value)}
            placeholder="Contract ref."
            className="h-9"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Sample Ref.</Label>
          <Input
            value={formData.exporter_sample_number}
            onChange={(e) => updateFormData('exporter_sample_number', e.target.value)}
            placeholder="Sample ref."
            className="h-9"
          />
        </div>
      </div>

      {/* Shipper Row (only if not same as seller) */}
      {!formData.same_seller_shipper && (
        <div className="grid grid-cols-[140px_180px_160px_140px] gap-3 items-center">
          <Label className="text-sm font-medium">Shipper *</Label>
          <div>
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
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select shipper" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Type custom...</SelectItem>
                <SelectItem value="new">+ Create New</SelectItem>
                {exporters.length > 0 && exporters.map((exporter: any) => (
                  <SelectItem key={exporter.id} value={exporter.name}>{exporter.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(formData.shipper === '' || !exporters.find((exp: any) => exp.name === formData.shipper)) && (
              <Input
                value={formData.shipper}
                onChange={(e) => updateFormData('shipper', e.target.value)}
                placeholder="Shipper name"
                className="h-9 mt-1"
              />
            )}
          </div>
          <Input
            value={formData.shipper_contract_nr}
            onChange={(e) => updateFormData('shipper_contract_nr', e.target.value)}
            placeholder="Contract ref."
            className="h-9"
          />
          <div></div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t" />

      {/* Importer Row */}
      <div className="grid grid-cols-[140px_180px_160px_140px] gap-3 items-center">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Importer</Label>
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
              className="h-3.5 w-3.5"
            />
            <Label htmlFor="importer_is_qc_client" className="text-[10px] cursor-pointer text-muted-foreground">
              =QC Client
            </Label>
          </div>
        </div>
        <div>
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
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select importer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Type custom...</SelectItem>
              <SelectItem value="new">+ Create New</SelectItem>
              {mergedImporterOptions.length > 0 && mergedImporterOptions.map((option) => (
                <SelectItem key={option.id} value={option.name}>{option.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(formData.importer === '' || !mergedImporterOptions.find(opt => opt.name === formData.importer)) && (
            <Input
              value={formData.importer}
              onChange={(e) => updateFormData('importer', e.target.value)}
              placeholder="Importer name"
              className="h-9 mt-1"
            />
          )}
        </div>
        <Input
          value={formData.importer_contract_nr}
          onChange={(e) => updateFormData('importer_contract_nr', e.target.value)}
          placeholder="Contract ref."
          className="h-9"
        />
        <div></div>
      </div>

      {/* QC Client Row (only if not same as importer) */}
      {!formData.importer_is_qc_client && (
        <div className="grid grid-cols-[140px_180px_160px_140px] gap-3 items-center">
          <Label className="text-sm font-medium">QC Client</Label>
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
              {qcClients.map((client) => (
                <SelectItem key={client.id} value={client.fantasy_name || client.company}>
                  {client.fantasy_name || client.company}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={formData.qc_client_contract_nr}
            onChange={(e) => updateFormData('qc_client_contract_nr', e.target.value)}
            placeholder="Contract ref."
            className="h-9"
          />
          <div></div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t" />

      {/* Supplier Row */}
      <div className="grid grid-cols-[140px_180px_160px_140px] gap-3 items-center">
        <Label className="text-sm text-muted-foreground">Supplier</Label>
        <Input
          value={formData.supplier}
          onChange={(e) => updateFormData('supplier', e.target.value)}
          placeholder="Farm / cooperative"
          className="h-9"
        />
        <Input
          value={formData.supplier_contract_nr}
          onChange={(e) => updateFormData('supplier_contract_nr', e.target.value)}
          placeholder="Contract ref."
          className="h-9"
        />
        <div></div>
      </div>

      {/* Roaster Row */}
      <div className="grid grid-cols-[140px_180px_160px_140px] gap-3 items-center">
        <Label className="text-sm text-muted-foreground">Roaster</Label>
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
            <SelectItem value="none">No roaster</SelectItem>
            <SelectItem value="new">+ Create New</SelectItem>
            {roasters.length > 0 && roasters.map((client) => (
              <SelectItem key={client.id} value={client.fantasy_name || client.company}>
                {client.fantasy_name || client.company}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={formData.roaster_contract_nr}
          onChange={(e) => updateFormData('roaster_contract_nr', e.target.value)}
          placeholder="Contract ref."
          className="h-9"
        />
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
