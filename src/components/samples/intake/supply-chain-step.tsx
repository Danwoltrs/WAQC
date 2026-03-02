'use client'

import { useState, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ChevronDown } from 'lucide-react'
import { CreateClientDialog } from './create-client-dialog'
import { StepComponentProps } from './types'

export function SupplyChainStep({
  formData,
  updateFormData,
  clients,
  exporters = [],
  importers = [],
  roasters = [],
  qcClients = [],
  approvedPSSSamples = []
}: StepComponentProps) {
  const [showCreateClientDialog, setShowCreateClientDialog] = useState(false)
  const [createClientType, setCreateClientType] = useState<'exporter' | 'importer' | 'roaster'>('exporter')
  const [showMore, setShowMore] = useState(
    !!(formData.supplier || formData.roaster || formData.end_client)
  )

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

  // Handle PSS selection and auto-fill
  const handlePSSSelection = (pssId: string) => {
    updateFormData('linked_pss_sample_id', pssId)
    if (pssId && pssId !== 'none') {
      const pss = approvedPSSSamples.find((s: any) => s.id === pssId)
      if (pss) {
        // Auto-fill fields from the linked PSS
        if (pss.origin) updateFormData('origin', pss.origin)
        if (pss.micro_origin) updateFormData('micro_origin', pss.micro_origin)
        if (pss.quality_spec_id) {
          updateFormData('quality_spec_id', pss.quality_spec_id)
          if (pss.quality_name) updateFormData('quality_name', pss.quality_name)
        }
        if (pss.ico_number) updateFormData('ico_number', pss.ico_number)
        if (pss.seller_name) updateFormData('seller', pss.seller_name)
        if (pss.exporter_name) updateFormData('shipper', pss.exporter_name)
        if (pss.exporter_sample_number) updateFormData('exporter_sample_number', pss.exporter_sample_number)
        if (pss.wolthers_contract_nr) updateFormData('wolthers_contract_nr', pss.wolthers_contract_nr)
        if (pss.exporter_contract_nr) updateFormData('exporter_contract_nr', pss.exporter_contract_nr)
        if (pss.processing_method) updateFormData('processing_method', pss.processing_method)
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* PSS Link for SS samples */}
      {formData.sample_type === 'ss' && (
        <div className="space-y-4 bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="space-y-2">
            <Label>Link to Approved Pre-Shipment Sample</Label>
            <Select
              value={formData.linked_pss_sample_id}
              onValueChange={handlePSSSelection}
            >
              <SelectTrigger className="w-[360px]">
                <SelectValue placeholder="Select approved PSS sample..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No linked sample</SelectItem>
                {approvedPSSSamples.length > 0 ? (
                  approvedPSSSamples.map((sample: any) => (
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
            {formData.linked_pss_sample_id && formData.linked_pss_sample_id !== 'none' && (
              <p className="text-xs text-muted-foreground">
                Fields auto-filled from linked PSS. You can override any values below.
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">ICO Number</Label>
              <Input
                value={formData.ico_number}
                onChange={(e) => updateFormData('ico_number', e.target.value)}
                placeholder="e.g., 123456789"
                className="w-[180px] h-9"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Container Number</Label>
              <Input
                value={formData.container_nr}
                onChange={(e) => updateFormData('container_nr', e.target.value)}
                placeholder="e.g., MSKU1234567"
                className="w-[180px] h-9"
              />
            </div>
          </div>
        </div>
      )}

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

      {/* Importer Row - with QC Client side-by-side when unchecked */}
      <div className={`grid ${formData.importer_is_qc_client ? 'grid-cols-[180px_160px]' : 'grid-cols-[180px_160px_180px_160px]'} gap-3 items-end`}>
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

        {/* QC Client side-by-side (only when importer != QC Client) */}
        {!formData.importer_is_qc_client && (
          <>
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
          </>
        )}
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* Collapsible: Supplier, Roaster & End Client */}
      <div>
        <button
          type="button"
          onClick={() => setShowMore(!showMore)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${showMore ? '' : '-rotate-90'}`} />
          Supplier, Roaster & End Client
          {(formData.supplier || formData.roaster || formData.end_client) && (
            <span className="ml-1 text-foreground font-medium">
              {[formData.supplier, formData.roaster, formData.end_client].filter(Boolean).join(', ')}
            </span>
          )}
        </button>

        {showMore && (
          <div className="space-y-4">
            {/* Supplier Row */}
            <div className="grid grid-cols-[180px_160px] gap-3 items-end">
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
            </div>

            {/* Roaster + End Client side-by-side */}
            <div className="grid grid-cols-[180px_160px_180px_160px] gap-3 items-end">
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
            </div>
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
