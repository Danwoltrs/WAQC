'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { aspectOptions, type AspectKind } from '@/lib/aspect-options'
import { QuadrantCard, EditPanel, MetricCell } from './ui-parts'
import { CertDraft } from './shared'

// Taints and faults live on the cupping card since 2026-10-30: they are found
// in the cup, and that is where a lab user looks for them.
type Physical = Pick<CertDraft, 'moisture' | 'density' | 'greenAspect' | 'roastAspect' | 'quakers'>

export function PhysicalQuadrant({
  draft,
  locked,
  lockedReason,
  readOnly,
  onEdit,
}: {
  draft: Physical
  locked?: boolean
  lockedReason?: string | null
  readOnly?: boolean
  onEdit?: () => void
}) {
  return (
    <QuadrantCard
      title="Physical"
      locked={locked}
      lockedReason={lockedReason}
      readOnly={readOnly}
      onEdit={onEdit}
    >
      <div className="grid grid-cols-2 gap-3">
        <MetricCell label="Moisture" value={draft.moisture != null ? `${draft.moisture}%` : '—'} />
        <MetricCell label="Density" value={draft.density != null ? draft.density : '—'} />
        <MetricCell label="Quakers" value={draft.quakers != null ? draft.quakers : '—'} />
        <MetricCell label="Green aspect" value={draft.greenAspect || '—'} />
        <MetricCell label="Roast aspect" value={draft.roastAspect || '—'} />
      </div>
    </QuadrantCard>
  )
}

export function PhysicalEditPanel({
  open,
  draft,
  specParameters,
  saving,
  onCancel,
  onApply,
}: {
  open: boolean
  draft: Physical
  /** The lot's quality parameters; its aspect levels are the choices offered. */
  specParameters?: Record<string, any> | null
  saving?: boolean
  onCancel: () => void
  onApply: (next: Physical) => void
}) {
  const [moisture, setMoisture] = useState(draft.moisture != null ? String(draft.moisture) : '')
  const [density, setDensity] = useState(draft.density != null ? String(draft.density) : '')
  const [greenAspect, setGreenAspect] = useState(draft.greenAspect ?? '')
  const [roastAspect, setRoastAspect] = useState(draft.roastAspect ?? '')
  const [quakers, setQuakers] = useState(draft.quakers != null ? String(draft.quakers) : '')

  const numOrNull = (s: string) => {
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : null
  }
  const apply = () =>
    onApply({
      moisture: numOrNull(moisture),
      density: numOrNull(density),
      greenAspect: greenAspect.trim() || null,
      roastAspect: roastAspect.trim() || null,
      quakers: quakers.trim() === '' ? null : (parseInt(quakers, 10) || 0),
    })

  return (
    <EditPanel open={open} title="Edit physical" onCancel={onCancel} onSave={apply} saving={saving} wide>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
          <AspectSelect kind="green" label="Green aspect" parameters={specParameters} saved={draft.greenAspect} value={greenAspect} onChange={setGreenAspect} />
        </Field>
        <Field label="Roast aspect">
          <AspectSelect kind="roast" label="Roast aspect" parameters={specParameters} saved={draft.roastAspect} value={roastAspect} onChange={setRoastAspect} />
        </Field>
      </div>
    </EditPanel>
  )
}

const NOT_SET = '__not_set__'

/**
 * One aspect as a dropdown: the levels the lot's quality configures, else the
 * house list. The value saved on the lot is always among the choices, so the
 * panel opens showing exactly what is saved.
 */
function AspectSelect({
  kind,
  label,
  parameters,
  saved,
  value,
  onChange,
}: {
  kind: AspectKind
  label: string
  parameters?: Record<string, any> | null
  saved: string | null
  value: string
  onChange: (next: string) => void
}) {
  const options = aspectOptions({ kind, parameters, saved, fallbackToStandard: true })
  return (
    <Select value={value || NOT_SET} onValueChange={(v) => onChange(v === NOT_SET ? '' : v)}>
      <SelectTrigger aria-label={label} className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NOT_SET}>Not set</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.label} value={o.label}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
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
