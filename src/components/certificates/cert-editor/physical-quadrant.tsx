'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import { QuadrantCard, EditPanel, MetricCell } from './ui-parts'
import { CertDraft, TaintFaultDraft } from './shared'

type Physical = Pick<CertDraft, 'taints' | 'faults' | 'moisture' | 'density' | 'greenAspect' | 'roastAspect' | 'quakers'>

function TaintFaultCell({ label, items }: { label: string; items: TaintFaultDraft[] }) {
  const named = items.filter((i) => i.name.trim())
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="text-xs text-muted-foreground">
        {label} ({named.length})
      </div>
      {named.length === 0 ? (
        <div className="mt-1 text-sm italic text-muted-foreground">None recorded</div>
      ) : (
        <div className="mt-1 space-y-0.5">
          {named.map((i, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm text-foreground">
              <span>{i.name}</span>
              {i.intensity != null ? <span className="text-muted-foreground">{i.intensity}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function PhysicalQuadrant({
  draft,
  locked,
  lockedReason,
  onEdit,
}: {
  draft: Physical
  locked?: boolean
  lockedReason?: string | null
  onEdit: () => void
}) {
  return (
    <QuadrantCard
      title="Taints, faults & physical"
      meta={
        <span>
          Taints {draft.taints.filter((t) => t.name.trim()).length} · Faults{' '}
          {draft.faults.filter((f) => f.name.trim()).length}
        </span>
      }
      locked={locked}
      lockedReason={lockedReason}
      onEdit={onEdit}
    >
      <div className="grid grid-cols-2 gap-3">
        <TaintFaultCell label="Taints" items={draft.taints} />
        <TaintFaultCell label="Faults" items={draft.faults} />
        <MetricCell label="Moisture" value={draft.moisture != null ? `${draft.moisture}%` : '—'} />
        <MetricCell label="Density" value={draft.density != null ? draft.density : '—'} />
      </div>
    </QuadrantCard>
  )
}

function TaintFaultEditor({
  label,
  items,
  onChange,
}: {
  label: string
  items: { name: string; intensityText: string }[]
  onChange: (next: { name: string; intensityText: string }[]) => void
}) {
  const set = (i: number, patch: Partial<{ name: string; intensityText: string }>) =>
    onChange(items.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-foreground">{label}</div>
      <div className="space-y-2">
        {items.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_84px_36px] items-center gap-2">
            <Input
              value={r.name}
              onChange={(e) => set(i, { name: e.target.value })}
              placeholder={`${label.slice(0, -1)} name`}
              className="h-9"
            />
            <Input
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              value={r.intensityText}
              onChange={(e) => set(i, { intensityText: e.target.value })}
              placeholder="Lvl"
              className="h-9 text-center"
            />
            <button
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
              aria-label={`Remove ${label}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {items.length === 0 ? <p className="text-sm text-muted-foreground">None recorded.</p> : null}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 text-primary"
        onClick={() => onChange([...items, { name: '', intensityText: '' }])}
      >
        <Plus className="mr-1 h-4 w-4" />
        Add {label.slice(0, -1).toLowerCase()}
      </Button>
    </div>
  )
}

export function PhysicalEditPanel({
  open,
  draft,
  saving,
  onCancel,
  onApply,
}: {
  open: boolean
  draft: Physical
  saving?: boolean
  onCancel: () => void
  onApply: (next: Physical) => void
}) {
  const [taints, setTaints] = useState(() =>
    draft.taints.map((t) => ({ name: t.name, intensityText: t.intensity != null ? String(t.intensity) : '' })),
  )
  const [faults, setFaults] = useState(() =>
    draft.faults.map((f) => ({ name: f.name, intensityText: f.intensity != null ? String(f.intensity) : '' })),
  )
  const [moisture, setMoisture] = useState(draft.moisture != null ? String(draft.moisture) : '')
  const [density, setDensity] = useState(draft.density != null ? String(draft.density) : '')
  const [greenAspect, setGreenAspect] = useState(draft.greenAspect ?? '')
  const [roastAspect, setRoastAspect] = useState(draft.roastAspect ?? '')
  const [quakers, setQuakers] = useState(draft.quakers != null ? String(draft.quakers) : '')

  const numOrNull = (s: string) => {
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : null
  }
  const mapTF = (rows: { name: string; intensityText: string }[]): TaintFaultDraft[] =>
    rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), intensity: numOrNull(r.intensityText) }))

  const apply = () =>
    onApply({
      taints: mapTF(taints),
      faults: mapTF(faults),
      moisture: numOrNull(moisture),
      density: numOrNull(density),
      greenAspect: greenAspect.trim() || null,
      roastAspect: roastAspect.trim() || null,
      quakers: quakers.trim() === '' ? null : (parseInt(quakers, 10) || 0),
    })

  return (
    <EditPanel open={open} title="Edit taints, faults & physical" onCancel={onCancel} onSave={apply} saving={saving} wide>
      <div className="grid gap-6 sm:grid-cols-2">
        <TaintFaultEditor label="Taints" items={taints} onChange={setTaints} />
        <TaintFaultEditor label="Faults" items={faults} onChange={setFaults} />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Moisture %">
          <Input type="number" min="0" step="0.1" inputMode="decimal" value={moisture} onChange={(e) => setMoisture(e.target.value)} className="h-9" />
        </Field>
        <Field label="Density">
          <Input type="number" min="0" step="0.1" inputMode="decimal" value={density} onChange={(e) => setDensity(e.target.value)} className="h-9" />
        </Field>
        <Field label="Quakers">
          <Input type="number" min="0" inputMode="numeric" value={quakers} onChange={(e) => setQuakers(e.target.value)} className="h-9" />
        </Field>
        <Field label="Green aspect">
          <Input value={greenAspect} onChange={(e) => setGreenAspect(e.target.value)} className="h-9" />
        </Field>
        <Field label="Roast aspect">
          <Input value={roastAspect} onChange={(e) => setRoastAspect(e.target.value)} className="h-9" />
        </Field>
      </div>
    </EditPanel>
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
