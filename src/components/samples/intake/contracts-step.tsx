'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Trash2, ChevronDown } from 'lucide-react'
import { SubContractFormData, StepComponentProps } from './types'
import type { Client } from './types'
import { BulkQuantityFields } from './bulk-quantity-fields'
import { suggestContractRefs, type RefBag } from '@/lib/reference-sequence'
import { bulkQuantitiesFromContainers, computeBagQuantities, formatQuantityLine } from '@/lib/bag-quantity'

const MONTHS = [
  { value: '01', label: 'Jan' }, { value: '02', label: 'Feb' },
  { value: '03', label: 'Mar' }, { value: '04', label: 'Apr' },
  { value: '05', label: 'May' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Aug' },
  { value: '09', label: 'Sep' }, { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' },
]

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const generateYears = () => {
  const y = new Date().getFullYear()
  return [
    { value: y.toString(), label: y.toString() },
    { value: (y + 1).toString(), label: (y + 1).toString() },
    { value: (y + 2).toString(), label: (y + 2).toString() },
  ]
}
const YEARS = generateYears()

const BAG_WEIGHTS: Record<string, { value: string; label: string }[]> = {
  jute_bag: [
    { value: '30', label: '30 kg' }, { value: '59', label: '59 kg' },
    { value: '60', label: '60 kg' }, { value: '70', label: '70 kg' },
  ],
  pp_bag: [
    { value: '30', label: '30 kg' }, { value: '59', label: '59 kg' },
    { value: '60', label: '60 kg' }, { value: '70', label: '70 kg' },
  ],
  big_bag: [{ value: '1000', label: '1 M/T (1000 kg)' }],
  bulk: [{ value: '21600', label: '21.6 M/T (Bulk Container)' }],
}

/** The form strings a quantity is entered as — the mother form and a contract share them. */
export type QuantityFields = Pick<
  SubContractFormData,
  'bag_type' | 'bag_count' | 'bag_weight_kg' | 'bags_quantity_mt' | 'container_count'
>

export interface ContractQuantities {
  bag_type: string | null
  bag_count: number | null
  bag_weight_kg: number | null
  bags_quantity_mt: number | null
  equivalent_60kg_bags: number | null
  container_count: number | null
}

/**
 * The numbers a quantity's form strings resolve to. Bulk is containers + MT
 * (spec addendum 2026-08-28): a blank container count reads as one container
 * and a blank MT as containers × 21.6, so a bulk contract always resolves to a
 * quantity without the user typing a value the form only suggested. Bags stay
 * count × weight. One function feeds the panel summary, the derive effects,
 * the submit validation and the POST body, so they cannot disagree.
 */
export function contractQuantities(c: QuantityFields): ContractQuantities {
  if (c.bag_type === 'bulk') {
    const containers = Number(c.container_count) > 0 ? Number(c.container_count) : 1
    const mt = Number(c.bags_quantity_mt) > 0 ? Number(c.bags_quantity_mt) : null
    const b = bulkQuantitiesFromContainers(containers, mt)
    return {
      bag_type: 'bulk',
      bag_count: b.bag_count,
      bag_weight_kg: b.bag_weight_kg,
      bags_quantity_mt: b.bags_quantity_mt,
      equivalent_60kg_bags: b.equivalent_60kg_bags,
      container_count: b.container_count,
    }
  }
  const count = parseInt(c.bag_count) || null
  const weight = parseFloat(c.bag_weight_kg) || null
  const q = computeBagQuantities(count, weight, c.bag_type)
  return {
    bag_type: c.bag_type || null,
    bag_count: count,
    bag_weight_kg: weight,
    bags_quantity_mt: q.bags_quantity_mt,
    equivalent_60kg_bags: q.equivalent_60kg_bags,
    container_count: null,
  }
}

/** "320 × 60 kg jute bags (19.2 MT)" / "2 containers in bulk (43.2 MT)" for a form quantity. */
export function formatFormQuantity(c: QuantityFields): string | null {
  return formatQuantityLine(contractQuantities(c))
}

// The mother's references under the sibling's field names: the buyer ref lives
// in importer_contract_nr on the mother form.
function motherRefs(formData: StepComponentProps['formData']): RefBag {
  return {
    exporter_sample_number: formData.exporter_sample_number,
    wolthers_contract_nr: formData.wolthers_contract_nr,
    supplier_contract_nr: formData.supplier_contract_nr,
    buyer_contract_nr: formData.importer_contract_nr,
    roaster_contract_nr: formData.roaster_contract_nr,
    qc_client_contract_nr: formData.qc_client_contract_nr,
    end_client_contract_nr: formData.end_client_contract_nr,
  }
}

/**
 * A new contract starts from the mother's values, then every reference that
 * carries a number continues the series. The mother counts as contract #1, so
 * the seeds are the last contract (`previous`) and the one before it
 * (`before`); with no contracts yet the mother is the only seed, and with one
 * contract the mother is the seed before it — "S049504-13, S049504-14" is how
 * the tool learns to suggest "-15" after the user corrected the first guess.
 * Suggestions land in ordinary inputs; nothing is locked.
 */
function createEmptyContract(
  formData: StepComponentProps['formData'],
  previous?: RefBag | null,
  before?: RefBag | null,
): SubContractFormData {
  const mother = motherRefs(formData)
  const contract: SubContractFormData = {
    importer: formData.importer,
    importer_is_qc_client: formData.importer_is_qc_client,
    roaster: formData.roaster,
    end_client: formData.end_client,
    qc_client: formData.qc_client,
    wolthers_contract_nr: formData.wolthers_contract_nr || '',
    buyer_contract_nr: formData.importer_contract_nr || '',
    roaster_contract_nr: formData.roaster_contract_nr || '',
    qc_client_contract_nr: formData.qc_client_contract_nr || '',
    end_client_contract_nr: formData.end_client_contract_nr || '',
    supplier_contract_nr: formData.supplier_contract_nr || '',
    ico_number: formData.ico_number || '',
    container_nr: formData.container_nr || '',
    bag_count: formData.bag_count,
    bag_weight_kg: formData.bag_weight_kg,
    bag_type: formData.bag_type,
    bags_quantity_mt: formData.bags_quantity_mt,
    equivalent_60kg_bags: formData.equivalent_60kg_bags,
    container_count: formData.container_count,
    shipment_month: formData.shipment_month,
    exporter_sample_number: formData.exporter_sample_number || '',
  }
  Object.assign(
    contract,
    suggestContractRefs(previous ?? mother, previous ? before ?? mother : undefined),
  )
  return contract
}

// ---------- Mother Contract Summary (fixed at top) ----------

function MotherContractSummary({ formData }: { formData: StepComponentProps['formData'] }) {
  let shipmentLabel = ''
  if (formData.shipment_month) {
    const [year, month] = formData.shipment_month.split('-')
    shipmentLabel = `${MONTH_NAMES[parseInt(month) - 1] || month} ${year} shpt`
  }

  // "320 × 60 kg jute bags (19.2 MT) | February 2026 shpt" — the same line the
  // certificate prints, so bulk reads as containers here too.
  const quantityParts = [formatFormQuantity(formData), shipmentLabel].filter(Boolean) as string[]

  const sampleType = (formData.sample_type || '').toUpperCase()

  // Helper to render entity with dash-separated contract ref
  const Entity = ({ label, value, ref: contractRef }: { label: string; value?: string; ref?: string }) => {
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
    <div className="bg-muted/50 border rounded-xl p-4 space-y-2 sticky top-0 z-10">
      {/* Top: Wolthers left */}
      {formData.wolthers_contract_nr && (
        <div className="text-xs font-mono text-muted-foreground">
          Wolthers {formData.wolthers_contract_nr}
        </div>
      )}

      {/* Entities: Seller/Shipper | Importer/Roaster | QC Client/End Client */}
      <div className="grid grid-cols-3 gap-x-5 gap-y-1">
        <Entity label={formData.same_seller_shipper ? 'Seller/Shipper' : 'Seller'} value={formData.seller} ref={formData.seller_contract_nr} />
        <Entity label="Importer" value={formData.importer} ref={formData.importer_contract_nr} />
        {formData.qc_client ? (
          <Entity label="QC Client" value={formData.qc_client} ref={formData.qc_client_contract_nr} />
        ) : <div />}

        {!formData.same_seller_shipper && (
          <Entity label="Shipper" value={formData.shipper} ref={formData.supplier_contract_nr} />
        )}
        {formData.same_seller_shipper && <div />}
        {formData.roaster ? (
          <Entity label="Roaster" value={formData.roaster} ref={formData.roaster_contract_nr} />
        ) : <div />}
        {formData.end_client ? (
          <Entity label="End Client" value={formData.end_client} ref={formData.end_client_contract_nr} />
        ) : <div />}
      </div>

      {/* Bottom: PSS/SS badge + info on left, quantity on right */}
      <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/50">
        <div className="flex items-center gap-2">
          {sampleType && <Badge variant="outline" className="text-[10px]">{sampleType}</Badge>}
          {formData.sample_type === 'pss' && formData.exporter_sample_number && (
            <span className="font-mono">{formData.exporter_sample_number}</span>
          )}
          {formData.sample_type === 'ss' && formData.ico_number && (
            <span>ICO: {formData.ico_number}</span>
          )}
          {formData.sample_type === 'ss' && formData.container_nr && (
            <>
              {formData.ico_number && <span className="text-muted-foreground">|</span>}
              <span>Container: {formData.container_nr}</span>
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

// ---------- Main ContractsStep ----------

interface ContractsStepProps extends StepComponentProps {
  onAddContract: () => void
  onRemoveContract: (index: number) => void
}

export function ContractsStep({
  formData,
  updateFormData,
  importers = [],
  roasters = [],
  qcClients = [],
  onAddContract,
  onRemoveContract,
}: ContractsStepProps) {
  const contracts = formData.contracts
  const [openItems, setOpenItems] = useState<string[]>(
    contracts.length > 0 ? [`contract-${contracts.length - 1}`] : []
  )
  const prevLengthRef = useRef(contracts.length)

  // Auto-open newly added contract
  useEffect(() => {
    if (contracts.length > prevLengthRef.current) {
      setOpenItems(prev => [...prev, `contract-${contracts.length - 1}`])
    }
    prevLengthRef.current = contracts.length
  }, [contracts.length])

  // Deduplicated importer options
  const importerOptions = useMemo(() => {
    const seen = new Set<string>()
    return importers
      .filter((i: any) => { if (!i.name || seen.has(i.name)) return false; seen.add(i.name); return true })
      .map((i: any) => ({ name: i.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [importers])

  // Merged importer options (QC clients + importers)
  const mergedImporterOptions = useMemo(() => {
    const clientOptions = qcClients.map(c => ({ name: c.fantasy_name || c.company }))
    const seen = new Set<string>()
    return [...clientOptions, ...importerOptions]
      .filter(opt => { const key = opt.name.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [qcClients, importerOptions])

  // Deduplicated roaster options
  const roasterOptions = useMemo(() => {
    const seen = new Set<string>()
    return roasters
      .filter(r => { if (!r.name || seen.has(r.name)) return false; seen.add(r.name); return true })
      .map(r => ({ name: r.name! }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [roasters])

  // updateFormData replaces the whole array, so two calls from one handler
  // (bag type + weight reset, containers + MT) would each start from the
  // render's stale `contracts` and the second would undo the first. Route
  // every write through a ref that carries the latest array within a tick.
  const contractsRef = useRef(contracts)
  contractsRef.current = contracts
  const updateContractField = (index: number, field: keyof SubContractFormData, value: string | boolean) => {
    const updated = [...contractsRef.current]
    updated[index] = { ...updated[index], [field]: value }
    contractsRef.current = updated
    updateFormData('contracts', updated)
  }

  // Auto-assign bag weight when bag_type changes. Bulk keeps its conventional
  // 21600 kg "bag" for the trigger and legacy readers; the containers + MT
  // inputs are what the user actually fills in.
  useEffect(() => {
    if (contracts.length === 0) return
    const updated = contracts.map(c => {
      if (!c.bag_type) return c
      let weight = ''
      if (c.bag_type === 'big_bag') weight = '1000'
      else if (c.bag_type === 'bulk') weight = '21600'
      else if (c.bag_type === 'jute_bag' || c.bag_type === 'pp_bag') {
        weight = formData.origin?.toLowerCase() === 'brazil' ? '60' : '70'
      }
      if (!weight || c.bag_weight_kg === weight) return c
      return { ...c, bag_weight_kg: weight }
    })
    if (JSON.stringify(updated) !== JSON.stringify(contracts)) {
      updateFormData('contracts', updated)
    }
  }, [contracts.map(c => c.bag_type).join(',')])

  // Derive what the user does not type: bulk gets bag_count = the 60 kg
  // equivalent from containers + MT (the invariant every report relies on);
  // bags get MT + equivalent from count × weight. Writing back only when a
  // value changes keeps the effect from chasing its own updates.
  useEffect(() => {
    if (contracts.length === 0) return
    const updated = contracts.map(c => {
      const q = contractQuantities(c)
      const next = c.bag_type === 'bulk'
        ? {
            ...c,
            bag_count: q.bag_count ? String(q.bag_count) : '',
            equivalent_60kg_bags: q.equivalent_60kg_bags ? String(q.equivalent_60kg_bags) : '',
            bag_weight_kg: String(q.bag_weight_kg),
          }
        : {
            ...c,
            bags_quantity_mt: q.bags_quantity_mt != null ? q.bags_quantity_mt.toFixed(3) : '',
            equivalent_60kg_bags: q.equivalent_60kg_bags != null ? String(q.equivalent_60kg_bags) : '',
          }
      return JSON.stringify(next) === JSON.stringify(c) ? c : next
    })
    if (JSON.stringify(updated) !== JSON.stringify(contracts)) {
      updateFormData('contracts', updated)
    }
  }, [contracts.map(c => `${c.bag_type}|${c.bag_count}|${c.bag_weight_kg}|${c.container_count}|${c.bags_quantity_mt}`).join(',')])

  return (
    <div className="space-y-4">
      <MotherContractSummary formData={formData} />

      {contracts.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No sub-contracts yet. Click &ldquo;+ Add Sub-Contract&rdquo; below to add one.
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
                  {formatFormQuantity(contract) && (
                    <span className="text-xs text-muted-foreground ml-auto">{formatFormQuantity(contract)}</span>
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
                  origin={formData.origin}
                  sampleType={formData.sample_type}
                  sellerName={formData.seller || ''}
                />
                <div className="flex justify-end pt-2 pb-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveContract(idx)}
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
  )
}

// ---------- Contract Panel (form for a single sub-contract) ----------

export function ContractPanel({
  contract,
  updateContract,
  importerOptions,
  mergedImporterOptions,
  roasterOptions,
  qcClients,
  origin,
  sellerName,
  lockQcClient,
}: {
  contract: SubContractFormData
  updateContract: (field: keyof SubContractFormData, value: string | boolean) => void
  importerOptions: { name: string }[]
  mergedImporterOptions: { name: string }[]
  roasterOptions: { name: string }[]
  qcClients: Client[]
  origin: string
  /** Accepted for callers; the panel no longer branches on it (a bulk PSS needs its container fields too). */
  sampleType?: string
  sellerName?: string
  lockQcClient?: boolean
}) {
  const [showDestination, setShowDestination] = useState(
    !!(contract.roaster || contract.end_client)
  )

  const dropdownOptions = contract.importer_is_qc_client ? mergedImporterOptions : importerOptions
  const isBulk = contract.bag_type === 'bulk'
  const quantityLine = formatFormQuantity(contract)
  const [showQuantity, setShowQuantity] = useState(
    !!(contract.bag_type || contract.bag_count)
  )
  const [customWeight, setCustomWeight] = useState(false)
  const availableWeights = contract.bag_type ? BAG_WEIGHTS[contract.bag_type] || [] : []

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[180px_1px_1fr_1px_1fr] gap-4">
        {/* Column 1: References */}
        <div className="space-y-2.5">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Sample nr</Label>
            <Input
              value={contract.exporter_sample_number}
              onChange={(e) => updateContract('exporter_sample_number', e.target.value)}
              placeholder="Sample ref."
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Wolthers contract</Label>
            <Input
              value={contract.wolthers_contract_nr}
              onChange={(e) => updateContract('wolthers_contract_nr', e.target.value)}
              placeholder="Wolthers ref."
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">{sellerName || 'Supplier ref.'}</Label>
            <Input
              value={contract.supplier_contract_nr}
              onChange={(e) => updateContract('supplier_contract_nr', e.target.value)}
              placeholder="Ref."
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Vertical separator */}
        <div className="bg-border" />

        {/* Column 2: Importer + QC Client */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Label className="text-xs text-muted-foreground">Importer</Label>
              <div className="flex items-center gap-1">
                <Checkbox
                  checked={contract.importer_is_qc_client}
                  onCheckedChange={(checked) => updateContract('importer_is_qc_client', checked as boolean)}
                  className="h-3 w-3"
                  disabled={lockQcClient}
                />
                <Label className="text-[10px] cursor-pointer text-muted-foreground">=QC Client</Label>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_100px] gap-2">
              <Select
                value={contract.importer || 'none'}
                onValueChange={(value) => updateContract('importer', value === 'none' ? '' : value)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select...</SelectItem>
                  {dropdownOptions.map((opt) => (
                    <SelectItem key={opt.name} value={opt.name}>{opt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={contract.buyer_contract_nr}
                onChange={(e) => updateContract('buyer_contract_nr', e.target.value)}
                placeholder="Ref."
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* QC Client (when importer != QC Client) */}
          {!contract.importer_is_qc_client && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">QC Client</Label>
              <div className="grid grid-cols-[1fr_100px] gap-2">
                <Select
                  value={contract.qc_client || 'none'}
                  onValueChange={(value) => updateContract('qc_client', value === 'none' ? '' : value)}
                  disabled={lockQcClient}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select...</SelectItem>
                    {qcClients.map((c) => (
                      <SelectItem key={c.id} value={c.fantasy_name || c.company}>
                        {c.fantasy_name || c.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={contract.qc_client_contract_nr}
                  onChange={(e) => updateContract('qc_client_contract_nr', e.target.value)}
                  placeholder="Ref."
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Vertical separator */}
        <div className="bg-border" />

        {/* Column 3: Roaster & End Client (collapsible) */}
        <div>
          <button
            type="button"
            onClick={() => setShowDestination(!showDestination)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showDestination ? '' : '-rotate-90'}`} />
            Roaster & End Client
          </button>
          {showDestination && (
            <div className="mt-2 space-y-2">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Roaster</Label>
                <div className="grid grid-cols-[1fr_80px] gap-2">
                  <Select
                    value={contract.roaster || 'none'}
                    onValueChange={(value) => updateContract('roaster', value === 'none' ? '' : value)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select...</SelectItem>
                      {roasterOptions.map((opt) => (
                        <SelectItem key={opt.name} value={opt.name}>{opt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={contract.roaster_contract_nr}
                    onChange={(e) => updateContract('roaster_contract_nr', e.target.value)}
                    placeholder="Ref."
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">End Client</Label>
                <div className="grid grid-cols-[1fr_80px] gap-2">
                  <Select
                    value={contract.end_client || 'none'}
                    onValueChange={(value) => updateContract('end_client', value === 'none' ? '' : value)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select...</SelectItem>
                      {qcClients.map((c) => (
                        <SelectItem key={c.id} value={c.fantasy_name || c.company}>
                          {c.fantasy_name || c.company}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={contract.end_client_contract_nr}
                    onChange={(e) => updateContract('end_client_contract_nr', e.target.value)}
                    placeholder="Ref."
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ICO & Container — for PSS too: a bulk PSS ships in containers */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">ICO Number</Label>
          <Input
            value={contract.ico_number}
            onChange={(e) => updateContract('ico_number', e.target.value)}
            placeholder="ICO number"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Container Nr.</Label>
          <Input
            value={contract.container_nr}
            onChange={(e) => updateContract('container_nr', e.target.value)}
            placeholder="Container nr."
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Quantity & Shipment (collapsible) */}
      <div className="border-t pt-2">
        <button
          type="button"
          onClick={() => setShowQuantity(!showQuantity)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${showQuantity ? '' : '-rotate-90'}`} />
          Quantity & Shipment
          {quantityLine && (
            <span className="ml-2 font-medium text-foreground">{quantityLine}</span>
          )}
        </button>
        {showQuantity && (
          <div className="mt-3 space-y-3">
            <div className={`grid gap-3 ${isBulk ? 'grid-cols-[1.2fr_0.6fr_0.7fr_1fr_1.4fr]' : 'grid-cols-[1.2fr_0.6fr_0.8fr_1.4fr]'}`}>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Bag Type</Label>
                <Select
                  value={contract.bag_type || 'none'}
                  onValueChange={(value) => {
                    const nextType = value === 'none' ? '' : value
                    updateContract('bag_type', nextType)
                    updateContract('bag_weight_kg', '')
                    // Bulk derives its bag count from the MT while bags derive
                    // their MT from the count, so crossing that line resets the
                    // pair rather than carrying one meaning into the other.
                    if (nextType === 'bulk' || isBulk) {
                      updateContract('bag_count', '')
                      updateContract('bags_quantity_mt', '')
                      updateContract('equivalent_60kg_bags', '')
                    }
                    setCustomWeight(false)
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select...</SelectItem>
                    <SelectItem value="jute_bag">Jute Bag</SelectItem>
                    <SelectItem value="pp_bag">PP Bag</SelectItem>
                    <SelectItem value="big_bag">Big Bag (1 M/T)</SelectItem>
                    <SelectItem value="bulk">Bulk</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isBulk ? (
                <BulkQuantityFields
                  containers={contract.container_count}
                  mt={contract.bags_quantity_mt}
                  onChange={(next) => {
                    updateContract('container_count', next.container_count)
                    updateContract('bags_quantity_mt', next.bags_quantity_mt)
                  }}
                />
              ) : (
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Qty of Bags</Label>
                  <Input
                    type="number"
                    min="1"
                    value={contract.bag_count}
                    onChange={(e) => updateContract('bag_count', e.target.value)}
                    placeholder="e.g., 300"
                    className="h-8 text-sm"
                  />
                </div>
              )}

              {!isBulk && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Bag Weight</Label>
                  {!customWeight && contract.bag_type ? (
                    <Select
                      value={contract.bag_weight_kg || 'none'}
                      onValueChange={(value) => {
                        if (value === 'custom') {
                          setCustomWeight(true)
                          updateContract('bag_weight_kg', '')
                        } else {
                          updateContract('bag_weight_kg', value === 'none' ? '' : value)
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select...</SelectItem>
                        {availableWeights.map((w) => (
                          <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                        ))}
                        <SelectItem value="custom">Custom...</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="space-y-1">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={contract.bag_weight_kg}
                        onChange={(e) => updateContract('bag_weight_kg', e.target.value)}
                        placeholder="kg"
                        className="h-8 text-sm"
                      />
                      {contract.bag_type && (
                        <button
                          type="button"
                          onClick={() => { setCustomWeight(false); updateContract('bag_weight_kg', '') }}
                          className="text-[10px] text-primary hover:underline"
                        >
                          Standard weights
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Shipment Month</Label>
                <div className="flex">
                  <Select
                    value={contract.shipment_month?.split('-')[1] || String(new Date().getMonth() + 1).padStart(2, '0')}
                    onValueChange={(month) => {
                      const year = contract.shipment_month?.split('-')[0] || new Date().getFullYear().toString()
                      updateContract('shipment_month', `${year}-${month}`)
                    }}
                  >
                    <SelectTrigger className="rounded-r-none border-r-0 h-8 text-sm w-[75px]">
                      <SelectValue placeholder="Mon" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={contract.shipment_month?.split('-')[0] || new Date().getFullYear().toString()}
                    onValueChange={(year) => {
                      const month = contract.shipment_month?.split('-')[1] || String(new Date().getMonth() + 1).padStart(2, '0')
                      updateContract('shipment_month', `${year}-${month}`)
                    }}
                  >
                    <SelectTrigger className="rounded-l-none h-8 text-sm w-[85px]">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {YEARS.map((y) => (
                        <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {quantityLine && (
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{quantityLine}</span>
                {!isBulk && contract.equivalent_60kg_bags && (
                  <span><strong>{contract.equivalent_60kg_bags}</strong> equiv. 60kg bags</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}

export { createEmptyContract }
