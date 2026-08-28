'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Trash2, Plus, Loader2 } from 'lucide-react'
import { ContractPanel } from './intake/contracts-step'
import type { SubContractFormData, Client } from './intake/types'
import { supabase } from '@/lib/supabase'
import {
  bagWeightForType,
  bulkQuantitiesFromContainers,
  computeBagQuantities,
  formatQuantityLine,
} from '@/lib/bag-quantity'
import { suggestContractRefs, type RefBag } from '@/lib/reference-sequence'
import type { ContractInput } from '@/lib/sample-group'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

interface SampleData {
  id: string
  tracking_number: string
  client_id?: string
  sample_type?: string
  origin?: string
  seller_name?: string
  exporter_name?: string
  importer_name?: string
  importer_is_qc_client?: boolean
  roaster_name?: string
  end_client_name?: string
  qc_client_name?: string
  wolthers_contract_nr?: string
  seller_contract_nr?: string
  buyer_contract_nr?: string
  roaster_contract_nr?: string
  qc_client_contract_nr?: string
  end_client_contract_nr?: string
  supplier_contract_nr?: string
  ico_number?: string
  container_nr?: string
  bags_quantity_mt?: number
  bag_count?: number
  bag_weight_kg?: number
  bag_type?: string
  equivalent_60kg_bags?: number | null
  container_count?: number | null
  shipment_month?: string
  exporter_sample_number?: string | null
  same_seller_shipper?: boolean
}

interface AddSubContractDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sample: SampleData
  onSuccess?: () => void
}

function MotherSummary({ sample }: { sample: SampleData }) {
  let shipmentLabel = ''
  if (sample.shipment_month) {
    const [year, month] = sample.shipment_month.split('-')
    shipmentLabel = `${MONTH_NAMES[parseInt(month) - 1] || month} ${year} shpt`
  }

  // The agreed wording on every surface ("320 × 60 kg jute bags (19.2 MT)",
  // "2 containers in bulk (43.2 MT)"), then the shipment: "... | February 2026 shpt".
  const quantityParts = [formatQuantityLine(sample), shipmentLabel].filter(Boolean) as string[]

  const sampleType = (sample.sample_type || '').toUpperCase()

  // Helper to render entity with dash-separated contract ref
  const Entity = ({ label, value, ref: contractRef }: { label: string; value?: string | null; ref?: string }) => {
    if (!value) return null
    return (
      <div className="text-sm">
        <span className="text-muted-foreground text-xs">{label}:</span>{' '}
        <span className="font-medium">{value}</span>
        {contractRef && <span className="text-muted-foreground text-xs"> - {contractRef}</span>}
      </div>
    )
  }

  return (
    <div className="bg-muted/50 border rounded-xl p-4 space-y-2">
      {/* Top: Wolthers left, tracking number right */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-mono text-muted-foreground">
          {sample.wolthers_contract_nr ? `Wolthers ${sample.wolthers_contract_nr}` : '\u00A0'}
        </div>
        <span className="text-sm font-mono font-medium">{sample.tracking_number}</span>
      </div>

      {/* Entities: Seller/Shipper | Importer/Roaster | QC Client/End Client */}
      <div className="grid grid-cols-3 gap-x-5 gap-y-1">
        <Entity label={sample.same_seller_shipper ? 'Seller/Shipper' : 'Seller'} value={sample.seller_name} ref={sample.seller_contract_nr} />
        <Entity label="Importer" value={sample.importer_name} ref={sample.buyer_contract_nr} />
        {sample.qc_client_name ? (
          <Entity label="QC Client" value={sample.qc_client_name} ref={sample.qc_client_contract_nr} />
        ) : <div />}

        {!sample.same_seller_shipper ? (
          <Entity label="Shipper" value={sample.exporter_name} ref={sample.supplier_contract_nr} />
        ) : <div />}
        {sample.roaster_name ? (
          <Entity label="Roaster" value={sample.roaster_name} ref={sample.roaster_contract_nr} />
        ) : <div />}
        {sample.end_client_name ? (
          <Entity label="End Client" value={sample.end_client_name} ref={sample.end_client_contract_nr} />
        ) : <div />}
      </div>

      {/* Bottom: PSS/SS badge + info on left, quantity on right */}
      <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/50">
        <div className="flex items-center gap-2">
          {sampleType && <Badge variant="outline" className="text-[10px]">{sampleType}</Badge>}
          {sample.sample_type === 'pss' && sample.exporter_sample_number && (
            <span className="font-mono">{sample.exporter_sample_number}</span>
          )}
          {sample.sample_type === 'ss' && sample.ico_number && (
            <span>ICO: {sample.ico_number}</span>
          )}
          {sample.sample_type === 'ss' && sample.container_nr && (
            <>
              {sample.ico_number && <span className="text-muted-foreground">|</span>}
              <span>Container: {sample.container_nr}</span>
            </>
          )}
        </div>
        {quantityParts.length > 0 && (
          <div className="text-muted-foreground">{quantityParts.join(' | ')}</div>
        )}
      </div>
    </div>
  )
}

/**
 * The stored quantity columns for one contract form. Bulk goes through the
 * containers rule (containers + total MT in; bag_count IS the 60 kg equivalent,
 * bag_weight_kg = 21600 — the invariant every report relies on), everything
 * else is count × weight. A blank container count reads as one container and
 * a blank MT as containers × 21.6, the defaults BulkQuantityFields shows.
 */
function contractQuantities(c: SubContractFormData) {
  if (c.bag_type === 'bulk') {
    return {
      bag_type: 'bulk' as const,
      ...bulkQuantitiesFromContainers(parseInt(c.container_count) || 1, parseFloat(c.bags_quantity_mt) || 0),
    }
  }
  const bag_count = parseInt(c.bag_count) || null
  const bag_weight_kg = parseFloat(c.bag_weight_kg) || null
  const derived = computeBagQuantities(bag_count, bag_weight_kg, c.bag_type)
  return {
    bag_type: c.bag_type || null,
    bag_count,
    bag_weight_kg,
    bags_quantity_mt: derived.bags_quantity_mt,
    equivalent_60kg_bags: derived.equivalent_60kg_bags,
    container_count: parseInt(c.container_count) || null,
  }
}

/** Write the derived MT / equivalent back into the form strings; returns the same object when nothing moved. */
function withDerivedQuantities(c: SubContractFormData): SubContractFormData {
  const q = contractQuantities(c)
  const equivalent = q.equivalent_60kg_bags?.toString() ?? ''
  if (c.bag_type === 'bulk') {
    // Total MT stays whatever was typed (blank shows the containers × 21.6
    // placeholder); only the read-only columns follow it.
    if (c.equivalent_60kg_bags === equivalent && c.bag_count === equivalent) return c
    return { ...c, equivalent_60kg_bags: equivalent, bag_count: equivalent }
  }
  const mt = q.bags_quantity_mt?.toString() ?? ''
  if (c.bags_quantity_mt === mt && c.equivalent_60kg_bags === equivalent) return c
  return { ...c, bags_quantity_mt: mt, equivalent_60kg_bags: equivalent }
}

/** The lab unit is contract #1: its refs seed the series the added contracts continue. */
function motherRefs(sample: SampleData): RefBag {
  return {
    exporter_sample_number: sample.exporter_sample_number,
    wolthers_contract_nr: sample.wolthers_contract_nr,
    supplier_contract_nr: sample.supplier_contract_nr,
    buyer_contract_nr: sample.buyer_contract_nr,
    roaster_contract_nr: sample.roaster_contract_nr,
    qc_client_contract_nr: sample.qc_client_contract_nr,
    end_client_contract_nr: sample.end_client_contract_nr,
  }
}

/** Resolve the typed counterparty names to company ids, as intake does. */
async function resolveEntityIds(sc: SubContractFormData): Promise<Record<string, string | undefined>> {
  const lookups: Promise<any>[] = []
  const keys: string[] = []
  if (sc.importer) {
    keys.push('importer')
    lookups.push(
      Promise.resolve((supabase as any).from('companies').select('id').filter('trading_roles', 'cs', '["buyer"]').ilike('name', `%${sc.importer}%`).limit(1).maybeSingle())
    )
  }
  if (sc.roaster) {
    keys.push('roaster')
    lookups.push(Promise.resolve((supabase as any).from('companies').select('id').contains('company_types', ['roaster']).ilike('name', sc.roaster).limit(1).maybeSingle()))
  }
  if (sc.end_client) {
    keys.push('end_client')
    lookups.push(Promise.resolve((supabase as any).from('companies').select('id').ilike('fantasy_name', sc.end_client).limit(1).maybeSingle()))
  }
  const results = await Promise.all(lookups)
  const resolved: Record<string, string | undefined> = {}
  results.forEach((r, idx) => { resolved[keys[idx]] = r?.data?.id })
  return resolved
}

/** Server wording for a sibling that exists but could not be certified (src/lib/sample-group.ts). */
const CREATED_WITHOUT_CERTIFICATE = 'Contract created'

export function AddSubContractDialog({ open, onOpenChange, sample, onSuccess }: AddSubContractDialogProps) {
  const [contracts, setContracts] = useState<SubContractFormData[]>([])
  const [openItems, setOpenItems] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prevLengthRef = useRef(0)

  // Dropdown data
  const [importers, setImporters] = useState<any[]>([])
  const [roasters, setRoasters] = useState<any[]>([])
  const [qcClients, setQcClients] = useState<Client[]>([])

  // Load dropdown data on open
  useEffect(() => {
    if (!open) return
    setContracts([])
    setOpenItems([])
    setError(null)
    prevLengthRef.current = 0

    const loadData = async () => {
      const [impRes, roaRes, qcRes] = await Promise.all([
        fetch('/api/importers'),
        fetch('/api/roasters'),
        fetch('/api/clients?is_qc_client=true&is_active=true&limit=500'),
      ])
      if (impRes.ok) {
        const d = await impRes.json()
        setImporters(d.importers || [])
      }
      if (roaRes.ok) {
        const d = await roaRes.json()
        setRoasters(d.roasters || [])
      }
      if (qcRes.ok) {
        const d = await qcRes.json()
        setQcClients(d.clients || [])
      }
    }
    loadData()
  }, [open])

  // Auto-open newly added contract
  useEffect(() => {
    if (contracts.length > prevLengthRef.current) {
      setOpenItems(prev => [...prev, `contract-${contracts.length - 1}`])
    }
    prevLengthRef.current = contracts.length
  }, [contracts.length])

  const importerOptions = useMemo(() => {
    const seen = new Set<string>()
    return importers
      .filter((i: any) => { if (!i.name || seen.has(i.name)) return false; seen.add(i.name); return true })
      .map((i: any) => ({ name: i.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [importers])

  const mergedImporterOptions = useMemo(() => {
    const clientOptions = qcClients.map(c => ({ name: c.fantasy_name || c.company }))
    const seen = new Set<string>()
    return [...clientOptions, ...importerOptions]
      .filter(opt => { const key = opt.name.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [qcClients, importerOptions])

  const roasterOptions = useMemo(() => {
    const seen = new Set<string>()
    return roasters
      .filter((r: any) => { if (!r.name || seen.has(r.name)) return false; seen.add(r.name); return true })
      .map((r: any) => ({ name: r.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [roasters])

  const updateContractField = (index: number, field: keyof SubContractFormData, value: string | boolean) => {
    setContracts(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  // Default the bag weight when a bag type is picked (bulk = the 21 600 kg
  // container the trigger and legacy readers expect). Keyed on the types only,
  // so a custom weight typed afterwards survives.
  useEffect(() => {
    if (contracts.length === 0) return
    setContracts(prev => {
      let changed = false
      const updated = prev.map(c => {
        const weight = bagWeightForType(c.bag_type, sample.origin)
        if (weight === null || c.bag_weight_kg === String(weight)) return c
        changed = true
        return { ...c, bag_weight_kg: String(weight) }
      })
      return changed ? updated : prev
    })
  }, [contracts.map(c => c.bag_type).join(',')])

  // Derive MT and the 60 kg equivalent through the shared helpers so this
  // dialog stores exactly what intake and the PATCH route would.
  useEffect(() => {
    if (contracts.length === 0) return
    setContracts(prev => {
      let changed = false
      const updated = prev.map(c => {
        const next = withDerivedQuantities(c)
        if (next !== c) changed = true
        return next
      })
      return changed ? updated : prev
    })
  }, [contracts.map(c => `${c.bag_type}|${c.bag_count}|${c.bag_weight_kg}|${c.container_count}|${c.bags_quantity_mt}`).join(',')])

  const handleAddContract = () => {
    // References continue the series: the lab unit is contract #1, so the
    // first addition steps its refs; later ones step the last contract, with
    // the one before it as the second seed so a corrected step is adopted. A
    // ref the helper cannot continue stays blank — every value is editable.
    const chain: RefBag[] = [motherRefs(sample), ...contracts]
    const previous = chain[chain.length - 1]
    const before = chain.length > 1 ? chain[chain.length - 2] : undefined
    const refs = suggestContractRefs(previous, before)
    const newContract: SubContractFormData = {
      importer: sample.importer_name || '',
      importer_is_qc_client: sample.importer_is_qc_client ?? true,
      roaster: sample.roaster_name || '',
      end_client: sample.end_client_name || '',
      qc_client: sample.qc_client_name || '',
      wolthers_contract_nr: refs.wolthers_contract_nr ?? '',
      buyer_contract_nr: refs.buyer_contract_nr ?? '',
      roaster_contract_nr: refs.roaster_contract_nr ?? '',
      qc_client_contract_nr: refs.qc_client_contract_nr ?? '',
      end_client_contract_nr: refs.end_client_contract_nr ?? '',
      supplier_contract_nr: refs.supplier_contract_nr ?? '',
      exporter_sample_number: refs.exporter_sample_number ?? '',
      ico_number: sample.ico_number || '',
      container_nr: sample.container_nr || '',
      bag_count: sample.bag_count?.toString() || '',
      bag_weight_kg: sample.bag_weight_kg?.toString() || '',
      bag_type: (sample.bag_type as SubContractFormData['bag_type']) || '',
      bags_quantity_mt: sample.bags_quantity_mt?.toString() || '',
      equivalent_60kg_bags: '',
      container_count: sample.container_count?.toString() || '',
      shipment_month: sample.shipment_month || '',
    }
    setContracts(prev => [...prev, newContract])
  }

  const handleRemoveContract = (index: number) => {
    setContracts(prev => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (contracts.length === 0) return
    setSaving(true)
    setError(null)

    try {
      const inputs: ContractInput[] = []
      for (const sc of contracts) {
        const resolved = await resolveEntityIds(sc)
        inputs.push({
          importer_id: resolved['importer'] || null,
          importer_is_qc_client: sc.importer_is_qc_client,
          roaster_id: resolved['roaster'] || null,
          end_client_id: resolved['end_client'] || null,
          client_id: sample.client_id || null,
          wolthers_contract_nr: sc.wolthers_contract_nr || null,
          buyer_contract_nr: sc.buyer_contract_nr || null,
          roaster_contract_nr: sc.roaster_contract_nr || null,
          qc_client_contract_nr: sc.qc_client_contract_nr || null,
          end_client_contract_nr: sc.end_client_contract_nr || null,
          supplier_contract_nr: sc.supplier_contract_nr || null,
          ico_number: sc.ico_number || null,
          container_nr: sc.container_nr || null,
          exporter_sample_number: sc.exporter_sample_number || null,
          shipment_month: sc.shipment_month || null,
          ...contractQuantities(sc),
        })
      }

      // One request for the whole batch: the server numbers each sibling,
      // certifies it when the lot is already decided, and re-syncs sys once.
      const res = await fetch(`/api/samples/${sample.id}/siblings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contracts: inputs }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.details || data.error || 'Failed to add the contracts')
      }

      const created: unknown[] = Array.isArray(data.created) ? data.created : []
      const failed: Array<{ index: number; error: string }> = Array.isArray(data.failed) ? data.failed : []
      if (created.length > 0) onSuccess?.()
      if (failed.length === 0) {
        onOpenChange(false)
        return
      }

      // "Contract #N" follows the accordion badges (the lab unit is #1). A
      // failed entry can name a contract that WAS created but has no
      // certificate, so only the ones that do not exist stay in the list —
      // saving again must not create a contract twice.
      setError(failed.map((f) => `Contract #${f.index + 2}: ${f.error}`).join('\n'))
      const notCreated = new Set(
        failed.filter((f) => !f.error.startsWith(CREATED_WITHOUT_CERTIFICATE)).map((f) => f.index),
      )
      const remaining = contracts.filter((_, i) => notCreated.has(i))
      setContracts(remaining)
      // Left expanded: the user is looking for what to fix.
      setOpenItems(remaining.map((_, i) => `contract-${i}`))
      prevLengthRef.current = remaining.length
    } catch (err: any) {
      setError(err.message || 'Failed to add the contracts')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle>Add Contracts</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <MotherSummary sample={sample} />

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3 whitespace-pre-line">
              {error}
            </div>
          )}

          {contracts.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Click &ldquo;+ Add Contract&rdquo; below to add one.
            </div>
          ) : (
            <Accordion type="multiple" value={openItems} onValueChange={setOpenItems}>
              {contracts.map((contract, idx) => (
                <AccordionItem key={idx} value={`contract-${idx}`} className="border rounded-lg px-4 mb-3">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3 text-left flex-1 mr-2">
                      <Badge variant="outline" className="shrink-0 text-[10px]">#{idx + 2}</Badge>
                      <span className="font-medium text-sm truncate">
                        {contract.importer || 'New Contract'}
                      </span>
                      {contract.buyer_contract_nr && (
                        <span className="text-xs text-muted-foreground">({contract.buyer_contract_nr})</span>
                      )}
                      {contract.bag_type && (
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatQuantityLine(contractQuantities(contract))}
                        </span>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ContractPanel
                      contract={contract}
                      updateContract={(field, value) => updateContractField(idx, field, value)}
                      importerOptions={importerOptions}
                      mergedImporterOptions={mergedImporterOptions}
                      roasterOptions={roasterOptions}
                      qcClients={qcClients}
                      origin={sample.origin || ''}
                      sampleType={sample.sample_type || ''}
                      sellerName={sample.seller_name || ''}
                      lockQcClient
                    />
                    <div className="flex justify-end pt-2 pb-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveContract(idx)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button type="button" variant="outline" onClick={handleAddContract}>
            <Plus className="h-4 w-4 mr-1" />
            Add Contract
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || contracts.length === 0}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Saving...
              </>
            ) : (
              `Save ${contracts.length > 0 ? contracts.length : ''} Contract${contracts.length !== 1 ? 's' : ''}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// The dialog now creates sibling samples (one sample per contract); the old
// name is kept for its two callers until they are renamed.
export { AddSubContractDialog as AddContractsDialog }
