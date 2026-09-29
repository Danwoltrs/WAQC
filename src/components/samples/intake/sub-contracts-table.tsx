'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { sellerRefIsImporterRef, SELLER_REF_IS_IMPORTER_REF_WARNING } from '@/lib/contract-intake-mapping'
import { IcoNumberInput } from '../ico-number-input'
import { ContractNumberInput } from './contract-number-input'
import { PartySelect } from './party-select'
import { QuantityInputs } from './quantity-inputs'
import { contractQuantities, quantityIssues, standardBagWeight } from './quantity-model'
import { useSubContractLookup } from './sub-contract-lookup'
import type { StepComponentProps, SubContractFormData } from './types'

/** Column template of the wide layout; below `xl` each row stacks as a small form. */
const WIDE_COLUMNS =
  'xl:grid-cols-[2.75rem_minmax(8rem,1fr)_minmax(10rem,1.3fr)_minmax(7rem,0.9fr)_minmax(7rem,0.9fr)_minmax(9rem,1fr)_minmax(8rem,1fr)_minmax(7.5rem,0.9fr)_5.5rem]'

const HEADERS = ['#', 'Wolthers contract', 'Importer', 'Importer ref.', 'Sample nr', 'ICO number', 'Container nr.', 'Quantity', '']

type Options = { key: string; name: string }[]

interface SubContractsTableProps extends StepComponentProps {
  onAddContract: () => void
  onRemoveContract: (index: number) => void
}

/**
 * The other contracts this physical sample covers, one row each; every row
 * becomes a sample (and a certificate) of its own. The fields a contract
 * usually differs by sit in the row; the rest of the contract (seller ref,
 * QC client, roaster, end client, bag kind, weight, shipment) opens under
 * "More". Adding is one click, and Enter in a row moves to the next row,
 * adding one after the last, so several contracts are typed in one go.
 */
export function SubContractsTable({
  formData,
  updateFormData,
  importers = [],
  roasters = [],
  qcClients = [],
  onAddContract,
  onRemoveContract,
}: SubContractsTableProps) {
  const contracts = formData.contracts
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])
  const prevLength = useRef(contracts.length)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // A new row comes into view with the cursor in its Wolthers contract.
  useEffect(() => {
    if (contracts.length > prevLength.current) {
      const idx = contracts.length - 1
      requestAnimationFrame(() => {
        const row = rowRefs.current[idx]
        row?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
        row?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
      })
    }
    prevLength.current = contracts.length
  }, [contracts.length])

  const importerOptions = useMemo<Options>(() => {
    const seen = new Set<string>()
    return importers
      .filter((i: any) => { if (!i.name || seen.has(i.name)) return false; seen.add(i.name); return true })
      .map((i: any) => ({ key: i.name, name: i.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [importers])

  // QC clients + importers, for a row whose importer is the QC client.
  const mergedImporterOptions = useMemo<Options>(() => {
    const seen = new Set<string>()
    return [...qcClients.map((c) => ({ key: c.fantasy_name || c.company, name: c.fantasy_name || c.company })), ...importerOptions]
      .filter((opt) => { const key = opt.name.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [qcClients, importerOptions])

  const roasterOptions = useMemo<Options>(() => {
    const seen = new Set<string>()
    return roasters
      .filter((r) => { if (!r.name || seen.has(r.name)) return false; seen.add(r.name); return true })
      .map((r) => ({ key: r.name!, name: r.name! }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [roasters])

  // updateFormData replaces the whole array, so two calls from one handler
  // (bag type + weight reset, a contract's sys fill) would each start from the
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

  // A row whose bag type arrived without a weight (a contract found on sys
  // maps the type only) takes the type's standard weight, open or not. A
  // weight already there — copied from the sample, or typed — is kept.
  useEffect(() => {
    if (contracts.length === 0) return
    const updated = contracts.map((c) => {
      if (!c.bag_type || c.bag_weight_kg) return c
      const weight = standardBagWeight(c.bag_type, formData.origin)
      return weight ? { ...c, bag_weight_kg: weight } : c
    })
    if (updated.some((c, i) => c !== contracts[i])) updateFormData('contracts', updated)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts.map((c) => `${c.bag_type}|${c.bag_weight_kg}`).join(',')])

  const toggle = (idx: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })

  const remove = (idx: number) => {
    onRemoveContract(idx)
    setExpanded((prev) => new Set([...prev].filter((i) => i !== idx).map((i) => (i > idx ? i - 1 : i))))
  }

  // Enter in a row: the next row's first field, or a new row after the last.
  const enterFrom = (idx: number) => {
    if (idx >= contracts.length - 1) onAddContract()
    else rowRefs.current[idx + 1]?.querySelector<HTMLInputElement>('input')?.focus()
  }

  const qcClientOptions: Options = qcClients.map((c) => ({ key: c.id, name: c.fantasy_name || c.company }))

  return (
    <section aria-labelledby="sub-contracts-title" data-enter-scope className="space-y-3">
      <div>
        <h3 id="sub-contracts-title" className="text-sm font-semibold">
          Sub-contracts
          {contracts.length > 0 && <span className="ml-1.5 font-normal text-muted-foreground">({contracts.length})</span>}
        </h3>
        <p className="text-xs text-muted-foreground">
          Other contracts this same sample covers. Each becomes its own sample and certificate.
          {contracts.length > 0 && ' Enter moves to the next row, and adds one after the last.'}
        </p>
      </div>

      <div role="table" aria-label="Sub-contracts" className="overflow-hidden rounded-lg border bg-card">
        {contracts.length > 0 && (
          <div role="row" className={cn('hidden h-9 items-center gap-2 border-b bg-muted/60 px-3 xl:grid', WIDE_COLUMNS)}>
            {HEADERS.map((h, i) => (
              <div key={i} role="columnheader" className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{h}</div>
            ))}
          </div>
        )}

        {contracts.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No sub-contracts. If this sample covers more contracts, add one row per contract.
          </div>
        ) : (
          contracts.map((contract, idx) => (
            <SubContractRow
              key={idx}
              ref={(el) => { rowRefs.current[idx] = el }}
              index={idx}
              contract={contract}
              updateContract={(field, value) => updateContractField(idx, field, value)}
              expanded={expanded.has(idx)}
              onToggle={() => toggle(idx)}
              onRemove={() => remove(idx)}
              onEnter={() => enterFrom(idx)}
              importerOptions={contract.importer_is_qc_client ? mergedImporterOptions : importerOptions}
              roasterOptions={roasterOptions}
              qcClientOptions={qcClientOptions}
              origin={formData.origin}
              sellerName={formData.seller || ''}
              lotQuality={{ specId: formData.quality_spec_id || null, contractText: formData.selected_contract?.quality_description ?? null }}
              lotQualityName={formData.quality_name}
            />
          ))
        )}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={onAddContract}>
        <Plus className="h-4 w-4" />
        Add sub-contract
      </Button>
    </section>
  )
}

/** Visible label on the stacked layout; the column header says it on the wide one. */
function CellLabel({ children }: { children: string }) {
  return <span className="mb-1 block text-xs text-muted-foreground xl:sr-only">{children}</span>
}

const hasTypedData = (c: SubContractFormData) =>
  [c.wolthers_contract_nr, c.buyer_contract_nr, c.supplier_contract_nr, c.roaster_contract_nr, c.qc_client_contract_nr, c.end_client_contract_nr]
    .some((v) => (v ?? '').trim() !== '')

interface SubContractRowProps {
  index: number
  contract: SubContractFormData
  updateContract: (field: keyof SubContractFormData, value: string | boolean) => void
  expanded: boolean
  onToggle: () => void
  onRemove: () => void
  onEnter: () => void
  importerOptions: Options
  roasterOptions: Options
  qcClientOptions: Options
  origin: string
  sellerName: string
  lotQuality: { specId: string | null; contractText: string | null }
  lotQualityName: string
  ref?: Ref<HTMLDivElement>
}

function SubContractRow({
  index,
  contract,
  updateContract,
  expanded,
  onToggle,
  onRemove,
  onEnter,
  importerOptions,
  roasterOptions,
  qcClientOptions,
  origin,
  sellerName,
  lotQuality,
  lotQualityName,
  ref,
}: SubContractRowProps) {
  const n = index + 2
  const [confirmRemove, setConfirmRemove] = useState(false)
  const { contractSeller, contractQuality, handleSelectContract, handleNumberChange } = useSubContractLookup({
    contract,
    updateContract,
    sellerName,
    lotQuality,
  })

  useEffect(() => {
    if (!confirmRemove) return
    const t = setTimeout(() => setConfirmRemove(false), 4000)
    return () => clearTimeout(t)
  }, [confirmRemove])

  const isBulk = contract.bag_type === 'bulk'
  const issues = contract.bag_type ? quantityIssues(contract) : []
  const mt = contractQuantities(contract).bags_quantity_mt
  const quantityLine = mt != null ? `${Number(mt.toFixed(3))} MT` : null

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.defaultPrevented || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.nativeEvent.isComposing) return
    const target = e.target as HTMLElement
    if (!(target instanceof HTMLInputElement) || target.getAttribute('aria-expanded') === 'true') return
    e.preventDefault()
    onEnter()
  }

  const notes = [
    contract.proposed_from === 'pss' &&
      'Proposed from the linked PSS, which covers this contract too. Remove it if this shipment does not.',
    contract.proposed_from === 'contract' &&
      'Proposed from the contract family on the system. Remove it if this sample does not cover it.',
    contract.contract_id && 'Filled from the contract on the system.',
  ].filter(Boolean) as string[]
  const warnings = [
    contractSeller && `This contract's seller is ${contractSeller}, not ${sellerName}. The lot keeps its seller.`,
    contractQuality &&
      `This contract's quality is ${contractQuality}${lotQualityName ? `, not ${lotQualityName}` : ''}. Every contract in a sample shares its quality; if it differs, enter it as a separate sample.`,
    sellerRefIsImporterRef(contract.supplier_contract_nr, contract.buyer_contract_nr) && SELLER_REF_IS_IMPORTER_REF_WARNING,
  ].filter(Boolean) as string[]

  const label = (what: string) => `${what}, sub-contract #${n}`

  return (
    <div
      ref={ref}
      role="row"
      data-field={`contract-${index}`}
      className={cn('scroll-mt-4 border-b bg-background last:border-b-0', contract.proposed_from && 'border-l-2 border-l-[#556b2f]')}
    >
      <div
        onKeyDown={onKeyDown}
        className={cn('grid grid-cols-2 gap-3 p-3 md:grid-cols-3 xl:items-start xl:gap-2 xl:py-2', WIDE_COLUMNS)}
      >
        <div role="cell" className="col-span-full flex items-center gap-2 xl:col-span-1 xl:h-9">
          <span className="text-sm font-semibold tabular-nums">#{n}</span>
          {contract.proposed_from && (
            <span className="inline-flex h-5 items-center rounded-sm border border-[#556b2f]/30 bg-[#556b2f]/10 px-1.5 text-[10.5px] font-semibold text-[#3f5122] dark:text-[#c3d196]">
              Proposed
            </span>
          )}
        </div>

        <div role="cell" className="min-w-0">
          <CellLabel>Wolthers contract</CellLabel>
          <ContractNumberInput
            value={contract.wolthers_contract_nr}
            onChange={handleNumberChange}
            onSelectContract={handleSelectContract}
            linkedContractId={contract.contract_id || null}
            placeholder="Wolthers ref."
            className="h-9 font-mono"
          />
        </div>

        <div role="cell" className="min-w-0">
          <CellLabel>Importer</CellLabel>
          <PartySelect
            value={contract.importer}
            onChange={(v) => updateContract('importer', v)}
            options={importerOptions}
            ariaLabel={label('Importer')}
          />
        </div>

        <div role="cell" className="min-w-0">
          <CellLabel>Importer ref.</CellLabel>
          <Input
            value={contract.buyer_contract_nr}
            onChange={(e) => updateContract('buyer_contract_nr', e.target.value)}
            placeholder="Importer ref."
            aria-label={label('Importer ref.')}
            className="h-9"
          />
        </div>

        <div role="cell" className="min-w-0">
          <CellLabel>Sample nr</CellLabel>
          <Input
            value={contract.exporter_sample_number}
            onChange={(e) => updateContract('exporter_sample_number', e.target.value)}
            placeholder="Sample ref."
            aria-label={label('Sample nr')}
            className="h-9"
          />
        </div>

        <div role="cell" className="min-w-0">
          <CellLabel>ICO number</CellLabel>
          <IcoNumberInput
            value={contract.ico_number}
            onChange={(e) => updateContract('ico_number', e.target.value)}
            placeholder="ICO number"
            aria-label={label('ICO number')}
            className="h-9 font-mono"
          />
        </div>

        <div role="cell" className="min-w-0">
          <CellLabel>Container nr.</CellLabel>
          <Input
            value={contract.container_nr}
            onChange={(e) => updateContract('container_nr', e.target.value)}
            placeholder="Container nr."
            aria-label={label('Container nr.')}
            className="h-9 font-mono"
          />
        </div>

        <div role="cell" className="min-w-0">
          <CellLabel>Quantity</CellLabel>
          <div className="relative">
            <Input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={contract.bag_count}
              onChange={(e) => updateContract('bag_count', e.target.value)}
              aria-label={label(isBulk ? 'Quantity in 60 kg bag equivalents' : 'Quantity of bags')}
              aria-invalid={issues.length > 0 || undefined}
              className={cn('h-9 pr-10 tabular-nums', issues.length > 0 && 'border-[#ef4444]')}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {isBulk ? 'eq.' : 'bags'}
            </span>
          </div>
          <p className={cn('mt-1 text-[11px] leading-snug', issues.length ? 'text-[#ef4444]' : 'text-muted-foreground')}>
            {issues.length ? issues.join(', ') : quantityLine ?? 'Bags or bulk under More'}
          </p>
        </div>

        {/* Row actions, visible and labelled; Remove last. */}
        <div role="cell" className="col-span-full flex items-center justify-end gap-1 xl:col-span-1 xl:h-9">
          <Button
            type="button"
            variant="ghost"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`More fields, sub-contract #${n}`}
            className="h-7 gap-1 px-2 text-xs"
          >
            More
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
          </Button>
          {confirmRemove ? (
            <Button
              type="button"
              variant="outline"
              onClick={onRemove}
              aria-label={`Confirm removing sub-contract #${n}`}
              className="h-7 border-destructive/40 px-2 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive"
            >
              Remove?
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => (hasTypedData(contract) ? setConfirmRemove(true) : onRemove())}
              aria-label={`Remove sub-contract #${n}`}
              title="Remove"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {(notes.length > 0 || warnings.length > 0) && (
        <div className="space-y-0.5 px-3 pb-2 text-[11px] leading-snug xl:pl-[3.75rem]">
          {notes.map((note) => <p key={note} className="text-[#556b2f]">{note}</p>)}
          {warnings.map((w) => <p key={w} className="text-[#b07946]">{w}</p>)}
        </div>
      )}

      {expanded && (
        <div className="space-y-5 border-t bg-muted/30 p-4 xl:pl-[3.75rem]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Seller ref.</Label>
              <Input
                value={contract.supplier_contract_nr}
                onChange={(e) => updateContract('supplier_contract_nr', e.target.value)}
                placeholder="Seller ref."
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">QC client</Label>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={contract.importer_is_qc_client}
                    onCheckedChange={(checked) => updateContract('importer_is_qc_client', checked as boolean)}
                    className="h-3.5 w-3.5"
                  />
                  Importer is the QC client
                </label>
              </div>
              {contract.importer_is_qc_client ? (
                <div className="flex h-9 items-center text-sm text-muted-foreground">The importer</div>
              ) : (
                <div className="grid grid-cols-[1fr_8rem] gap-2">
                  <PartySelect value={contract.qc_client} onChange={(v) => updateContract('qc_client', v)} options={qcClientOptions} ariaLabel={label('QC client')} />
                  <Input
                    value={contract.qc_client_contract_nr}
                    onChange={(e) => updateContract('qc_client_contract_nr', e.target.value)}
                    placeholder="QC client ref."
                    className="h-9"
                  />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Roaster</Label>
              <div className="grid grid-cols-[1fr_8rem] gap-2">
                <PartySelect value={contract.roaster} onChange={(v) => updateContract('roaster', v)} options={roasterOptions} ariaLabel={label('Roaster')} />
                <Input
                  value={contract.roaster_contract_nr}
                  onChange={(e) => updateContract('roaster_contract_nr', e.target.value)}
                  placeholder="Roaster ref."
                  className="h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">End client</Label>
              <div className="grid grid-cols-[1fr_8rem] gap-2">
                <PartySelect value={contract.end_client} onChange={(v) => updateContract('end_client', v)} options={qcClientOptions} ariaLabel={label('End client')} />
                <Input
                  value={contract.end_client_contract_nr}
                  onChange={(e) => updateContract('end_client_contract_nr', e.target.value)}
                  placeholder="End client ref."
                  className="h-9"
                />
              </div>
            </div>
          </div>
          <QuantityInputs
            value={contract}
            origin={origin}
            onChange={(patch) => {
              for (const [field, v] of Object.entries(patch)) {
                updateContract(field as keyof SubContractFormData, v as string)
              }
            }}
          />
        </div>
      )}
    </div>
  )
}
