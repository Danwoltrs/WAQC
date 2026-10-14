// src/components/portal/qc-invite-dialog.tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { QC_PRESETS, type QcKeySet } from '@/lib/portal/qc-keys'
import { QcKeyPicker } from './qc-key-picker'

/** The light portal look for a dialog opened from /portal (the staff app uses the default dark-aware one). */
export const PORTAL_DIALOG_TONE = 'bg-white text-neutral-900 border-neutral-200'

function startingKeys(ceiling?: QcKeySet): QcKeySet {
  const viewer = QC_PRESETS.find((p) => p.key === 'viewer')!.keys
  if (!ceiling) return viewer
  return {
    views: viewer.views.filter((k) => ceiling.views.includes(k)),
    capabilities: viewer.capabilities.filter((k) => ceiling.capabilities.includes(k)),
  }
}

export function QcInviteDialog({
  endpoint, allowCompanyAdmin, ceiling, onDone, tone = 'app',
}: {
  endpoint: string
  allowCompanyAdmin: boolean
  ceiling?: QcKeySet
  onDone: () => void
  tone?: 'app' | 'portal'
}) {
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [keys, setKeys] = useState<QcKeySet>(startingKeys(ceiling))
  const [isAdmin, setIsAdmin] = useState(false)
  const [busy, setBusy] = useState(false)

  function reset() {
    setFirstName(''); setLastName(''); setEmail(''); setKeys(startingKeys(ceiling)); setIsAdmin(false)
  }

  async function submit() {
    setBusy(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, first_name: firstName, last_name: lastName, views: keys.views, capabilities: keys.capabilities,
          is_company_admin: allowCompanyAdmin && isAdmin,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body.error ?? 'The invitation could not be sent'); return }
      if (body.emailSent === false) toast.warning('Saved, but the email could not be sent. Use Resend.')
      else toast.success(body.outcome === 'access_added' ? 'Access added. They can sign in now.' : 'Invitation sent.')
    } catch {
      toast.error('Could not reach the server. Please try again.')
      return
    } finally {
      setBusy(false)
    }
    reset()
    setOpen(false)
    onDone()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 rounded-[9px] text-[13px]">Invite</Button>
      </DialogTrigger>
      <DialogContent className={tone === 'portal' ? PORTAL_DIALOG_TONE : undefined}>
        <DialogHeader>
          <DialogTitle>Invite to the QC portal</DialogTitle>
          <DialogDescription>They get an email with a link to set up their access. The link works for 7 days.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <Input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <QcKeyPicker value={keys} onChange={setKeys} ceiling={ceiling} />
          {allowCompanyAdmin && (
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" className="h-4 w-4 accent-[#556b2f]" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
              Company admin (can invite colleagues and partners)
            </label>
          )}
        </div>
        <DialogFooter>
          <Button disabled={busy || !email || !firstName || keys.views.length === 0} onClick={submit}>
            {busy ? 'Sending...' : 'Send invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
