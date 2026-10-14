// src/components/clients/portal-access-card.tsx
'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { QC_KEY_LABELS, type QcKeySet } from '@/lib/portal/qc-keys'
import type { QcMember } from '@/lib/portal/qc-grants'
import type { InvitationSummary } from '@/lib/portal/portal-invitations'
import type { QcTeamActivityRow } from '@/lib/portal/team-activity'
import { TEAM_ACTION_VERBS } from '@/lib/portal/team-action-labels'
import { QcInviteDialog } from '@/components/portal/qc-invite-dialog'
import { QcAccessEditorDialog } from '@/components/portal/qc-access-editor-dialog'
import { runPortalAction } from '@/components/portal/run-portal-action'

function keySummary(keys: QcKeySet): string {
  return [...keys.views, ...keys.capabilities].map((k) => QC_KEY_LABELS[k]).join(', ')
}

function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}

export function PortalAccessCard({ companyId, companyName }: { companyId: string; companyName: string }) {
  const base = `/api/clients/${companyId}/portal-access`
  const [members, setMembers] = useState<QcMember[]>([])
  const [invitations, setInvitations] = useState<InvitationSummary[]>([])
  const [activity, setActivity] = useState<QcTeamActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<QcMember | null>(null)
  const [removing, setRemoving] = useState<QcMember | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(base)
    if (res.ok) {
      const body = await res.json()
      setMembers(body.members)
      setInvitations(body.invitations)
      setActivity(body.activity)
    } else {
      toast.error('Portal access could not be loaded')
    }
    setLoading(false)
  }, [base])

  useEffect(() => { load() }, [load])

  const call = (url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) =>
    runPortalAction((u, init) => fetch(u, init), url, method, body, load)

  return (
    <div className="space-y-6 rounded-[14px] border border-border p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold">Portal access</h3>
          <p className="text-[12px] text-muted-foreground">People at {companyName} who can sign in to the QC portal.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-9 rounded-[9px] text-[13px]">
            <a href={`/portal?company=${companyId}`} target="_blank" rel="noopener noreferrer">View as client</a>
          </Button>
          <QcInviteDialog endpoint={base} allowCompanyAdmin onDone={load} />
        </div>
      </div>

      {loading ? (
        <p className="text-[13px] text-muted-foreground">Loading...</p>
      ) : (
        <>
          <table className="w-full text-[13px]">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Person</th>
                <th className="py-2 font-medium">Access</th>
                <th className="py-2 font-medium">Last sign-in</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.length === 0 ? (
                <tr><td colSpan={4} className="py-4 text-muted-foreground">Nobody yet. Invite the first person.</td></tr>
              ) : members.map((m) => (
                <tr key={m.userId}>
                  <td className="py-2">
                    <div className="font-medium">{m.fullName || m.email}</div>
                    <div className="text-[12px] text-muted-foreground">{m.email}</div>
                  </td>
                  <td className="py-2">
                    {m.isCompanyAdmin && <Badge variant="secondary" className="mr-2">Company admin</Badge>}
                    <span className="text-muted-foreground">{keySummary(m.keys)}</span>
                  </td>
                  <td className="py-2 text-muted-foreground">{day(m.lastSignInAt)}</td>
                  <td className="py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(m)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => setRemoving(m)}>Remove</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {invitations.length > 0 && (
            <div>
              <h4 className="mb-2 text-[13px] font-semibold">Pending invitations</h4>
              <ul className="divide-y divide-border text-[13px]">
                {invitations.map((i) => (
                  <li key={i.id} className="flex items-center justify-between py-2">
                    <span>
                      {i.email}
                      {i.isCompanyAdmin && <Badge variant="secondary" className="ml-2">Company admin</Badge>}
                      <span className="ml-2 text-muted-foreground">expires {day(i.expiresAt)}</span>
                    </span>
                    <span>
                      <Button variant="ghost" size="sm" onClick={() => call(`${base}/invitations/${i.id}`, 'POST')}>Resend</Button>
                      <Button variant="ghost" size="sm" onClick={() => call(`${base}/invitations/${i.id}`, 'DELETE')}>Cancel</Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activity.length > 0 && (
            <div>
              <h4 className="mb-2 text-[13px] font-semibold">Recent activity</h4>
              <ul className="space-y-1 text-[12px] text-muted-foreground">
                {activity.map((a) => (
                  <li key={a.id}>{day(a.occurredAt)} · {a.actorName ?? 'Someone'} {TEAM_ACTION_VERBS[a.action] ?? a.action} {a.targetEmail}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {editing && (
        <QcAccessEditorDialog
          open={!!editing}
          onOpenChange={(o) => { if (!o) setEditing(null) }}
          personLabel={editing.fullName || editing.email || 'this person'}
          initial={editing.keys}
          initialAdmin={editing.isCompanyAdmin}
          allowCompanyAdmin
          onSave={(keys, isAdmin) => call(`${base}/${editing.userId}`, 'PATCH', {
            views: keys.views, capabilities: keys.capabilities, is_company_admin: isAdmin,
          })}
        />
      )}

      <AlertDialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove portal access?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.fullName || removing?.email} will no longer see {companyName} on the QC portal. Any sys portal access stays.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (removing) await call(`${base}/${removing.userId}`, 'DELETE'); setRemoving(null) }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
