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

const BAG_TYPE_LABELS: Record<string, string> = {
  jute_bag: 'jute bags', pp_bag: 'PP bags', big_bag: 'big bags', bulk: 'bulk',
}

function createEmptyContract(formData: StepComponentProps['formData']): SubContractFormData {
  return {
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
    shipment_month: formData.shipment_month,
    exporter_sample_number: formData.exporter_sample_number || '',
  }
}

// ---------- Mother Contract Summary (fixed at top) ----------

function MotherContractSummary({ formData }: { formData: StepComponentProps['formData'] }) {
  const shipperName = formData.same_seller_shipper ? formData.seller : formData.shipper
  const bagLabel = formData.bag_type ? BAG_TYPE_LABELS[formData.bag_type] || formData.bag_type : ''

  let shipmentLabel = ''
  if (formData.shipment_month) {
    const [year, month] = formData.shipment_month.split('-')
    shipmentLabel = `${MONTH_NAMES[parseInt(month) - 1] || month} ${year} shpt`
  }

  const quantityParts: string[] = []
  if (formData.bag_count && formData.bag_weight_kg && bagLabel) {
    quantityParts.push(`${formData.bag_count} bags in ${formData.bag_weight_kg}kg ${bagLabel}`)
  }
  // MT and shipment combined: "19.2 MT February 2026 shpt"
  const mtShipment = [
    formData.bags_quantity_mt ? `${formData.bags_quantity_mt} MT` : '',
    shipmentLabel,
  ].filter(Boolean).join(' ')
  if (mtShipment) quantityParts.push(mtShipment)

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

  const updateContractField = (index: number, field: keyof SubContractFormData, value: string | boolean) => {
    const updated = [...contracts]
    updated[index] = { ...updated[index], [field]: value }
    updateFormData('contracts', updated)
  }

  // Auto-assign bag weight when bag_type changes
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

  // Auto-calculate MT and equivalent 60kg bags
  useEffect(() => {
    if (contracts.length === 0) return
    const updated = contracts.map(c => {
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
    if (JSON.stringify(updated) !== JSON.stringify(contracts)) {
      updateFormData('contracts', updated)
    }
  }, [contracts.map(c => `${c.bag_count}|${c.bag_weight_kg}|${c.bag_type}`).join(',')])

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
  sampleType,
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
  sampleType: string
  sellerName?: string
  lockQcClient?: boolean
}) {
  const [showDestination, setShowDestination] = useState(
    !!(contract.roaster || contract.end_client)
  )

  const dropdownOptions = contract.importer_is_qc_client ? mergedImporterOptions : importerOptions
  const isPSS = sampleType === 'pss'
  const isBulk = contract.bag_type === 'bulk'
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

      {/* ICO & Container (SS only) */}
      {!isPSS && (
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
      )}

      {/* Quantity & Shipment (collapsible) */}
      <div className="border-t pt-2">
        <button
          type="button"
          onClick={() => setShowQuantity(!showQuantity)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${showQuantity ? '' : '-rotate-90'}`} />
          Quantity & Shipment
          {contract.bags_quantity_mt && parseFloat(contract.bags_quantity_mt) > 0 && (
            <span className="ml-2 font-medium text-foreground">{contract.bags_quantity_mt} MT</span>
          )}
        </button>
        {showQuantity && (
          <div className="mt-3 space-y-3">
            <div className={`grid gap-3 ${isBulk ? 'grid-cols-[1.2fr_0.7fr_1.6fr]' : 'grid-cols-[1.2fr_0.6fr_0.8fr_1.4fr]'}`}>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Bag Type</Label>
                <Select
                  value={contract.bag_type || 'none'}
                  onValueChange={(value) => {
                    updateContract('bag_type', value === 'none' ? '' : value)
                    updateContract('bag_weight_kg', '')
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

              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">
                  {isBulk ? 'Equiv. 60kg Bags' : 'Qty of Bags'}
                </Label>
                <Input
                  type="number"
                  min="1"
                  value={contract.bag_count}
                  onChange={(e) => updateContract('bag_count', e.target.value)}
                  placeholder={isBulk ? 'e.g., 360' : 'e.g., 300'}
                  className="h-8 text-sm"
                />
              </div>

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

            {contract.bags_quantity_mt && parseFloat(contract.bags_quantity_mt) > 0 && (
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span><strong>{contract.bags_quantity_mt}</strong> MT</span>
                {contract.equivalent_60kg_bags && (
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
