'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { aspectOptions, type AspectKind } from '@/lib/aspect-options'
import { checkQuakers, quakerLimit, quakerLimitPhrase, quakerSampleGrams } from '@/lib/quakers'
import { methodFromSpec, optionLabel } from '@/lib/measurement-options'
import { MeasurementSelect, useMeasurementOptions } from '@/components/measurement/measurement-select'
import { QuadrantCard, EditPanel, MetricCell } from './ui-parts'
import { CertDraft } from './shared'

// Taints and faults live on the cupping card since 2026-10-30: they are found
// in the cup, and that is where a lab user looks for them.
type Physical = Pick<
  CertDraft,
  'moisture' | 'density' | 'greenAspect' | 'roastAspect' | 'quakers' | 'quakerGrams' | 'moistureMethod' | 'moistureMethodIso' | 'densityType'
>

/** The count, "per 300 g · max 5 per 300 g" beneath it, and whether the count is over the limit. */
function quakerReading(draft: Physical, specParameters?: Record<string, any> | null) {
  const limit = quakerLimit(specParameters)
  const grams = quakerSampleGrams({ quaker_sample_grams: draft.quakerGrams }, specParameters)
  const notes = [grams != null ? `per ${grams} g` : null, limit ? quakerLimitPhrase(limit) : null].filter(Boolean)
  return {
    sub: notes.length > 0 ? notes.join(' · ') : undefined,
    over: draft.quakers != null && limit ? !checkQuakers(draft.quakers, limit, grams).passed : false,
  }
}

export function PhysicalQuadrant({
  draft,
  specParameters,
  locked,
  lockedReason,
  readOnly,
  onEdit,
}: {
  draft: Physical
  /** The lot's quality parameters: the quaker limit and the weight it is stated for. */
  specParameters?: Record<string, any> | null
  locked?: boolean
  lockedReason?: string | null
  readOnly?: boolean
  onEdit?: () => void
}) {
  const quakers = quakerReading(draft, specParameters)
  return (
    <QuadrantCard
      title="Physical"
      locked={locked}
      lockedReason={lockedReason}
      readOnly={readOnly}
      onEdit={onEdit}
    >
      <div className="grid grid-cols-2 gap-3">
        <MetricCell
          label="Moisture"
          value={draft.moisture != null ? `${draft.moisture}%` : '—'}
          sub={draft.moistureMethod ? optionLabel({ kind: 'humidity_method', name: draft.moistureMethod, is_iso: draft.moistureMethodIso === true }) : undefined}
        />
        <MetricCell
          label="Density"
          value={draft.density != null ? draft.density : '—'}
          sub={draft.densityType ?? undefined}
        />
        <MetricCell
          label="Quakers"
          value={draft.quakers == null ? '—' : quakers.over ? <span className="text-[#ef4444]">{draft.quakers}</span> : draft.quakers}
          sub={quakers.sub}
        />
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
  const [quakerGrams, setQuakerGrams] = useState(draft.quakerGrams != null ? String(draft.quakerGrams) : '')
  // A lot with no method yet starts from its quality's standard; Apply saves it.
  const { options: measurementOptions } = useMeasurementOptions()
  const specMethod = methodFromSpec(measurementOptions, specParameters)
  const [method, setMethod] = useState<{ name: string; iso: boolean } | null>(
    draft.moistureMethod ? { name: draft.moistureMethod, iso: draft.moistureMethodIso === true } : null,
  )
  const [methodTouched, setMethodTouched] = useState(false)
  const shownMethod = method ?? (!methodTouched && specMethod ? { name: specMethod.name, iso: specMethod.is_iso } : null)
  const [densityType, setDensityType] = useState(draft.densityType ?? '')
  const limit = quakerLimit(specParameters)

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
      // Empty = counted on the quality's own weight.
      quakerGrams: (() => { const g = parseInt(quakerGrams, 10); return Number.isFinite(g) && g > 0 ? g : null })(),
      moistureMethod: shownMethod?.name ?? null,
      moistureMethodIso: shownMethod ? shownMethod.iso : null,
      densityType: densityType.trim() || null,
    })

  return (
    <EditPanel open={open} title="Edit physical" onCancel={onCancel} onSave={apply} saving={saving} wide>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Moisture %">
          <Input type="number" min="0" step="0.1" inputMode="decimal" value={moisture} onChange={(e) => setMoisture(e.target.value)} className="h-9" />
          <MeasurementSelect
            kind="humidity_method"
            value={shownMethod?.name ?? ''}
            saved={draft.moistureMethod}
            savedIso={draft.moistureMethodIso}
            onChange={(name, iso) => { setMethodTouched(true); setMethod(name ? { name, iso } : null) }}
          />
        </Field>
        <Field label="Density">
          {/* The type sits above the value: it says which density the figure is. */}
          <MeasurementSelect kind="density_type" value={densityType} saved={draft.densityType} onChange={(name) => setDensityType(name)} />
          <Input aria-label="Density value" type="number" min="0" step="0.001" inputMode="decimal" value={density} onChange={(e) => setDensity(e.target.value)} className="h-9" />
        </Field>
        <Field label={limit ? `Quakers (${quakerLimitPhrase(limit)})` : 'Quakers'}>
          <div className="flex items-center gap-2">
            <Input aria-label="Quakers counted" type="number" min="0" inputMode="numeric" value={quakers} onChange={(e) => setQuakers(e.target.value)} className="h-9" />
            <span className="shrink-0 text-xs text-muted-foreground">per</span>
            <Input
              aria-label="Roasted sample weight in grams" type="number" min="1" inputMode="numeric" className="h-9"
              value={quakerGrams} placeholder={limit?.perGrams != null ? String(limit.perGrams) : ''}
              onChange={(e) => setQuakerGrams(e.target.value)}
            />
            <span className="shrink-0 text-xs text-muted-foreground">g</span>
          </div>
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
