'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SensoryWheelDialog } from '@/components/sensory/sensory-wheel-dialog'
import { RESOLVED_NOTE_CAP, leafTerm, sanitizePicks } from '@/lib/sensory'
import type { SensoryConfig, SensoryDraft } from './shared'

/**
 * The "Sensory" block of the cupping edit panel: the notes the certificate
 * prints and the lab's Yes/No on the quality's regional profile. A late
 * correction, or the first entry for a lot validated before sensory notes
 * existed. It never changes the lot's approval.
 */
export function SensoryEditBlock({
  config,
  value,
  onChange,
}: {
  config: SensoryConfig
  value: SensoryDraft
  onChange: (next: SensoryDraft) => void
}) {
  const [wheelOpen, setWheelOpen] = useState(false)
  const profile = config.profile

  return (
    <div className="mt-6">
      <div className="mb-3 text-sm font-semibold text-foreground">Sensory notes</div>

      {config.notesEnabled ? (
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {value.notes.length === 0 ? <span className="text-sm text-muted-foreground">No notes recorded.</span> : null}
            {value.notes.map((n) => (
              <span key={n.join('>')} className="inline-flex items-center rounded-[4px] border-[0.5px] border-border px-2 py-0.5 text-[12px] text-foreground">
                {leafTerm(n)}
              </span>
            ))}
            <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[12px]" onClick={() => setWheelOpen(true)}>
              Edit notes
            </Button>
          </div>
          <SensoryWheelDialog
            open={wheelOpen}
            onOpenChange={setWheelOpen}
            title="Notes on the certificate"
            value={value.notes}
            cap={RESOLVED_NOTE_CAP}
            onSave={(next) => onChange({ ...value, notes: sanitizePicks(next, RESOLVED_NOTE_CAP) })}
          />
        </div>
      ) : null}

      {config.profileConfigured ? (
        profile ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <div className="text-sm font-medium text-foreground">{profile.name}</div>
              {profile.notes.length > 0 ? (
                <p className="text-xs text-muted-foreground">{profile.notes.map(leafTerm).join(', ')}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">Does the lot match this profile?</p>
            </div>
            <div className="inline-flex items-center rounded-[6px] bg-muted p-0.5" role="group" aria-label="Matches profile">
              {([['Yes', true], ['No', false]] as const).map(([label, answer]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={value.match === answer}
                  onClick={() => onChange({ ...value, match: value.match === answer ? null : answer })}
                  className="h-7 rounded-[4px] px-3 text-[12px] font-medium text-muted-foreground hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">The regional profile could not be loaded.</p>
        )
      ) : null}
    </div>
  )
}
