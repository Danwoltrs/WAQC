'use client'

import { useId, useState } from 'react'
import { Check, X, Minus, Plus, Trash2 } from 'lucide-react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { QuadrantCard, EditPanel } from './ui-parts'
import {
  CertDraft,
  CUPPING_COLOR,
  TaintFaultDraft,
  TaintFaultRules,
  cupDefectLine,
  taintLimitWarning,
  taintRow,
} from './shared'
import { isFlavorDescriptor } from '@/lib/quality-resolvers'

type CuppingDraft = Pick<
  CertDraft,
  'cupping' | 'cupProfile' | 'cleanCup' | 'uniformCup' | 'cuppingComments' | 'gradingComments' | 'taints' | 'faults'
>

/** Numeric sensory attributes only — what the spider graph (and bars) can plot.
 *  Flavor descriptor is a TEXT attribute that leaks into the aggregated cupping
 *  map; `isFlavorDescriptor` is shared with the public certificate page so both
 *  exclude exactly the same thing. */
function scoreEntries(cupping: Record<string, number>): Array<[string, number]> {
  return Object.entries(cupping).filter(
    ([name, score]) => !isFlavorDescriptor(name) && Number.isFinite(score),
  )
}

function AttributeBar({ name, score, min, max }: { name: string; score: number; min: number; max: number }) {
  const span = max - min || 1
  const pct = Math.max(0, Math.min(100, ((score - min) / span) * 100))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{name}</span>
        <span className="font-medium text-foreground">{Number.isFinite(score) ? score : '—'}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: CUPPING_COLOR }} />
      </div>
    </div>
  )
}

/** Spider (radar) view of the sensory attributes. Axis labels carry the score
 *  so no tooltip is needed; the radius spans the spec's full scale (min–max) so
 *  the same scores read identically across samples. */
function SensorySpider({ entries, min, max }: { entries: Array<[string, number]>; min: number; max: number }) {
  const data = entries.map(([name, score]) => ({
    label: `${name} · ${score}`,
    score,
  }))
  return (
    <div className="h-[240px] w-full text-muted-foreground">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="currentColor" strokeOpacity={0.18} />
          <PolarAngleAxis dataKey="label" tick={{ fill: 'currentColor', fontSize: 11 }} />
          <PolarRadiusAxis domain={[min, max]} tick={false} axisLine={false} />
          <Radar
            dataKey="score"
            stroke={CUPPING_COLOR}
            fill={CUPPING_COLOR}
            fillOpacity={0.25}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** The taints or faults the certificate prints, one line each. */
function CupDefectList({ label, items }: { label: string; items: TaintFaultDraft[] }) {
  const named = items.filter((i) => i.name.trim())
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">
        {label} ({named.length})
      </div>
      {named.length === 0 ? (
        <div className="mt-0.5 text-sm italic text-muted-foreground">None</div>
      ) : (
        named.map((d, i) => (
          <div key={i} className="mt-0.5 text-sm text-foreground">
            {cupDefectLine(d)}
          </div>
        ))
      )}
    </div>
  )
}

function CupFlag({ label, value }: { label: string; value: boolean | null }) {
  const Icon = value === true ? Check : value === false ? X : Minus
  const cls =
    value === true
      ? 'border-green-500/40 dark:border-green-500/50 text-green-600 dark:text-green-400'
      : value === false
        ? 'border-red-500/40 dark:border-red-500/50 text-red-600 dark:text-red-400'
        : 'border-border text-muted-foreground'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

export function CuppingQuadrant({
  draft,
  isCVA,
  cvaScore,
  cvaMinScore,
  sensoryScale,
  locked,
  lockedReason,
  readOnly,
  onEdit,
}: {
  draft: CuppingDraft
  isCVA: boolean
  cvaScore?: number | null
  cvaMinScore?: number | null
  /** Spider domain from the quality spec; falls back to the conventional scale. */
  sensoryScale?: { min: number; max: number } | null
  locked?: boolean
  lockedReason?: string | null
  readOnly?: boolean
  onEdit?: () => void
}) {
  const entries = scoreEntries(draft.cupping)
  // Prefer the spec's full scale; fall back to the conventional range
  // (CVA section impressions 0–9; SCA attributes 0–10).
  const domainMin = sensoryScale?.min ?? 0
  const domainMax = sensoryScale?.max ?? (isCVA ? 9 : 10)
  const overall = isCVA ? (cvaScore ?? null) : null
  const pass = overall != null && cvaMinScore != null ? overall >= cvaMinScore : null

  return (
    <QuadrantCard
      title="Cupping / sensory"
      headerExtra={
        <>
          <CupFlag label="Clean cup" value={draft.cleanCup} />
          <CupFlag label="Uniform cup" value={draft.uniformCup} />
          {draft.cupProfile ? (
            <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {draft.cupProfile}
            </span>
          ) : null}
        </>
      }
      meta={<span>{isCVA ? 'CVA score' : 'Sensory profile'}</span>}
      locked={locked}
      lockedReason={lockedReason}
      readOnly={readOnly}
      onEdit={onEdit}
    >
      <div className="flex gap-5">
        {overall != null ? (
          <div className="shrink-0">
            <div
              className="text-3xl font-semibold"
              style={pass == null ? undefined : { color: pass ? '#22c55e' : '#ef4444' }}
            >
              {overall}
            </div>
            <div className="text-xs text-muted-foreground">Overall score</div>
            {cvaMinScore != null ? (
              <div className="mt-0.5 text-[11px] text-muted-foreground">min {cvaMinScore}</div>
            ) : null}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {entries.length === 0 ? (
            <div className="py-6 text-xs text-muted-foreground">No cupping scores recorded</div>
          ) : entries.length < 3 ? (
            // A radar needs 3+ axes to read as a shape — fall back to bars.
            <div className="space-y-2.5">
              {entries.map(([name, score]) => (
                <AttributeBar key={name} name={name} score={score} min={domainMin} max={domainMax} />
              ))}
            </div>
          ) : (
            <SensorySpider entries={entries} min={domainMin} max={domainMax} />
          )}
        </div>
      </div>
      {/* A CVA certificate prints no taint/fault list, so neither does its card. */}
      {!isCVA ? (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/30 p-4">
          <CupDefectList label="Taints" items={draft.taints} />
          <CupDefectList label="Faults" items={draft.faults} />
        </div>
      ) : null}
    </QuadrantCard>
  )
}

type TaintFaultInput = { name: string; cupsText: string; intensityText: string }

const toInput = (d: TaintFaultDraft): TaintFaultInput => ({
  name: d.name,
  cupsText: d.cups != null ? String(d.cups) : '',
  intensityText: d.intensity != null ? String(d.intensity) : '',
})

const fromInputs = (rows: TaintFaultInput[]): TaintFaultDraft[] =>
  rows
    .filter((r) => r.name.trim())
    .map((r) => {
      const cups = parseInt(r.cupsText, 10)
      const intensity = parseFloat(r.intensityText)
      return taintRow(
        r.name.trim(),
        Number.isFinite(intensity) ? intensity : null,
        Number.isFinite(cups) ? cups : null,
      )
    })

/** Name, cups and intensity per row: what the certificate prints for each one. */
function TaintFaultRows({
  kind,
  rows,
  listId,
  onChange,
}: {
  kind: 'Taint' | 'Fault'
  rows: TaintFaultInput[]
  /** The <datalist> of the quality's names, suggested as the user types. */
  listId: string
  onChange: (next: TaintFaultInput[]) => void
}) {
  const set = (i: number, patch: Partial<TaintFaultInput>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-foreground">{kind}s</div>
      {rows.length > 0 ? (
        <div className="mb-1 grid grid-cols-[1fr_64px_64px_36px] gap-2 text-[11px] text-muted-foreground">
          <span>Name</span>
          <span className="text-center">Cups</span>
          <span className="text-center">Intensity</span>
          <span />
        </div>
      ) : null}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_64px_64px_36px] items-center gap-2">
            <Input
              aria-label={`${kind} ${i + 1} name`}
              list={listId}
              value={r.name}
              onChange={(e) => set(i, { name: e.target.value })}
              placeholder={`${kind} name`}
              className="h-9"
            />
            <Input
              aria-label={`${kind} ${i + 1} cups`}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={r.cupsText}
              onChange={(e) => set(i, { cupsText: e.target.value })}
              className="h-9 px-2 text-center"
            />
            <Input
              aria-label={`${kind} ${i + 1} intensity`}
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              value={r.intensityText}
              onChange={(e) => set(i, { intensityText: e.target.value })}
              className="h-9 px-2 text-center"
            />
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
              aria-label={`Remove ${kind.toLowerCase()} ${r.name.trim() || i + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">None recorded.</p> : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 text-primary"
        onClick={() => onChange([...rows, { name: '', cupsText: '', intensityText: '' }])}
      >
        <Plus className="mr-1 h-4 w-4" />
        Add {kind.toLowerCase()}
      </Button>
    </div>
  )
}

export function CuppingEditPanel({
  open,
  draft,
  scales,
  isCVA,
  defectNames = [],
  taintRules,
  saving,
  onCancel,
  onApply,
}: {
  open: boolean
  draft: CuppingDraft
  /** Per-attribute numeric bounds from the quality spec (min/max/increment). */
  scales?: Record<string, { min: number; max: number; increment?: number }>
  /** A CVA certificate prints no taint/fault list, so the panel offers none. */
  isCVA: boolean
  /** The quality's taint/fault names, suggested in the name field. */
  defectNames?: string[]
  /** The quality's taint/fault limits; breaking one warns, it never blocks. */
  taintRules?: TaintFaultRules | null
  saving?: boolean
  onCancel: () => void
  onApply: (next: CuppingDraft) => void
}) {
  const attrs = scoreEntries(draft.cupping)
  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(attrs.map(([k, v]) => [k, Number.isFinite(v) ? String(v) : ''])),
  )
  const [cupProfile, setCupProfile] = useState(draft.cupProfile ?? '')
  const [cleanCup, setCleanCup] = useState<boolean | null>(draft.cleanCup)
  const [uniformCup, setUniformCup] = useState<boolean | null>(draft.uniformCup)
  const [cuppingComments, setCuppingComments] = useState(draft.cuppingComments ?? '')
  const [gradingComments, setGradingComments] = useState(draft.gradingComments ?? '')
  const [taints, setTaints] = useState(() => draft.taints.map(toInput))
  const [faults, setFaults] = useState(() => draft.faults.map(toInput))
  const listId = `${useId()}-cup-defects`
  const limitWarning = isCVA ? null : taintLimitWarning(taintRules, fromInputs(taints), fromInputs(faults))

  const apply = () => {
    // Start from the current map so non-numeric keys (e.g. Flavor_descriptor)
    // survive; overwrite each edited attribute, clearing blanks and clamping to
    // the spec scale so out-of-range typos can't reach the certificate.
    const nextCupping: Record<string, number> = { ...(draft.cupping as Record<string, number>) }
    for (const [k] of attrs) {
      const raw = (scores[k] ?? '').trim()
      const n = raw === '' ? NaN : Number(raw)
      if (!Number.isFinite(n)) {
        delete nextCupping[k]
        continue
      }
      const sc = scales?.[k]
      nextCupping[k] = sc ? Math.min(sc.max, Math.max(sc.min, n)) : n
    }
    onApply({
      cupping: nextCupping,
      cupProfile: cupProfile.trim() || null,
      cleanCup,
      uniformCup,
      cuppingComments: cuppingComments.trim() || null,
      gradingComments: gradingComments.trim() || null,
      // A CVA lot's lists are not edited here; hand them back as they came.
      taints: isCVA ? draft.taints : fromInputs(taints),
      faults: isCVA ? draft.faults : fromInputs(faults),
    })
  }

  return (
    <EditPanel open={open} title="Edit cupping / sensory" onCancel={onCancel} onSave={apply} saving={saving} wide>
      {attrs.length > 0 ? (
        <div>
          <div className="mb-2 text-xs text-amber-600 dark:text-amber-400">
            Editing these overrides the scores aggregated from the cupping sessions. Leave a field blank to remove its score.
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {attrs.map(([k]) => {
              const sc = scales?.[k]
              return (
                <div key={k} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5">
                  <span className="min-w-0 truncate text-xs text-muted-foreground">{k}</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={scores[k] ?? ''}
                    onChange={(e) => setScores((p) => ({ ...p, [k]: e.target.value }))}
                    min={sc?.min}
                    max={sc?.max}
                    step={sc?.increment ?? 'any'}
                    className="h-8 w-16 shrink-0 px-2 text-right text-sm"
                  />
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {!isCVA ? (
        <div className="mt-6">
          <div className="mb-3 text-sm font-semibold text-foreground">Taints &amp; faults</div>
          <datalist id={listId}>
            {defectNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <div className="grid gap-6 sm:grid-cols-2">
            <TaintFaultRows kind="Taint" rows={taints} listId={listId} onChange={setTaints} />
            <TaintFaultRows kind="Fault" rows={faults} listId={listId} onChange={setFaults} />
          </div>
          {limitWarning ? (
            <div className="mt-3 text-xs text-amber-600 dark:text-amber-400">
              {limitWarning} The certificate prints it; the lot&apos;s approval does not change.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Cup profile (flavor descriptor)</label>
          <Input value={cupProfile} onChange={(e) => setCupProfile(e.target.value)} className="h-9" placeholder="e.g. Strictly Soft" />
        </div>
        <div className="flex items-end gap-6 pb-1">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <Checkbox checked={cleanCup === true} onCheckedChange={(c) => setCleanCup(c === true)} />
            Clean cup
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <Checkbox checked={uniformCup === true} onCheckedChange={(c) => setUniformCup(c === true)} />
            Uniform cup
          </label>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Cupping comments</label>
          <Textarea value={cuppingComments} onChange={(e) => setCuppingComments(e.target.value)} className="min-h-[72px]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Grading comments</label>
          <Textarea value={gradingComments} onChange={(e) => setGradingComments(e.target.value)} className="min-h-[72px]" />
        </div>
      </div>
    </EditPanel>
  )
}
