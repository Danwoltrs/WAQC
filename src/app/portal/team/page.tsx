'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { QC_KEY_LABELS } from '@/lib/portal/qc-keys'
import type { QcMember } from '@/lib/portal/qc-grants'
import type { InvitationSummary } from '@/lib/portal/portal-invitations'
import { PortalSessionEnded } from '@/lib/portal/portal-fetch'
import { normalizeTeamData, teamEndpoints, type TeamData } from '@/lib/portal/team-endpoints'
import { PortalNotice, usePortal } from '@/components/portal/portal-context'
import { QcInviteDialog } from '@/components/portal/qc-invite-dialog'
import { QcAccessEditorDialog } from '@/components/portal/qc-access-editor-dialog'
import { runPortalAction } from '@/components/portal/run-portal-action'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const DIALOG_TONE = 'bg-white text-neutral-900 border-neutral-200'

export default function PortalTeamPage() {
  const { fetch: portalFetch, company, me } = usePortal()
  // Wolthers staff viewing the portal as this client: their changes go through
  // the client page's staff routes and may name a company admin.
  const staffView = me.viewAs
  const endpoints = useMemo(() => teamEndpoints(staffView, company.id), [staffView, company.id])
  const [data, setData] = useState<TeamData | null>(null)
  const [denied, setDenied] = useState(false)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<QcMember | null>(null)
  const [removing, setRemoving] = useState<QcMember | null>(null)
  const [cancelling, setCancelling] = useState<InvitationSummary | null>(null)
  const [resending, setResending] = useState<ReadonlySet<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const res = await portalFetch(endpoints.list)
      setDenied(res.status === 403)
      if (res.ok) {
        setData(normalizeTeamData(await res.json()))
        setFailed(false)
      } else if (res.status !== 403) {
        setFailed(true)
      }
    } catch (e) {
      // session ended: portalFetch already sent the person to sign in
      if (e instanceof PortalSessionEnded) return
      setFailed(true)
    }
  }, [portalFetch, endpoints])

  useEffect(() => {
    setData(null)
    setDenied(false)
    setFailed(false)
    if (company.isCompanyAdmin) void load()
  }, [load, company.isCompanyAdmin, company.id])

  // A session that ended mid-action is already redirecting: stay silent instead of toasting a network error.
  const quietFetch = useCallback(async (url: string, init?: RequestInit) => {
    try {
      return await portalFetch(url, init)
    } catch (e) {
      if (e instanceof PortalSessionEnded) return new Promise<Response>(() => {})
      throw e
    }
  }, [portalFetch])

  const call = (path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) =>
    runPortalAction(quietFetch, path, method, body, load)

  // One send per invitation at a time: a double click must not mail twice.
  const resend = async (id: string) => {
    if (resending.has(id)) return
    setResending((s) => new Set(s).add(id))
    try {
      await call(endpoints.invitation(id), 'POST')
    } finally {
      setResending((s) => { const n = new Set(s); n.delete(id); return n })
    }
  }

  if (!company.isCompanyAdmin || denied) return <PortalNotice>Team management is not part of your access.</PortalNotice>
  if (failed && !data) return <PortalNotice>Could not load the team. Please refresh.</PortalNotice>
  if (!data) return <div className="text-sm text-neutral-500">Loading...</div>

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Team</h1>
        <QcInviteDialog endpoint={endpoints.invite} allowCompanyAdmin={staffView}
          ceiling={staffView ? undefined : data.ceiling} onDone={load} tone="portal" />
      </div>
      {failed && <PortalNotice>Could not refresh the team. Showing the last loaded list.</PortalNotice>}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-100">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">Person</th>
              <th className="px-5 py-3 font-medium">Access</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {data.members.length === 0 && (
              <tr><td colSpan={3} className="px-5 py-8 text-center text-neutral-500">Nobody yet. Invite the first person.</td></tr>
            )}
            {data.members.map((m) => {
              // A company admin cannot change themselves or another admin; staff can change anyone.
              const locked = !staffView && (m.userId === data.selfId || m.isCompanyAdmin)
              return (
                <tr key={m.userId}>
                  <td className="px-5 py-3">
                    <div className="text-neutral-900">{m.fullName || m.email}{m.userId === data.selfId ? ' (you)' : ''}</div>
                    <div className="text-xs text-neutral-500">{m.email}</div>
                  </td>
                  <td className="px-5 py-3 text-neutral-600">
                    {m.isCompanyAdmin ? 'Company admin' : [...m.keys.views, ...m.keys.capabilities].map((k) => QC_KEY_LABELS[k]).join(', ')}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {!locked && (
                      <>
                        <button className="mr-3 text-[#556b2f] hover:underline" onClick={() => setEditing(m)}>Edit</button>
                        <button className="text-[#ef4444] hover:underline" onClick={() => setRemoving(m)}>Remove</button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {data.invitations.length > 0 && (
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-100">
          <h2 className="mb-3 text-sm font-medium text-neutral-900">Pending invitations</h2>
          <ul className="divide-y divide-neutral-100 text-sm">
            {data.invitations.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2">
                <span className="text-neutral-900">
                  {i.email}
                  {i.isCompanyAdmin && staffView && <span className="ml-2 text-xs text-neutral-500">Company admin</span>}
                </span>
                {i.isCompanyAdmin && !staffView ? (
                  <span className="text-xs text-neutral-500">Sent by Wolthers</span>
                ) : (
                  <span>
                    <button className="mr-3 text-[#556b2f] hover:underline disabled:opacity-50" disabled={resending.has(i.id)} onClick={() => void resend(i.id)}>{resending.has(i.id) ? 'Sending...' : 'Resend'}</button>
                    <button className="text-neutral-500 hover:underline" onClick={() => setCancelling(i)}>Cancel</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && (
        <QcAccessEditorDialog
          open={!!editing}
          onOpenChange={(o) => { if (!o) setEditing(null) }}
          personLabel={editing.fullName || editing.email || 'this person'}
          initial={editing.keys}
          initialAdmin={staffView && editing.isCompanyAdmin}
          allowCompanyAdmin={staffView}
          ceiling={staffView ? undefined : data.ceiling}
          tone="portal"
          onSave={(keys, isAdmin) => call(endpoints.member(editing.userId), 'PATCH', staffView
            ? { views: keys.views, capabilities: keys.capabilities, is_company_admin: isAdmin }
            : { views: keys.views, capabilities: keys.capabilities })}
        />
      )}

      <AlertDialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null) }}>
        <AlertDialogContent className={DIALOG_TONE}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from the team?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.fullName || removing?.email} will no longer see {company.name} on the QC portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (removing) await call(endpoints.member(removing.userId), 'DELETE'); setRemoving(null) }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelling} onOpenChange={(o) => { if (!o) setCancelling(null) }}>
        <AlertDialogContent className={DIALOG_TONE}>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              Cancel the invitation for {cancelling?.email}? Their link will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (cancelling) await call(endpoints.invitation(cancelling.id), 'DELETE'); setCancelling(null) }}>
              Cancel invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
