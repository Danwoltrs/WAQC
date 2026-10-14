# Client Portal Accounts — Part E: Staff and team UI, database lockdown, Phase A retirement (Tasks 18–22)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Read first: the plan index `docs/superpowers/plans/2026-10-14-client-portal-accounts.md` and the spec `docs/superpowers/specs/2026-10-14-client-portal-accounts-design.md`. Parts A–D must be done.

---

### Task 18: Staff Portal access card and shared dialogs

The "Company admin" switch sets QC's own admin key `qc_manage_users` (the staff routes of Task 12 send `is_company_admin`; the server writes the key). It has nothing to do with sys's `manage_users`: a sys portal admin is not a QC admin. The member list is the company's `qc_portal_access` rows (ruling R11): QC access only, never sys grants, so the card never shows or changes sys access, and a person's sys access is invisible here (sys staff screens, in turn, do not show QC access: this card is where it is seen). Client components here import only pure modules (`qc-keys`, `team-action-labels`) and types.

**Files:**
- Create: `src/components/portal/qc-key-picker.tsx`, `src/components/portal/qc-key-picker.test.tsx`
- Create: `src/components/portal/run-portal-action.ts`, `src/components/portal/run-portal-action.test.ts` (the one client helper for a write + toast + reload, shared with Task 19)
- Create: `src/components/portal/qc-invite-dialog.tsx`
- Create: `src/components/portal/qc-access-editor-dialog.tsx`
- Create: `src/components/clients/portal-access-card.tsx`
- Modify: `src/components/clients/client-detail-view.tsx` (remove the Phase A invite button; add a "Portal access" tab)
- Delete: `src/components/portal/client-invite-dialog.tsx`, `src/components/portal/client-invite-dialog.test.tsx`

**Interfaces:**
- Consumes: `QC_PRESETS`, `QC_VIEWS`, `QC_CAPABILITIES`, `QC_KEY_LABELS`, `normalizeQcKeys`, `QcKeySet` (Task 2); `TEAM_ACTION_VERBS` (`src/lib/portal/team-action-labels.ts`, Task 11); staff routes (Task 12); `QcMember`, `InvitationSummary`, `QcTeamActivityRow` types.
- Produces:
  - `QcKeyPicker` props: `{ value: QcKeySet; onChange(next: QcKeySet): void; ceiling?: QcKeySet }`
  - `runPortalAction(doFetch: (url: string, init?: RequestInit) => Promise<Response>, url: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown, reload: () => Promise<void>): Promise<boolean>`
  - `PORTAL_DIALOG_TONE: string` (exported from `qc-invite-dialog.tsx`)
  - `QcInviteDialog` props: `{ endpoint: string; allowCompanyAdmin: boolean; ceiling?: QcKeySet; onDone(): void; tone?: 'app' | 'portal' }`
  - `QcAccessEditorDialog` props: `{ open: boolean; onOpenChange(open: boolean): void; personLabel: string; initial: QcKeySet; initialAdmin: boolean; allowCompanyAdmin: boolean; ceiling?: QcKeySet; onSave(keys: QcKeySet, isCompanyAdmin: boolean): Promise<boolean>; tone?: 'app' | 'portal' }`
  - `PortalAccessCard` props: `{ companyId: string; companyName: string }`

- [ ] **Step 1: Write the failing tests (picker, write helper)**

```tsx
// src/components/portal/qc-key-picker.test.tsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QcKeyPicker } from './qc-key-picker'

describe('QcKeyPicker', () => {
  it('applies a preset', () => {
    const onChange = vi.fn()
    render(<QcKeyPicker value={{ views: [], capabilities: [] }} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Viewer' }))
    expect(onChange).toHaveBeenCalledWith({ views: ['qc_samples', 'qc_certificates', 'qc_dashboard', 'qc_reports'], capabilities: [] })
  })

  it('toggles a key and keeps registry order', () => {
    const onChange = vi.fn()
    render(<QcKeyPicker value={{ views: ['qc_certificates'], capabilities: [] }} onChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Samples and contracts' }))
    expect(onChange).toHaveBeenCalledWith({ views: ['qc_samples', 'qc_certificates'], capabilities: [] })
  })

  it('disables keys above the ceiling and clamps presets to it', () => {
    const onChange = vi.fn()
    render(<QcKeyPicker value={{ views: [], capabilities: [] }} onChange={onChange}
      ceiling={{ views: ['qc_samples', 'qc_certificates'], capabilities: [] }} />)
    expect(screen.getByRole('checkbox', { name: 'Dashboard' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Full' }))
    expect(onChange).toHaveBeenCalledWith({ views: ['qc_samples', 'qc_certificates'], capabilities: [] })
  })
})
```

```ts
// src/components/portal/run-portal-action.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const t = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: t.error, warning: t.warning } }))

import { runPortalAction } from './run-portal-action'

const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

beforeEach(() => { t.error.mockReset(); t.warning.mockReset() })

describe('runPortalAction', () => {
  it('sends JSON, reloads and answers true', async () => {
    const doFetch = answer(200, { ok: true })
    const reload = vi.fn(async () => {})
    expect(await runPortalAction(doFetch, '/x', 'PATCH', { views: ['qc_samples'] }, reload)).toBe(true)
    expect(doFetch).toHaveBeenCalledWith('/x', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ views: ['qc_samples'] }),
    })
    expect(reload).toHaveBeenCalled()
  })

  it('shows the server error and does not reload', async () => {
    const reload = vi.fn(async () => {})
    expect(await runPortalAction(answer(409, { error: 'Already on the team' }), '/x', 'POST', undefined, reload)).toBe(false)
    expect(t.error).toHaveBeenCalledWith('Already on the team')
    expect(reload).not.toHaveBeenCalled()
  })

  it('warns when the email could not be sent', async () => {
    await runPortalAction(answer(200, { ok: true, emailSent: false }), '/x', 'POST', undefined, vi.fn(async () => {}))
    expect(t.warning).toHaveBeenCalledWith('Saved, but the email could not be sent.')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/portal/qc-key-picker.test.tsx src/components/portal/run-portal-action.test.ts`
Expected: FAIL, cannot resolve `./qc-key-picker` and `./run-portal-action`.

- [ ] **Step 3: Implement the picker and the write helper** (native checkboxes: they look right in both the dark staff app and the light portal, and stay accessible)

```tsx
// src/components/portal/qc-key-picker.tsx
'use client'
import { QC_CAPABILITIES, QC_KEY_LABELS, QC_PRESETS, QC_VIEWS, normalizeQcKeys, type QcKeySet } from '@/lib/portal/qc-keys'

export function QcKeyPicker({ value, onChange, ceiling }: { value: QcKeySet; onChange: (next: QcKeySet) => void; ceiling?: QcKeySet }) {
  const viewAllowed = (k: string) => !ceiling || (ceiling.views as string[]).includes(k)
  const capabilityAllowed = (k: string) => !ceiling || (ceiling.capabilities as string[]).includes(k)

  function applyPreset(keys: QcKeySet) {
    onChange({ views: keys.views.filter(viewAllowed), capabilities: keys.capabilities.filter(capabilityAllowed) })
  }

  function toggle(kind: 'views' | 'capabilities', key: string) {
    const current = value[kind] as string[]
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    onChange(normalizeQcKeys({ ...value, [kind]: next }))
  }

  function box(kind: 'views' | 'capabilities', key: (typeof QC_VIEWS)[number] | (typeof QC_CAPABILITIES)[number]) {
    const allowed = kind === 'views' ? viewAllowed(key) : capabilityAllowed(key)
    const id = `qc-key-${key}`
    return (
      <label key={key} htmlFor={id} className={`flex items-center gap-2 text-[13px] ${allowed ? '' : 'opacity-40'}`}
        title={allowed ? undefined : 'Not part of your own access'}>
        <input id={id} type="checkbox" className="h-4 w-4 accent-[#556b2f]" disabled={!allowed}
          checked={(value[kind] as string[]).includes(key)} onChange={() => toggle(kind, key)} />
        {QC_KEY_LABELS[key]}
      </label>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {QC_PRESETS.map((p) => (
          <button key={p.key} type="button" onClick={() => applyPreset(p.keys)}
            className="rounded-full border px-3 py-1 text-[12px] hover:bg-black/5">
            {p.label}
          </button>
        ))}
      </div>
      <div>
        <div className="mb-2 text-[12px] font-medium opacity-70">Pages</div>
        <div className="grid grid-cols-2 gap-2">{QC_VIEWS.map((k) => box('views', k))}</div>
      </div>
      <div>
        <div className="mb-2 text-[12px] font-medium opacity-70">Actions</div>
        <div className="grid grid-cols-2 gap-2">{QC_CAPABILITIES.map((k) => box('capabilities', k))}</div>
      </div>
    </div>
  )
}
```

```ts
// src/components/portal/run-portal-action.ts
import { toast } from 'sonner'

/**
 * One write from the staff Portal access card or the portal Team page: send
 * it, show the server's error or an email warning, reload on success.
 * `doFetch` is window.fetch on the staff card and the company-scoped portal
 * fetch on the Team page.
 */
export async function runPortalAction(
  doFetch: (url: string, init?: RequestInit) => Promise<Response>,
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
  reload: () => Promise<void>,
): Promise<boolean> {
  const res = await doFetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    toast.error(json.error ?? 'That did not work')
    return false
  }
  if (json.emailSent === false) toast.warning('Saved, but the email could not be sent.')
  await reload()
  return true
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/portal/qc-key-picker.test.tsx src/components/portal/run-portal-action.test.ts`
Expected: PASS.

- [ ] **Step 5: The two dialogs**

```tsx
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
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, first_name: firstName, last_name: lastName, views: keys.views, capabilities: keys.capabilities,
        is_company_admin: allowCompanyAdmin && isAdmin,
      }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(body.error ?? 'The invitation could not be sent'); return }
    if (body.emailSent === false) toast.warning('Saved, but the email could not be sent. Use Resend.')
    else toast.success(body.outcome === 'access_added' ? 'Access added. They can sign in now.' : 'Invitation sent.')
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
```

```tsx
// src/components/portal/qc-access-editor-dialog.tsx
'use client'
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { QcKeySet } from '@/lib/portal/qc-keys'
import { QcKeyPicker } from './qc-key-picker'
import { PORTAL_DIALOG_TONE } from './qc-invite-dialog'

export function QcAccessEditorDialog({
  open, onOpenChange, personLabel, initial, initialAdmin, allowCompanyAdmin, ceiling, onSave, tone = 'app',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  personLabel: string
  initial: QcKeySet
  initialAdmin: boolean
  allowCompanyAdmin: boolean
  ceiling?: QcKeySet
  onSave: (keys: QcKeySet, isCompanyAdmin: boolean) => Promise<boolean>
  tone?: 'app' | 'portal'
}) {
  const [keys, setKeys] = useState(initial)
  const [isAdmin, setIsAdmin] = useState(initialAdmin)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setKeys(initial); setIsAdmin(initialAdmin) }
  }, [open, initial, initialAdmin])

  async function save() {
    setBusy(true)
    const ok = await onSave(keys, isAdmin)
    setBusy(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={tone === 'portal' ? PORTAL_DIALOG_TONE : undefined}>
        <DialogHeader>
          <DialogTitle>Access for {personLabel}</DialogTitle>
          <DialogDescription>Choose the pages and actions this person has on the QC portal.</DialogDescription>
        </DialogHeader>
        <QcKeyPicker value={keys} onChange={setKeys} ceiling={ceiling} />
        {allowCompanyAdmin && (
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" className="h-4 w-4 accent-[#556b2f]" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            Company admin (can invite colleagues and partners)
          </label>
        )}
        <DialogFooter>
          <Button disabled={busy || keys.views.length === 0} onClick={save}>{busy ? 'Saving...' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 6: The Portal access card**

```tsx
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
```

(If `Button` does not support `asChild` in this repo, check `src/components/ui/button.tsx`; shadcn's does.)

- [ ] **Step 7: Mount it on the client page; drop the Phase A button**

In `src/components/clients/client-detail-view.tsx`:
- Delete `import { ClientInviteDialog } from '@/components/portal/client-invite-dialog'` (line ~25) and the `<ClientInviteDialog companyId={client.id} companyName={displayName} />` line (~684).
- Add `import { PortalAccessCard } from '@/components/clients/portal-access-card'`.
- After the Contacts `TabsTrigger` add:

```tsx
          <TabsTrigger value="portal" className="px-4 py-1.5 text-[13px] rounded-[7px] data-[state=active]:shadow-sm">
            Portal access
          </TabsTrigger>
```

- After the Contacts `TabsContent` (ends ~line 805) add:

```tsx
        <TabsContent value="portal" className="space-y-4 mt-4">
          <PortalAccessCard companyId={client.id} companyName={displayName} />
        </TabsContent>
```

Then `git rm src/components/portal/client-invite-dialog.tsx src/components/portal/client-invite-dialog.test.tsx` and `grep -rn "client-invite-dialog\|ClientInviteDialog" src` → no hits.

- [ ] **Step 8: Typecheck, test, commit**

Run: `npx tsc --noEmit -p .` and `npx vitest run src/components/portal src/components/clients`
Expected: no errors; PASS.

```bash
git add src/components/portal/qc-key-picker.tsx src/components/portal/qc-key-picker.test.tsx src/components/portal/qc-invite-dialog.tsx \
  src/components/portal/run-portal-action.ts src/components/portal/run-portal-action.test.ts \
  src/components/portal/qc-access-editor-dialog.tsx src/components/clients/portal-access-card.tsx src/components/clients/client-detail-view.tsx
git rm -q src/components/portal/client-invite-dialog.tsx src/components/portal/client-invite-dialog.test.tsx
git commit -m "feat(clients): Portal access tab — invite, company admin, edit keys, remove, resend/cancel, activity, view as client"
```

---

### Task 19: Team page `/portal/team`

Shown to a QC company admin (`qc_manage_users` in their `qc_portal_access` row on the current company, `company.isCompanyAdmin`). The member list is the company's `qc_portal_access` rows; the admin cannot edit or remove themselves or another QC company admin (the routes refuse it too, Task 14). sys portal access, sys admin status included, plays no part here.

**Files:**
- Create: `src/app/portal/team/page.tsx`

**Interfaces:**
- Consumes: `usePortal`, `PortalNotice` (Task 16); `QcInviteDialog`, `QcAccessEditorDialog`, `runPortalAction` (Task 18); team routes (Task 14); `withCompany` (Task 16).

- [ ] **Step 1: Write the page**

```tsx
// src/app/portal/team/page.tsx
'use client'
import { useCallback, useEffect, useState } from 'react'
import { QC_KEY_LABELS, type QcKeySet } from '@/lib/portal/qc-keys'
import type { QcMember } from '@/lib/portal/qc-grants'
import type { InvitationSummary } from '@/lib/portal/portal-invitations'
import { withCompany } from '@/lib/portal/portal-fetch'
import { PortalNotice, usePortal } from '@/components/portal/portal-context'
import { QcInviteDialog } from '@/components/portal/qc-invite-dialog'
import { QcAccessEditorDialog } from '@/components/portal/qc-access-editor-dialog'
import { runPortalAction } from '@/components/portal/run-portal-action'

interface TeamData {
  members: QcMember[]
  invitations: InvitationSummary[]
  ceiling: QcKeySet
  selfId: string
}

export default function PortalTeamPage() {
  const { fetch: portalFetch, company } = usePortal()
  const [data, setData] = useState<TeamData | null>(null)
  const [editing, setEditing] = useState<QcMember | null>(null)

  const load = useCallback(async () => {
    const res = await portalFetch('/api/portal/team')
    if (res.ok) setData(await res.json())
  }, [portalFetch])

  useEffect(() => { if (company.isCompanyAdmin) load().catch(() => {}) }, [load, company.isCompanyAdmin, company.id])

  const call = (path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) =>
    runPortalAction(portalFetch, path, method, body, load)

  if (!company.isCompanyAdmin) return <PortalNotice>Only company admins manage the team.</PortalNotice>
  if (!data) return <div className="text-sm text-neutral-500">Loading...</div>

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Team</h1>
        <QcInviteDialog endpoint={withCompany('/api/portal/team', company.id)} allowCompanyAdmin={false}
          ceiling={data.ceiling} onDone={load} tone="portal" />
      </div>

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
            {data.members.map((m) => {
              const locked = m.userId === data.selfId || m.isCompanyAdmin
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
                        <button className="text-[#ef4444] hover:underline"
                          onClick={() => call(`/api/portal/team/${m.userId}`, 'DELETE')}>Remove</button>
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
                <span className="text-neutral-900">{i.email}</span>
                {i.isCompanyAdmin ? (
                  <span className="text-xs text-neutral-500">Sent by Wolthers</span>
                ) : (
                  <span>
                    <button className="mr-3 text-[#556b2f] hover:underline" onClick={() => call(`/api/portal/team/invitations/${i.id}`, 'POST')}>Resend</button>
                    <button className="text-neutral-500 hover:underline" onClick={() => call(`/api/portal/team/invitations/${i.id}`, 'DELETE')}>Cancel</button>
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
          initialAdmin={false}
          allowCompanyAdmin={false}
          ceiling={data.ceiling}
          tone="portal"
          onSave={(keys) => call(`/api/portal/team/${editing.userId}`, 'PATCH', { views: keys.views, capabilities: keys.capabilities })}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit -p .` → no errors.

```bash
git add src/app/portal/team/page.tsx
git commit -m "feat(portal): Team page for company admins — invite colleagues and partners, edit within their own access, remove"
```

---

### Task 20: Staff accept page reads its invitation server-side; drop anonymous listing

**Files:**
- Create: `src/app/api/auth/invitation/route.ts`
- Modify: `src/app/auth/accept-invite/page.tsx:42-56` (the `user_invitations` read)
- Create: `database/migrations/20261014000003_drop_anon_invitation_listing.sql`

**Interfaces:**
- Consumes: `portalServiceClient` (Task 8), `isExternalQcRole` (Task 6).
- Produces: `GET /api/auth/invitation?token=` → `{ id, email, first_name, last_name, qc_role, laboratory_id, is_cupper, is_q_grader, qc_enabled, status, expires_at }` | 404 | 410.

- [ ] **Step 1: Read the live policies first** (Daniel pastes; read-only, before any DROP)

```sql
-- Read-only: every live policy on user_invitations.
SELECT policyname, permissive, cmd, roles::text AS roles,
       coalesce(qual, '-') AS using_expression,
       coalesce(with_check, '-') AS check_expression
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_invitations'
ORDER BY policyname;
```

Expected: an anonymous read policy named "Public can view pending invitations by token" and/or "public_invitations_select_policy" (roles `{anon}` or `{public}`, `using_expression` about `status = 'pending'`). If the live names differ, put the live names in the `DROP POLICY` lines of Step 5 before handing the SQL over; if no anonymous read policy exists, tell Daniel and drop nothing.

- [ ] **Step 2: The route**

```ts
// src/app/api/auth/invitation/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { portalServiceClient } from '@/lib/portal/qc-portal-gate'
import { isExternalQcRole } from '@/lib/auth/new-profile'

/**
 * Public: the staff invitation behind a /auth/accept-invite link. Replaces
 * the page's anonymous table read, so the "anyone can list pending
 * invitations" policy can be dropped (migration 20261014000003).
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? ''
  if (token.length < 10) return NextResponse.json({ error: 'Invitation not found or has expired' }, { status: 404 })
  const { data } = await portalServiceClient()
    .from('user_invitations')
    .select('id, email, first_name, last_name, qc_role, laboratory_id, is_cupper, is_q_grader, qc_enabled, status, expires_at')
    .eq('invitation_token', token)
    .eq('status', 'pending')
    .maybeSingle()
  if (!data || isExternalQcRole(data.qc_role)) {
    return NextResponse.json({ error: 'Invitation not found or has expired' }, { status: 404 })
  }
  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invitation has expired' }, { status: 410 })
  }
  return NextResponse.json(data)
}
```

- [ ] **Step 3: The page uses it**

In `src/app/auth/accept-invite/page.tsx`, replace

```ts
      const { data, error} = await supabase
        .from('user_invitations')
        .select('*')
        .eq('invitation_token', token)
        .eq('status', 'pending')
        .single()
```

with

```ts
      const res = await fetch(`/api/auth/invitation?token=${encodeURIComponent(token)}`)
      const data = res.ok ? await res.json() : null
      const error = res.ok ? null : await res.json().catch(() => ({ error: 'Invitation not found' }))
```

The checks that follow (`if (error || !data)`, the `expires_at` checks) stay as they are. Run `grep -n "supabase" src/app/auth/accept-invite/page.tsx`: the remaining uses (sign-up, Microsoft sign-in) are unchanged.

- [ ] **Step 4: Typecheck, route guard, commit the code**

Run: `npx tsc --noEmit -p .` and `npx vitest run src/app/api/route-exports.test.ts` → PASS.

```bash
git add src/app/api/auth/invitation/route.ts src/app/auth/accept-invite/page.tsx
git commit -m "fix(auth): staff accept page reads its invitation through a server route"
```

- [ ] **Step 5: The SQL** (applied only after Step 4 is deployed)

```sql
-- Anonymous visitors could list every pending staff invitation, tokens
-- included ("Public can view pending invitations by token", and the older
-- public_invitations_select_policy). The accept page now reads its
-- invitation through /api/auth/invitation with the service role.
-- Apply only after that code is live.

DROP POLICY IF EXISTS "Public can view pending invitations by token" ON public.user_invitations;
DROP POLICY IF EXISTS "public_invitations_select_policy" ON public.user_invitations;

-- Verification: no policy left that lets anon read the table.
SELECT policyname, permissive, cmd, roles::text AS roles,
       coalesce(qual, '-') AS using_expression
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_invitations'
ORDER BY policyname;
```

Save as `database/migrations/20261014000003_drop_anon_invitation_listing.sql`, lint (`grep -n -i into` → no hits), commit, and give it to Daniel with the note "apply after the accept-page change is deployed". Expected result: the invitations insert/select/update policies and the three sys `*_deny` policies; nothing with `roles` = `{anon}` or `{public}` and `status = 'pending'` alone.

```bash
git add database/migrations/20261014000003_drop_anon_invitation_listing.sql
git commit -m "fix(db): drop the anonymous pending-invitation listing"
```

---

### Task 21: Writer inventory, restrictive write policies, SQL checks

Today any signed-in user who is not external can update and insert `samples`, create certificates, insert cupping scores and write `qc_client_settings` / `companies`. External users are already blocked by sys's deny policies; this closes it for everyone else who is not WAQC staff. The risk is a writer we do not know about, so it starts with an inventory.

**Service-role-only tables** (no policy work here, checked by CHECK 4 in Step 5): `portal_invitations` (Task 4) and `qc_portal_access` (Task 9, ruling R11). Both have RLS on, no policies, and no rights for `anon` or `authenticated`; every reader and writer in the app uses the service-role client. Leave them out of the restrictive-policy migrations below, and never add a policy to them: a `qc_portal_access` row readable with a user's own JWT would tell any signed-in user who has QC access where.

**Files:**
- Create: `database/checks/2026-10-14-qc-table-writers.sql`
- Create: `database/migrations/20261014000004_waqc_staff_write_policies_config.sql`
- Create: `database/migrations/20261014000005_waqc_staff_write_policies_samples.sql`
- Create: `database/checks/2026-10-14-portal-access-checks.sql`

**Interfaces:**
- Consumes: `public.waqc_is_staff()` (Task 4).

- [ ] **Step 1: Read the live policies and helpers first** (Daniel pastes; read-only, before any DROP or CREATE)

```sql
-- Read-only: live policies on the eight QC tables.
SELECT tablename, policyname, permissive, cmd, roles::text AS roles,
       coalesce(qual, '-') AS using_expression,
       coalesce(with_check, '-') AS check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('samples', 'certificates', 'quality_assessments', 'cupping_sessions',
                    'cupping_scores', 'client_qualities', 'quality_templates', 'qc_client_settings')
ORDER BY tablename, cmd, policyname;
```

```sql
-- Read-only: the live helper bodies the new policies call (Task 4).
SELECT pg_get_functiondef('public.waqc_is_staff'::regproc) AS waqc_is_staff,
       pg_get_functiondef('public.waqc_access_kind'::regproc) AS waqc_access_kind;
```

```sql
-- Read-only: the service-role-only tables (Tasks 4 and 9) have no policies.
SELECT tablename, policyname, permissive, cmd, roles::text AS roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('portal_invitations', 'qc_portal_access')
ORDER BY tablename, policyname;
```

Expected: the second query returns both bodies as Task 4 wrote them (if it errors, `20261014000001` is not applied: stop). The third returns no rows (a row means someone added a policy: report it to Daniel). In the first, note any existing RESTRICTIVE write policy and any policy already named `*_waqc_staff_*`; the migrations below drop and recreate only their own `*_waqc_staff_*` names and leave every other policy alone. Report anything unexpected to Daniel before Step 4.

- [ ] **Step 2: Inventory of database functions that write QC tables** (Daniel pastes)

```sql
-- Which database functions write the QC tables, whether they run as their
-- owner (security_definer), and which triggers fire them. A function that is
-- NOT security definer and is fired by a trigger on a table sys users write
-- would run as that sys user and be blocked by the new policies.
WITH qc_tables(t) AS (
  VALUES ('samples'), ('certificates'), ('quality_assessments'), ('cupping_sessions'),
         ('cupping_scores'), ('client_qualities'), ('quality_templates'), ('qc_client_settings')
),
fns AS (
  SELECT p.oid, p.proname, p.prosecdef, pg_get_functiondef(p.oid) AS body
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
)
SELECT f.proname AS function_name,
       f.prosecdef AS security_definer,
       string_agg(DISTINCT q.t, ', ') AS writes_tables,
       (SELECT string_agg(DISTINCT c.relname || '.' || tg.tgname, ', ')
          FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
         WHERE tg.tgfoid = f.oid AND NOT tg.tgisinternal) AS fired_by_triggers
FROM fns f
JOIN qc_tables q
  ON f.body ~* ('(update\s+(public\.)?' || q.t || '\M|insert\s+i' || 'nto\s+(public\.)?' || q.t || '\M|delete\s+from\s+(public\.)?' || q.t || '\M)')
GROUP BY f.oid, f.proname, f.prosecdef
ORDER BY f.prosecdef, f.proname;
```

Save it as `database/checks/2026-10-14-qc-table-writers.sql`. Lint: `grep -n -i '\binto\b'` → no hits (the regex splits the word on purpose).

- [ ] **Step 3: Inventory of app code that writes QC tables with a user session**

WAQC: `grep -rn "from('\(samples\|certificates\|quality_assessments\|cupping_sessions\|cupping_scores\|client_qualities\|quality_templates\|qc_client_settings\)')" src --include='*.ts' --include='*.tsx' | grep -v test` — every hit is staff-facing (staff pass the new policies) or uses the service role. Note any that a non-staff user could reach.

WAQC, service-role-only tables: `grep -rn "'qc_portal_access'\|'portal_invitations'" src --include='*.ts' --include='*.tsx' | grep -v test` — expected hits: `src/lib/portal/qc-grants.ts` and `src/lib/portal/portal-invitations.ts` (their `TABLE` constants), `src/lib/portal/qc-portal-gate.ts` and `src/app/api/portal/me/route.ts`. Each runs on the service-role client (`portalServiceClient()`, or the `admin` client a gate hands over), never on a session client (`@/lib/supabase`, `@/lib/supabase-server`). Any other hit, or a session client on one of these, is a bug: fix it before Step 4.

sys: in the sys repo, `grep -rn 'from("\(samples\|certificates\|quality_assessments\|cupping_sessions\|cupping_scores\|client_qualities\|quality_templates\|qc_client_settings\)")' src --include='*.ts' --include='*.tsx' | grep -v test`. For each write (`.insert(`, `.update(`, `.upsert(`, `.delete(`), note whether the client is the admin (service role) client or the user's session client.

- [ ] **Step 4: Decide, then write the two policy migrations**

Write down, from Steps 2–3, every writer that would run as a non-staff signed-in user. For each:
- a database function: make it `SECURITY DEFINER` in its own migration (read its live body with `pg_get_functiondef` first; add `SET search_path = public`), applied BEFORE the policies; or
- an app path: switch it to the service-role client, or leave that table out of the policy migration and report it to Daniel.

Then, for the config tables (low traffic, apply first):

```sql
-- Writes to the QC configuration tables need a WAQC staff profile
-- (waqc_is_staff, migration 20261014000001). RESTRICTIVE, so it narrows the
-- existing permissive policies instead of replacing them. Service-role routes
-- bypass RLS and are unaffected.

DROP POLICY IF EXISTS client_qualities_waqc_staff_insert ON public.client_qualities;
CREATE POLICY client_qualities_waqc_staff_insert ON public.client_qualities AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS client_qualities_waqc_staff_update ON public.client_qualities;
CREATE POLICY client_qualities_waqc_staff_update ON public.client_qualities AS RESTRICTIVE
  FOR UPDATE TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS client_qualities_waqc_staff_delete ON public.client_qualities;
CREATE POLICY client_qualities_waqc_staff_delete ON public.client_qualities AS RESTRICTIVE
  FOR DELETE TO authenticated USING ((SELECT public.waqc_is_staff()));

DROP POLICY IF EXISTS quality_templates_waqc_staff_insert ON public.quality_templates;
CREATE POLICY quality_templates_waqc_staff_insert ON public.quality_templates AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS quality_templates_waqc_staff_update ON public.quality_templates;
CREATE POLICY quality_templates_waqc_staff_update ON public.quality_templates AS RESTRICTIVE
  FOR UPDATE TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS quality_templates_waqc_staff_delete ON public.quality_templates;
CREATE POLICY quality_templates_waqc_staff_delete ON public.quality_templates AS RESTRICTIVE
  FOR DELETE TO authenticated USING ((SELECT public.waqc_is_staff()));

DROP POLICY IF EXISTS qc_client_settings_waqc_staff_insert ON public.qc_client_settings;
CREATE POLICY qc_client_settings_waqc_staff_insert ON public.qc_client_settings AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS qc_client_settings_waqc_staff_update ON public.qc_client_settings;
CREATE POLICY qc_client_settings_waqc_staff_update ON public.qc_client_settings AS RESTRICTIVE
  FOR UPDATE TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS qc_client_settings_waqc_staff_delete ON public.qc_client_settings;
CREATE POLICY qc_client_settings_waqc_staff_delete ON public.qc_client_settings AS RESTRICTIVE
  FOR DELETE TO authenticated USING ((SELECT public.waqc_is_staff()));

-- Verification: nine rows.
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public' AND policyname LIKE '%\_waqc\_staff\_%'
ORDER BY tablename, cmd;
```

Save as `database/migrations/20261014000004_waqc_staff_write_policies_config.sql`.

Then the sample tables (remove the block of any table Step 4 decided to leave out):

```sql
-- Writes to the sample, certificate, grading and cupping tables need a WAQC
-- staff profile. Apply after 20261014000004 has run for a day without trouble.

DROP POLICY IF EXISTS samples_waqc_staff_insert ON public.samples;
CREATE POLICY samples_waqc_staff_insert ON public.samples AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS samples_waqc_staff_update ON public.samples;
CREATE POLICY samples_waqc_staff_update ON public.samples AS RESTRICTIVE
  FOR UPDATE TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS samples_waqc_staff_delete ON public.samples;
CREATE POLICY samples_waqc_staff_delete ON public.samples AS RESTRICTIVE
  FOR DELETE TO authenticated USING ((SELECT public.waqc_is_staff()));

DROP POLICY IF EXISTS certificates_waqc_staff_insert ON public.certificates;
CREATE POLICY certificates_waqc_staff_insert ON public.certificates AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS certificates_waqc_staff_update ON public.certificates;
CREATE POLICY certificates_waqc_staff_update ON public.certificates AS RESTRICTIVE
  FOR UPDATE TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS certificates_waqc_staff_delete ON public.certificates;
CREATE POLICY certificates_waqc_staff_delete ON public.certificates AS RESTRICTIVE
  FOR DELETE TO authenticated USING ((SELECT public.waqc_is_staff()));

DROP POLICY IF EXISTS quality_assessments_waqc_staff_insert ON public.quality_assessments;
CREATE POLICY quality_assessments_waqc_staff_insert ON public.quality_assessments AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS quality_assessments_waqc_staff_update ON public.quality_assessments;
CREATE POLICY quality_assessments_waqc_staff_update ON public.quality_assessments AS RESTRICTIVE
  FOR UPDATE TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS quality_assessments_waqc_staff_delete ON public.quality_assessments;
CREATE POLICY quality_assessments_waqc_staff_delete ON public.quality_assessments AS RESTRICTIVE
  FOR DELETE TO authenticated USING ((SELECT public.waqc_is_staff()));

DROP POLICY IF EXISTS cupping_sessions_waqc_staff_insert ON public.cupping_sessions;
CREATE POLICY cupping_sessions_waqc_staff_insert ON public.cupping_sessions AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS cupping_sessions_waqc_staff_update ON public.cupping_sessions;
CREATE POLICY cupping_sessions_waqc_staff_update ON public.cupping_sessions AS RESTRICTIVE
  FOR UPDATE TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS cupping_sessions_waqc_staff_delete ON public.cupping_sessions;
CREATE POLICY cupping_sessions_waqc_staff_delete ON public.cupping_sessions AS RESTRICTIVE
  FOR DELETE TO authenticated USING ((SELECT public.waqc_is_staff()));

DROP POLICY IF EXISTS cupping_scores_waqc_staff_insert ON public.cupping_scores;
CREATE POLICY cupping_scores_waqc_staff_insert ON public.cupping_scores AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS cupping_scores_waqc_staff_update ON public.cupping_scores;
CREATE POLICY cupping_scores_waqc_staff_update ON public.cupping_scores AS RESTRICTIVE
  FOR UPDATE TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS cupping_scores_waqc_staff_delete ON public.cupping_scores;
CREATE POLICY cupping_scores_waqc_staff_delete ON public.cupping_scores AS RESTRICTIVE
  FOR DELETE TO authenticated USING ((SELECT public.waqc_is_staff()));

-- Verification: 24 rows with 20261014000004 applied (9 + 15).
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public' AND policyname LIKE '%\_waqc\_staff\_%'
ORDER BY tablename, cmd;
```

Save as `database/migrations/20261014000005_waqc_staff_write_policies_samples.sql`.

Lint both: `grep -n -i '\binto\b'` → no hits. Commit:

```bash
git add database/checks/2026-10-14-qc-table-writers.sql database/migrations/20261014000004_waqc_staff_write_policies_config.sql \
  database/migrations/20261014000005_waqc_staff_write_policies_samples.sql
git commit -m "fix(db): writes to QC tables need a WAQC staff profile (restrictive policies, config tables then sample tables)"
```

- [ ] **Step 5: The check scripts** (`database/checks/2026-10-14-portal-access-checks.sql`; Daniel runs each block on its own — the editor shows only the last result)

```sql
-- CHECK 1 — an external (client) user reads nothing from QC tables.
-- Expected: kind = external, every count 0.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id FROM public.user_profiles WHERE user_type = 'external' AND status = 'active' ORDER BY id LIMIT 1),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.waqc_access_kind() AS kind,
       (SELECT count(*) FROM public.samples) AS samples,
       (SELECT count(*) FROM public.certificates) AS certificates,
       (SELECT count(*) FROM public.cupping_scores) AS cupping_scores,
       (SELECT count(*) FROM public.client_qualities) AS client_qualities,
       (SELECT count(*) FROM public.qc_client_settings) AS qc_client_settings;
ROLLBACK;

-- CHECK 2 — a signed-in user with no WAQC profile cannot write samples.
-- Expected after 20261014000005: kind = none, samples_updated = 0 (before it: 1).
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT up.id FROM public.user_profiles up LEFT JOIN public.profiles p ON p.id = up.id
                             WHERE p.id IS NULL AND up.user_type = 'internal' ORDER BY up.id LIMIT 1),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
WITH touched AS (
  UPDATE public.samples SET updated_at = updated_at
  WHERE id = (SELECT s.id FROM public.samples s ORDER BY s.created_at DESC LIMIT 1)
  RETURNING id
)
SELECT public.waqc_access_kind() AS kind, (SELECT count(*) FROM touched) AS samples_updated;
ROLLBACK;

-- CHECK 3 — staff still write. Expected: kind = staff, samples_updated = 1.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id FROM public.profiles WHERE qc_role = 'lab_personnel' ORDER BY created_at LIMIT 1),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
WITH touched AS (
  UPDATE public.samples SET updated_at = updated_at
  WHERE id = (SELECT s.id FROM public.samples s ORDER BY s.created_at DESC LIMIT 1)
  RETURNING id
)
SELECT public.waqc_access_kind() AS kind, (SELECT count(*) FROM touched) AS samples_updated;
ROLLBACK;
```

```sql
-- CHECK 4 — the service-role-only tables: RLS on, no policies, no rights
-- for anon or authenticated. Expected: two rows, every column true.
SELECT t.table_name,
       c.relrowsecurity AS rls_on,
       NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.table_name) AS no_policies,
       NOT has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS anon_none,
       NOT has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS authenticated_none
FROM (VALUES ('portal_invitations'), ('qc_portal_access')) AS t(table_name)
JOIN pg_class c ON c.oid = to_regclass('public.' || t.table_name);
```

Lint: `grep -n -i '\binto\b'` → no hits. Commit:

```bash
git add database/checks/2026-10-14-portal-access-checks.sql
git commit -m "chore(db): portal access check scripts — external reads nothing, non-staff cannot write, staff can, service-role-only tables closed"
```

- [ ] **Step 6: Apply order (tell Daniel)**

1. Any SECURITY DEFINER fix from Step 4.
2. `20261014000004` (config tables). Run CHECK 3 → staff still write. Use the app for a day: editing a spec, client QC settings.
3. `20261014000005` (sample tables). Run CHECK 2 → 0 and CHECK 3 → 1. Watch intake, grading, cupping and the sys decision write-back on the next real lots.

---

### Task 22: Retire Phase A client-role code; end-to-end run; handoff

**Files:**
- Delete: `src/app/api/portal/invitations/route.ts`, `src/lib/portal/invite.ts`, `src/lib/portal/invite.test.ts`
- Delete: `src/lib/portal/portal-auth.ts`, `src/lib/portal/portal-auth.test.ts` (after confirming no imports remain)
- Modify: `src/components/layout/main-layout.tsx:39-50` (replace the client-role redirect with an access-kind redirect; drop the `isClientRole` import)

- [ ] **Step 1: Replace the main-layout redirect** (spec §7.4)

Middleware routes every request by access kind, but a password sign-in on `/` renders `MainLayout` and the dashboard client-side without a new request, so the layout keeps its own check. In `src/components/layout/main-layout.tsx`, delete `import { isClientRole } from '@/lib/portal/portal-auth'` (keep `import { supabase } from '@/lib/supabase'`: the new effect uses it) and replace the whole `// Redirect client-role users to the partner portal` `useEffect` block with:

```tsx
  // Middleware routes every request by access kind. A password sign-in on '/'
  // renders this layout client-side without a new request, so check here too:
  // clients go to the portal, people without WAQC access to /auth/no-access.
  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    let active = true
    ;(async () => {
      const { data, error } = await supabase.rpc('waqc_access_kind')
      if (!active || error) return
      if (data === 'external') router.replace('/portal')
      else if (data === 'none') router.replace('/auth/no-access')
    })()
    return () => { active = false }
  }, [router, userId])
```

(`user` is the `useAuth()` value already destructured at the top of `MainLayout`.)

- [ ] **Step 2: Remove the Phase A pieces**

```bash
git rm -q src/app/api/portal/invitations/route.ts src/lib/portal/invite.ts src/lib/portal/invite.test.ts
grep -rn "portal-auth\|isClientRole\|requirePortalCompany\|getPortalCompany\|api/portal/invitations" src
```

Expected: only `src/lib/portal/portal-auth.ts` and its test. Then `git rm -q src/lib/portal/portal-auth.ts src/lib/portal/portal-auth.test.ts`.

- [ ] **Step 3: Full check**

Run: `npx tsc --noEmit -p .` and `npx vitest run`
Expected: no type errors; the whole suite passes (note any pre-existing failures that are unrelated, with their names, rather than fixing them; the 2026-10-14 baseline has 19 unhandled rejections from CvaJourney and others).

Run: `grep -rn "external_user_company_grants" src`
Expected: no hits. Nothing in `src` references sys's grant table, not even in a comment or test (ruling R11: QC access lives only in `qc_portal_access`, and WAQC never reads or writes sys's grants).

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/main-layout.tsx
git commit -m "refactor(portal): retire Phase A client-role access — grants and middleware replace it; main layout redirects by access kind"
```

- [ ] **Step 5: End-to-end run on production** (after Daniel pushes and every SQL step in the Ship order is applied; do it with Daniel)

1. Staff: `/clients/<a test client>` → Portal access → Invite a test address Daniel controls (not `@wolthers.com`), preset Full, Company admin on. Expect a toast "Invitation sent."
2. The invitation arrives at the test address with **no CC**; subject names the company's fantasy name; the button opens `/auth/portal-invite?token=...`. `wolthers@wolthers.com` receives a separate copy: "<Daniel> invited <test address> to <company>'s QC portal", the access list, and **no link**.
3. In a private window: set a password → lands on `/portal`; nav shows Overview, Contracts, Samples, Certificates, Team; the header shows the company.
4. SQL:

```sql
SELECT up.email, up.user_type, up.status, up.is_active, a.company_id, a.views, a.capabilities, a.created_by,
       EXISTS (SELECT 1 FROM public.external_user_company_grants g WHERE g.user_id = up.id) AS has_sys_grant,
       EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = up.id) AS has_waqc_profile
FROM public.user_profiles up
JOIN public.qc_portal_access a ON a.user_id = up.id
WHERE up.email = lower('<test address>');
```

   Expected: external, active, `is_active` true; one row for the test company; `views` only `qc_*`; `capabilities` the `qc_*` keys plus `qc_manage_users`; `created_by` Daniel's user id; `has_sys_grant` false (WAQC wrote nothing to sys's grants, so sys opens no company data to this person); `has_waqc_profile` false.
5. As the client: open `/dashboard` → back on `/portal`; open `/api/samples` → `{"error":"Forbidden"}` 403; open `/api/portal/samples?company=<another company id>` → 403.
6. Samples and Certificates show certificate numbers and the lots' own references, never `SAN-`. Download a certificate: the file is named by its certificate number.
7. Team: invite a second address with Viewer → accept → that person sees Overview, Contracts, Samples and Certificates (the Viewer preset holds `qc_samples`, which shows Contracts) and no Team link; the admin changes them to Cupper; then removes them → their next page load lands on `/auth/no-access`. Inviting the admin's own address, or the first person's, from the Team page is refused.
8. sys gives the QC-only person nothing (ruling R11): in a private window, sign in at sys.wolthers.com with the test login. The sys portal shows no company and no contracts, shipments or documents (there is no sys grant row). Daniel opens the test person in sys → Management → Users: an external user with no company grants. Re-running the SQL of item 4 shows the QC row unchanged.
9. Staff: the Portal access tab lists the activity; global admins have in-app notifications. "View as client" opens the portal with the read-only banner and no Team link.
10. Clean up: remove both test people from the Portal access tab, then delete the two logins in Supabase → Authentication → Users.

- [ ] **Step 6: Handoff and memory**

Use the `handoff` skill to write `docs/superpowers/handoffs/2026-10-14-client-portal-accounts-handoff.md` (what shipped, which SQL is applied (`20261014000006`, `qc_portal_access`, included), the end-to-end result, the Microsoft spike still deferred to Daniel, the sys finding from Task 5 (sys `inviteExternalUser` vs the sign-up trigger's `user_profiles` insert), ruling R11 (QC access in `qc_portal_access`; Task 3 dropped, its sys branch `feat/keep-qc-grant-keys` stays local and is never pushed; sys staff screens do not show QC access, and a QC-only person looks like an external user with no grants there), open items: piece 2 views, piece 3 specs, piece 4 cupping, the public certificate slug). Update the project memory `client-portal-v2-external-model.md`.
