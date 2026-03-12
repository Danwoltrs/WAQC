'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Building2, Edit, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddClientModal, AddClientRole } from '@/components/clients/add-client-modal'

interface Entity {
  id: string
  name: string
  country?: string | null
}

interface ClientEntity {
  id: string
  name: string
  company?: string
  fantasy_name?: string | null
  country?: string | null
  is_qc_client?: boolean
}

export interface SupplyChainSampleData {
  seller_id?: string | null
  exporter_id?: string | null
  importer_id?: string | null
  roaster_id?: string | null
  end_client_id?: string | null
  client_id?: string | null
  seller_name?: string | null
  exporter_name?: string | null
  importer_name?: string | null
  roaster_name?: string | null
  end_client_name?: string | null
  qc_client_name?: string | null
  importer_is_qc_client?: boolean
  same_seller_shipper?: boolean
  wolthers_contract_nr?: string | null
  seller_contract_nr?: string | null
  shipper_contract_nr?: string | null
  exporter_contract_nr?: string | null
  buyer_contract_nr?: string | null
  roaster_contract_nr?: string | null
  qc_client_contract_nr?: string | null
  end_client_contract_nr?: string | null
  supplier_contract_nr?: string | null
}

interface SupplyChainEditTableProps {
  sample: SupplyChainSampleData
  isEditMode: boolean
  formData: Record<string, any>
  onFormChange: (field: string, value: any) => void
  onEditClick?: () => void
}

const KEEP_CURRENT = '__keep_current__'

export function SupplyChainEditTable({ sample, isEditMode, formData, onFormChange, onEditClick }: SupplyChainEditTableProps) {
  const [exporters, setExporters] = useState<Entity[]>([])
  const [importers, setImporters] = useState<Entity[]>([])
  const [roasters, setRoasters] = useState<Entity[]>([])
  const [clients, setClients] = useState<ClientEntity[]>([])
  const [qcClients, setQcClients] = useState<ClientEntity[]>([])
  const [loadingEntities, setLoadingEntities] = useState(false)

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createDialogType, setCreateDialogType] = useState<AddClientRole>('exporter')
  const [pendingEntityField, setPendingEntityField] = useState<string>('')

  // Load entities when entering edit mode
  useEffect(() => {
    if (isEditMode) {
      loadEntities()
    }
  }, [isEditMode])

  const loadEntities = async () => {
    setLoadingEntities(true)
    try {
      const [exportersRes, importersRes, roastersRes, clientsRes, qcClientsRes,
             exporterClientsRes, importerClientsRes, roasterClientsRes, endClientClientsRes] = await Promise.all([
        fetch('/api/exporters').then(r => r.json()),
        fetch('/api/importers').then(r => r.json()),
        fetch('/api/roasters').then(r => r.json()),
        fetch('/api/clients?limit=500').then(r => r.json()),
        fetch('/api/clients?is_qc_client=true&limit=500').then(r => r.json()),
        // Also fetch clients by role for merging into party dropdowns
        fetch('/api/clients?client_types=exporter,producer_exporter&is_active=true&limit=500').then(r => r.json()),
        fetch('/api/clients?client_types=importer_buyer&is_active=true&limit=500').then(r => r.json()),
        fetch('/api/clients?client_types=roaster,roaster_final_buyer&is_active=true&limit=500').then(r => r.json()),
        fetch('/api/clients?client_types=end_client&is_active=true&limit=500').then(r => r.json()),
      ])

      // Merge exporters table + clients with exporter role
      const mergedExporters = [
        ...(exportersRes.exporters || []),
        ...(exporterClientsRes.clients || []).map((c: any) => ({ id: c.id, name: c.fantasy_name || c.company, country: c.country })),
      ]
      setExporters(dedup(mergedExporters))

      // Merge importers table + clients with importer_buyer role
      const mergedImporters = [
        ...(importersRes.importers || []),
        ...(importerClientsRes.clients || []).map((c: any) => ({ id: c.id, name: c.fantasy_name || c.company, country: c.country })),
      ]
      setImporters(dedup(mergedImporters))

      // Merge roasters table + clients with roaster role
      const mergedRoasters = [
        ...(roastersRes.roasters || []),
        ...(roasterClientsRes.clients || []).map((c: any) => ({ id: c.id, name: c.fantasy_name || c.company, country: c.country })),
      ]
      setRoasters(dedup(mergedRoasters))

      // End clients: merge all clients + clients with end_client role
      const allClients = (clientsRes.clients || []).map((c: any) => ({
        id: c.id, name: c.fantasy_name || c.company, company: c.company,
        fantasy_name: c.fantasy_name, country: c.country, is_qc_client: c.is_qc_client
      }))
      setClients(allClients)

      setQcClients((qcClientsRes.clients || []).map((c: any) => ({
        id: c.id, name: c.fantasy_name || c.company, company: c.company,
        fantasy_name: c.fantasy_name, country: c.country, is_qc_client: c.is_qc_client
      })))
    } catch (error) {
      console.error('Error loading entities:', error)
    } finally {
      setLoadingEntities(false)
    }
  }

  const dedup = (items: Entity[]) => {
    const seen = new Map<string, Entity>()
    for (const item of items) {
      const key = item.name?.toLowerCase()
      if (key && !seen.has(key)) seen.set(key, item)
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
  }

  const handleEntitySelect = (value: string, idField: string) => {
    if (value === '__create_new__') {
      if (idField === 'seller_id' || idField === 'exporter_id') {
        setCreateDialogType('exporter')
      } else if (idField === 'importer_id') {
        setCreateDialogType('importer')
      } else if (idField === 'roaster_id') {
        setCreateDialogType('roaster')
      } else if (idField === 'end_client_id') {
        setCreateDialogType('end_client')
      } else if (idField === 'client_id') {
        setCreateDialogType('qc_client')
      }
      setPendingEntityField(idField)
      setShowCreateDialog(true)
      return
    }
    if (value === KEEP_CURRENT) {
      // User re-selected the current derived value — don't send any change
      onFormChange(idField, (sample as any)[idField] ?? null)
      return
    }
    if (value === '__none__') {
      onFormChange(idField, null)
      return
    }
    onFormChange(idField, value)
  }

  const handleCreateSuccess = (name: string, entityId?: string) => {
    if (entityId && pendingEntityField) {
      onFormChange(pendingEntityField, entityId)
    }
    loadEntities()
  }

  // Determine the current Select value, accounting for fallback display names
  const getSelectValue = (idField: string, displayName?: string | null): string => {
    // If user already made a selection in this edit session, use it
    if (formData[idField] !== undefined && formData[idField] !== null) {
      return formData[idField]
    }
    // Check sample's actual ID
    const sampleId = (sample as any)[idField]
    if (sampleId) return sampleId
    // If explicitly set to null by user, show none
    if (formData[idField] === null) return '__none__'
    // No ID but there IS a display name (derived from QC client fallback)
    if (displayName) return KEEP_CURRENT
    return '__none__'
  }

  const renderEntityCell = (
    label: string,
    displayName: string | null | undefined,
    idField: string,
    entityList: (Entity | ClientEntity)[],
    contractField: string,
    contractValue: string | null | undefined,
  ) => {
    const selectValue = getSelectValue(idField, displayName)
    // Check if no real ID exists for this entity (derived/fallback name)
    const hasNoRealId = !(sample as any)[idField]
    const showCurrentOption = hasNoRealId && !!displayName

    return (
      <tr className="border-b">
        <td className="py-2 px-3 text-muted-foreground">{label}</td>
        <td className="py-2 px-3">
          {isEditMode ? (
            loadingEntities ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </div>
            ) : (
              <Select value={selectValue} onValueChange={(v) => handleEntitySelect(v, idField)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={`Select ${label}...`} />
                </SelectTrigger>
                <SelectContent>
                  {showCurrentOption && (
                    <SelectItem value={KEEP_CURRENT}>
                      {displayName} (current)
                    </SelectItem>
                  )}
                  <SelectItem value="__none__">- None -</SelectItem>
                  {entityList.map((entity) => (
                    <SelectItem key={entity.id} value={entity.id}>
                      {entity.name}{entity.country ? ` (${entity.country})` : ''}
                    </SelectItem>
                  ))}
                  <SelectItem value="__create_new__" className="text-primary font-medium">
                    + Create New
                  </SelectItem>
                </SelectContent>
              </Select>
            )
          ) : (
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{displayName || '-'}</span>
            </div>
          )}
        </td>
        <td className="py-2 px-3">
          {isEditMode ? (
            <Input
              value={formData[contractField] ?? contractValue ?? ''}
              onChange={(e) => onFormChange(contractField, e.target.value)}
              className="h-7 text-sm font-mono"
              placeholder="Contract #"
            />
          ) : (
            <span className="font-mono">{contractValue || '-'}</span>
          )}
        </td>
      </tr>
    )
  }

  const renderClientEntityCell = (
    label: string,
    displayName: string | null | undefined,
    idField: string,
    clientList: ClientEntity[],
    contractField: string,
    contractValue: string | null | undefined,
    isLast?: boolean,
  ) => {
    const selectValue = getSelectValue(idField, displayName)
    const hasNoRealId = !(sample as any)[idField]
    const showCurrentOption = hasNoRealId && !!displayName

    return (
      <tr className={isLast ? '' : 'border-b'}>
        <td className="py-2 px-3 text-muted-foreground">{label}</td>
        <td className="py-2 px-3">
          {isEditMode ? (
            loadingEntities ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </div>
            ) : (
              <Select value={selectValue} onValueChange={(v) => handleEntitySelect(v, idField)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={`Select ${label}...`} />
                </SelectTrigger>
                <SelectContent>
                  {showCurrentOption && (
                    <SelectItem value={KEEP_CURRENT}>
                      {displayName} (current)
                    </SelectItem>
                  )}
                  <SelectItem value="__none__">- None -</SelectItem>
                  {clientList.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}{client.country ? ` (${client.country})` : ''}
                    </SelectItem>
                  ))}
                  <SelectItem value="__create_new__" className="text-primary font-medium">
                    + Create New
                  </SelectItem>
                </SelectContent>
              </Select>
            )
          ) : (
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{displayName || '-'}</span>
            </div>
          )}
        </td>
        <td className="py-2 px-3">
          {isEditMode ? (
            <Input
              value={formData[contractField] ?? contractValue ?? ''}
              onChange={(e) => onFormChange(contractField, e.target.value)}
              className="h-7 text-sm font-mono"
              placeholder="Contract #"
            />
          ) : (
            <span className="font-mono">{contractValue || '-'}</span>
          )}
        </td>
      </tr>
    )
  }

  const effectiveImporterName = sample.importer_name || (sample.importer_is_qc_client ? sample.qc_client_name : null)
  const effectiveEndClientName = sample.end_client_name || sample.qc_client_name

  // In view mode, check if importer/roaster/end client are all the same as QC client
  const qcName = sample.qc_client_name?.toLowerCase()?.trim()
  const allSameAsQc = !isEditMode && qcName && (
    (!effectiveImporterName || effectiveImporterName.toLowerCase().trim() === qcName) &&
    (!sample.roaster_name || sample.roaster_name.toLowerCase().trim() === qcName) &&
    (!effectiveEndClientName || effectiveEndClientName.toLowerCase().trim() === qcName)
  )

  // In view mode, hide roaster/end client rows if empty or all same as QC client
  const showImporter = isEditMode || (!allSameAsQc && !!effectiveImporterName)
  const showRoaster = isEditMode || (!allSameAsQc && !!sample.roaster_name)
  const showEndClient = isEditMode || (!allSameAsQc && !!effectiveEndClientName)

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left py-2 px-3 font-medium w-[120px]">Party</th>
              <th className="text-left py-2 px-3 font-medium">Name</th>
              <th className="text-left py-2 px-3 font-medium w-[180px]">
                <div className="flex items-center justify-between">
                  Contract Ref
                  {!isEditMode && onEditClick && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1" onClick={onEditClick} title="Edit">
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Wolthers - no entity dropdown, just contract */}
            <tr className="border-b">
              <td className="py-2 px-3 text-muted-foreground">Wolthers</td>
              <td className="py-2 px-3 text-muted-foreground">-</td>
              <td className="py-2 px-3">
                {isEditMode ? (
                  <Input
                    value={formData.wolthers_contract_nr ?? sample.wolthers_contract_nr ?? ''}
                    onChange={(e) => onFormChange('wolthers_contract_nr', e.target.value)}
                    className="h-7 text-sm font-mono"
                    placeholder="Contract #"
                  />
                ) : (
                  <span className="font-mono">{sample.wolthers_contract_nr || '-'}</span>
                )}
              </td>
            </tr>

            {/* Seller / Shipper - merged when same_seller_shipper */}
            {sample.same_seller_shipper && !isEditMode ? (
              renderEntityCell(
                'Seller/Shipper',
                sample.seller_name,
                'seller_id',
                exporters,
                'seller_contract_nr',
                sample.seller_contract_nr,
              )
            ) : (
              <>
                {renderEntityCell(
                  'Seller',
                  sample.seller_name,
                  'seller_id',
                  exporters,
                  'seller_contract_nr',
                  sample.seller_contract_nr,
                )}
                {renderEntityCell(
                  'Shipper',
                  sample.same_seller_shipper ? null : sample.exporter_name,
                  'exporter_id',
                  exporters,
                  'shipper_contract_nr',
                  sample.shipper_contract_nr || (sample.same_seller_shipper ? null : sample.exporter_contract_nr),
                )}
              </>
            )}

            {/* Importer - hidden in view mode if all same as QC client */}
            {showImporter && renderEntityCell(
              'Importer',
              effectiveImporterName,
              'importer_id',
              importers,
              'buyer_contract_nr',
              sample.buyer_contract_nr,
            )}

            {/* Roaster - hidden in view mode if empty */}
            {showRoaster && renderEntityCell(
              'Roaster',
              sample.roaster_name,
              'roaster_id',
              roasters,
              'roaster_contract_nr',
              sample.roaster_contract_nr,
            )}

            {/* End Client - hidden in view mode if empty */}
            {showEndClient && renderClientEntityCell(
              'End Client',
              effectiveEndClientName,
              'end_client_id',
              clients,
              'end_client_contract_nr',
              sample.end_client_contract_nr,
            )}

            {/* QC Client - inherit importer contract nr when others are collapsed */}
            {renderClientEntityCell(
              'QC Client',
              sample.qc_client_name,
              'client_id',
              qcClients,
              'qc_client_contract_nr',
              sample.qc_client_contract_nr || (allSameAsQc ? sample.buyer_contract_nr : null),
              true,
            )}
          </tbody>
        </table>
      </div>

      {/* Create Entity Dialog */}
      <AddClientModal
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        defaultRole={createDialogType}
        onSuccess={handleCreateSuccess}
      />
    </>
  )
}
