'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Trash2, Plus, Loader2 } from 'lucide-react'
import { ContractPanel, createEmptyContract } from './intake/contracts-step'
import type { SubContractFormData, Client } from './intake/types'
import { supabase } from '@/lib/supabase'

const BAG_TYPE_LABELS: Record<string, string> = {
  jute_bag: 'jute bags', pp_bag: 'PP bags', big_bag: 'big bags', bulk: 'bulk',
}

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
  const bagLabel = sample.bag_type ? BAG_TYPE_LABELS[sample.bag_type] || sample.bag_type : ''

  let shipmentLabel = ''
  if (sample.shipment_month) {
    const [year, month] = sample.shipment_month.split('-')
    shipmentLabel = `${MONTH_NAMES[parseInt(month) - 1] || month} ${year} shpt`
  }

  const quantityParts: string[] = []
  if (sample.bag_count && sample.bag_weight_kg && bagLabel) {
    quantityParts.push(`${sample.bag_count} bags in ${sample.bag_weight_kg}kg ${bagLabel}`)
  }
  // MT and shipment combined: "19.2 MT February 2026 shpt"
  const mtShipment = [
    sample.bags_quantity_mt ? `${sample.bags_quantity_mt} MT` : '',
    shipmentLabel,
  ].filter(Boolean).join(' ')
  if (mtShipment) quantityParts.push(mtShipment)

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

  // Auto-assign bag weight when bag_type changes
  useEffect(() => {
    if (contracts.length === 0) return
    setContracts(prev => {
      const updated = prev.map(c => {
        if (!c.bag_type) return c
        let weight = ''
        if (c.bag_type === 'big_bag') weight = '1000'
        else if (c.bag_type === 'bulk') weight = '21600'
        else if (c.bag_type === 'jute_bag' || c.bag_type === 'pp_bag') {
          weight = (sample.origin || '').toLowerCase() === 'brazil' ? '60' : '70'
        }
        if (!weight || c.bag_weight_kg === weight) return c
        return { ...c, bag_weight_kg: weight }
      })
      return JSON.stringify(updated) !== JSON.stringify(prev) ? updated : prev
    })
  }, [contracts.map(c => c.bag_type).join(',')])

  // Auto-calculate MT and equivalent 60kg bags
  useEffect(() => {
    if (contracts.length === 0) return
    setContracts(prev => {
      const updated = prev.map(c => {
        const bagCount = parseInt(c.bag_count) || 0
        const bagWeight = parseFloat(c.bag_weight_kg) || 0
        const isBulk = c.bag_type === 'bulk'
        if (bagCount <= 0 || (!isBulk && bagWeight <= 0)) {
          if (c.bags_quantity_mt || c.equivalent_60kg_bags) {
            return { ...c, bags_quantity_mt: '', equivalent_60kg_bags: '' }
          }
          return c
        }
        let totalMT: number, equivalent: number
        if (isBulk) {
          totalMT = (bagCount * 60) / 1000
          equivalent = bagCount
        } else {
          totalMT = (bagCount * bagWeight) / 1000
          equivalent = (bagCount * bagWeight) / 60
        }
        const newMT = totalMT.toFixed(3)
        const newEquiv = Math.round(equivalent).toString()
        if (c.bags_quantity_mt === newMT && c.equivalent_60kg_bags === newEquiv) return c
        return { ...c, bags_quantity_mt: newMT, equivalent_60kg_bags: newEquiv }
      })
      return JSON.stringify(updated) !== JSON.stringify(prev) ? updated : prev
    })
  }, [contracts.map(c => `${c.bag_count}|${c.bag_weight_kg}|${c.bag_type}`).join(',')])

  const handleAddContract = () => {
    const newContract: SubContractFormData = {
      importer: sample.importer_name || '',
      importer_is_qc_client: sample.importer_is_qc_client ?? true,
      roaster: sample.roaster_name || '',
      end_client: sample.end_client_name || '',
      qc_client: sample.qc_client_name || '',
      wolthers_contract_nr: sample.wolthers_contract_nr || '',
      buyer_contract_nr: sample.buyer_contract_nr || '',
      roaster_contract_nr: sample.roaster_contract_nr || '',
      qc_client_contract_nr: sample.qc_client_contract_nr || '',
      end_client_contract_nr: sample.end_client_contract_nr || '',
      supplier_contract_nr: sample.supplier_contract_nr || '',
      ico_number: sample.ico_number || '',
      container_nr: sample.container_nr || '',
      bag_count: sample.bag_count?.toString() || '',
      bag_weight_kg: sample.bag_weight_kg?.toString() || '',
      bag_type: (sample.bag_type as SubContractFormData['bag_type']) || '',
      bags_quantity_mt: sample.bags_quantity_mt?.toString() || '',
      equivalent_60kg_bags: '',
      shipment_month: sample.shipment_month || '',
      exporter_sample_number: sample.exporter_sample_number || '',
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
      for (let i = 0; i < contracts.length; i++) {
        const sc = contracts[i]

        // Resolve entity IDs
        const lookups: Promise<any>[] = []
        const keys: string[] = []

        if (sc.importer) {
          keys.push('importer')
          lookups.push(
            Promise.resolve(supabase.from('importers').select('id').ilike('name', `%${sc.importer}%`).limit(1).maybeSingle())
          )
        }
        if (sc.roaster) {
          keys.push('roaster')
          lookups.push(Promise.resolve(supabase.from('roasters').select('id').ilike('name', sc.roaster).limit(1).maybeSingle()))
        }
        if (sc.end_client) {
          keys.push('end_client')
          lookups.push(Promise.resolve(supabase.from('clients').select('id').ilike('fantasy_name', sc.end_client).limit(1).maybeSingle()))
        }
        const results = await Promise.all(lookups)
        const resolved: Record<string, string | undefined> = {}
        results.forEach((r, idx) => { resolved[keys[idx]] = r?.data?.id })

        const body: Record<string, any> = {
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
          bag_count: sc.bag_count ? parseInt(sc.bag_count) : null,
          bag_weight_kg: sc.bag_weight_kg ? parseFloat(sc.bag_weight_kg) : null,
          bag_type: sc.bag_type || null,
          bags_quantity_mt: sc.bags_quantity_mt ? parseFloat(sc.bags_quantity_mt) : null,
          equivalent_60kg_bags: sc.equivalent_60kg_bags ? parseInt(sc.equivalent_60kg_bags) : null,
          shipment_month: sc.shipment_month || null,
        }

        const res = await fetch(`/api/samples/${sample.id}/contracts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.details || err.error || `Failed to create sub-contract ${i + 1}`)
        }
      }

      onOpenChange(false)
      onSuccess?.()
    } catch (err: any) {
      setError(err.message || 'Failed to save sub-contracts')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle>Add Sub-Contracts</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <MotherSummary sample={sample} />

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
              {error}
            </div>
          )}

          {contracts.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Click &ldquo;+ Add Sub-Contract&rdquo; below to add one.
            </div>
          ) : (
            <Accordion type="multiple" value={openItems} onValueChange={setOpenItems}>
              {contracts.map((contract, idx) => (
                <AccordionItem key={idx} value={`contract-${idx}`} className="border rounded-lg px-4 mb-3">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3 text-left flex-1 mr-2">
                      <Badge variant="outline" className="shrink-0 text-[10px]">#{idx + 2}</Badge>
                      <span className="font-medium text-sm truncate">
                        {contract.importer || 'New Sub-Contract'}
                      </span>
                      {contract.buyer_contract_nr && (
                        <span className="text-xs text-muted-foreground">({contract.buyer_contract_nr})</span>
                      )}
                      {contract.bags_quantity_mt && parseFloat(contract.bags_quantity_mt) > 0 && (
                        <span className="text-xs text-muted-foreground ml-auto">{contract.bags_quantity_mt} MT</span>
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
            Add Sub-Contract
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
              `Save ${contracts.length > 0 ? contracts.length : ''} Sub-Contract${contracts.length !== 1 ? 's' : ''}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
