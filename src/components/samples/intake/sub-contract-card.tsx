'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { SubContractFormData } from './types'
import type { Client, Importer, Roaster } from './types'

interface SubContractDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: SubContractFormData
  onSave: (data: SubContractFormData) => void
  index: number | null // null = new contract
  importers: Importer[]
  roasters: Roaster[]
  mergedImporterOptions: Array<{ name: string; clientId?: string }>
}

function SubContractDialog({
  open,
  onOpenChange,
  data: initialData,
  onSave,
  index,
  importers,
  roasters,
  mergedImporterOptions,
}: SubContractDialogProps) {
  const [data, setData] = useState<SubContractFormData>(initialData)

  const update = (field: keyof SubContractFormData, value: string | boolean) => {
    setData(prev => ({ ...prev, [field]: value }))
  }

  // Deduplicated importer options (plain importers only)
  const plainImporterOptions = (() => {
    const seen = new Set<string>()
    return importers
      .filter(i => {
        if (!i.name || seen.has(i.name)) return false
        seen.add(i.name)
        return true
      })
      .map(i => ({ name: i.name! }))
      .sort((a, b) => a.name.localeCompare(b.name))
  })()

  // Deduplicated roaster options
  const roasterOptions = (() => {
    const seen = new Set<string>()
    return roasters
      .filter(r => {
        if (!r.name || seen.has(r.name)) return false
        seen.add(r.name)
        return true
      })
      .map(r => ({ name: r.name! }))
      .sort((a, b) => a.name.localeCompare(b.name))
  })()

  const importerDropdownOptions = data.importer_is_qc_client ? mergedImporterOptions : plainImporterOptions

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {index !== null ? `Edit Contract #${index + 2}` : 'Add Sub-Contract'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Importer + Contract Ref */}
          <div className="grid grid-cols-[1fr_140px] gap-3 items-end">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Label className="text-xs">Importer</Label>
                <div className="flex items-center gap-1">
                  <Checkbox
                    id="sc_dialog_importer_is_qc"
                    checked={data.importer_is_qc_client}
                    onCheckedChange={(checked) => {
                      update('importer_is_qc_client', checked as boolean)
                    }}
                    className="h-3 w-3"
                  />
                  <Label htmlFor="sc_dialog_importer_is_qc" className="text-[10px] cursor-pointer text-muted-foreground">
                    =QC Client
                  </Label>
                </div>
              </div>
              <Select
                value={data.importer || 'none'}
                onValueChange={(value) => update('importer', value === 'none' ? '' : value)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select importer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select...</SelectItem>
                  {importerDropdownOptions.map((opt) => (
                    <SelectItem key={opt.name} value={opt.name}>{opt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Buyer contract</Label>
              <Input
                value={data.buyer_contract_nr}
                onChange={(e) => update('buyer_contract_nr', e.target.value)}
                placeholder="Contract ref."
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Roaster + Contract Ref */}
          <div className="grid grid-cols-[1fr_140px] gap-3 items-end">
            <div>
              <Label className="text-xs mb-1.5 block">Roaster</Label>
              <Select
                value={data.roaster || 'none'}
                onValueChange={(value) => update('roaster', value === 'none' ? '' : value)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select roaster" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select...</SelectItem>
                  {roasterOptions.map((opt) => (
                    <SelectItem key={opt.name} value={opt.name}>{opt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Roaster contract</Label>
              <Input
                value={data.roaster_contract_nr}
                onChange={(e) => update('roaster_contract_nr', e.target.value)}
                placeholder="Contract ref."
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Contract References - compact 2x2 grid */}
          <div className="border-t pt-3">
            <Label className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2 block">Contract References</Label>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Wolthers</Label>
                <Input
                  value={data.wolthers_contract_nr}
                  onChange={(e) => update('wolthers_contract_nr', e.target.value)}
                  placeholder="Wolthers ref."
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">ICO Number</Label>
                <Input
                  value={data.ico_number}
                  onChange={(e) => update('ico_number', e.target.value)}
                  placeholder="ICO number"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Container Nr.</Label>
                <Input
                  value={data.container_nr}
                  onChange={(e) => update('container_nr', e.target.value)}
                  placeholder="Container nr."
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Supplier</Label>
                <Input
                  value={data.supplier_contract_nr}
                  onChange={(e) => update('supplier_contract_nr', e.target.value)}
                  placeholder="Supplier ref."
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave(data)
              onOpenChange(false)
            }}
          >
            {index !== null ? 'Save' : 'Add Contract'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Summary row for a sub-contract in the list ---

interface SubContractRowProps {
  index: number
  data: SubContractFormData
  onEdit: () => void
  onRemove: () => void
}

function SubContractRow({ index, data, onEdit, onRemove }: SubContractRowProps) {
  const parts: string[] = []
  if (data.importer) parts.push(data.importer)
  if (data.roaster) parts.push(data.roaster)
  const chain = parts.join(' → ')

  const refs: string[] = []
  if (data.buyer_contract_nr) refs.push(data.buyer_contract_nr)
  if (data.wolthers_contract_nr) refs.push(`W: ${data.wolthers_contract_nr}`)
  if (data.ico_number) refs.push(`ICO: ${data.ico_number}`)

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-md border bg-background hover:bg-muted/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground w-4 shrink-0">#{index + 2}</span>
          <span className="text-xs font-medium truncate">{chain || 'No entities set'}</span>
        </div>
        {refs.length > 0 && (
          <span className="text-[10px] text-muted-foreground ml-6 truncate block">{refs.join(' | ')}</span>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 shrink-0"
        onClick={onEdit}
      >
        <Pencil className="h-3 w-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  )
}

// --- Main exported component ---

interface SubContractsSectionProps {
  contracts: SubContractFormData[]
  onChange: (contracts: SubContractFormData[]) => void
  // Mother contract values for pre-population
  motherImporter: string
  motherImporterIsQcClient: boolean
  motherRoaster: string
  // Dropdown options
  importers: Importer[]
  roasters: Roaster[]
  qcClients: Client[]
  mergedImporterOptions: Array<{ name: string; clientId?: string }>
}

export function SubContractsSection({
  contracts,
  onChange,
  motherImporter,
  motherImporterIsQcClient,
  motherRoaster,
  importers,
  roasters,
  mergedImporterOptions,
}: SubContractsSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [editData, setEditData] = useState<SubContractFormData | null>(null)

  const createNew = () => {
    // Pre-populate from mother contract
    setEditData({
      importer: motherImporter,
      importer_is_qc_client: motherImporterIsQcClient,
      roaster: motherRoaster,
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
      bag_count: '',
      bag_weight_kg: '',
      bag_type: '',
      bags_quantity_mt: '',
      equivalent_60kg_bags: '',
      shipment_month: '',
      exporter_sample_number: '',
    })
    setEditIndex(null)
    setDialogOpen(true)
  }

  const editExisting = (idx: number) => {
    setEditData({ ...contracts[idx] })
    setEditIndex(idx)
    setDialogOpen(true)
  }

  const handleSave = (data: SubContractFormData) => {
    if (editIndex !== null) {
      const updated = [...contracts]
      updated[editIndex] = data
      onChange(updated)
    } else {
      onChange([...contracts, data])
    }
  }

  const handleRemove = (idx: number) => {
    onChange(contracts.filter((_, j) => j !== idx))
  }

  return (
    <>
      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs font-medium text-muted-foreground">
            Sub-Contracts
            {contracts.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
                {contracts.length}
              </span>
            )}
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={createNew}
          >
            <Plus className="h-3 w-3" />
            Contract
          </Button>
        </div>

        {contracts.length > 0 && (
          <div className="space-y-1.5">
            {contracts.map((contract, idx) => (
              <SubContractRow
                key={idx}
                index={idx}
                data={contract}
                onEdit={() => editExisting(idx)}
                onRemove={() => handleRemove(idx)}
              />
            ))}
          </div>
        )}
      </div>

      {editData && (
        <SubContractDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) setEditData(null)
          }}
          data={editData}
          onSave={handleSave}
          index={editIndex}
          importers={importers}
          roasters={roasters}
          mergedImporterOptions={mergedImporterOptions}
        />
      )}
    </>
  )
}
