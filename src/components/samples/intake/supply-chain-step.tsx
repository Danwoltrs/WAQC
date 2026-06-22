'use client'

import { useState, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Checkbox } from '@/components/ui/checkbox'
import { ChevronDown } from 'lucide-react'
import { AddClientModal, AddClientRole } from '@/components/clients/add-client-modal'
import { StepComponentProps } from './types'
import { EntityResolutionNotice } from './entity-resolution-notice'

export function SupplyChainStep({
  formData,
  updateFormData,
  clients,
  exporters = [],
  importers = [],
  roasters = [],
  qcClients = [],
  approvedPSSSamples = [],
  onEntityCreated
}: StepComponentProps) {
  const [showCreateClientDialog, setShowCreateClientDialog] = useState(false)
  const [createClientRole, setCreateClientRole] = useState<AddClientRole>('exporter')
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
        name: e.name,
        fantasy_name: e.fantasy_name ?? null
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
        fantasy_name: imp.fantasy_name ?? null,
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
        fantasy_name: c.fantasy_name ?? null,
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
        name: r.name,
        fantasy_name: r.fantasy_name ?? null
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
          <SearchableSelect
            options={sellerOptions.map(o => ({ value: o.name, label: o.fantasy_name || o.name }))}
            value={formData.seller || ''}
            onValueChange={(value) => updateFormData('seller', value)}
            placeholder="Select seller"
            searchPlaceholder="Search sellers..."
            className="h-9"
            allowCreate
            createLabel="+ New Seller"
            onCreateNew={() => {
              setCreateClientRole('exporter')
              setShowCreateClientDialog(true)
            }}
          />
          {formData.contract_resolution && formData.selected_contract && (
            <>
              {formData.contract_resolution.seller_match_count === 0 && (
                <EntityResolutionNotice
                  message={`No exporter named "${formData.seller}" found in WAQC. Select an existing exporter above or create one.`}
                />
              )}
              {formData.contract_resolution.multiple_seller_matches && (
                <EntityResolutionNotice
                  message={`${formData.contract_resolution.seller_match_count} exporters named "${formData.seller}" exist — verify the selection above is correct.`}
                />
              )}
            </>
          )}
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
            <SearchableSelect
              options={sellerOptions.map(o => ({ value: o.name, label: o.fantasy_name || o.name }))}
              value={formData.shipper || ''}
              onValueChange={(value) => updateFormData('shipper', value)}
              placeholder="Select shipper"
              searchPlaceholder="Search shippers..."
              className="h-9"
              allowCreate
              createLabel="+ New Shipper"
              onCreateNew={() => {
                setCreateClientRole('exporter')
                setShowCreateClientDialog(true)
              }}
            />
            {formData.contract_resolution && formData.selected_contract && (
              <>
                {formData.contract_resolution.shipper_match_count === 0 && (
                  <EntityResolutionNotice
                    message={`No exporter named "${formData.shipper}" found in WAQC. Select an existing exporter above or create one.`}
                  />
                )}
                {formData.contract_resolution.multiple_shipper_matches && (
                  <EntityResolutionNotice
                    message={`${formData.contract_resolution.shipper_match_count} exporters named "${formData.shipper}" exist — verify the selection above is correct.`}
                  />
                )}
              </>
            )}
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
          <SearchableSelect
            options={mergedImporterOptions.map((o: any) => ({ value: o.name, label: o.fantasy_name || o.name }))}
            value={formData.importer || ''}
            onValueChange={(value) => updateFormData('importer', value)}
            placeholder="Select importer"
            searchPlaceholder="Search importers..."
            className="h-9"
            allowCreate
            createLabel="+ New Importer"
            onCreateNew={() => {
              setCreateClientRole('importer')
              setShowCreateClientDialog(true)
            }}
          />
          {formData.contract_resolution && formData.selected_contract && !formData.contract_resolution.importer_resolved && (
            <EntityResolutionNotice
              message={`No WAQC client or importer is linked to "${formData.importer}". Select an existing one above or create new.`}
            />
          )}
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
              <SearchableSelect
                options={qcClientOptions.map(c => ({ value: c.fantasy_name!, label: c.fantasy_name! }))}
                value={formData.qc_client || ''}
                onValueChange={(value) => updateFormData('qc_client', value)}
                placeholder="Select QC client"
                searchPlaceholder="Search QC clients..."
                className="h-9"
                allowCreate
                createLabel="+ New QC Client"
                onCreateNew={() => {
                  setCreateClientRole('qc_client')
                  setShowCreateClientDialog(true)
                }}
              />
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
                <SearchableSelect
                  options={roasterOptions.map(r => ({ value: r.name, label: r.fantasy_name || r.name }))}
                  value={formData.roaster || ''}
                  onValueChange={(value) => updateFormData('roaster', value)}
                  placeholder="Select roaster"
                  searchPlaceholder="Search roasters..."
                  className="h-9"
                  allowCreate
                  createLabel="+ New Roaster"
                  onCreateNew={() => {
                    setCreateClientRole('roaster')
                    setShowCreateClientDialog(true)
                  }}
                />
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
                <SearchableSelect
                  options={qcClients.map(c => ({ value: c.fantasy_name || c.company, label: c.fantasy_name || c.company }))}
                  value={formData.end_client || ''}
                  onValueChange={(value) => updateFormData('end_client', value)}
                  placeholder="Select end client"
                  searchPlaceholder="Search end clients..."
                  className="h-9"
                  allowCreate
                  createLabel="+ New End Client"
                  onCreateNew={() => {
                    setCreateClientRole('end_client')
                    setShowCreateClientDialog(true)
                  }}
                />
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
          } else if (createClientRole === 'end_client') {
            updateFormData('end_client', clientName)
          } else if (createClientRole === 'qc_client') {
            updateFormData('qc_client', clientName)
          }
          // Trigger entity list reload so the new entity appears in the dropdown
          onEntityCreated?.(createClientRole as any)
        }}
      />
    </div>
  )
}
