'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SensoryWheelDialog } from '@/components/sensory/sensory-wheel-dialog'
import { ORIGINS, MICRO_ORIGINS } from '@/components/samples/intake/constants'
import { PROFILE_NOTE_CAP, leafTerm, type RegionalProfile } from '@/lib/sensory'

interface ProfileEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Null creates a new profile. */
  profile: RegionalProfile | null
  onSaved: (profile: RegionalProfile) => void
}

const selectClass =
  'h-9 w-full rounded-[6px] border border-input bg-transparent px-3 text-[14px] outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function ProfileEditorDialog({ open, onOpenChange, profile, onSaved }: ProfileEditorDialogProps) {
  const [name, setName] = useState('')
  const [origin, setOrigin] = useState('')
  const [region, setRegion] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState<string[][]>([])
  const [wheelOpen, setWheelOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(profile?.name ?? '')
    setOrigin(profile?.origin ?? '')
    setRegion(profile?.region ?? '')
    setDescription(profile?.description ?? '')
    setNotes(profile?.notes ?? [])
  }, [open, profile])

  const regions = MICRO_ORIGINS[origin] ?? []

  const save = async () => {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(profile ? `/api/regional-profiles/${profile.id}` : '/api/regional-profiles', {
        method: profile ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, origin, region, description, notes }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error || 'Could not save the profile')
        return
      }
      toast.success('Profile saved')
      onSaved(body.profile)
      onOpenChange(false)
    } catch {
      toast.error('Could not save the profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{profile ? 'Edit regional profile' : 'New regional profile'}</DialogTitle>
            <DialogDescription>A named sensory profile that client qualities can point at.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="rp-name" className="text-[12px]">Name</Label>
              <Input id="rp-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="rp-origin" className="text-[12px]">Origin</Label>
                <select
                  id="rp-origin"
                  className={selectClass}
                  value={origin}
                  onChange={(e) => {
                    setOrigin(e.target.value)
                    setRegion('')
                  }}
                >
                  <option value="">None</option>
                  {ORIGINS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rp-region" className="text-[12px]">Region</Label>
                <select
                  id="rp-region"
                  className={selectClass}
                  value={region}
                  disabled={regions.length === 0}
                  onChange={(e) => setRegion(e.target.value)}
                >
                  <option value="">None</option>
                  {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rp-description" className="text-[12px]">Description</Label>
              <Input id="rp-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1">
              <span className="text-[12px] font-medium">Notes</span>
              <div className="flex items-center justify-between gap-3 rounded-[6px] border px-3 py-2">
                <span className="text-[14px]">
                  {notes.length > 0 ? notes.map(leafTerm).join(', ') : <span className="text-muted-foreground">No notes picked</span>}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => setWheelOpen(true)}>
                  Pick notes ({notes.length}/{PROFILE_NOTE_CAP})
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SensoryWheelDialog
        open={wheelOpen}
        onOpenChange={setWheelOpen}
        title={name.trim() || 'Regional profile'}
        value={notes}
        cap={PROFILE_NOTE_CAP}
        onSave={(picks) => {
          setNotes(picks)
          setWheelOpen(false)
        }}
      />
    </>
  )
}
