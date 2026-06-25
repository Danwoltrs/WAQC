'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Lock, Pencil } from 'lucide-react'
import { SupplyChainEditTable } from '@/components/samples/supply-chain-edit-table'
import { EditPanel } from './ui-parts'
import { CertSample, QualityOption } from './use-cert-editor'

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

/** Read-only details band beneath the topbar — clickable tiles open the edit panel. */
export function InfoStripBand({
  sample,
  draftSample,
  onEdit,
}: {
  sample: CertSample
  draftSample: Record<string, any>
  onEdit: () => void
}) {
  const bagCount = draftSample.bag_count ?? sample.bag_count ?? sample.bags
  const bagWeight = draftSample.bag_weight_kg ?? sample.bag_weight_kg
  const isPSS = ((draftSample.sample_type ?? sample.sample_type) || '').toLowerCase() === 'pss'
  const tiles: { label: string; value: React.ReactNode }[] = [
    { label: 'Wolthers ref', value: draftSample.wolthers_contract_nr || sample.wolthers_contract_nr || '—' },
    { label: 'Seller ref', value: draftSample.seller_contract_nr || sample.seller_contract_nr || '—' },
    { label: 'Quantity', value: bagCount ? `${bagCount} × ${bagWeight ?? '—'} kg` : '—' },
    { label: 'Bag type', value: bagTypeLabel(draftSample.bag_type ?? sample.bag_type) },
  ]
  if (isPSS) {
    tiles.push({ label: 'Exporter sample #', value: draftSample.exporter_sample_number || sample.exporter_sample_number || '—' })
  } else {
    tiles.push({ label: 'Container', value: draftSample.container_nr || sample.container_nr || '—' })
    tiles.push({ label: 'ICO #', value: draftSample.ico_number || sample.ico_number || '—' })
  }
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
      {tiles.map((t) => (
        <button
          key={t.label}
          onClick={onEdit}
          className="group flex flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        >
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</span>
          <span className="text-sm font-medium text-foreground">{t.value}</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-primary opacity-0 transition-opacity group-hover:opacity-100">
            <Pencil className="h-3 w-3" /> Edit
          </span>
        </button>
      ))}
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
  lockedQuality,
  lockedReason,
  saving,
  onCancel,
  onApply,
}: {
  open: boolean
  sample: CertSample
  draftSample: Record<string, any>
  qualityOptions: QualityOption[]
  /** When quality content is locked (7 days post-cert), lock-sensitive commodity fields freeze. */
  lockedQuality?: boolean
  lockedReason?: string | null
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
          <SupplyChainEditTable
            sample={sample as any}
            isEditMode
            formData={form}
            onFormChange={set}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            Commodity
            {lockedQuality ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-normal text-amber-600 dark:text-amber-400">
                <Lock className="h-3 w-3" />
                {lockedReason || 'Locked after certification'}
              </span>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Sample type">
              <Select
                value={(form.sample_type || '').toString()}
                onValueChange={(v) => set('sample_type', v)}
                disabled={lockedQuality}
              >
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
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Origin">
              <Input value={form.origin ?? ''} onChange={(e) => set('origin', e.target.value)} disabled={lockedQuality} className="h-9" />
            </Field>
            <Field label="Micro origin">
              <Input value={form.micro_origin ?? ''} onChange={(e) => set('micro_origin', e.target.value)} disabled={lockedQuality} className="h-9" />
            </Field>
            <Field label="Quality">
              <Select
                value={form.quality_spec_id || ''}
                onValueChange={(v) => set('quality_spec_id', v)}
                disabled={lockedQuality}
              >
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
              <Input
                value={form.processing_method ?? ''}
                onChange={(e) => set('processing_method', e.target.value)}
                placeholder="e.g. Washed, Natural"
                disabled={lockedQuality}
                className="h-9"
              />
            </Field>
            <Field label="Exporter sample #">
              <Input
                value={form.exporter_sample_number ?? ''}
                onChange={(e) => set('exporter_sample_number', e.target.value)}
                className="h-9"
              />
            </Field>
            <Field label="Warehouse location">
              <Input
                value={form.storage_position ?? ''}
                onChange={(e) => set('storage_position', e.target.value)}
                placeholder="e.g. A1-B2"
                className="h-9"
              />
            </Field>
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-foreground">Quantity</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Bag count">
              <Input
                type="number"
                min="0"
                inputMode="numeric"
                value={form.bag_count ?? ''}
                onChange={(e) => set('bag_count', e.target.value === '' ? null : parseInt(e.target.value, 10) || 0)}
                className="h-9"
              />
            </Field>
            <Field label="Bag weight (kg)">
              <Input
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                value={form.bag_weight_kg ?? ''}
                onChange={(e) => set('bag_weight_kg', e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
                className="h-9"
              />
            </Field>
            <Field label="Bag type">
              <Select value={form.bag_type || ''} onValueChange={(v) => set('bag_type', v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select bag type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BAG_TYPES).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
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
