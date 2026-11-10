'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, Info, Loader2, Plus, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import {
  PURPOSE_GROUPS, QC_EDITABLE_PURPOSES, mergePeople, portalAccessLabel, departments,
  type PersonContact, type PersonRow,
} from '@/lib/contacts/people'
import type { QcMember } from '@/lib/portal/qc-grants'
import type { InvitationSummary } from '@/lib/portal/portal-invitations'
import type { QcTeamActivityRow } from '@/lib/portal/team-activity'
import { TEAM_ACTION_VERBS } from '@/lib/portal/team-action-labels'
import { QcInviteDialog, type InvitePrefill } from '@/components/portal/qc-invite-dialog'
import { QcAccessEditorDialog } from '@/components/portal/qc-access-editor-dialog'
import { runPortalAction } from '@/components/portal/run-portal-action'
import { ContactDialog } from './contact-dialog'

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null

type PortalState =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'failed' }
  | { kind: 'ok'; members: QcMember[]; invitations: InvitationSummary[]; activity: QcTeamActivityRow[] }

/**
 * "Contacts and portal": one row per person at the company. The ticks are the
 * sys contact matrix itself (shared `contacts.routing_purposes`), so a tick
 * here is a tick in sys. QC staff tick only the QC certs column; every other
 * column is shown for context and edited in sys. Portal access sits on
 * the same row, matched by email.
 */
export function ClientPeopleTab({ companyId, companyName }: { companyId: string; companyName: string }) {
  const portalBase = `/api/clients/${companyId}/portal-access`
  const [contacts, setContacts] = useState<PersonContact[] | null>(null)
  const [contactsError, setContactsError] = useState<string | null>(null)
  const [portal, setPortal] = useState<PortalState>({ kind: 'loading' })
  const [pending, setPending] = useState<Set<string>>(new Set())

  const [contactDialog, setContactDialog] = useState<{ contact: PersonContact | null; seed?: Partial<PersonContact> } | null>(null)
  const [invite, setInvite] = useState<InvitePrefill | null>(null)
  const [editingAccess, setEditingAccess] = useState<QcMember | null>(null)
  const [removing, setRemoving] = useState<QcMember | null>(null)
  const [cancelling, setCancelling] = useState<InvitationSummary | null>(null)

  const loadContacts = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}/people`)
      if (!res.ok) throw new Error()
      const body = await res.json()
      setContacts(body.contacts ?? [])
      setContactsError(null)
    } catch {
      setContactsError('The contacts could not be loaded.')
    }
  }, [companyId])

  const loadPortal = useCallback(async () => {
    try {
      const res = await fetch(portalBase)
      if (res.status === 403) { setPortal({ kind: 'forbidden' }); return }
      if (!res.ok) throw new Error()
      const body = await res.json()
      setPortal({ kind: 'ok', members: body.members ?? [], invitations: body.invitations ?? [], activity: body.activity ?? [] })
    } catch {
      setPortal({ kind: 'failed' })
    }
  }, [portalBase])

  useEffect(() => { loadContacts(); loadPortal() }, [loadContacts, loadPortal])

  const rows = useMemo(() => mergePeople(
    contacts ?? [],
    portal.kind === 'ok' ? portal.members : [],
    portal.kind === 'ok' ? portal.invitations : [],
  ), [contacts, portal])

  const portalCall = (url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) =>
    runPortalAction((u, init) => fetch(u, init), url, method, body, loadPortal)

  async function toggle(contact: PersonContact, purpose: string, on: boolean) {
    const key = `${contact.id}:${purpose}`
    // One change per contact at a time: the route reads, edits and writes the
    // whole purposes array, so two overlapping saves could drop one tick.
    if ([...pending].some((k) => k.startsWith(`${contact.id}:`))) return
    setPending((p) => new Set(p).add(key))
    const before = contact.routing_purposes ?? []
    const apply = (purposes: string[]) =>
      setContacts((cs) => cs?.map((c) => (c.id === contact.id ? { ...c, routing_purposes: purposes } : c)) ?? cs)
    apply(on ? [...before.filter((p) => p !== purpose), purpose] : before.filter((p) => p !== purpose))
    try {
      const res = await fetch(`/api/companies/${companyId}/people/${contact.id}/purposes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose, on }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'That change was not saved')
      apply(body.contact?.routing_purposes ?? [])
    } catch (e) {
      apply(before)
      toast.error(e instanceof Error ? e.message : 'That change was not saved')
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(key); return n })
    }
  }

  const qcRecipients = (contacts ?? []).filter((c) => (c.routing_purposes ?? []).includes('qc_certificates')).length
  const onPortal = portal.kind === 'ok' ? portal.members.length : 0
  const canManagePortal = portal.kind === 'ok'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 text-[13px]">
          <span className="font-semibold">{rows.length} {rows.length === 1 ? 'person' : 'people'} at {companyName}</span>
          <span className="text-muted-foreground">
            {' · '}{qcRecipients} {qcRecipients === 1 ? 'receives' : 'receive'} QC certificates
            {canManagePortal && <>{' · '}{onPortal} on the portal</>}
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Same contacts as sys.wolthers.com
        </span>
        <Button variant="outline" size="sm" asChild className="h-8 rounded-[6px] text-[13px] gap-1.5">
          <a href={`/portal?company=${companyId}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" />View as client</a>
        </Button>
        <Button variant="outline" size="sm" onClick={() => setContactDialog({ contact: null })} className="h-8 rounded-[6px] text-[13px] gap-1.5">
          <Plus className="h-3.5 w-3.5" />Add contact
        </Button>
        {canManagePortal && (
          <Button size="sm" onClick={() => setInvite({})} className="h-8 rounded-[6px] text-[13px]">Invite to portal</Button>
        )}
      </div>

      {contactsError ? (
        <div className="flex items-center gap-3 text-[13px]">
          <span className="text-red-600 dark:text-red-400">{contactsError}</span>
          <Button variant="outline" size="sm" onClick={loadContacts}>Retry</Button>
        </div>
      ) : contacts == null ? (
        <div className="flex items-center gap-2 py-8 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading contacts</div>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-border">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80">
                <th className="px-3 pt-2.5 text-left font-medium" />
                {PURPOSE_GROUPS.map((g) => (
                  <th key={g.label} colSpan={g.purposes.length} className="border-l border-border px-2 pt-2.5 text-center font-medium">{g.label}</th>
                ))}
                <th className="border-l border-border px-3 pt-2.5 text-left font-medium">Portal</th>
                <th />
              </tr>
              <tr className="border-b border-border text-[12px] text-muted-foreground">
                <th className="px-3 pb-2 pt-1 text-left font-medium">Contact</th>
                {PURPOSE_GROUPS.map((g) => g.purposes.map((p, i) => (
                  <th
                    key={p.value}
                    title={p.label}
                    className={cn(
                      'whitespace-nowrap px-2 pb-2 pt-1 text-center font-medium',
                      i === 0 && 'border-l border-border',
                      QC_EDITABLE_PURPOSES.includes(p.value) && 'bg-muted/50',
                      p.value === 'qc_certificates' && 'text-foreground font-semibold',
                    )}
                  >
                    {p.short}
                  </th>
                )))}
                <th className="border-l border-border px-3 pb-2 pt-1 text-left font-medium">Access</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={16} className="px-3 py-8 text-center text-muted-foreground">No contacts at {companyName} yet. Add the first one.</td></tr>
              ) : rows.map((r) => (
                <PersonTableRow
                  key={r.key}
                  row={r}
                  pending={pending}
                  portal={portal}
                  onToggle={toggle}
                  onEditContact={(c) => setContactDialog({ contact: c })}
                  onAddAsContact={(row) => setContactDialog({
                    contact: null,
                    seed: { email: row.email, name: row.name !== row.email ? row.name : '' },
                  })}
                  onInvite={(row) => {
                    const [firstName, ...rest] = (row.contact?.is_group ? '' : row.name !== row.email ? row.name : '').split(' ')
                    setInvite({ email: row.email ?? '', firstName: firstName ?? '', lastName: rest.join(' ') })
                  }}
                  onChangeAccess={setEditingAccess}
                  onRemoveAccess={setRemoving}
                  onResend={(i) => portalCall(`${portalBase}/invitations/${i.id}`, 'POST')}
                  onCancelInvite={setCancelling}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="flex gap-2.5 rounded-[10px] border border-border p-3.5 text-[12px] text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            <span className="font-medium text-foreground">One list for email and portal.</span>{' '}
            The ticks are the sys contact matrix, so a tick here is a tick in sys and the other way round.
            Here you change who receives QC certificates; every other column is changed in sys.
            Portal access belongs to the person: invite them from their row.
          </p>
        </div>
        {portal.kind === 'ok' && portal.activity.length > 0 && (
          <div className="rounded-[10px] border border-border p-3.5">
            <h3 className="mb-2 text-[13px] font-semibold">Recent portal activity</h3>
            <ul className="space-y-1 text-[12px] text-muted-foreground">
              {portal.activity.slice(0, 6).map((a) => (
                <li key={a.id}>{day(a.occurredAt)} · {a.actorName ?? 'Someone'} {TEAM_ACTION_VERBS[a.action] ?? a.action} {a.targetEmail}</li>
              ))}
            </ul>
          </div>
        )}
        {portal.kind === 'forbidden' && (
          <p className="rounded-[10px] border border-border p-3.5 text-[12px] text-muted-foreground">
            Only global admins and quality managers manage portal access.
          </p>
        )}
        {portal.kind === 'failed' && (
          <div className="flex items-center gap-3 rounded-[10px] border border-border p-3.5 text-[12px]">
            <span className="text-muted-foreground">Portal access could not be loaded.</span>
            <Button variant="outline" size="sm" onClick={loadPortal}>Retry</Button>
          </div>
        )}
      </div>

      <ContactDialog
        open={!!contactDialog}
        onOpenChange={(o) => { if (!o) setContactDialog(null) }}
        companyId={companyId}
        companyName={companyName}
        contact={contactDialog?.contact ?? null}
        seed={contactDialog?.seed}
        onSaved={loadContacts}
      />

      {canManagePortal && (
        <QcInviteDialog
          endpoint={portalBase}
          allowCompanyAdmin
          hideTrigger
          open={!!invite}
          onOpenChange={(o) => { if (!o) setInvite(null) }}
          prefill={invite ?? undefined}
          onDone={loadPortal}
        />
      )}

      {editingAccess && (
        <QcAccessEditorDialog
          open={!!editingAccess}
          onOpenChange={(o) => { if (!o) setEditingAccess(null) }}
          personLabel={editingAccess.fullName || editingAccess.email || 'this person'}
          initial={editingAccess.keys}
          initialAdmin={editingAccess.isCompanyAdmin}
          allowCompanyAdmin
          onSave={(keys, isAdmin) => portalCall(`${portalBase}/${editingAccess.userId}`, 'PATCH', {
            views: keys.views, capabilities: keys.capabilities, is_company_admin: isAdmin,
          })}
        />
      )}

      <AlertDialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove portal access?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.fullName || removing?.email} will no longer see {companyName} on the QC portal. Their contact and any sys portal access stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (removing) await portalCall(`${portalBase}/${removing.userId}`, 'DELETE'); setRemoving(null) }}>
              Remove access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelling} onOpenChange={(o) => { if (!o) setCancelling(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel invitation?</AlertDialogTitle>
            <AlertDialogDescription>Cancel the invitation for {cancelling?.email}? Their link will stop working.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (cancelling) await portalCall(`${portalBase}/invitations/${cancelling.id}`, 'DELETE'); setCancelling(null) }}>
              Cancel invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PersonTableRow({
  row, pending, portal, onToggle, onEditContact, onAddAsContact, onInvite, onChangeAccess, onRemoveAccess, onResend, onCancelInvite,
}: {
  row: PersonRow
  pending: Set<string>
  portal: PortalState
  onToggle: (c: PersonContact, purpose: string, on: boolean) => void
  onEditContact: (c: PersonContact) => void
  onAddAsContact: (r: PersonRow) => void
  onInvite: (r: PersonRow) => void
  onChangeAccess: (m: QcMember) => void
  onRemoveAccess: (m: QcMember) => void
  onResend: (i: InvitationSummary) => void
  onCancelInvite: (i: InvitationSummary) => void
}) {
  const c = row.contact
  const purposes = c?.routing_purposes ?? []
  const depts = departments(c?.role)

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/40">
      <td className="min-w-[220px] px-3 py-2.5 align-top">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{row.name || row.email}</span>
          {c?.is_group && <span className="rounded-[4px] bg-muted px-1.5 py-px text-[11px] text-muted-foreground">Group inbox</span>}
          {!c && <span className="rounded-[4px] bg-muted px-1.5 py-px text-[11px] text-muted-foreground">Portal only</span>}
        </div>
        {row.email && row.name !== row.email && <div className="text-[12px] text-muted-foreground">{row.email}</div>}
        {depts.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {depts.map((d) => <span key={d} className="rounded-[4px] border border-border px-1.5 text-[11px] text-muted-foreground">{d}</span>)}
          </div>
        )}
      </td>

      {PURPOSE_GROUPS.map((g) => g.purposes.map((p, i) => {
        const editable = !!c && QC_EDITABLE_PURPOSES.includes(p.value)
        const on = purposes.includes(p.value)
        const busy = c ? [...pending].some((k) => k.startsWith(`${c.id}:`)) : false
        return (
          <td
            key={p.value}
            className={cn('px-2 py-2.5 text-center align-top', i === 0 && 'border-l border-border', QC_EDITABLE_PURPOSES.includes(p.value) && 'bg-muted/50')}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-label={`${row.name || row.email}: ${p.label}`}
              title={!c ? 'Add this person as a contact first' : editable ? p.label : `${p.label}: changed in sys`}
              disabled={!editable || busy}
              onClick={() => c && onToggle(c, p.value, !on)}
              className={cn(
                'mt-0.5 inline-grid h-4 w-4 place-items-center rounded-[3px] border transition-colors',
                on ? 'border-foreground bg-foreground text-background' : 'border-muted-foreground/50',
                editable ? 'cursor-pointer hover:border-foreground' : 'cursor-default opacity-45',
                busy && 'opacity-60',
              )}
            >
              {on && <Check className="h-3 w-3" strokeWidth={3} />}
            </button>
          </td>
        )
      }))}

      <td className="min-w-[200px] border-l border-border px-3 py-2.5 align-top text-[12px]">
        <PortalCell row={row} portal={portal} onInvite={onInvite} onChangeAccess={onChangeAccess}
          onRemoveAccess={onRemoveAccess} onResend={onResend} onCancelInvite={onCancelInvite} />
      </td>

      <td className="whitespace-nowrap px-3 py-2 text-right align-top">
        {c ? (
          <Button variant="ghost" size="sm" onClick={() => onEditContact(c)} className="h-7 rounded-[6px] px-2.5 text-[12px]">Edit</Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => onAddAsContact(row)} className="h-7 rounded-[6px] px-2.5 text-[12px]">Add as contact</Button>
        )}
      </td>
    </tr>
  )
}

function PortalCell({ row, portal, onInvite, onChangeAccess, onRemoveAccess, onResend, onCancelInvite }: {
  row: PersonRow
  portal: PortalState
  onInvite: (r: PersonRow) => void
  onChangeAccess: (m: QcMember) => void
  onRemoveAccess: (m: QcMember) => void
  onResend: (i: InvitationSummary) => void
  onCancelInvite: (i: InvitationSummary) => void
}) {
  if (portal.kind === 'loading') return <span className="text-muted-foreground">…</span>
  if (portal.kind !== 'ok') return <span className="text-muted-foreground">–</span>

  const link = 'text-[12px] font-medium text-foreground/80 hover:underline'
  if (row.member) {
    const m = row.member
    return (
      <Fragment>
        <div className="font-medium text-[13px]">
          {portalAccessLabel(m.keys)}
          {m.isCompanyAdmin && <span className="ml-1.5 rounded-[4px] bg-muted px-1.5 py-px text-[11px] font-normal text-muted-foreground">Admin</span>}
        </div>
        <div className="text-muted-foreground">{m.lastSignInAt ? `Last signed in ${day(m.lastSignInAt)}` : 'Not signed in yet'}</div>
        <div className="mt-1 flex gap-3">
          <button type="button" className={link} onClick={() => onChangeAccess(m)}>Change</button>
          <button type="button" className={link} onClick={() => onRemoveAccess(m)}>Remove</button>
        </div>
      </Fragment>
    )
  }
  if (row.invitation) {
    const i = row.invitation
    return (
      <Fragment>
        <div className="font-medium text-[13px]">Invited</div>
        <div className="text-muted-foreground">Link expires {day(i.expiresAt)}</div>
        <div className="mt-1 flex gap-3">
          <button type="button" className={link} onClick={() => onResend(i)}>Resend</button>
          <button type="button" className={link} onClick={() => onCancelInvite(i)}>Cancel</button>
        </div>
      </Fragment>
    )
  }
  if (row.contact?.is_group) return <span className="text-muted-foreground">Not for group inboxes</span>
  if (!row.email) return <span className="text-muted-foreground">No email</span>
  return (
    <Button variant="outline" size="sm" onClick={() => onInvite(row)} className="h-7 rounded-[6px] px-2.5 text-[12px]">Invite</Button>
  )
}
