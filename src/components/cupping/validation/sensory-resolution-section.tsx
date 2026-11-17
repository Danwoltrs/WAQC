'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SensoryWheelDialog } from '@/components/sensory/sensory-wheel-dialog'
import {
  PROFILE_ANSWER_REQUIRED,
  RESOLVED_NOTE_CAP,
  fetchSensoryConfig,
  leafTerm,
  mergePanelSensory,
  sanitizePicks,
  type PanelSensoryRow,
  type RegionalProfile,
  type SensoryResolution,
} from '@/lib/sensory'

/**
 * The validation screen's Sensory section: the panel's notes and regional
 * profile answers merged, adjusted by the validator, and sent with Finalize to
 * be frozen into quality_assessments.sensory_resolution.
 *
 * Descriptive only. Nothing here feeds the approve / reject decision.
 */

export interface SensoryValidationConfig {
  notesEnabled: boolean
  profile: RegionalProfile | null
}

/** A panel card as the validation screen sees it: keyed by score_id, never cupper_id. */
export interface ValidationSensoryRow extends PanelSensoryRow {
  cupper_name: string
}

export interface SensoryResolutionPayload {
  notes: string[][]
  match: boolean | null
}

/** Finalize waits for the lot's settings: without them the profile answer could be skipped. */
export const SENSORY_SETTINGS_LOADING = 'Loading sensory settings'

const OFF: SensoryValidationConfig = { notesEnabled: false, profile: null }
const keyOf = (path: string[]) => path.join('>')

export function useSensoryResolution({
  sampleId,
  rows,
  excludedScoreIds,
  sourceScoreId,
  storedResolution,
}: {
  /** Null while the screen is closed; the config is fetched again on reopen. */
  sampleId: string | null
  rows: ValidationSensoryRow[]
  excludedScoreIds: readonly string[]
  sourceScoreId: string | null
  storedResolution: SensoryResolution | null
}) {
  const [config, setConfig] = useState<SensoryValidationConfig | null>(null)
  const [notes, setNotes] = useState<string[][]>([])
  const [match, setMatch] = useState<boolean | null>(null)
  // The config the current notes / answer were seeded for. Until it matches,
  // the section is not shown and Finalize waits, so nothing can be clicked
  // (or sent) against a seed that is about to land.
  const [seededFor, setSeededFor] = useState<SensoryValidationConfig | null>(null)

  // The lot's settings, read fresh: a quality switched off since cupping shows
  // no section and sends nothing. Any failure is all off.
  useEffect(() => {
    setConfig(null)
    if (!sampleId) return
    let cancelled = false
    ;(async () => {
      // Null on a failure or after ~8 s without an answer: all off, so
      // Finalize is never held by a hung request.
      const c = await fetchSensoryConfig(sampleId)
      const next: SensoryValidationConfig = c ? { notesEnabled: c.notesEnabled, profile: c.profile } : OFF
      if (!cancelled) setConfig(next)
    })()
    return () => {
      cancelled = true
    }
  }, [sampleId])

  const profileId = config?.profile?.id ?? null
  const excludedKey = [...excludedScoreIds].sort().join(',')
  const panelKey = `${excludedKey}|${sourceScoreId ?? ''}`

  const merged = useMemo(
    () => mergePanelSensory({ rows, excludedScoreIds, sourceScoreId, profileId }),
    // excludedKey stands in for the array, which the caller may rebuild each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, excludedKey, sourceScoreId, profileId],
  )

  // Seeding. At load (new rows, a stored result, or the config arriving) a
  // stored resolution wins: re-validating a lot restores what was agreed rather
  // than re-merging. After that, excluding a cupper or taking one card re-seeds
  // from the merge, the way the Final scores move with the panel.
  const seeded = useRef<{ rows: unknown; stored: unknown; config: unknown; panelKey: string } | null>(null)
  useEffect(() => {
    if (!config) return
    const last = seeded.current
    const loaded = !last || last.rows !== rows || last.stored !== storedResolution || last.config !== config
    if (!loaded && last.panelKey === panelKey) return
    seeded.current = { rows, stored: storedResolution, config, panelKey }
    setSeededFor(config)

    if (loaded && storedResolution) {
      setNotes(sanitizePicks(storedResolution.notes, RESOLVED_NOTE_CAP))
      // A stored answer counts only for the profile the quality has today.
      const sameProfile = !!storedResolution.profile && storedResolution.profile.id === profileId
      setMatch(sameProfile ? storedResolution.profile!.match : merged.match)
      return
    }
    setNotes(merged.notes)
    setMatch(merged.match)
  }, [config, rows, storedResolution, panelKey, merged, profileId])

  const settled = !!config && seededFor === config
  const visible = settled && (config!.notesEnabled || !!config!.profile)
  // Until the settings have settled (a failed read settles to all off), a
  // quick Finalize must not skip a required profile answer.
  const blockReason = !settled
    ? SENSORY_SETTINGS_LOADING
    : visible && config!.profile && match === null
      ? PROFILE_ANSWER_REQUIRED
      : null
  const payload: SensoryResolutionPayload | undefined = visible
    ? { notes: config!.notesEnabled ? notes : [], match: config!.profile ? match : null }
    : undefined

  return {
    config,
    notes,
    setNotes,
    match,
    setMatch,
    visible,
    blockReason,
    payload,
    counts: merged.counts,
    contributors: merged.contributors,
  }
}

export type SensoryResolutionState = ReturnType<typeof useSensoryResolution>

export function SensoryResolutionSection({
  state,
  rows,
  excludedScoreIds,
  disabled = false,
}: {
  state: SensoryResolutionState
  rows: ValidationSensoryRow[]
  excludedScoreIds: readonly string[]
  disabled?: boolean
}) {
  const [wheelOpen, setWheelOpen] = useState(false)
  if (!state.visible || !state.config) return null
  const { config, notes, setNotes, match, setMatch, counts, contributors } = state

  const excluded = new Set(excludedScoreIds)
  const included = rows.filter((r) => !excluded.has(r.score_id))

  // The chips: everything an included cupper picked (most picked first), then
  // anything the validator added from the wheel.
  const notesKeys = new Set(notes.map(keyOf))
  const chipKeys = Object.keys(counts).sort((a, b) => counts[b] - counts[a])
  for (const n of notes) if (!(keyOf(n) in counts)) chipKeys.push(keyOf(n))
  const atCap = notes.length >= RESOLVED_NOTE_CAP

  const toggle = (key: string) => {
    if (disabled) return
    if (notesKeys.has(key)) setNotes(notes.filter((n) => keyOf(n) !== key))
    else if (!atCap) setNotes([...notes, key.split('>')])
  }

  return (
    <div className="space-y-4 rounded-[10px] border-[0.5px] border-border p-4">
      <div className="text-[14px] font-semibold">Sensory</div>

      {config.notesEnabled && (
        <div className="space-y-3">
          <ul className="space-y-1">
            {included.map((r) => {
              const picks = r.sensory?.picks ?? []
              return (
                <li key={r.score_id} data-testid={`sensory-row-${r.score_id}`} className="flex gap-2 text-[12px]">
                  <span className="w-28 shrink-0 truncate font-medium">{r.cupper_name}</span>
                  <span className={picks.length === 0 ? 'text-muted-foreground' : ''}>
                    {picks.length === 0 ? 'no notes' : picks.map(leafTerm).join(', ')}
                  </span>
                </li>
              )
            })}
          </ul>

          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] font-medium">Notes on the certificate</span>
              <span className="text-[12px] text-muted-foreground">{`${notes.length} of ${RESOLVED_NOTE_CAP}`}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {chipKeys.map((key) => {
                const on = notesKeys.has(key)
                const count = counts[key]
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    disabled={disabled || (!on && atCap)}
                    onClick={() => toggle(key)}
                    className="inline-flex items-center gap-1 rounded-[4px] border-[0.5px] border-border px-2 py-0.5 text-[12px] text-muted-foreground disabled:opacity-50 aria-pressed:border-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
                  >
                    {leafTerm(key.split('>'))}
                    {count !== undefined && contributors > 0 && (
                      <span className="text-[11px] text-muted-foreground">{`${count}/${contributors}`}</span>
                    )}
                  </button>
                )
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[12px]"
                disabled={disabled}
                onClick={() => setWheelOpen(true)}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add note
              </Button>
            </div>
          </div>

          <SensoryWheelDialog
            open={wheelOpen}
            onOpenChange={setWheelOpen}
            title="Notes on the certificate"
            value={notes}
            cap={RESOLVED_NOTE_CAP}
            onSave={(next) => setNotes(sanitizePicks(next, RESOLVED_NOTE_CAP))}
          />
        </div>
      )}

      {config.profile && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <div className="text-[12px] font-medium">Matches profile: {config.profile.name}</div>
            {config.profile.notes.length > 0 && (
              <p className="text-[12px] text-muted-foreground">{config.profile.notes.map(leafTerm).join(', ')}</p>
            )}
            {config.profile.description && (
              <p className="text-[12px] text-muted-foreground">{config.profile.description}</p>
            )}
            {match === null && <p className="text-[12px] text-muted-foreground">{PROFILE_ANSWER_REQUIRED}</p>}
          </div>
          <div className="inline-flex items-center rounded-[6px] bg-muted p-0.5" role="group" aria-label="Matches profile">
            {([['Yes', true], ['No', false]] as const).map(([label, answer]) => (
              <button
                key={label}
                type="button"
                aria-pressed={match === answer}
                disabled={disabled}
                onClick={() => setMatch(match === answer ? null : answer)}
                className="h-7 rounded-[4px] px-3 text-[12px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
