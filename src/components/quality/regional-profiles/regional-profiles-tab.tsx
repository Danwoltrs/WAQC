'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { leafTerm, type RegionalProfile } from '@/lib/sensory'
import { ProfileEditorDialog } from './profile-editor-dialog'

const GRID = 'grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)_80px_160px] items-center gap-x-4 px-6'
const headCell = 'text-[11px] font-semibold tracking-wider uppercase text-muted-foreground'

export function RegionalProfilesTab() {
  const [profiles, setProfiles] = useState<RegionalProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<RegionalProfile | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/regional-profiles')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      setProfiles(body.profiles ?? [])
    } catch {
      toast.error('Could not load regional profiles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openEditor = (profile: RegionalProfile | null) => {
    setEditing(profile)
    setEditorOpen(true)
  }

  const toggleActive = async (profile: RegionalProfile) => {
    try {
      const res = await fetch(`/api/regional-profiles/${profile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !profile.is_active }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error || 'Could not update the profile')
        return
      }
      setProfiles((prev) => prev.map((p) => (p.id === profile.id ? body.profile : p)))
    } catch {
      toast.error('Could not update the profile')
    }
  }

  const onSaved = (saved: RegionalProfile) => {
    setProfiles((prev) => {
      const next = prev.some((p) => p.id === saved.id) ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved]
      return next.sort((a, b) => a.name.localeCompare(b.name))
    })
  }

  return (
    <div>
      <div className="flex items-center justify-end px-6 py-3 border-b">
        <Button onClick={() => openEditor(null)}>
          <Plus />
          New profile
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading regional profiles...</div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-12 text-[14px] text-muted-foreground">No regional profiles yet.</div>
      ) : (
        <div>
          <div className={`hidden md:grid ${GRID} h-9 bg-muted/40 border-b`}>
            <span className={headCell}>Profile</span>
            <span className={headCell}>Region</span>
            <span className={headCell}>Notes</span>
            <span className={headCell}>Status</span>
            <span aria-hidden />
          </div>
          {profiles.map((p) => (
            <div key={p.id} data-profile-row className={`${GRID} py-3 border-b text-[14px] max-md:grid-cols-1 max-md:gap-y-1`}>
              <div className="min-w-0">
                <div data-field="name" className="font-semibold truncate">{p.name}</div>
                {p.description && <div className="text-[12px] text-muted-foreground truncate">{p.description}</div>}
              </div>
              <span className="truncate text-muted-foreground">{[p.region, p.origin].filter(Boolean).join(', ') || '-'}</span>
              <span className="truncate">{p.notes.length > 0 ? p.notes.map(leafTerm).join(', ') : '-'}</span>
              <span className={p.is_active ? 'text-[12px]' : 'text-[12px] text-muted-foreground'}>
                {p.is_active ? 'Active' : 'Inactive'}
              </span>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => openEditor(p)}>Edit</Button>
                <Button variant="outline" size="sm" onClick={() => toggleActive(p)}>
                  {p.is_active ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProfileEditorDialog open={editorOpen} onOpenChange={setEditorOpen} profile={editing} onSaved={onSaved} />
    </div>
  )
}
