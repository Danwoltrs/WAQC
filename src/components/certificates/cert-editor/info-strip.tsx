'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SupplyChainEditTable } from '@/components/samples/supply-chain-edit-table'
import { ContractNumberInput, type ContractMatch } from '@/components/samples/intake/contract-number-input'
import { contractDisplayNumber } from '@/lib/contract-family'
import { EditPanel } from './ui-parts'
import { CertSample, QualityOption } from './use-cert-editor'
import { PROCESSING_METHODS } from '@/components/samples/intake/constants'
import { CertificationsField } from './certifications-field'
import { InlineEdit, InPlaceEdit, useEditLeave, type InPlaceDone } from './inline-edit'
import { IcoNumberInput } from '@/components/samples/ico-number-input'
import { CropYearField } from './crop-year-field'
import { ProcessingField } from './processing-field'
import { BulkQuantityFields } from '@/components/samples/intake/bulk-quantity-fields'
import { BULK_CONTAINER_MT, formatQuantityLine } from '@/lib/bag-quantity'
import { SectionCard } from '@/components/samples/intake/section-card'
import { QualitySuggestion, useContractQualityMatch } from '@/components/samples/intake/quality-suggestion'
import '@/components/samples/intake/intake-radius.css'

const BAG_TYPES: Record<string, string> = {
  jute_bag: 'Jute Bag',
  pp_bag: 'PP Bag',
  big_bag: 'Big Bag',
  bulk: 'Bulk',
}

const SAMPLE_TYPES: { value: string; label: string }[] = [
  { value: 'pss', label: 'PSS' },
  { value: 'ss', label: 'SS' },
  { value: 'stocklot', label: 'Stocklot' },
]

function bagTypeLabel(v?: string | null): string {
  if (!v) return '—'
  return BAG_TYPES[v] || v
}

/** The draft value once the user has touched a field, else the loaded sample's. */
function draftOr(draftSample: Record<string, any>, sample: CertSample, field: string): any {
  return draftSample[field] !== undefined ? draftSample[field] : (sample as any)[field]
}

/** The quantity columns as the tile and editors see them (legacy `bags` stands in for a missing count). */
function quantityRow(draftSample: Record<string, any>, sample: CertSample) {
  return {
    bag_type: draftOr(draftSample, sample, 'bag_type') as string | null,
    bag_count: (draftOr(draftSample, sample, 'bag_count') ?? sample.bags ?? null) as number | null,
    bag_weight_kg: draftOr(draftSample, sample, 'bag_weight_kg') as number | null,
    bags_quantity_mt: draftOr(draftSample, sample, 'bags_quantity_mt') as number | null,
    container_count: draftOr(draftSample, sample, 'container_count') as number | null,
    equivalent_60kg_bags: draftOr(draftSample, sample, 'equivalent_60kg_bags') as number | null,
  }
}

const numText = (v: unknown): string => (v === null || v === undefined || v === '' ? '' : String(v))
const intOrNull = (s: string): number | null => (s === '' ? null : parseInt(s, 10) || 0)
const floatOrNull = (s: string): number | null => (s === '' ? null : parseFloat(s) || 0)

/**
 * Switching to bulk with no container count yet: one container is the spec's
 * default, and writing it makes the MT default (containers × 21.6) and the
 * saved row agree with what the editor shows.
 */
function bulkDefaults(bagType: string, containerCount: unknown): Record<string, any> {
  if (bagType !== 'bulk' || (Number(containerCount) || 0) > 0) return {}
  return { container_count: 1 }
}

/** Containers + total MT for a bulk row; the parent stores parsed numbers, the inputs keep the typed text. */
function BulkQuantityEditor({
  containers,
  mt,
  onChange,
}: {
  containers: string
  mt: string
  onChange: (next: { container_count: number | null; bags_quantity_mt: number | null }) => void
}) {
  const [text, setText] = useState({ containers, mt })
  return (
    <BulkQuantityFields
      containers={text.containers}
      mt={text.mt}
      onChange={(next) => {
        setText({ containers: next.container_count, mt: next.bags_quantity_mt })
        onChange({ container_count: intOrNull(next.container_count), bags_quantity_mt: floatOrNull(next.bags_quantity_mt) })
      }}
    />
  )
}

/** In-place width: the control's text lines up with the value it replaces. */
const IN_PLACE = '-mx-1.5 h-7 w-[calc(100%+0.75rem)] px-1.5 text-sm font-medium'

/**
 * One in-place edit's end: Enter or leaving the field keeps what was typed,
 * Escape drops it (and stays off the overlay, which Escape would close).
 * Settles once, whichever comes first.
 */
function useInPlaceFinish(done: InPlaceDone, keep: () => void) {
  const settled = useRef(false)
  const finish = (commit: boolean, refocus = false) => {
    if (settled.current) return
    settled.current = true
    if (commit) keep()
    done({ refocus })
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      finish(true, true)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      finish(false, true)
    }
  }
  return { finish, onKeyDown, settled }
}

/** A tile's text, edited where it stands. */
function InPlaceText({
  value,
  onCommit,
  done,
  mono,
  ico,
}: {
  value: string
  onCommit: (v: string) => void
  done: InPlaceDone
  mono?: boolean
  /** An ICO mark: the cursor lands on its last segment (the lot) instead of selecting it all. */
  ico?: boolean
}) {
  const [v, setV] = useState(value)
  const boxRef = useRef<HTMLDivElement>(null)
  const { finish, onKeyDown } = useInPlaceFinish(done, () => { if (v !== value) onCommit(v) })
  useEditLeave(boxRef, () => finish(true))
  const TextInput = ico ? IcoNumberInput : Input
  return (
    <div ref={boxRef} onKeyDown={onKeyDown}>
      <TextInput
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        className={`${IN_PLACE} ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}

/**
 * The Wolthers ref, edited where it stands with intake's contract box, so any
 * of a contract's numbers (Wolthers nr, seller ref, buyer ref) finds it. A
 * pick hands the contract on, and the host sets its number and fills the
 * rest. Without a pick, what was typed is kept on Enter or on leaving the
 * field; Escape drops it. A click on a match is inside the field, so it never
 * ends the edit before the pick lands.
 */
function InPlaceContractRef({
  value,
  linkedContractId,
  onCommit,
  onPick,
  done,
}: {
  value: string
  linkedContractId: string | null
  onCommit: (v: string) => void
  onPick: (contract: ContractMatch) => void
  done: InPlaceDone
}) {
  const [v, setV] = useState(value)
  const boxRef = useRef<HTMLDivElement>(null)
  const { finish, onKeyDown, settled } = useInPlaceFinish(done, () => { if (v !== value) onCommit(v) })
  useEditLeave(boxRef, () => finish(true))
  return (
    <div ref={boxRef} onKeyDown={onKeyDown}>
      <ContractNumberInput
        autoFocus
        value={v}
        onChange={setV}
        linkedContractId={linkedContractId}
        onSelectContract={(m) => {
          if (settled.current) return
          settled.current = true
          onPick(m)
          done()
        }}
        placeholder="Contract # or ref"
        className={`${IN_PLACE} font-mono`}
      />
    </div>
  )
}

/** Bag type, picked where it stands: the value becomes the select, opened. */
function InPlaceBagType({ value, onSelect, done }: { value: string | null; onSelect: (v: string) => void; done: InPlaceDone }) {
  const options = Object.entries(BAG_TYPES)
  if (value && !BAG_TYPES[value]) options.push([value, value])
  return (
    <Select defaultOpen value={value ?? undefined} onValueChange={onSelect} onOpenChange={(o) => { if (!o) done({ refocus: true }) }}>
      <SelectTrigger className={IN_PLACE}>
        <SelectValue placeholder="Bag type" />
      </SelectTrigger>
      <SelectContent>
        {options.map(([val, label]) => (
          <SelectItem key={val} value={val}>{label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Quantity, edited where it stands: containers + MT for bulk, else bag count × bag weight. */
function InPlaceQuantity({
  draftSample,
  sample,
  onFieldChange,
  done,
}: {
  draftSample: Record<string, any>
  sample: CertSample
  onFieldChange: (field: string, value: any) => void
  done: InPlaceDone
}) {
  const row = quantityRow(draftSample, sample)
  const bulk = row.bag_type === 'bulk'
  const [start] = useState(() =>
    bulk
      ? { first: numText(row.container_count), second: numText(row.bags_quantity_mt) }
      : { first: numText(row.bag_count), second: numText(row.bag_weight_kg) },
  )
  const [first, setFirst] = useState(start.first)
  const [second, setSecond] = useState(start.second)
  const boxRef = useRef<HTMLDivElement>(null)
  const { finish, onKeyDown } = useInPlaceFinish(done, () => {
    if (first !== start.first) onFieldChange(bulk ? 'container_count' : 'bag_count', intOrNull(first))
    if (second !== start.second) onFieldChange(bulk ? 'bags_quantity_mt' : 'bag_weight_kg', floatOrNull(second))
  })
  useEditLeave(boxRef, () => finish(true))
  // A blank MT reads as the containers' default weight, as on every bulk surface.
  const suggestedMt = String(Number(((Number(first) > 0 ? Number(first) : 1) * BULK_CONTAINER_MT).toFixed(1)))
  const num = '-my-0.5 h-7 px-1.5 text-sm font-medium'
  return (
    <div ref={boxRef} onKeyDown={onKeyDown} className="-mx-1.5 flex items-center gap-1.5 text-sm">
      <Input
        autoFocus
        type="number"
        min={bulk ? '1' : '0'}
        inputMode="numeric"
        value={first}
        onChange={(e) => setFirst(e.target.value)}
        aria-label={bulk ? 'Containers' : 'Bag count'}
        className={`${num} w-20`}
      />
      <span className="text-muted-foreground">{bulk ? 'cont.' : '×'}</span>
      <Input
        type="number"
        min="0"
        step="0.1"
        inputMode="decimal"
        value={second}
        placeholder={bulk ? suggestedMt : undefined}
        onChange={(e) => setSecond(e.target.value)}
        aria-label={bulk ? 'Total MT' : 'Bag weight (kg)'}
        className={`${num} w-16`}
      />
      <span className="text-muted-foreground">{bulk ? 'MT' : 'kg'}</span>
    </div>
  )
}

/** Details band beneath the topbar — each tile is inline-editable. */
export function InfoStripBand({
  sample,
  draftSample,
  onFieldChange,
  onPickContract,
}: {
  sample: CertSample
  draftSample: Record<string, any>
  onFieldChange: (field: string, value: any) => void
  /** A contract picked in the Wolthers ref tile; the host fills parties and refs from it. */
  onPickContract?: (contract: ContractMatch) => void
}) {
  const quantity = formatQuantityLine(quantityRow(draftSample, sample))
  const isPSS = ((draftSample.sample_type ?? sample.sample_type) || '').toLowerCase() === 'pss'

  type Tile = { label: string; value: React.ReactNode; edit: (done: InPlaceDone) => React.ReactNode }
  const text = (field: string, done: InPlaceDone, opts: { mono?: boolean; ico?: boolean } = {}) => (
    <InPlaceText
      value={(draftSample[field] ?? (sample as any)[field] ?? '') as string}
      onCommit={(v) => onFieldChange(field, v)}
      done={done}
      {...opts}
    />
  )
  const tiles: Tile[] = [
    {
      label: 'Wolthers ref',
      value: draftSample.wolthers_contract_nr || sample.wolthers_contract_nr || '—',
      edit: (done) => (
        <InPlaceContractRef
          value={(draftSample.wolthers_contract_nr ?? sample.wolthers_contract_nr ?? '') as string}
          linkedContractId={sample.contract_id ?? null}
          onCommit={(v) => onFieldChange('wolthers_contract_nr', v)}
          onPick={(m) => {
            onFieldChange('wolthers_contract_nr', contractDisplayNumber(m))
            onPickContract?.(m)
          }}
          done={done}
        />
      ),
    },
    {
      label: 'Seller ref',
      value: draftSample.seller_contract_nr || sample.seller_contract_nr || '—',
      edit: (done) => text('seller_contract_nr', done),
    },
    {
      label: 'Quantity',
      value: quantity ?? '—',
      edit: (done) => <InPlaceQuantity draftSample={draftSample} sample={sample} onFieldChange={onFieldChange} done={done} />,
    },
    {
      label: 'Bag type',
      value: bagTypeLabel(draftSample.bag_type ?? sample.bag_type),
      edit: (done) => (
        <InPlaceBagType
          value={(draftSample.bag_type ?? sample.bag_type ?? null) as string | null}
          onSelect={(v) => {
            onFieldChange('bag_type', v)
            for (const [f, val] of Object.entries(bulkDefaults(v, draftOr(draftSample, sample, 'container_count')))) {
              onFieldChange(f, val)
            }
          }}
          done={done}
        />
      ),
    },
  ]
  if (isPSS) {
    tiles.push({
      label: 'Exporter sample #',
      value: draftSample.exporter_sample_number || sample.exporter_sample_number || '—',
      edit: (done) => text('exporter_sample_number', done),
    })
  } else {
    tiles.push({
      label: 'Container',
      value: draftSample.container_nr || sample.container_nr || '—',
      edit: (done) => text('container_nr', done, { mono: true }),
    })
    tiles.push({
      label: 'ICO #',
      value: draftSample.ico_number || sample.ico_number || '—',
      edit: (done) => text('ico_number', done, { mono: true, ico: true }),
    })
  }

  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
      {tiles.map((t) => (
        <div key={t.label} className="flex min-w-0 flex-col items-start gap-0.5 px-4 py-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</span>
          <InPlaceEdit
            className="min-h-7"
            display={<span className="text-sm font-medium text-foreground">{t.value}</span>}
          >
            {t.edit}
          </InPlaceEdit>
        </div>
      ))}
    </div>
  )
}

/** Compact attributes band under the strip: crop · processing · certifications, each inline-editable. */
export function AttributesLine({
  sample,
  draftSample,
  onFieldChange,
  distinctProcessing,
  onEditAll,
}: {
  sample: CertSample
  draftSample: Record<string, any>
  onFieldChange: (field: string, value: any) => void
  distinctProcessing: string[]
  onEditAll: () => void
}) {
  const crop = ((draftSample.crop_year ?? sample.crop_year) || '') as string
  const processing = ((draftSample.processing_method ?? sample.processing_method) || '') as string
  const certs: string[] = Array.isArray(draftSample.certifications)
    ? draftSample.certifications
    : Array.isArray(sample.certifications)
      ? sample.certifications
      : []

  const labelCls = 'text-[11px] uppercase tracking-wide text-muted-foreground'
  const valueCls = 'text-sm font-medium text-foreground'

  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2">
      <InlineEdit
        display={
          <span className="flex items-center gap-1.5">
            <span className={labelCls}>Crop</span>
            <span className={valueCls}>{crop || '—'}</span>
          </span>
        }
      >
        {(close) => (
          <CropYearField
            value={crop}
            onChange={(v) => {
              onFieldChange('crop_year', v)
              close()
            }}
          />
        )}
      </InlineEdit>

      <span className="text-muted-foreground">·</span>

      <InlineEdit
        display={
          <span className="flex items-center gap-1.5">
            <span className={labelCls}>Processing</span>
            <span className={valueCls}>{processing || '—'}</span>
          </span>
        }
      >
        {(close) => (
          <ProcessingField
            value={processing}
            distinct={distinctProcessing}
            onChange={(v) => {
              onFieldChange('processing_method', v)
              close()
            }}
          />
        )}
      </InlineEdit>

      <span className="text-muted-foreground">·</span>

      <InlineEdit
        contentClassName="w-72 p-3"
        display={
          <span className="flex flex-wrap items-center gap-1">
            {certs.length ? (
              certs.map((c, i) => (
                <span
                  key={`${c}-${i}`}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground"
                >
                  {c}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-muted-foreground">No certifications</span>
            )}
          </span>
        }
      >
        {() => (
          <CertificationsField
            sampleId={sample.id}
            value={certs}
            onChange={(next) => onFieldChange('certifications', next)}
          />
        )}
      </InlineEdit>

      <button
        type="button"
        onClick={onEditAll}
        className="ml-auto text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
      >
        Edit all details
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

/**
 * Full "Edit details" panel, laid out like the intake's Step 2 (2026-09-29):
 * four cards in two columns, the sample's references and its supply chain on
 * the left, quality and quantity on the right, each opening the rest of its
 * fields under "All fields". The quality card shows what the sample's sys
 * contract says and offers its specification with one click; it never
 * changes a saved quality by itself.
 */
export function DetailsEditPanel({
  open,
  sample,
  draftSample,
  qualityOptions,
  saving,
  onCancel,
  onApply,
  onPickContract,
}: {
  open: boolean
  sample: CertSample
  draftSample: Record<string, any>
  qualityOptions: QualityOption[]
  saving?: boolean
  onCancel: () => void
  onApply: (next: Record<string, any>) => void
  /**
   * A contract picked in the supply chain's Wolthers row. Its edits go to this
   * panel's own form through `apply`, so Save carries them with the rest.
   */
  onPickContract?: (
    contract: ContractMatch,
    current: Record<string, any>,
    apply: (field: string, value: any) => void,
  ) => void
}) {
  const [form, setForm] = useState<Record<string, any>>(() => ({ ...draftSample }))
  const set = (field: string, value: any) => setForm((prev) => ({ ...prev, [field]: value }))
  const isBulk = form.bag_type === 'bulk'

  // The contract whose quality is suggested: one picked here, else the
  // sample's own link.
  const [pickedContractId, setPickedContractId] = useState<string | null>(null)
  const contractId = pickedContractId ?? form.contract_id ?? (sample as any).contract_id ?? null
  const contractQuality = useContractQualityMatch(open ? contractId : null)

  // The held spec is always an option, so the select never shows blank over it.
  const specOptions: QualityOption[] =
    form.quality_spec_id && !qualityOptions.some((q) => q.id === form.quality_spec_id)
      ? [{ id: form.quality_spec_id, custom_name: form.quality_name || (sample as any).quality_name || 'Selected specification', quality_code: null }, ...qualityOptions]
      : qualityOptions
  const applyQuality = (id: string, label: string | null) =>
    setForm((prev) => ({ ...prev, quality_spec_id: id, ...(label ? { quality_name: label } : {}) }))

  return (
    <EditPanel open={open} title="Edit details" onCancel={onCancel} onSave={() => onApply(form)} saving={saving} wide="xl">
      {/* Same cards as the intake, so the same corners (intake-radius.css). */}
      <div data-new-corners className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          {/* The sample's own identifiers first: a duplicate is corrected
              here (a new container number, the ICO's last segment). */}
          <SectionCard title="Sample references" description="The sample's own identifiers, as on its label.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Exporter sample #">
                <Input value={form.exporter_sample_number ?? ''} onChange={(e) => set('exporter_sample_number', e.target.value)} className="h-9" />
              </Field>
              <Field label="ICO #">
                <IcoNumberInput value={form.ico_number ?? ''} onChange={(e) => set('ico_number', e.target.value)} className="h-9 font-mono" />
              </Field>
              <Field label="Container #">
                <Input value={form.container_nr ?? ''} onChange={(e) => set('container_nr', e.target.value)} className="h-9 font-mono" />
              </Field>
            </div>
          </SectionCard>

          <SectionCard
            title="Supply chain and contract"
            defaultOpen={!!form.supplier}
            more={
              <Field label="Supplier (farm / coop)">
                <Input value={form.supplier ?? ''} onChange={(e) => set('supplier', e.target.value)} className="h-9" />
              </Field>
            }
          >
            <SupplyChainEditTable
              sample={sample as any}
              isEditMode
              formData={form}
              onFormChange={set}
              onPickContract={
                onPickContract
                  ? (m) => {
                      setPickedContractId(m.id)
                      onPickContract(m, form, set)
                    }
                  : undefined
              }
            />
          </SectionCard>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard
            title="Quality"
            defaultOpen={!!(form.micro_origin || form.processing_method || form.certifications?.length)}
            more={
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Micro origin">
                    <Input value={form.micro_origin ?? ''} onChange={(e) => set('micro_origin', e.target.value)} className="h-9" />
                  </Field>
                  <Field label="Processing">
                    <Select value={(form.processing_method || '').toString()} onValueChange={(v) => set('processing_method', v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select processing" />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const cur = (form.processing_method || '').toString()
                          const opts = [...PROCESSING_METHODS]
                          if (cur && !opts.includes(cur)) opts.push(cur)
                          return opts
                        })().map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Certifications">
                  <CertificationsField
                    sampleId={sample.id}
                    value={Array.isArray(form.certifications) ? form.certifications : []}
                    onChange={(next) => set('certifications', next)}
                  />
                </Field>
              </div>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sample type">
                <Select value={(form.sample_type || '').toString()} onValueChange={(v) => set('sample_type', v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const cur = (form.sample_type || '').toString()
                      const opts = [...SAMPLE_TYPES]
                      if (cur && !opts.some((t) => t.value === cur)) {
                        opts.push({ value: cur, label: cur.charAt(0).toUpperCase() + cur.slice(1) })
                      }
                      return opts
                    })().map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Quality">
                <Select value={form.quality_spec_id || ''} onValueChange={(v) => set('quality_spec_id', v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select quality" />
                  </SelectTrigger>
                  <SelectContent>
                    {specOptions.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.custom_name}
                        {q.quality_code ? ` (${q.quality_code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <QualitySuggestion
                  match={contractQuality?.match}
                  contractLabel={contractQuality?.contractLabel}
                  currentSpecId={form.quality_spec_id}
                  onUse={applyQuality}
                />
              </div>
              <Field label="Origin">
                <Input value={form.origin ?? ''} onChange={(e) => set('origin', e.target.value)} className="h-9" />
              </Field>
              <Field label="Crop year">
                <Input value={form.crop_year ?? ''} onChange={(e) => set('crop_year', e.target.value)} placeholder="e.g. 25/26" className="h-9" />
              </Field>
            </div>
          </SectionCard>

          <SectionCard
            title="Quantity and shipment"
            defaultOpen={!!form.storage_position}
            more={
              <Field label="Warehouse location">
                <Input value={form.storage_position ?? ''} onChange={(e) => set('storage_position', e.target.value)} placeholder="e.g. A1-B2" className="h-9" />
              </Field>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bag type">
                <Select
                  value={form.bag_type || ''}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, bag_type: v, ...bulkDefaults(v, prev.container_count) }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select bag type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(BAG_TYPES).map(([v, label]) => (
                      <SelectItem key={v} value={v}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Shipment month">
                <Input type="month" value={form.shipment_month ?? ''} onChange={(e) => set('shipment_month', e.target.value)} className="h-9" />
              </Field>
              {isBulk ? (
                <BulkQuantityEditor
                  key="bulk"
                  containers={numText(form.container_count)}
                  mt={numText(form.bags_quantity_mt)}
                  onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
                />
              ) : (
                <>
                  <Field label="Bag count">
                    <Input type="number" min="0" inputMode="numeric" value={form.bag_count ?? ''} onChange={(e) => set('bag_count', intOrNull(e.target.value))} className="h-9" />
                  </Field>
                  <Field label="Bag weight (kg)">
                    <Input type="number" min="0" step="0.1" inputMode="decimal" value={form.bag_weight_kg ?? ''} onChange={(e) => set('bag_weight_kg', floatOrNull(e.target.value))} className="h-9" />
                  </Field>
                </>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </EditPanel>
  )
}
