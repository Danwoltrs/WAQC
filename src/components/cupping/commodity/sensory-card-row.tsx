'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { SensoryWheelDialog } from '@/components/sensory/sensory-wheel-dialog'
import { CUPPER_PICK_CAP, leafTerm, type CupperSensory, type RegionalProfile } from '@/lib/sensory'

export interface SensoryCardRowProps {
  config: { notesEnabled: boolean; profile: RegionalProfile | null }
  value: CupperSensory | null
  onChange: (v: CupperSensory) => void
  disabled?: boolean
}

export function SensoryCardRow({ config, value, onChange, disabled }: SensoryCardRowProps) {
  const [open, setOpen] = useState(false)
  if (!config.notesEnabled && !config.profile) return null

  const picks = value?.picks ?? []
  const match = value?.profile_match ?? null
  const emit = (next: Partial<CupperSensory>) =>
    onChange({ picks, profile_id: config.profile?.id ?? null, profile_match: match, ...next })

  return (
    <div className="mt-3 space-y-3">
      {config.notesEnabled && (
        <div>
          <Label className="text-xs font-medium mb-1 block">Sensory notes</Label>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)} className="h-auto min-h-8 whitespace-normal text-left text-xs">
            {picks.length === 0 ? 'Add notes' : picks.map((p) => leafTerm(p)).join(', ')}
          </Button>
          <SensoryWheelDialog
            open={open}
            onOpenChange={setOpen}
            title="Sensory notes"
            value={picks}
            cap={CUPPER_PICK_CAP}
            readOnly={disabled}
            onSave={(next) => {
              emit({ picks: next })
              setOpen(false)
            }}
          />
        </div>
      )}
      {config.profile && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <Label className="text-xs font-medium block">Matches profile: {config.profile.name}</Label>
            {config.profile.notes.length > 0 && (
              <p className="text-xs text-muted-foreground">{config.profile.notes.map((n) => leafTerm(n)).join(', ')}</p>
            )}
          </div>
          <div className="inline-flex items-center gap-0 rounded-md bg-muted p-0.5" role="group" aria-label="Matches profile">
            {([['Yes', true], ['No', false]] as const).map(([label, answer]) => (
              <button
                key={label}
                type="button"
                aria-pressed={match === answer}
                disabled={disabled}
                onClick={() => emit({ profile_match: match === answer ? null : answer })}
                className="h-7 rounded-sm px-3 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
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
