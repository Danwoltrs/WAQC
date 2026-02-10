'use client'

import { useState, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { CreateClientDialog } from './create-client-dialog'
import { SubContractCard } from './sub-contract-card'
import { StepComponentProps, SubContractFormData } from './types'

export function SupplyChainStep({
  formData,
  updateFormData,
  clients,
  exporters = [],
  importers = [],
  roasters = [],
  qcClients = []
}: StepComponentProps) {
  const [showCreateClientDialog, setShowCreateClientDialog] = useState(false)
  const [createClientType, setCreateClientType] = useState<'exporter' | 'importer' | 'roaster'>('exporter')

  // Sellers/Shippers: from exporters table (deduplicated by name)
  const sellerOptions = useMemo(() => {
    const seen = new Set<string>()
    return exporters
      .filter(e => {
        if (!e.name || seen.has(e.name)) return false
        seen.add(e.name)
        return true
      })
      .map(e => ({
        id: e.id,
        name: e.name
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [exporters])

  // Importers: deduplicated by name
  const importerOptions = useMemo(() => {
    const seen = new Set<string>()
    return importers
      .filter((imp: any) => {
        if (!imp.name || seen.has(imp.name)) return false
        seen.add(imp.name)
        return true
      })
      .map((imp: any) => ({
        id: imp.id,
        name: imp.name,
        type: 'importer' as const,
        clientId: imp.client_id
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [importers])

  // Merged importer options: when importer_is_qc_client is checked, show QC clients + linked importers
  const mergedImporterOptions = useMemo(() => {
    if (formData.importer_is_qc_client) {
      const clientOptions = qcClients.map(c => ({
        id: c.id,
        name: c.fantasy_name || c.company,
        type: 'client' as const,
        clientId: c.id
      }))
      const linkedImporterOptions = importerOptions
        .filter(imp => imp.clientId)
      // Deduplicate by name (QC clients first)
      const seen = new Set<string>()
      return [...clientOptions, ...linkedImporterOptions]
        .filter(opt => {
          const key = opt.name.toLowerCase()
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    }
    return importerOptions
  }, [formData.importer_is_qc_client, qcClients, importerOptions])

  // QC Client options: exclude the selected importer if they're also a QC client
  const qcClientOptions = useMemo(() => {
    return qcClients
      .filter(c => c.fantasy_name && c.fantasy_name !== formData.importer)
      .sort((a, b) => (a.fantasy_name || '').localeCompare(b.fantasy_name || ''))
  }, [qcClients, formData.importer])

  // Roaster options from roasters table (deduplicated by name)
  const roasterOptions = useMemo(() => {
    const seen = new Set<string>()
    return roasters
      .filter(r => {
        if (!r.name || seen.has(r.name)) return false
        seen.add(r.name)
        return true
      })
      .map(r => ({
        id: r.id,
        name: r.name
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [roasters])

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
              {mergedImporterOptions.map((option) => (
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
                {qcClientOptions.map((client) => (
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
              {roasterOptions.map((roaster) => (
                <SelectItem key={roaster.id} value={roaster.name}>
                  {roaster.name}
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

      {/* End Client Row */}
      <div className="grid grid-cols-[180px_160px_140px] gap-3 items-end">
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">End Client</Label>
          <Select
            value={formData.end_client || 'none'}
            onValueChange={(value) => {
              if (value === 'none') {
                updateFormData('end_client', '')
              } else {
                updateFormData('end_client', value)
              }
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select end client" />
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
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block invisible">Contract Ref.</Label>
          <Input
            value={formData.end_client_contract_nr}
            onChange={(e) => updateFormData('end_client_contract_nr', e.target.value)}
            placeholder="Contract ref."
            className="h-9"
          />
        </div>
        <div></div>
      </div>

      {/* Sub-Contracts Section */}
      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-xs font-medium text-muted-foreground">Sub-Contracts</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => {
              const newContract: SubContractFormData = {
                importer: '',
                importer_is_qc_client: true,
                roaster: '',
                end_client: '',
                qc_client: '',
                wolthers_contract_nr: '',
                buyer_contract_nr: '',
                roaster_contract_nr: '',
                qc_client_contract_nr: '',
                end_client_contract_nr: '',
                supplier_contract_nr: '',
                ico_number: '',
                container_nr: '',
              }
              updateFormData('contracts', [...formData.contracts, newContract])
            }}
          >
            <Plus className="h-3 w-3" />
            Contract
          </Button>
        </div>

        {formData.contracts.length > 0 && (
          <div className="space-y-3">
            {formData.contracts.map((contract, idx) => (
              <SubContractCard
                key={idx}
                index={idx}
                data={contract}
                onChange={(i, field, value) => {
                  const updated = [...formData.contracts]
                  updated[i] = { ...updated[i], [field]: value }
                  updateFormData('contracts', updated)
                }}
                onRemove={(i) => {
                  const updated = formData.contracts.filter((_, j) => j !== i)
                  updateFormData('contracts', updated)
                }}
                importers={importers}
                roasters={roasters}
                qcClients={qcClients}
                mergedImporterOptions={mergedImporterOptions}
              />
            ))}
          </div>
        )}
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
