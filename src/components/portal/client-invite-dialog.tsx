'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'

export function ClientInviteDialog({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/portal/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, first_name: firstName, last_name: lastName, company_id: companyId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to send invitation')
      toast.success(`Invitation sent to ${email}`)
      setOpen(false); setFirstName(''); setLastName(''); setEmail('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send invitation')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Invite portal user</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a portal user for {companyName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-first">First name</Label>
              <Input id="invite-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-last">Last name</Label>
              <Input id="invite-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button
            onClick={submit}
            disabled={submitting || !firstName || !lastName || !email}
            className="w-full bg-[#556b2f] hover:bg-[#465824] text-white"
          >
            {submitting ? 'Sending…' : 'Send invitation'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
