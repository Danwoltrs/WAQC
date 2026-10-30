'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
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
      </div>
    </QuadrantCard>
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
