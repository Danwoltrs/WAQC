'use client'

import { useState } from 'react'
import { Check, X, Minus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { QuadrantCard, EditPanel } from './ui-parts'
import { CertDraft, CUPPING_COLOR } from './shared'

type CuppingDraft = Pick<
  CertDraft,
  'cupping' | 'cupProfile' | 'cleanCup' | 'uniformCup' | 'cuppingComments' | 'gradingComments'
>

function AttributeBar({ name, score, scale }: { name: string; score: number; scale: number }) {
  const pct = Math.max(0, Math.min(100, (score / scale) * 100))
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

function CupFlag({ label, value }: { label: string; value: boolean | null }) {
  const Icon = value === true ? Check : value === false ? X : Minus
  const cls =
    value === true
      ? 'border-green-500/40 text-green-600 dark:text-green-400'
      : value === false
        ? 'border-red-500/40 text-red-600 dark:text-red-400'
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
  locked,
  lockedReason,
  onEdit,
}: {
  draft: CuppingDraft
  isCVA: boolean
  cvaScore?: number | null
  cvaMinScore?: number | null
  locked?: boolean
  lockedReason?: string | null
  onEdit: () => void
}) {
  const entries = Object.entries(draft.cupping)
  // Fixed conventional scale so identical scores read the same across samples
  // (CVA section impressions are on a 0–9 scale; SCA attributes 0–10).
  const scale = isCVA ? 9 : 10
  const overall = isCVA ? (cvaScore ?? null) : null
  const pass = overall != null && cvaMinScore != null ? overall >= cvaMinScore : null

  return (
    <QuadrantCard
      title="Cupping / sensory"
      meta={<span>{isCVA ? 'CVA score' : 'Sensory profile'}</span>}
      locked={locked}
      lockedReason={lockedReason}
      onEdit={onEdit}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CupFlag label="Clean cup" value={draft.cleanCup} />
        <CupFlag label="Uniform cup" value={draft.uniformCup} />
      </div>
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
        <div className="flex-1 space-y-2.5">
          {entries.length === 0 ? (
            <div className="py-6 text-xs text-muted-foreground">No cupping scores recorded</div>
          ) : (
            entries.map(([name, score]) => <AttributeBar key={name} name={name} score={score} scale={scale} />)
          )}
        </div>
      </div>
    </QuadrantCard>
  )
}

export function CuppingEditPanel({
  open,
  draft,
  saving,
  onCancel,
  onApply,
}: {
  open: boolean
  draft: CuppingDraft
  saving?: boolean
  onCancel: () => void
  onApply: (next: CuppingDraft) => void
}) {
  const [cupProfile, setCupProfile] = useState(draft.cupProfile ?? '')
  const [cleanCup, setCleanCup] = useState<boolean | null>(draft.cleanCup)
  const [uniformCup, setUniformCup] = useState<boolean | null>(draft.uniformCup)
  const [cuppingComments, setCuppingComments] = useState(draft.cuppingComments ?? '')
  const [gradingComments, setGradingComments] = useState(draft.gradingComments ?? '')

  const apply = () => {
    onApply({
      // Attribute scores are aggregated from cupping sessions and are not edited here,
      // so they round-trip unchanged.
      cupping: draft.cupping,
      cupProfile: cupProfile.trim() || null,
      cleanCup,
      uniformCup,
      cuppingComments: cuppingComments.trim() || null,
      gradingComments: gradingComments.trim() || null,
    })
  }

  const attrs = Object.entries(draft.cupping)

  return (
    <EditPanel open={open} title="Edit cupping / sensory" onCancel={onCancel} onSave={apply} saving={saving} wide>
      {attrs.length > 0 ? (
        <div>
          <div className="mb-2 text-xs text-muted-foreground">
            Attribute scores are aggregated from the cupping sessions (read-only here).
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {attrs.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                <span className="text-xs text-muted-foreground">{k}</span>
                <span className="text-sm font-medium text-foreground">{Number.isFinite(v) ? v : '—'}</span>
              </div>
            ))}
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
