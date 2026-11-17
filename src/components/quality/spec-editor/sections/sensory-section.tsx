'use client'

import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { leafTerm, readSensorySettings, type RegionalProfile } from '@/lib/sensory'

const NONE = '__none__'

interface SensorySectionProps {
  params: Record<string, any>
  patch: (slice: Record<string, any>) => void
  /** The active profiles; null makes the section fetch them itself. */
  profiles: RegionalProfile[] | null
  /** Accepted for the portal; this section has no link to manage profiles, so it is ignored. */
  readOnlyProfiles?: boolean
}

export function SensorySection({ params, patch, profiles }: SensorySectionProps) {
  const [fetched, setFetched] = useState<RegionalProfile[]>([])
  useEffect(() => {
    if (profiles !== null) return
    let cancelled = false
    fetch('/api/regional-profiles?active=true')
      .then((res) => (res.ok ? res.json() : { profiles: [] }))
      .then((data) => { if (!cancelled) setFetched(Array.isArray(data?.profiles) ? data.profiles : []) })
      .catch(() => { if (!cancelled) setFetched([]) })
    return () => { cancelled = true }
  }, [profiles])

  const list = profiles ?? fetched
  const { notesEnabled, profile } = readSensorySettings(params, null)
  const known = profile ? list.find((p) => p.id === profile.id) : undefined
  const inactive = profile && !known

  const pick = (value: string) => {
    if (value === NONE) return patch({ regional_profile: null })
    const chosen = list.find((p) => p.id === value)
    if (chosen) patch({ regional_profile: { id: chosen.id, name: chosen.name } })
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div className="flex items-center justify-between gap-4 rounded-[10px] border border-border p-4">
        <div className="space-y-1">
          <Label htmlFor="sensory-notes" className="text-sm font-semibold">Sensory notes</Label>
          <p className="text-xs text-muted-foreground">Cuppers pick flavor notes for lots of this quality.</p>
        </div>
        <Switch id="sensory-notes" checked={notesEnabled}
          onCheckedChange={(v) => patch({ sensory_notes_enabled: v })} />
      </div>

      <div className="space-y-2 rounded-[10px] border border-border p-4">
        <Label id="regional-profile-label" className="text-sm font-semibold">Regional profile</Label>
        <Select value={profile?.id ?? NONE} onValueChange={pick}>
          <SelectTrigger aria-labelledby="regional-profile-label"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {inactive && <SelectItem value={profile.id}>{profile.name} (inactive)</SelectItem>}
            {list.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {known && (
          <div className="space-y-1 pt-1 text-xs text-muted-foreground">
            {known.region && <p>{known.region}</p>}
            {known.notes.length > 0 && <p>{known.notes.map(leafTerm).join(', ')}</p>}
            {known.description && <p>{known.description}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
