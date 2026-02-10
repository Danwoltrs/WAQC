'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { SubContractFormData } from './types'
import type { Client, Importer, Roaster } from './types'

interface SubContractCardProps {
  index: number
  data: SubContractFormData
  onChange: (index: number, field: keyof SubContractFormData, value: any) => void
  onRemove: (index: number) => void
  importers: Importer[]
  roasters: Roaster[]
  qcClients: Client[]
  mergedImporterOptions: Array<{ name: string; clientId?: string }>
}

export function SubContractCard({
  index,
  data,
  onChange,
  onRemove,
  importers,
  roasters,
  qcClients,
  mergedImporterOptions,
}: SubContractCardProps) {
  const [collapsed, setCollapsed] = useState(false)

  // Build summary for collapsed state
  const parts: string[] = []
  if (data.importer) parts.push(data.importer)
  if (data.roaster) parts.push(data.roaster)
  if (data.end_client) parts.push(data.end_client)
  const summary = parts.length > 0 ? parts.join(' → ') : 'No entities set'

  // Deduplicated importer options (plain importers only, for non-QC-client mode)
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
    <div className="border rounded-lg p-3 bg-muted/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground/80"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Contract #{index + 2}
          {collapsed && <span className="text-xs text-muted-foreground ml-2">{summary}</span>}
        </button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(index)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {!collapsed && (
        <div className="space-y-3">
          {/* Importer Row */}
          <div className="grid grid-cols-[180px_160px] gap-3 items-end">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Label className="text-xs text-muted-foreground">Importer</Label>
                <div className="flex items-center gap-1">
                  <Checkbox
                    id={`sc_${index}_importer_is_qc_client`}
                    checked={data.importer_is_qc_client}
                    onCheckedChange={(checked) => {
                      onChange(index, 'importer_is_qc_client', checked as boolean)
                      if (checked) {
                        onChange(index, 'qc_client', '')
                        onChange(index, 'qc_client_contract_nr', '')
                      }
                    }}
                    className="h-3 w-3"
                  />
                  <Label htmlFor={`sc_${index}_importer_is_qc_client`} className="text-[10px] cursor-pointer text-muted-foreground">
                    =QC Client
                  </Label>
                </div>
              </div>
              <Select
                value={data.importer || 'none'}
                onValueChange={(value) => onChange(index, 'importer', value === 'none' ? '' : value)}
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
              <Label className="text-xs text-muted-foreground mb-1.5 block invisible">Contract</Label>
              <Input
                value={data.buyer_contract_nr}
                onChange={(e) => onChange(index, 'buyer_contract_nr', e.target.value)}
                placeholder="Contract ref."
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* QC Client (if not same as importer) */}
          {!data.importer_is_qc_client && (
            <div className="grid grid-cols-[180px_160px] gap-3 items-end">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">QC Client</Label>
                <Select
                  value={data.qc_client || 'none'}
                  onValueChange={(value) => onChange(index, 'qc_client', value === 'none' ? '' : value)}
                >
                  <SelectTrigger className="h-8 text-xs">
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
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block invisible">Contract</Label>
                <Input
                  value={data.qc_client_contract_nr}
                  onChange={(e) => onChange(index, 'qc_client_contract_nr', e.target.value)}
                  placeholder="Contract ref."
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          {/* Roaster Row */}
          <div className="grid grid-cols-[180px_160px] gap-3 items-end">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Roaster</Label>
              <Select
                value={data.roaster || 'none'}
                onValueChange={(value) => onChange(index, 'roaster', value === 'none' ? '' : value)}
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
              <Label className="text-xs text-muted-foreground mb-1.5 block invisible">Contract</Label>
              <Input
                value={data.roaster_contract_nr}
                onChange={(e) => onChange(index, 'roaster_contract_nr', e.target.value)}
                placeholder="Contract ref."
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* End Client Row */}
          <div className="grid grid-cols-[180px_160px] gap-3 items-end">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">End Client</Label>
              <Select
                value={data.end_client || 'none'}
                onValueChange={(value) => onChange(index, 'end_client', value === 'none' ? '' : value)}
              >
                <SelectTrigger className="h-8 text-xs">
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
              <Label className="text-xs text-muted-foreground mb-1.5 block invisible">Contract</Label>
              <Input
                value={data.end_client_contract_nr}
                onChange={(e) => onChange(index, 'end_client_contract_nr', e.target.value)}
                placeholder="Contract ref."
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Additional Contract References */}
          <div className="grid grid-cols-[180px_160px] gap-3 items-end">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Wolthers Contract</Label>
              <Input
                value={data.wolthers_contract_nr}
                onChange={(e) => onChange(index, 'wolthers_contract_nr', e.target.value)}
                placeholder="Wolthers ref."
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">ICO Number</Label>
              <Input
                value={data.ico_number}
                onChange={(e) => onChange(index, 'ico_number', e.target.value)}
                placeholder="ICO number"
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-[180px_160px] gap-3 items-end">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Container Nr.</Label>
              <Input
                value={data.container_nr}
                onChange={(e) => onChange(index, 'container_nr', e.target.value)}
                placeholder="Container nr."
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Supplier Contract</Label>
              <Input
                value={data.supplier_contract_nr}
                onChange={(e) => onChange(index, 'supplier_contract_nr', e.target.value)}
                placeholder="Supplier ref."
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
