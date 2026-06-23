# Partner Portal — Foundation (Sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a read-only, company-scoped partner portal at `/portal` for QC-client users — a light/airy top-nav shell with an Overview dashboard, by-contract and by-sample browse lists, a certificates list, and staff tooling to invite client users — without building the cross-system lifecycle merge (B), Excel export (C), or traceability (D).

**Architecture:** New `/portal` route area (flat, no route groups) rendered by a dedicated light-mode top-nav shell, separate from the internal dark `MainLayout`. Portal pages fetch from new `/api/portal/*` route handlers that authenticate the user, resolve their company via `profiles.client_id`, and query `samples`/`certificates` filtered to that company. Onboarding reuses the existing `user_invitations` + accept-invite machinery, extended so client invitations carry `company_id` and that company_id lands on `profiles.client_id`. All risky data logic (status rollups, row mapping, contract grouping, invite payload) is extracted into pure functions with unit tests; route handlers and pages stay thin.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind (CSS-variable theme), shadcn/ui, Supabase (`@supabase/ssr`), Resend (invite email), Vitest 2.x + @testing-library/react.

## Global Constraints

- Portal visual language: **light & airy, top navigation**, white background, generous whitespace, soft shadows (not 0.5px borders), single olive accent `#556b2f`. Portal defaults to **light mode**. Distinct component set from the internal `MainLayout` (do not reuse the dark left-sidebar shell).
- Font: **Inter** (already the app default). **No emojis in UI. No mock data** — every value comes from Supabase.
- Portal is **read-only**: no writes to QC data from `/portal`.
- Every `/api/portal/*` handler: require an authenticated user, resolve company via `getPortalCompany`, and scope queries with `.or('client_id.eq.<id>,end_client_id.eq.<id>')`. Return 401 (no user) / 403 (not a client / no company).
- Keep files focused and under ~2000 lines; split by responsibility.
- Tests: Vitest, co-located `*.test.ts(x)`. Run one file with `npx vitest run <path>`. Typecheck with `npx tsc --noEmit`. Component tests use `@testing-library/react`; stub network with `vi.stubGlobal('fetch', …)` and clean up with `vi.unstubAllGlobals()`.
- **Migrations:** present the SQL in the task for Daniel to apply manually (his standing preference: "I prefer pasting the SQL"; "I will always apply migrations"). Still create the `.sql` file under `database/migrations/` for the record. Do not attempt to run the migration yourself.
- Branch policy: trunk-based on `main` (sole developer).
- Reuse, do not rebuild: `src/lib/supabase-server.ts` `createClient()`, browser `src/lib/supabase.ts` `supabase`, `trackingNumberToSlug`/`cn` from `src/lib/utils.ts`, shadcn components in `src/components/ui/*`, the public cert PDF endpoint `/api/certificate/[slug]/pdf`, Resend invite pattern from `src/app/api/users/invite/route.ts`.

---

## File structure

- `src/lib/portal/portal-auth.ts` — role predicates + `getPortalCompany` (server).
- `src/lib/portal/portal-overview.ts` — `buildStatusRollup`.
- `src/lib/portal/portal-samples.ts` — `mapSampleRow`.
- `src/lib/portal/portal-contracts.ts` — `groupSamplesByContract`.
- `src/lib/portal/portal-certificates.ts` — `mapCertRow`.
- `src/lib/portal/invite.ts` — `buildClientInvitePayload`.
- `src/app/api/portal/overview/route.ts`, `…/samples/route.ts`, `…/contracts/route.ts`, `…/certificates/route.ts`, `…/invitations/route.ts`.
- `src/components/portal/portal-nav.ts`, `portal-top-nav.tsx`, `portal-shell.tsx`, `client-invite-dialog.tsx`.
- `src/app/portal/layout.tsx`, `page.tsx`, `samples/page.tsx`, `contracts/page.tsx`, `certificates/page.tsx`.
- Modify: `src/app/auth/callback/route.ts`, `src/components/layout/main-layout.tsx`, `src/app/clients/[id]/page.tsx`.
- Migrations: `database/migrations/20260622000002_handle_new_user_company_id.sql`, `database/migrations/20260622000003_portal_client_sample_read_scope.sql`.

---

### Task 1: Portal auth helpers

**Files:**
- Create: `src/lib/portal/portal-auth.ts`
- Test: `src/lib/portal/portal-auth.test.ts`

**Interfaces:**
- Produces: `isClientRole(qcRole: string | null | undefined): boolean`; `resolveLandingPath(qcRole: string | null | undefined): string`; `getPortalCompany(supabase, userId): Promise<{ clientId: string; qcRole: string; fullName: string | null } | null>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/portal/portal-auth.test.ts
import { describe, it, expect } from 'vitest'
import { isClientRole, resolveLandingPath } from './portal-auth'

describe('isClientRole', () => {
  it('is true only for the client role', () => {
    expect(isClientRole('client')).toBe(true)
    expect(isClientRole('lab_personnel')).toBe(false)
    expect(isClientRole(null)).toBe(false)
    expect(isClientRole(undefined)).toBe(false)
  })
})

describe('resolveLandingPath', () => {
  it('sends clients to /portal and everyone else to /dashboard', () => {
    expect(resolveLandingPath('client')).toBe('/portal')
    expect(resolveLandingPath('lab_personnel')).toBe('/dashboard')
    expect(resolveLandingPath(null)).toBe('/dashboard')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/portal/portal-auth.test.ts`
Expected: FAIL — cannot find module `./portal-auth`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/portal/portal-auth.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export function isClientRole(qcRole: string | null | undefined): boolean {
  return qcRole === 'client'
}

export function resolveLandingPath(qcRole: string | null | undefined): string {
  return isClientRole(qcRole) ? '/portal' : '/dashboard'
}

export interface PortalCompany {
  clientId: string
  qcRole: string
  fullName: string | null
}

/** Resolve the authenticated user's portal company, or null if they are not a
 *  client-role user linked to a company. */
export async function getPortalCompany(
  supabase: SupabaseClient,
  userId: string,
): Promise<PortalCompany | null> {
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('qc_role, client_id, full_name')
    .eq('id', userId)
    .maybeSingle()
  if (!profile || !isClientRole(profile.qc_role) || !profile.client_id) return null
  return { clientId: profile.client_id, qcRole: profile.qc_role, fullName: profile.full_name ?? null }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/portal/portal-auth.test.ts`
Expected: PASS (4 assertions across 2 suites).

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal/portal-auth.ts src/lib/portal/portal-auth.test.ts
git commit -m "feat(portal): add role + company resolution helpers"
```

---

### Task 2: Map invitation company_id → profiles.client_id (DB trigger)

This migration replaces `handle_new_user()` so a password-signup from an invitation copies `company_id` onto `profiles.client_id`. Without it, client portal users never get scoped.

**Files:**
- Create: `database/migrations/20260622000002_handle_new_user_company_id.sql`

- [ ] **Step 1: Write the migration SQL (verbatim, including the existing body plus the two added lines)**

```sql
-- Migration 20260622000002: handle_new_user copies invitation.company_id -> profiles.client_id
-- Purpose: client-role portal users must be linked to their company for scoping.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invitation_record RECORD;
BEGIN
  SELECT * INTO invitation_record
  FROM user_invitations
  WHERE email = NEW.email
    AND status = 'pending'
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.profiles (
      id, email, first_name, last_name, full_name,
      qc_role, laboratory_id, client_id,
      is_cupper, is_q_grader, qc_enabled, created_at, updated_at
    )
    VALUES (
      NEW.id, NEW.email,
      invitation_record.first_name,
      invitation_record.last_name,
      invitation_record.first_name || ' ' || invitation_record.last_name,
      invitation_record.qc_role,
      invitation_record.laboratory_id,
      invitation_record.company_id,
      invitation_record.is_cupper,
      invitation_record.is_q_grader,
      invitation_record.qc_enabled,
      NOW(), NOW()
    );

    UPDATE user_invitations
    SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
    WHERE id = invitation_record.id;
  ELSE
    INSERT INTO public.profiles (
      id, email, first_name, last_name, full_name, qc_role, qc_enabled, created_at, updated_at
    )
    VALUES (
      NEW.id, NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      'lab_personnel', false, NOW(), NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Hand the SQL to Daniel to apply**

Tell Daniel: "Migration `20260622000002_handle_new_user_company_id.sql` is ready — please apply it." Do not run it yourself.

- [ ] **Step 3: Verify after apply (Daniel applies, then confirm)**

Verification query (run via Supabase SQL editor): confirm the function references `client_id` / `company_id`:
```sql
SELECT pg_get_functiondef('handle_new_user'::regproc) LIKE '%client_id%' AS maps_client_id;
```
Expected: `maps_client_id = true`.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/20260622000002_handle_new_user_company_id.sql
git commit -m "feat(portal): trigger maps invitation company_id to profiles.client_id"
```

---

### Task 3: OAuth callback — set client_id + role-based landing

Two edits to `src/app/auth/callback/route.ts`: (a) the invitation upsert must include `client_id`; (b) after the profile is ensured, client-role users land on `/portal`.

**Files:**
- Modify: `src/app/auth/callback/route.ts`

**Interfaces:**
- Consumes: `resolveLandingPath` from `src/lib/portal/portal-auth.ts`.

- [ ] **Step 1: Add `client_id` to the invitation-based profile upsert**

In `ensureUserProfile`, the `.from('profiles').upsert({...})` block under `if (invitation)` — add the `client_id` line:

```ts
          is_global_admin: invitation.qc_role === 'global_admin' || invitation.qc_role === 'global_quality_admin',
          laboratory_id: invitation.laboratory_id || defaultLab?.id || null,
          client_id: invitation.company_id || null,
```

- [ ] **Step 2: Compute role-based landing after profile is ensured**

Replace the response construction (currently `const response = NextResponse.redirect(\`${requestUrl.origin}${next}\`)`) with logic that, when `next` is the default `'/'`, routes by role:

```ts
import { resolveLandingPath } from '@/lib/portal/portal-auth'
// ...
    let destination = next
    if (next === '/' && user) {
      const supabaseAdmin = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      const { data: profile } = await supabaseAdmin
        .from('profiles').select('qc_role').eq('id', user.id).maybeSingle()
      destination = resolveLandingPath((profile as any)?.qc_role)
    }

    const response = NextResponse.redirect(`${requestUrl.origin}${destination}`)
```

(`createClient` from `@supabase/supabase-js` and `Database` are already imported at the top of this file.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `callback/route.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/app/auth/callback/route.ts
git commit -m "feat(portal): callback sets client_id and routes clients to /portal"
```

---

### Task 4: Client-invite payload builder + invite API

**Files:**
- Create: `src/lib/portal/invite.ts`
- Test: `src/lib/portal/invite.test.ts`
- Create: `src/app/api/portal/invitations/route.ts`

**Interfaces:**
- Produces: `buildClientInvitePayload(input): Record<string, unknown>`; `POST /api/portal/invitations` (body `{ email, first_name, last_name, company_id }`) → `{ success, invitationUrl, expiresAt }`; `GET /api/portal/invitations?company_id=<id>` → `{ invitations: Array<{ id, email, first_name, last_name, status, expires_at, created_at }> }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/portal/invite.test.ts
import { describe, it, expect } from 'vitest'
import { buildClientInvitePayload } from './invite'

describe('buildClientInvitePayload', () => {
  it('builds a client invitation row with company link and client role', () => {
    const row = buildClientInvitePayload({
      email: 'buyer@acme.com', firstName: 'Pat', lastName: 'Lee',
      companyId: 'co-1', invitedBy: 'staff-1', token: 'tok-1',
      expiresAtIso: '2026-07-01T00:00:00.000Z',
    })
    expect(row).toMatchObject({
      email: 'buyer@acme.com', first_name: 'Pat', last_name: 'Lee',
      qc_role: 'client', company_id: 'co-1', laboratory_id: null,
      qc_enabled: true, status: 'pending', invitation_token: 'tok-1',
      invited_by: 'staff-1', expires_at: '2026-07-01T00:00:00.000Z',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/portal/invite.test.ts`
Expected: FAIL — cannot find module `./invite`.

- [ ] **Step 3: Write the builder**

```ts
// src/lib/portal/invite.ts
export interface ClientInviteInput {
  email: string
  firstName: string
  lastName: string
  companyId: string
  invitedBy: string | null
  token: string
  expiresAtIso: string
}

export function buildClientInvitePayload(i: ClientInviteInput) {
  return {
    email: i.email,
    first_name: i.firstName,
    last_name: i.lastName,
    qc_role: 'client',
    company_id: i.companyId,
    laboratory_id: null,
    is_cupper: false,
    is_q_grader: false,
    qc_enabled: true,
    invitation_token: i.token,
    expires_at: i.expiresAtIso,
    status: 'pending',
    invited_by: i.invitedBy,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/portal/invite.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the invite API route**

```ts
// src/app/api/portal/invitations/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase-server'
import { isClientRole } from '@/lib/portal/portal-auth'
import { buildClientInvitePayload } from '@/lib/portal/invite'

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const resend = new Resend(process.env.RESEND_API_KEY)

/** Only authenticated non-client (staff) users may manage client invitations. */
async function requireStaff() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await (supabase as any)
    .from('profiles').select('qc_role').eq('id', user.id).maybeSingle()
  if (!profile || isClientRole(profile.qc_role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId: user.id }
}

export async function GET(request: NextRequest) {
  const gate = await requireStaff()
  if (gate.error) return gate.error
  const companyId = new URL(request.url).searchParams.get('company_id')
  if (!companyId) return NextResponse.json({ error: 'company_id required' }, { status: 400 })
  const { data } = await supabaseAdmin
    .from('user_invitations')
    .select('id, email, first_name, last_name, status, expires_at, created_at')
    .eq('company_id', companyId)
    .eq('qc_role', 'client')
    .order('created_at', { ascending: false })
  return NextResponse.json({ invitations: data ?? [] })
}

export async function POST(request: NextRequest) {
  const gate = await requireStaff()
  if (gate.error) return gate.error

  const { email, first_name, last_name, company_id } = await request.json()
  if (!email || !first_name || !last_name || !company_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('profiles').select('id').eq('email', email).maybeSingle()
  if (existing) return NextResponse.json({ error: 'User already exists' }, { status: 409 })

  const token = crypto.randomUUID()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const payload = buildClientInvitePayload({
    email, firstName: first_name, lastName: last_name,
    companyId: company_id, invitedBy: gate.userId!, token,
    expiresAtIso: expiresAt.toISOString(),
  })
  const { error: insertError } = await supabaseAdmin.from('user_invitations').insert(payload)
  if (insertError) {
    console.error('client invite insert failed', insertError)
    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 })
  }

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/accept-invite?token=${token}`
  try {
    await resend.emails.send({
      from: 'Wolthers QC <noreply@qc.wolthers.com>',
      to: email,
      subject: 'You have been invited to the Wolthers QC partner portal',
      html: `<p>Hello ${first_name},</p>
        <p>You have been invited to the Wolthers Quality Control partner portal.</p>
        <p><a href="${inviteUrl}">Accept your invitation and create your account</a></p>
        <p>This link expires on ${expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.</p>
        <p>If the link does not work, paste this into your browser:<br>${inviteUrl}</p>`,
    })
  } catch (emailError) {
    console.error('client invite email failed (invitation still created)', emailError)
  }

  return NextResponse.json({ success: true, invitationUrl: inviteUrl, expiresAt: expiresAt.toISOString() })
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/portal/invite.ts src/lib/portal/invite.test.ts src/app/api/portal/invitations/route.ts
git commit -m "feat(portal): client-invitation API + payload builder"
```

---

### Task 5: Client-invite admin UI on the client detail page

**Files:**
- Create: `src/components/portal/client-invite-dialog.tsx`
- Test: `src/components/portal/client-invite-dialog.test.tsx`
- Modify: `src/app/clients/[id]/page.tsx` (mount the dialog button)

**Interfaces:**
- Consumes: `POST/GET /api/portal/invitations`.
- Produces: `<ClientInviteDialog companyId={string} companyName={string} />`.

- [ ] **Step 1: Write the failing component test**

```tsx
// src/components/portal/client-invite-dialog.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ClientInviteDialog } from './client-invite-dialog'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/api/portal/invitations') && init?.method === 'POST') {
      return { ok: true, json: async () => ({ success: true, invitationUrl: 'http://x/accept' }) } as Response
    }
    return { ok: true, json: async () => ({ invitations: [] }) } as Response
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('ClientInviteDialog', () => {
  it('opens and posts an invitation', async () => {
    render(<ClientInviteDialog companyId="co-1" companyName="Acme" />)
    fireEvent.click(screen.getByRole('button', { name: /invite portal user/i }))
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Pat' } })
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Lee' } })
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'pat@acme.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/portal/invitations', expect.objectContaining({ method: 'POST' }))
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/portal/client-invite-dialog.test.tsx`
Expected: FAIL — cannot find module `./client-invite-dialog`.

- [ ] **Step 3: Implement the dialog**

```tsx
// src/components/portal/client-invite-dialog.tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/portal/client-invite-dialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mount the dialog on the client detail page**

Read `src/app/clients/[id]/page.tsx`, import the dialog at the top:
```tsx
import { ClientInviteDialog } from '@/components/portal/client-invite-dialog'
```
Then render it in the page header area (next to the client name/title), passing the loaded client's id and name:
```tsx
<ClientInviteDialog companyId={client.id} companyName={client.name} />
```
Use the existing variable names from that file for the loaded company (adjust `client.id` / `client.name` to match the component's actual state variable).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/portal/client-invite-dialog.tsx src/components/portal/client-invite-dialog.test.tsx src/app/clients/[id]/page.tsx
git commit -m "feat(portal): staff client-invite dialog on client detail page"
```

---

### Task 6: Portal shell (top-nav, light/airy) + layout + staff guard

**Files:**
- Create: `src/components/portal/portal-nav.ts`, `src/components/portal/portal-top-nav.tsx`, `src/components/portal/portal-shell.tsx`, `src/app/portal/layout.tsx`
- Test: `src/components/portal/portal-top-nav.test.tsx`
- Modify: `src/components/layout/main-layout.tsx` (redirect client-role users to `/portal`)

**Interfaces:**
- Produces: `PORTAL_NAV: { label: string; href: string }[]`; `<PortalTopNav pathname onSignOut />`; `<PortalShell>children</PortalShell>`.
- Consumes: `isClientRole` (Task 1), browser `supabase`.

- [ ] **Step 1: Write the failing nav test**

```tsx
// src/components/portal/portal-top-nav.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PortalTopNav } from './portal-top-nav'

describe('PortalTopNav', () => {
  it('renders all portal nav items and marks the active one', () => {
    render(<PortalTopNav pathname="/portal/samples" onSignOut={() => {}} />)
    for (const label of ['Overview', 'Contracts', 'Samples', 'Certificates']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Samples' })).toHaveAttribute('aria-current', 'page')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/portal/portal-top-nav.test.tsx`
Expected: FAIL — cannot find module `./portal-top-nav`.

- [ ] **Step 3: Implement nav config + presentational top nav**

```ts
// src/components/portal/portal-nav.ts
export interface PortalNavItem { label: string; href: string }
export const PORTAL_NAV: PortalNavItem[] = [
  { label: 'Overview', href: '/portal' },
  { label: 'Contracts', href: '/portal/contracts' },
  { label: 'Samples', href: '/portal/samples' },
  { label: 'Certificates', href: '/portal/certificates' },
]
```

```tsx
// src/components/portal/portal-top-nav.tsx
'use client'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { PORTAL_NAV } from './portal-nav'

export function PortalTopNav({ pathname, onSignOut }: { pathname: string; onSignOut: () => void }) {
  return (
    <header className="border-b border-neutral-100 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <span className="text-base font-semibold tracking-tight text-neutral-900">Wolthers QC</span>
          <nav className="hidden items-center gap-1 md:flex">
            {PORTAL_NAV.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm transition-colors',
                    active ? 'bg-[#556b2f]/10 font-medium text-[#556b2f]' : 'text-neutral-500 hover:text-neutral-900'
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <button onClick={onSignOut} className="text-sm text-neutral-500 hover:text-neutral-900">Sign out</button>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/portal/portal-top-nav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement the guarded shell + layout**

```tsx
// src/components/portal/portal-shell.tsx
'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isClientRole } from '@/lib/portal/portal-auth'
import { PortalTopNav } from './portal-top-nav'

export function PortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }
      const { data: profile } = await supabase.from('profiles').select('qc_role').eq('id', user.id).single()
      if (!active) return
      if (!isClientRole((profile as any)?.qc_role)) { router.replace('/dashboard'); return }
      setReady(true)
    })()
    return () => { active = false }
  }, [router])

  async function signOut() { await supabase.auth.signOut(); router.replace('/') }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#556b2f]" />
      </div>
    )
  }
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <PortalTopNav pathname={pathname} onSignOut={signOut} />
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  )
}
```

```tsx
// src/app/portal/layout.tsx
import { PortalShell } from '@/components/portal/portal-shell'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>
}
```

- [ ] **Step 6: Block client-role users from the internal shell**

In `src/components/layout/main-layout.tsx`, add an effect (after the existing hooks, before the `if (!loading && !user)` block) that redirects client-role users to `/portal`:

```tsx
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { isClientRole } from '@/lib/portal/portal-auth'
// ... inside MainLayout, after existing hooks:
  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('qc_role').eq('id', user.id).single()
      if (active && isClientRole((profile as any)?.qc_role)) router.replace('/portal')
    })()
    return () => { active = false }
  }, [router])
```
(`router` is already defined in `MainLayout`. Add `useEffect` to the existing `react` import if not present.)

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/portal/portal-nav.ts src/components/portal/portal-top-nav.tsx src/components/portal/portal-top-nav.test.tsx src/components/portal/portal-shell.tsx src/app/portal/layout.tsx src/components/layout/main-layout.tsx
git commit -m "feat(portal): light/airy top-nav shell with role guards"
```

---

### Task 7: Overview dashboard — rollup + API + page

**Files:**
- Create: `src/lib/portal/portal-overview.ts`, test `src/lib/portal/portal-overview.test.ts`
- Create: `src/app/api/portal/overview/route.ts`
- Create: `src/app/portal/page.tsx`

**Interfaces:**
- Produces: `buildStatusRollup(rows): StatusRollup`; `GET /api/portal/overview` → `{ rollup: StatusRollup, recent: Array<{ id, tracking_number, origin, status, updated_at }> }`.
- `StatusRollup = { pssPending, pssApproved, pssRejected, ssTotal, certified, total }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/portal/portal-overview.test.ts
import { describe, it, expect } from 'vitest'
import { buildStatusRollup } from './portal-overview'

describe('buildStatusRollup', () => {
  it('counts PSS by status, SS, and certified', () => {
    const rollup = buildStatusRollup([
      { sample_type: 'pss', status: 'approved', workflow_stage: 'certified' },
      { sample_type: 'pss', status: 'rejected', workflow_stage: 'rejected' },
      { sample_type: 'pss', status: 'received', workflow_stage: 'analysis' },
      { sample_type: 'ss', status: 'approved', workflow_stage: 'certified' },
    ])
    expect(rollup).toEqual({ pssPending: 1, pssApproved: 1, pssRejected: 1, ssTotal: 1, certified: 2, total: 4 })
  })

  it('handles empty input', () => {
    expect(buildStatusRollup([])).toEqual({ pssPending: 0, pssApproved: 0, pssRejected: 0, ssTotal: 0, certified: 0, total: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/portal/portal-overview.test.ts`
Expected: FAIL — cannot find module `./portal-overview`.

- [ ] **Step 3: Implement the rollup**

```ts
// src/lib/portal/portal-overview.ts
export interface RollupRow { sample_type: string | null; status: string | null; workflow_stage: string | null }
export interface StatusRollup {
  pssPending: number; pssApproved: number; pssRejected: number
  ssTotal: number; certified: number; total: number
}

export function buildStatusRollup(rows: RollupRow[]): StatusRollup {
  const r: StatusRollup = { pssPending: 0, pssApproved: 0, pssRejected: 0, ssTotal: 0, certified: 0, total: 0 }
  for (const row of rows) {
    r.total++
    if (row.sample_type === 'ss') r.ssTotal++
    if (row.sample_type === 'pss') {
      if (row.status === 'approved') r.pssApproved++
      else if (row.status === 'rejected') r.pssRejected++
      else r.pssPending++
    }
    if (row.workflow_stage === 'certified') r.certified++
  }
  return r
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/portal/portal-overview.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the overview API**

```ts
// src/app/api/portal/overview/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getPortalCompany } from '@/lib/portal/portal-auth'
import { buildStatusRollup } from '@/lib/portal/portal-overview'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const company = await getPortalCompany(supabase, user.id)
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const scope = `client_id.eq.${company.clientId},end_client_id.eq.${company.clientId}`
  const { data: rows } = await (supabase as any)
    .from('samples').select('sample_type, status, workflow_stage').or(scope)
  const { data: recent } = await (supabase as any)
    .from('samples')
    .select('id, tracking_number, origin, status, updated_at')
    .or(scope)
    .in('status', ['approved', 'rejected'])
    .order('updated_at', { ascending: false })
    .limit(8)

  return NextResponse.json({ rollup: buildStatusRollup(rows ?? []), recent: recent ?? [] })
}
```

- [ ] **Step 6: Implement the overview page**

```tsx
// src/app/portal/page.tsx
'use client'
import { useEffect, useState } from 'react'
import type { StatusRollup } from '@/lib/portal/portal-overview'

interface RecentRow { id: string; tracking_number: string; origin: string | null; status: string; updated_at: string | null }

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-100">
      <div className="text-3xl font-semibold text-neutral-900">{value}</div>
      <div className="mt-1 text-sm text-neutral-500">{label}</div>
    </div>
  )
}

export default function PortalOverviewPage() {
  const [rollup, setRollup] = useState<StatusRollup | null>(null)
  const [recent, setRecent] = useState<RecentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/portal/overview')
      if (res.ok) { const d = await res.json(); setRollup(d.rollup); setRecent(d.recent) }
      setLoading(false)
    })()
  }, [])

  if (loading) return <div className="text-sm text-neutral-500">Loading…</div>

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Overview</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="PSS approved" value={rollup?.pssApproved ?? 0} />
        <StatCard label="PSS pending" value={rollup?.pssPending ?? 0} />
        <StatCard label="PSS rejected" value={rollup?.pssRejected ?? 0} />
        <StatCard label="Certified" value={rollup?.certified ?? 0} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-100">
          <h2 className="mb-4 text-sm font-medium text-neutral-900">Recent approvals & rejections</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-neutral-500">No decisions yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                  <span className="text-neutral-900">{r.tracking_number}</span>
                  <span className={r.status === 'approved' ? 'text-[#22c55e]' : 'text-[#ef4444]'}>{r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-100">
          <h2 className="mb-2 text-sm font-medium text-neutral-900">Shipments & in-transit</h2>
          <p className="text-sm text-neutral-500">Shipment tracking is coming soon.</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/portal/portal-overview.ts src/lib/portal/portal-overview.test.ts src/app/api/portal/overview/route.ts src/app/portal/page.tsx
git commit -m "feat(portal): overview dashboard with status rollups"
```

---

### Task 8: Samples list — mapper + API + page

**Files:**
- Create: `src/lib/portal/portal-samples.ts`, test `src/lib/portal/portal-samples.test.ts`
- Create: `src/app/api/portal/samples/route.ts`
- Create: `src/app/portal/samples/page.tsx`

**Interfaces:**
- Produces: `mapSampleRow(row): PortalSampleRow`; `GET /api/portal/samples` → `{ samples: PortalSampleRow[] }`.
- `PortalSampleRow = { id, trackingNumber, origin, quality, sampleType, stage, status, certificateUrl }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/portal/portal-samples.test.ts
import { describe, it, expect } from 'vitest'
import { mapSampleRow } from './portal-samples'

describe('mapSampleRow', () => {
  it('maps a certified sample with a certificate link', () => {
    const row = mapSampleRow({
      id: 's1', tracking_number: 'BR-0231/26', origin: 'Brazil',
      quality_name: 'GC17', sample_type: 'pss', workflow_stage: 'certified', status: 'approved',
    })
    expect(row).toEqual({
      id: 's1', trackingNumber: 'BR-0231/26', origin: 'Brazil', quality: 'GC17',
      sampleType: 'pss', stage: 'certified', status: 'approved',
      certificateUrl: '/certificate/BR-0231_26',
    })
  })

  it('omits the certificate link for non-certified samples', () => {
    const row = mapSampleRow({
      id: 's2', tracking_number: 'CO-0188/26', origin: 'Colombia',
      quality_name: 'EP', sample_type: 'pss', workflow_stage: 'analysis', status: 'received',
    })
    expect(row.certificateUrl).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/portal/portal-samples.test.ts`
Expected: FAIL — cannot find module `./portal-samples`.

- [ ] **Step 3: Implement the mapper**

```ts
// src/lib/portal/portal-samples.ts
import { trackingNumberToSlug } from '@/lib/utils'

export interface PortalSampleRow {
  id: string
  trackingNumber: string
  origin: string | null
  quality: string | null
  sampleType: string | null
  stage: string | null
  status: string | null
  certificateUrl: string | null
}

export function mapSampleRow(row: any): PortalSampleRow {
  const certified = row.workflow_stage === 'certified' || row.workflow_stage === 'rejected'
  return {
    id: row.id,
    trackingNumber: row.tracking_number,
    origin: row.origin ?? null,
    quality: row.quality_name ?? null,
    sampleType: row.sample_type ?? null,
    stage: row.workflow_stage ?? null,
    status: row.status ?? null,
    certificateUrl: certified && row.tracking_number ? `/certificate/${trackingNumberToSlug(row.tracking_number)}` : null,
  }
}
```

(Confirm `trackingNumberToSlug` is exported from `src/lib/utils.ts`; it converts `/` → `_`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/portal/portal-samples.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the samples API**

```ts
// src/app/api/portal/samples/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getPortalCompany } from '@/lib/portal/portal-auth'
import { mapSampleRow } from '@/lib/portal/portal-samples'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const company = await getPortalCompany(supabase, user.id)
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const q = new URL(request.url).searchParams.get('q')?.trim()
  let query = (supabase as any)
    .from('samples')
    .select('id, tracking_number, origin, quality_name, sample_type, workflow_stage, status, wolthers_contract_nr')
    .or(`client_id.eq.${company.clientId},end_client_id.eq.${company.clientId}`)
    .order('created_at', { ascending: false })
    .limit(500)
  if (q) query = query.ilike('tracking_number', `%${q}%`)

  const { data } = await query
  return NextResponse.json({ samples: (data ?? []).map(mapSampleRow) })
}
```

- [ ] **Step 6: Implement the samples page**

```tsx
// src/app/portal/samples/page.tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PortalSampleRow } from '@/lib/portal/portal-samples'

export default function PortalSamplesPage() {
  const [rows, setRows] = useState<PortalSampleRow[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true)
      const res = await fetch(`/api/portal/samples${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      if (res.ok) setRows((await res.json()).samples)
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Samples</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tracking number"
          className="w-64 rounded-full border border-neutral-200 px-4 py-2 text-sm outline-none focus:border-[#556b2f]"
        />
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-100">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">Tracking #</th>
              <th className="px-5 py-3 font-medium">Origin</th>
              <th className="px-5 py-3 font-medium">Quality</th>
              <th className="px-5 py-3 font-medium">Stage</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Certificate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-neutral-500">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-neutral-500">No samples found.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 text-neutral-900">{r.trackingNumber}</td>
                <td className="px-5 py-3 text-neutral-600">{r.origin ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.quality ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.stage ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.status ?? '—'}</td>
                <td className="px-5 py-3">
                  {r.certificateUrl
                    ? <Link href={r.certificateUrl} className="text-[#556b2f] hover:underline">View</Link>
                    : <span className="text-neutral-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/portal/portal-samples.ts src/lib/portal/portal-samples.test.ts src/app/api/portal/samples/route.ts src/app/portal/samples/page.tsx
git commit -m "feat(portal): company-scoped samples list with search"
```

---

### Task 9: Contracts list — grouping + API + page

**Files:**
- Create: `src/lib/portal/portal-contracts.ts`, test `src/lib/portal/portal-contracts.test.ts`
- Create: `src/app/api/portal/contracts/route.ts`
- Create: `src/app/portal/contracts/page.tsx`

**Interfaces:**
- Produces: `groupSamplesByContract(rows): PortalContractRow[]`; `GET /api/portal/contracts` → `{ contracts: PortalContractRow[] }`.
- `PortalContractRow = { contractNumber, sampleCount, approved, rejected, pending, origins }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/portal/portal-contracts.test.ts
import { describe, it, expect } from 'vitest'
import { groupSamplesByContract } from './portal-contracts'

describe('groupSamplesByContract', () => {
  it('groups samples by contract number with status rollups and distinct origins', () => {
    const out = groupSamplesByContract([
      { wolthers_contract_nr: '4220', status: 'approved', origin: 'Brazil' },
      { wolthers_contract_nr: '4220', status: 'rejected', origin: 'Brazil' },
      { wolthers_contract_nr: '4231', status: 'received', origin: 'Colombia' },
    ])
    expect(out).toEqual([
      { contractNumber: '4220', sampleCount: 2, approved: 1, rejected: 1, pending: 0, origins: ['Brazil'] },
      { contractNumber: '4231', sampleCount: 1, approved: 0, rejected: 0, pending: 1, origins: ['Colombia'] },
    ])
  })

  it('buckets samples without a contract number under "Unassigned"', () => {
    const out = groupSamplesByContract([{ wolthers_contract_nr: null, status: 'approved', origin: 'Peru' }])
    expect(out[0].contractNumber).toBe('Unassigned')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/portal/portal-contracts.test.ts`
Expected: FAIL — cannot find module `./portal-contracts`.

- [ ] **Step 3: Implement the grouping**

```ts
// src/lib/portal/portal-contracts.ts
export interface PortalContractRow {
  contractNumber: string
  sampleCount: number
  approved: number
  rejected: number
  pending: number
  origins: string[]
}

export function groupSamplesByContract(rows: any[]): PortalContractRow[] {
  const map = new Map<string, PortalContractRow>()
  for (const row of rows) {
    const key = row.wolthers_contract_nr || 'Unassigned'
    let entry = map.get(key)
    if (!entry) { entry = { contractNumber: key, sampleCount: 0, approved: 0, rejected: 0, pending: 0, origins: [] }; map.set(key, entry) }
    entry.sampleCount++
    if (row.status === 'approved') entry.approved++
    else if (row.status === 'rejected') entry.rejected++
    else entry.pending++
    if (row.origin && !entry.origins.includes(row.origin)) entry.origins.push(row.origin)
  }
  return Array.from(map.values()).sort((a, b) => a.contractNumber.localeCompare(b.contractNumber))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/portal/portal-contracts.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the contracts API**

```ts
// src/app/api/portal/contracts/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getPortalCompany } from '@/lib/portal/portal-auth'
import { groupSamplesByContract } from '@/lib/portal/portal-contracts'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const company = await getPortalCompany(supabase, user.id)
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await (supabase as any)
    .from('samples')
    .select('wolthers_contract_nr, status, origin')
    .or(`client_id.eq.${company.clientId},end_client_id.eq.${company.clientId}`)

  return NextResponse.json({ contracts: groupSamplesByContract(data ?? []) })
}
```

- [ ] **Step 6: Implement the contracts page**

```tsx
// src/app/portal/contracts/page.tsx
'use client'
import { useEffect, useState } from 'react'
import type { PortalContractRow } from '@/lib/portal/portal-contracts'

export default function PortalContractsPage() {
  const [rows, setRows] = useState<PortalContractRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/portal/contracts')
      if (res.ok) setRows((await res.json()).contracts)
      setLoading(false)
    })()
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Contracts</h1>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-100">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">Contract</th>
              <th className="px-5 py-3 font-medium">Origins</th>
              <th className="px-5 py-3 font-medium">Samples</th>
              <th className="px-5 py-3 font-medium">Approved</th>
              <th className="px-5 py-3 font-medium">Rejected</th>
              <th className="px-5 py-3 font-medium">Pending</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-neutral-500">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-neutral-500">No contracts found.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.contractNumber}>
                <td className="px-5 py-3 text-neutral-900">{r.contractNumber}</td>
                <td className="px-5 py-3 text-neutral-600">{r.origins.join(', ') || '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.sampleCount}</td>
                <td className="px-5 py-3 text-[#22c55e]">{r.approved}</td>
                <td className="px-5 py-3 text-[#ef4444]">{r.rejected}</td>
                <td className="px-5 py-3 text-neutral-600">{r.pending}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/portal/portal-contracts.ts src/lib/portal/portal-contracts.test.ts src/app/api/portal/contracts/route.ts src/app/portal/contracts/page.tsx
git commit -m "feat(portal): contracts list grouped from scoped samples"
```

---

### Task 10: Certificates list — mapper + API + page

**Files:**
- Create: `src/lib/portal/portal-certificates.ts`, test `src/lib/portal/portal-certificates.test.ts`
- Create: `src/app/api/portal/certificates/route.ts`
- Create: `src/app/portal/certificates/page.tsx`

**Interfaces:**
- Produces: `mapCertRow(row): PortalCertRow`; `GET /api/portal/certificates` → `{ certificates: PortalCertRow[] }`.
- `PortalCertRow = { id, certificateNumber, trackingNumber, status, issuedDate, downloadUrl }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/portal/portal-certificates.test.ts
import { describe, it, expect } from 'vitest'
import { mapCertRow } from './portal-certificates'

describe('mapCertRow', () => {
  it('maps a certificate row with a PDF download url from the sample tracking number', () => {
    const row = mapCertRow({
      id: 'c1', certificate_number: 'SAG-011692/26', is_rejected: false,
      created_at: '2026-06-01T00:00:00Z', sample: { tracking_number: 'BR-0231/26' },
    })
    expect(row).toEqual({
      id: 'c1', certificateNumber: 'SAG-011692/26', trackingNumber: 'BR-0231/26',
      status: 'approved', issuedDate: '2026-06-01T00:00:00Z', downloadUrl: '/api/certificate/BR-0231_26/pdf',
    })
  })

  it('marks rejected certificates', () => {
    const row = mapCertRow({ id: 'c2', certificate_number: 'X', is_rejected: true, created_at: null, sample: { tracking_number: 'CO-1/26' } })
    expect(row.status).toBe('rejected')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/portal/portal-certificates.test.ts`
Expected: FAIL — cannot find module `./portal-certificates`.

- [ ] **Step 3: Implement the mapper**

```ts
// src/lib/portal/portal-certificates.ts
import { trackingNumberToSlug } from '@/lib/utils'

export interface PortalCertRow {
  id: string
  certificateNumber: string | null
  trackingNumber: string | null
  status: 'approved' | 'rejected'
  issuedDate: string | null
  downloadUrl: string | null
}

export function mapCertRow(row: any): PortalCertRow {
  const tn = row.sample?.tracking_number ?? row.tracking_number ?? null
  return {
    id: row.id,
    certificateNumber: row.certificate_number ?? null,
    trackingNumber: tn,
    status: row.is_rejected ? 'rejected' : 'approved',
    issuedDate: row.created_at ?? null,
    downloadUrl: tn ? `/api/certificate/${trackingNumberToSlug(tn)}/pdf` : null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/portal/portal-certificates.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the certificates API**

```ts
// src/app/api/portal/certificates/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getPortalCompany } from '@/lib/portal/portal-auth'
import { mapCertRow } from '@/lib/portal/portal-certificates'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const company = await getPortalCompany(supabase, user.id)
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Scope certificates through their parent sample's company columns via an inner join filter.
  const { data } = await (supabase as any)
    .from('certificates')
    .select('id, certificate_number, is_rejected, created_at, sample:samples!inner(tracking_number, client_id, end_client_id)')
    .or(`client_id.eq.${company.clientId},end_client_id.eq.${company.clientId}`, { foreignTable: 'samples' })
    .is('sample_contract_id', null)
    .order('created_at', { ascending: false })
    .limit(500)

  return NextResponse.json({ certificates: (data ?? []).map(mapCertRow) })
}
```

(If the `foreignTable` filter form needs adjustment for the installed `@supabase/supabase-js` version, fetch certificates joined to `samples!inner(...)` and filter the company match in JS over the returned `sample.client_id`/`sample.end_client_id` before mapping — keep the result shape identical.)

- [ ] **Step 6: Implement the certificates page**

```tsx
// src/app/portal/certificates/page.tsx
'use client'
import { useEffect, useState } from 'react'
import type { PortalCertRow } from '@/lib/portal/portal-certificates'

export default function PortalCertificatesPage() {
  const [rows, setRows] = useState<PortalCertRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/portal/certificates')
      if (res.ok) setRows((await res.json()).certificates)
      setLoading(false)
    })()
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Certificates</h1>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-100">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">Certificate #</th>
              <th className="px-5 py-3 font-medium">Tracking #</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Issued</th>
              <th className="px-5 py-3 font-medium">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-neutral-500">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-neutral-500">No certificates found.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 text-neutral-900">{r.certificateNumber ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.trackingNumber ?? '—'}</td>
                <td className="px-5 py-3"><span className={r.status === 'approved' ? 'text-[#22c55e]' : 'text-[#ef4444]'}>{r.status}</span></td>
                <td className="px-5 py-3 text-neutral-600">{r.issuedDate ? new Date(r.issuedDate).toLocaleDateString() : '—'}</td>
                <td className="px-5 py-3">
                  {r.downloadUrl
                    ? <a href={r.downloadUrl} target="_blank" rel="noreferrer" className="text-[#556b2f] hover:underline">Download</a>
                    : <span className="text-neutral-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/portal/portal-certificates.ts src/lib/portal/portal-certificates.test.ts src/app/api/portal/certificates/route.ts src/app/portal/certificates/page.tsx
git commit -m "feat(portal): certificates list with PDF download"
```

---

### Task 11: RLS hardening — client-scoped sample reads (security)

The current `samples` SELECT policy lets **any authenticated user** read **all** samples. Onboarding many client users makes that a data-leak risk: a client could query `samples` directly with their session and see other companies' data. This task replaces the broad SELECT policy so client-role users see only their own company's rows, while staff/admin keep broad read and the public cert path (service role) is unaffected.

**Files:**
- Create: `database/migrations/20260622000003_portal_client_sample_read_scope.sql`

- [ ] **Step 1: Discover the current broad SELECT policy name**

Run in the Supabase SQL editor and note the policy name(s) whose `cmd = 'SELECT'` and whose `qual` allows all authenticated users:
```sql
SELECT polname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'samples' AND cmd = 'SELECT';
```

- [ ] **Step 2: Write the migration SQL**

Replace `<BROAD_SELECT_POLICY_NAME>` with the exact name found in Step 1.
```sql
-- Migration 20260622000003: scope sample reads for client-role users
-- Staff/admin keep broad read; client-role users only see their own company's samples.
-- Public certificate path uses the service role and bypasses RLS, so it is unaffected.

DROP POLICY IF EXISTS "<BROAD_SELECT_POLICY_NAME>" ON public.samples;

CREATE POLICY "samples_select_staff_or_own_company"
ON public.samples
FOR SELECT
TO authenticated
USING (
  -- staff / global admins: broad read
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.is_global_admin = true
        OR p.qc_role IN ('lab_personnel','lab_quality_manager','lab_finance_manager',
                         'global_admin','global_quality_admin','global_finance_admin','santos_hq_finance')
      )
  )
  OR
  -- client-role users: only their own company's samples
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.qc_role = 'client'
      AND p.client_id IS NOT NULL
      AND (samples.client_id = p.client_id OR samples.end_client_id = p.client_id)
  )
);
```

- [ ] **Step 3: Hand the SQL to Daniel to apply**

Tell Daniel the migration is ready and which policy name it drops (from Step 1). Do not run it yourself.

- [ ] **Step 4: Verify after apply**

- As a **staff** user (existing internal app): confirm sample lists still load across companies (no regression).
- As a **test client** user: confirm `/portal/samples` shows only that company's samples, and a direct query for another company returns nothing:
```sql
-- run while authenticated as the test client (e.g. via the app), expect 0 rows for a foreign company:
SELECT count(*) FROM samples WHERE client_id = '<SOME_OTHER_COMPANY_ID>';
```
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add database/migrations/20260622000003_portal_client_sample_read_scope.sql
git commit -m "feat(portal): RLS scopes sample reads to a client's own company"
```

---

## Final verification (whole sub-project)

- [ ] Run the full suite: `npx vitest run` — all green.
- [ ] Typecheck: `npx tsc --noEmit` — clean.
- [ ] Build: `npm run build` — succeeds.
- [ ] Manual end-to-end (dev server `npm run dev`):
  1. As staff, open a QC client's detail page → **Invite portal user** → send to a test address.
  2. Accept the invite (set password or Microsoft OAuth) → confirm you land on `/portal`.
  3. Confirm `profiles.client_id` is set for the new user (SQL: `select client_id, qc_role from profiles where email = '<test>'`).
  4. In `/portal`: Overview shows that company's rollups; Samples/Contracts/Certificates show only that company's data; a certificate PDF downloads.
  5. Try `/dashboard` and `/clients` as the client user → redirected to `/portal`.
  6. As staff, confirm `/dashboard` still loads normally.

## Spec coverage self-check

- Entry & routing (one-login, role redirect) → Tasks 3, 6.
- Namespace & read-only scoping → Tasks 1, 7–10 (+ RLS Task 11).
- Visual language (light/airy top-nav, olive accent) → Task 6 + page tasks.
- Overview dashboard (WAQC-knowable rollups, recent decisions, "coming soon" shipment tile) → Task 7.
- Browse modes (contracts + samples lists) + certificates → Tasks 8, 9, 10.
- Onboarding admin UI (invite client users, company link) → Tasks 2, 3, 4, 5.
- Out of scope (B/C/D, supplier/buyer) → not built, by design.
