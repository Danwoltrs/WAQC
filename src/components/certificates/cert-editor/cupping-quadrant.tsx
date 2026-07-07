'use client'

import { useState } from 'react'
import { Check, X, Minus } from 'lucide-react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { QuadrantCard, EditPanel } from './ui-parts'
import { CertDraft, CUPPING_COLOR } from './shared'

type CuppingDraft = Pick<
  CertDraft,
  'cupping' | 'cupProfile' | 'cleanCup' | 'uniformCup' | 'cuppingComments' | 'gradingComments'
>

// Flavor descriptor is a TEXT attribute that leaks into the aggregated cupping
// map — it has no numeric score and must not appear in the sensory graph.
const isFlavorDescriptor = (name: string) => /flavou?r[\s_-]*descriptor/i.test(name)

/** Numeric sensory attributes only — what the spider graph (and bars) can plot. */
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
    </QuadrantCard>
  )
}

export function CuppingEditPanel({
  open,
  draft,
  scales,
  saving,
  onCancel,
  onApply,
}: {
  open: boolean
  draft: CuppingDraft
  /** Per-attribute numeric bounds from the quality spec (min/max/increment). */
  scales?: Record<string, { min: number; max: number; increment?: number }>
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
