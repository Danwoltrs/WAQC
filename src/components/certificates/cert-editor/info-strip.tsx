'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SupplyChainEditTable } from '@/components/samples/supply-chain-edit-table'
import { EditPanel } from './ui-parts'
import { CertSample, QualityOption } from './use-cert-editor'
import { PROCESSING_METHODS } from '@/components/samples/intake/constants'
import { CertificationsField } from './certifications-field'
import { InlineEdit } from './inline-edit'
import { CropYearField } from './crop-year-field'
import { ProcessingField } from './processing-field'

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

/** Single-line text editor for a tile; commits on Enter or blur. */
function InlineTextEditor({
  value,
  onCommit,
  mono,
}: {
  value: string
  onCommit: (v: string) => void
  mono?: boolean
}) {
  const [v, setV] = useState(value)
  return (
    <Input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit(v)
        }
      }}
      onBlur={() => onCommit(v)}
      className={`h-8 w-48 ${mono ? 'font-mono' : ''}`}
    />
  )
}

/** Bag-type option list (value → label). */
function BagTypeEditor({ onSelect }: { onSelect: (value: string) => void }) {
  return (
    <div className="flex w-48 flex-col gap-0.5">
      {Object.entries(BAG_TYPES).map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => onSelect(val)}
          className="rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60"
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** Quantity editor: bag count + weight; stays open while typing. */
function QuantityEditor({
  draftSample,
  sample,
  onFieldChange,
}: {
  draftSample: Record<string, any>
  sample: CertSample
  onFieldChange: (field: string, value: any) => void
}) {
  const count = draftSample.bag_count ?? sample.bag_count ?? sample.bags ?? ''
  const weight = draftSample.bag_weight_kg ?? sample.bag_weight_kg ?? ''
  return (
    <div className="flex w-56 flex-col gap-2 p-2">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Bag count</label>
        <Input
          type="number"
          min="0"
          inputMode="numeric"
          value={count}
          onChange={(e) => onFieldChange('bag_count', e.target.value === '' ? null : parseInt(e.target.value, 10) || 0)}
          className="h-8"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Bag weight (kg)</label>
        <Input
          type="number"
          min="0"
          step="0.1"
          inputMode="decimal"
          value={weight}
          onChange={(e) => onFieldChange('bag_weight_kg', e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
          className="h-8"
        />
      </div>
    </div>
  )
}

/** Details band beneath the topbar — each tile is inline-editable. */
export function InfoStripBand({
  sample,
  draftSample,
  onFieldChange,
}: {
  sample: CertSample
  draftSample: Record<string, any>
  onFieldChange: (field: string, value: any) => void
}) {
  const bagCount = draftSample.bag_count ?? sample.bag_count ?? sample.bags
  const bagWeight = draftSample.bag_weight_kg ?? sample.bag_weight_kg
  const isPSS = ((draftSample.sample_type ?? sample.sample_type) || '').toLowerCase() === 'pss'

  type Tile = { label: string; value: React.ReactNode; edit: (close: () => void) => React.ReactNode }
  const tiles: Tile[] = [
    {
      label: 'Wolthers ref',
      value: draftSample.wolthers_contract_nr || sample.wolthers_contract_nr || '—',
      edit: (close) => (
        <InlineTextEditor
          value={(draftSample.wolthers_contract_nr ?? sample.wolthers_contract_nr ?? '') as string}
          onCommit={(v) => {
            onFieldChange('wolthers_contract_nr', v)
            close()
          }}
        />
      ),
    },
    {
      label: 'Seller ref',
      value: draftSample.seller_contract_nr || sample.seller_contract_nr || '—',
      edit: (close) => (
        <InlineTextEditor
          value={(draftSample.seller_contract_nr ?? sample.seller_contract_nr ?? '') as string}
          onCommit={(v) => {
            onFieldChange('seller_contract_nr', v)
            close()
          }}
        />
      ),
    },
    {
      label: 'Quantity',
      value: bagCount ? `${bagCount} × ${bagWeight ?? '—'} kg` : '—',
      edit: () => <QuantityEditor draftSample={draftSample} sample={sample} onFieldChange={onFieldChange} />,
    },
    {
      label: 'Bag type',
      value: bagTypeLabel(draftSample.bag_type ?? sample.bag_type),
      edit: (close) => (
        <BagTypeEditor
          onSelect={(v) => {
            onFieldChange('bag_type', v)
            close()
          }}
        />
      ),
    },
  ]
  if (isPSS) {
    tiles.push({
      label: 'Exporter sample #',
      value: draftSample.exporter_sample_number || sample.exporter_sample_number || '—',
      edit: (close) => (
        <InlineTextEditor
          value={(draftSample.exporter_sample_number ?? sample.exporter_sample_number ?? '') as string}
          onCommit={(v) => {
            onFieldChange('exporter_sample_number', v)
            close()
          }}
        />
      ),
    })
  } else {
    tiles.push({
      label: 'Container',
      value: draftSample.container_nr || sample.container_nr || '—',
      edit: (close) => (
        <InlineTextEditor
          value={(draftSample.container_nr ?? sample.container_nr ?? '') as string}
          mono
          onCommit={(v) => {
            onFieldChange('container_nr', v)
            close()
          }}
        />
      ),
    })
    tiles.push({
      label: 'ICO #',
      value: draftSample.ico_number || sample.ico_number || '—',
      edit: (close) => (
        <InlineTextEditor
          value={(draftSample.ico_number ?? sample.ico_number ?? '') as string}
          mono
          onCommit={(v) => {
            onFieldChange('ico_number', v)
            close()
          }}
        />
      ),
    })
  }

  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
      {tiles.map((t) => (
        <div key={t.label} className="flex flex-col items-start gap-0.5 px-4 py-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</span>
          <InlineEdit
            display={<span className="text-sm font-medium text-foreground">{t.value}</span>}
          >
            {t.edit}
          </InlineEdit>
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

/** Full "Edit details" panel: parties (reused table) + commercial / logistics fields. */
export function DetailsEditPanel({
  open,
  sample,
  draftSample,
  qualityOptions,
  saving,
  onCancel,
  onApply,
}: {
  open: boolean
  sample: CertSample
  draftSample: Record<string, any>
  qualityOptions: QualityOption[]
  saving?: boolean
  onCancel: () => void
  onApply: (next: Record<string, any>) => void
}) {
  const [form, setForm] = useState<Record<string, any>>(() => ({ ...draftSample }))
  const set = (field: string, value: any) => setForm((prev) => ({ ...prev, [field]: value }))

  return (
    <EditPanel open={open} title="Edit details" onCancel={onCancel} onSave={() => onApply(form)} saving={saving} wide>
      <div className="space-y-6">
        <div>
          <div className="mb-2 text-sm font-medium text-foreground">Supply chain</div>
          <SupplyChainEditTable sample={sample as any} isEditMode formData={form} onFormChange={set} />
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-foreground">Commodity</div>
          <div className="grid gap-4 sm:grid-cols-3">
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
            <Field label="Origin">
              <Input value={form.origin ?? ''} onChange={(e) => set('origin', e.target.value)} className="h-9" />
            </Field>
            <Field label="Micro origin">
              <Input value={form.micro_origin ?? ''} onChange={(e) => set('micro_origin', e.target.value)} className="h-9" />
            </Field>
            <Field label="Quality">
              <Select value={form.quality_spec_id || ''} onValueChange={(v) => set('quality_spec_id', v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select quality" />
                </SelectTrigger>
                <SelectContent>
                  {qualityOptions.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.custom_name}
                      {q.quality_code ? ` (${q.quality_code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Field label="Crop year">
              <Input value={form.crop_year ?? ''} onChange={(e) => set('crop_year', e.target.value)} placeholder="e.g. 25/26" className="h-9" />
            </Field>
            <Field label="Exporter sample #">
              <Input value={form.exporter_sample_number ?? ''} onChange={(e) => set('exporter_sample_number', e.target.value)} className="h-9" />
            </Field>
            <Field label="Supplier (farm / coop)">
              <Input value={form.supplier ?? ''} onChange={(e) => set('supplier', e.target.value)} className="h-9" />
            </Field>
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-foreground">Certifications</div>
          <CertificationsField
            sampleId={sample.id}
            value={Array.isArray(form.certifications) ? form.certifications : []}
            onChange={(next) => set('certifications', next)}
          />
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-foreground">Logistics</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Container #">
              <Input value={form.container_nr ?? ''} onChange={(e) => set('container_nr', e.target.value)} className="h-9 font-mono" />
            </Field>
            <Field label="ICO #">
              <Input value={form.ico_number ?? ''} onChange={(e) => set('ico_number', e.target.value)} className="h-9 font-mono" />
            </Field>
            <Field label="Shipment month">
              <Input type="month" value={form.shipment_month ?? ''} onChange={(e) => set('shipment_month', e.target.value)} className="h-9" />
            </Field>
            <Field label="Warehouse location">
              <Input value={form.storage_position ?? ''} onChange={(e) => set('storage_position', e.target.value)} placeholder="e.g. A1-B2" className="h-9" />
            </Field>
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-foreground">Quantity</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Bag count">
              <Input type="number" min="0" inputMode="numeric" value={form.bag_count ?? ''} onChange={(e) => set('bag_count', e.target.value === '' ? null : parseInt(e.target.value, 10) || 0)} className="h-9" />
            </Field>
            <Field label="Bag weight (kg)">
              <Input type="number" min="0" step="0.1" inputMode="decimal" value={form.bag_weight_kg ?? ''} onChange={(e) => set('bag_weight_kg', e.target.value === '' ? null : parseFloat(e.target.value) || 0)} className="h-9" />
            </Field>
            <Field label="Bag type">
              <Select value={form.bag_type || ''} onValueChange={(v) => set('bag_type', v)}>
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
          </div>
        </div>
      </div>
    </EditPanel>
  )
}
