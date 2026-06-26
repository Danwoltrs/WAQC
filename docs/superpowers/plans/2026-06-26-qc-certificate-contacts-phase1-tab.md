# QC Certificate Contacts — Phase 1 (Contacts Tab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Contacts" tab on the company detail page (`/clients/[id]`) in WAQC that lists and manages the people and group inboxes who receive QC certificates for that company, writing to the shared `contacts` table.

**Architecture:** All QC-recipient writes go through a small server module (`src/lib/qc-contacts/`) whose core operation is an upsert keyed by `(company_id, lower(email))` that set-unions the `qc_certificates` tag onto `contacts.routing_purposes` (never clobbering sys's other tags). Two thin Next.js API routes (service-role client, auth-gated) expose list/add/edit/remove. A React tab component renders a simplified two-pane list/detail editor. No migration — the shared `contacts` table is owned by sys and already has every column we use.

**Tech Stack:** Next.js 15.5.9 (App Router, async route `params`), TypeScript, Supabase JS ^2.58 (service-role client for writes, user-context client for auth), Vitest ^2.1.9 + @testing-library/react ^16 + jsdom for tests, Tailwind + existing shadcn/ui primitives (`Button`, `Input`).

## Global Constraints

- **No migration to `contacts`** — sys owns it; all columns used (`email, name, nickname, phone, whatsapp, preferred_language, is_group, is_primary, is_active, routing_purposes, created_by`) already exist.
- **`qc_certificates` is the only recipient signal** — value `'qc_certificates'` in `contacts.routing_purposes text[]`. Source of truth constant: `QC_CERTIFICATES_PURPOSE` exported from `src/lib/approval-notification/resolve-panels.ts`. Import it; never hardcode the literal elsewhere.
- **Never clobber other routing purposes** — tag add/remove is a set operation on that one element only.
- **Service-role writes, auth-gated in-route** — copy the admin-client pattern from `src/app/api/certificates/route.ts:12-17`; gate every handler on `supabase.auth.getUser()` (user-context client from `@/lib/supabase-server`), 401 if absent. Use `user.id` for `created_by`.
- **No emojis in the UI. No mock data.** (Project CLAUDE.md.) Font is Inter; cards use the existing rounded/`text-[13px]` styling already in `client-detail-view.tsx`.
- **Keep files under ~2000 lines.** All files here are small.
- **Run tests with** `npx vitest run <path>` (one-shot; the bare `vitest` script is watch mode).
- **Type-check with** `npx tsc --noEmit`.
- **Commit directly to `main`** (trunk-based; sole developer — see project memory). Do not open a branch/PR unless asked.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/lib/qc-contacts/tags.ts` (create) | Pure tag-array ops, internal-email check, list split/order, shared `QcContactRecord` type | 1 |
| `src/lib/qc-contacts/tags.test.ts` (create) | Unit tests for the pure helpers | 1 |
| `src/lib/qc-contacts/upsert.ts` (create) | Pure `planQcUpsert` + DB ops (`upsertQcRecipient`, `setQcCertTag`, `updateQcContactFields`, `findContactByEmail`) | 2 |
| `src/lib/qc-contacts/upsert.test.ts` (create) | Unit tests for the pure `planQcUpsert` | 2 |
| `src/app/api/companies/[id]/qc-contacts/route.ts` (create) | GET (list) + POST (add) | 3 |
| `src/app/api/companies/[id]/qc-contacts/[contactId]/route.ts` (create) | PATCH (edit) + DELETE (untag) | 3 |
| `src/components/clients/qc-contacts-tab.tsx` (create) | Two-pane list/detail editor component | 4 |
| `src/components/clients/qc-contacts-tab.test.tsx` (create) | Component tests (list render + add) | 4 |
| `src/components/clients/client-detail-view.tsx` (modify `:751-787`) | Add the `Contacts` tab trigger + content | 4 |

---

### Task 1: Pure tag & list helpers

**Files:**
- Create: `src/lib/qc-contacts/tags.ts`
- Test: `src/lib/qc-contacts/tags.test.ts`

**Interfaces:**
- Consumes: `QC_CERTIFICATES_PURPOSE` from `src/lib/approval-notification/resolve-panels.ts`.
- Produces:
  - `interface QcContactRecord { id: string; company_id: string; email: string | null; name: string; nickname: string | null; phone: string | null; whatsapp: string | null; preferred_language: string | null; is_group: boolean; is_primary: boolean | null; is_active: boolean; routing_purposes: string[] }`
  - `hasQcCertTag(purposes: string[] | null | undefined): boolean`
  - `addQcCertTag(purposes: string[] | null | undefined): string[]`
  - `removeQcCertTag(purposes: string[] | null | undefined): string[]`
  - `isInternalEmail(email: string | null | undefined): boolean`
  - `splitQcContacts(rows: QcContactRecord[]): { people: QcContactRecord[]; groups: QcContactRecord[] }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/qc-contacts/tags.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  hasQcCertTag,
  addQcCertTag,
  removeQcCertTag,
  isInternalEmail,
  splitQcContacts,
  type QcContactRecord,
} from './tags'

const rec = (over: Partial<QcContactRecord>): QcContactRecord => ({
  id: 'id', company_id: 'co', email: 'a@x.com', name: 'A', nickname: null,
  phone: null, whatsapp: null, preferred_language: null, is_group: false,
  is_primary: null, is_active: true, routing_purposes: ['qc_certificates'], ...over,
})

describe('qc-cert tag helpers', () => {
  it('hasQcCertTag detects the tag and tolerates null', () => {
    expect(hasQcCertTag(['qc_certificates'])).toBe(true)
    expect(hasQcCertTag(['shipping_documents'])).toBe(false)
    expect(hasQcCertTag(null)).toBe(false)
  })

  it('addQcCertTag unions without duplicating and preserves other tags', () => {
    expect(addQcCertTag(['shipping_documents'])).toEqual(['shipping_documents', 'qc_certificates'])
    expect(addQcCertTag(['qc_certificates'])).toEqual(['qc_certificates'])
    expect(addQcCertTag(null)).toEqual(['qc_certificates'])
  })

  it('removeQcCertTag removes ONLY the qc tag', () => {
    expect(removeQcCertTag(['qc_certificates', 'fixation_letters'])).toEqual(['fixation_letters'])
    expect(removeQcCertTag(['fixation_letters'])).toEqual(['fixation_letters'])
    expect(removeQcCertTag(null)).toEqual([])
  })

  it('isInternalEmail flags @wolthers.com only', () => {
    expect(isInternalEmail('anderson@wolthers.com')).toBe(true)
    expect(isInternalEmail('buyer@ahold.nl')).toBe(false)
    expect(isInternalEmail(null)).toBe(false)
  })

  it('splitQcContacts separates people/groups, primary-first then name', () => {
    const rows = [
      rec({ id: 'p2', is_group: false, is_primary: false, name: 'Zed' }),
      rec({ id: 'p1', is_group: false, is_primary: true, name: 'Bob' }),
      rec({ id: 'g1', is_group: true, name: 'Inbox' }),
    ]
    const { people, groups } = splitQcContacts(rows)
    expect(people.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(groups.map((g) => g.id)).toEqual(['g1'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/qc-contacts/tags.test.ts`
Expected: FAIL — cannot resolve `./tags` (module does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/qc-contacts/tags.ts`:

```ts
import { QC_CERTIFICATES_PURPOSE } from '@/lib/approval-notification/resolve-panels'

/** A contact row as the QC-contacts feature reads/writes it (a subset of the shared `contacts` table). */
export interface QcContactRecord {
  id: string
  company_id: string
  email: string | null
  name: string
  nickname: string | null
  phone: string | null
  whatsapp: string | null
  preferred_language: string | null
  is_group: boolean
  is_primary: boolean | null
  is_active: boolean
  routing_purposes: string[]
}

/** Columns to select for a QcContactRecord — shared by the module and routes. */
export const QC_CONTACT_COLUMNS =
  'id, company_id, email, name, nickname, phone, whatsapp, preferred_language, is_group, is_primary, is_active, routing_purposes'

/** True when `purposes` already contains the QC-certificate tag. */
export function hasQcCertTag(purposes: string[] | null | undefined): boolean {
  return Array.isArray(purposes) && purposes.includes(QC_CERTIFICATES_PURPOSE)
}

/** `purposes` with the QC-cert tag added (set-union; no duplicates; preserves order + other tags). */
export function addQcCertTag(purposes: string[] | null | undefined): string[] {
  const base = Array.isArray(purposes) ? [...purposes] : []
  return hasQcCertTag(base) ? base : [...base, QC_CERTIFICATES_PURPOSE]
}

/** `purposes` with ONLY the QC-cert tag removed (every other tag untouched). */
export function removeQcCertTag(purposes: string[] | null | undefined): string[] {
  const base = Array.isArray(purposes) ? purposes : []
  return base.filter((p) => p !== QC_CERTIFICATES_PURPOSE)
}

/** Wolthers internal address — the resolver treats these as house CC, not a TO recipient. */
export function isInternalEmail(email: string | null | undefined): boolean {
  return !!email && /@wolthers\.com$/i.test(email)
}

/** Split QC-cert contacts into people and group inboxes, each ordered primary-first then name. */
export function splitQcContacts(rows: QcContactRecord[]): {
  people: QcContactRecord[]
  groups: QcContactRecord[]
} {
  const order = (a: QcContactRecord, b: QcContactRecord): number => {
    const ap = a.is_primary ? 0 : 1
    const bp = b.is_primary ? 0 : 1
    if (ap !== bp) return ap - bp
    return (a.name || '').localeCompare(b.name || '')
  }
  return {
    people: rows.filter((r) => !r.is_group).sort(order),
    groups: rows.filter((r) => r.is_group).sort(order),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/qc-contacts/tags.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/qc-contacts/tags.ts src/lib/qc-contacts/tags.test.ts
git commit -m "feat(qc-contacts): pure tag + list helpers"
```

---

### Task 2: Upsert planner & DB operations

**Files:**
- Create: `src/lib/qc-contacts/upsert.ts`
- Test: `src/lib/qc-contacts/upsert.test.ts`

**Interfaces:**
- Consumes: `QC_CERTIFICATES_PURPOSE` (from resolve-panels); `addQcCertTag`, `removeQcCertTag`, `QcContactRecord`, `QC_CONTACT_COLUMNS` (from `./tags`); `SupabaseClient` type from `@supabase/supabase-js`.
- Produces:
  - `interface QcContactInput { email: string; name?: string | null; nickname?: string | null; isGroup: boolean; phone?: string | null; whatsapp?: string | null; preferredLanguage?: string | null }`
  - `interface QcContactFields { name?: string; nickname?: string | null; email?: string; phone?: string | null; whatsapp?: string | null; preferredLanguage?: string | null; isGroup?: boolean }`
  - `type QcUpsertPlan = { kind: 'insert'; values: Record<string, unknown> } | { kind: 'update'; id: string; values: Record<string, unknown> }`
  - `planQcUpsert(existing: QcContactRecord | null, companyId: string, input: QcContactInput, actorId: string | null): QcUpsertPlan`
  - `findContactByEmail(db, companyId, email): Promise<QcContactRecord | null>`
  - `upsertQcRecipient(db, companyId, input: QcContactInput, actorId: string | null): Promise<QcContactRecord>`
  - `setQcCertTag(db, contactId: string, on: boolean): Promise<void>`
  - `updateQcContactFields(db, contactId: string, fields: QcContactFields): Promise<QcContactRecord>`

- [ ] **Step 1: Write the failing test** (pure planner only — DB ops are thin wrappers verified by type-check + Task 3 smoke)

Create `src/lib/qc-contacts/upsert.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { planQcUpsert } from './upsert'
import type { QcContactRecord } from './tags'

const existing = (over: Partial<QcContactRecord>): QcContactRecord => ({
  id: 'c1', company_id: 'co1', email: 'joost@ahold.nl', name: 'Joost', nickname: null,
  phone: null, whatsapp: null, preferred_language: null, is_group: false,
  is_primary: null, is_active: true, routing_purposes: ['shipping_documents'], ...over,
})

const input = {
  email: 'joost@ahold.nl', name: 'Joost Pollmann', nickname: 'Joost',
  isGroup: false, phone: '+31', whatsapp: null, preferredLanguage: 'en',
}

describe('planQcUpsert', () => {
  it('plans an INSERT (tagged) when no contact exists', () => {
    const plan = planQcUpsert(null, 'co1', input, 'user1')
    expect(plan.kind).toBe('insert')
    if (plan.kind !== 'insert') return
    expect(plan.values).toMatchObject({
      company_id: 'co1', email: 'joost@ahold.nl', name: 'Joost Pollmann',
      is_group: false, is_active: true, routing_purposes: ['qc_certificates'], created_by: 'user1',
    })
  })

  it('derives name from the email local-part when none is given', () => {
    const plan = planQcUpsert(null, 'co1', { email: 'team@ahold.nl', isGroup: true }, null)
    if (plan.kind !== 'insert') throw new Error('expected insert')
    expect(plan.values.name).toBe('team')
    expect(plan.values.is_group).toBe(true)
  })

  it('plans an UPDATE that unions the tag and preserves other purposes', () => {
    const plan = planQcUpsert(existing({}), 'co1', input, 'user1')
    expect(plan.kind).toBe('update')
    if (plan.kind !== 'update') return
    expect(plan.id).toBe('c1')
    expect(plan.values.routing_purposes).toEqual(['shipping_documents', 'qc_certificates'])
    expect(plan.values.is_active).toBe(true)
  })

  it('reactivates a deactivated contact on re-add', () => {
    const plan = planQcUpsert(existing({ is_active: false }), 'co1', input, 'user1')
    if (plan.kind !== 'update') throw new Error('expected update')
    expect(plan.values.is_active).toBe(true)
  })

  it('fills only BLANK fields and never clobbers an existing name', () => {
    const plan = planQcUpsert(existing({ name: 'Existing Name', phone: null }), 'co1', input, 'user1')
    if (plan.kind !== 'update') throw new Error('expected update')
    expect(plan.values.name).toBeUndefined() // existing non-blank name kept
    expect(plan.values.phone).toBe('+31')    // blank phone filled
  })

  it('does not flip an existing person/group kind', () => {
    const plan = planQcUpsert(existing({ is_group: false }), 'co1', { ...input, isGroup: true }, 'user1')
    if (plan.kind !== 'update') throw new Error('expected update')
    expect(plan.values.is_group).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/qc-contacts/upsert.test.ts`
Expected: FAIL — cannot resolve `./upsert`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/qc-contacts/upsert.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { QC_CERTIFICATES_PURPOSE } from '@/lib/approval-notification/resolve-panels'
import { addQcCertTag, removeQcCertTag, QC_CONTACT_COLUMNS, type QcContactRecord } from './tags'

/** Input for adding/saving a QC-certificate recipient. */
export interface QcContactInput {
  email: string
  name?: string | null
  nickname?: string | null
  isGroup: boolean
  phone?: string | null
  whatsapp?: string | null
  preferredLanguage?: string | null
}

/** Fields the tab can edit on an existing contact (all optional; only provided keys are written). */
export interface QcContactFields {
  name?: string
  nickname?: string | null
  email?: string
  phone?: string | null
  whatsapp?: string | null
  preferredLanguage?: string | null
  isGroup?: boolean
}

export type QcUpsertPlan =
  | { kind: 'insert'; values: Record<string, unknown> }
  | { kind: 'update'; id: string; values: Record<string, unknown> }

const localPart = (email: string): string => email.split('@')[0] || email
const isBlank = (v: string | null | undefined): boolean => !v || !v.trim()

/**
 * Decide the write for "make this email a QC-cert recipient for the company". Pure — no DB.
 * `existing` is the current row matched by (company_id, lower(email)), or null.
 *  - insert: brand-new contact tagged qc_certificates.
 *  - update: union the tag, reactivate, fill ONLY blank fields (never clobber sys data,
 *    never flip an existing person/group kind).
 */
export function planQcUpsert(
  existing: QcContactRecord | null,
  companyId: string,
  input: QcContactInput,
  actorId: string | null,
): QcUpsertPlan {
  const email = input.email.trim()
  if (!existing) {
    return {
      kind: 'insert',
      values: {
        company_id: companyId,
        email,
        name: (input.name && input.name.trim()) || localPart(email),
        nickname: input.nickname?.trim() || null,
        phone: input.phone?.trim() || null,
        whatsapp: input.whatsapp?.trim() || null,
        preferred_language: input.preferredLanguage || 'en',
        is_group: input.isGroup,
        is_active: true,
        routing_purposes: [QC_CERTIFICATES_PURPOSE],
        created_by: actorId,
      },
    }
  }
  const values: Record<string, unknown> = {
    routing_purposes: addQcCertTag(existing.routing_purposes),
    is_active: true,
  }
  if (isBlank(existing.name) && input.name && input.name.trim()) values.name = input.name.trim()
  if (isBlank(existing.nickname) && input.nickname && input.nickname.trim()) values.nickname = input.nickname.trim()
  if (isBlank(existing.phone) && input.phone && input.phone.trim()) values.phone = input.phone.trim()
  if (isBlank(existing.whatsapp) && input.whatsapp && input.whatsapp.trim()) values.whatsapp = input.whatsapp.trim()
  if (isBlank(existing.preferred_language) && input.preferredLanguage) values.preferred_language = input.preferredLanguage
  return { kind: 'update', id: existing.id, values }
}

/** Find a company's contact by case-insensitive email (matches the (company_id, lower(email)) index). */
export async function findContactByEmail(
  db: SupabaseClient,
  companyId: string,
  email: string,
): Promise<QcContactRecord | null> {
  const { data, error } = await db
    .from('contacts')
    .select(QC_CONTACT_COLUMNS)
    .eq('company_id', companyId)
    .ilike('email', email.trim())
    .maybeSingle()
  if (error) throw error
  return (data as QcContactRecord) ?? null
}

/** Add/save a QC-cert recipient for the company (insert or tag-union update). Returns the row. */
export async function upsertQcRecipient(
  db: SupabaseClient,
  companyId: string,
  input: QcContactInput,
  actorId: string | null,
): Promise<QcContactRecord> {
  const existing = await findContactByEmail(db, companyId, input.email)
  const plan = planQcUpsert(existing, companyId, input, actorId)
  if (plan.kind === 'insert') {
    const { data, error } = await db.from('contacts').insert(plan.values).select(QC_CONTACT_COLUMNS).single()
    if (error) throw mapContactError(error)
    return data as QcContactRecord
  }
  const { data, error } = await db.from('contacts').update(plan.values).eq('id', plan.id).select(QC_CONTACT_COLUMNS).single()
  if (error) throw mapContactError(error)
  return data as QcContactRecord
}

/** Toggle the QC-cert tag on a contact. on=false removes ONLY that tag (never deletes the row). */
export async function setQcCertTag(db: SupabaseClient, contactId: string, on: boolean): Promise<void> {
  const { data, error } = await db.from('contacts').select('routing_purposes').eq('id', contactId).single()
  if (error) throw error
  const current = (data as { routing_purposes: string[] | null }).routing_purposes
  const next = on ? addQcCertTag(current) : removeQcCertTag(current)
  const { error: upErr } = await db.from('contacts').update({ routing_purposes: next }).eq('id', contactId)
  if (upErr) throw upErr
}

/** Edit core fields on a contact (tab). Maps the unique-email violation to a friendly Error. */
export async function updateQcContactFields(
  db: SupabaseClient,
  contactId: string,
  fields: QcContactFields,
): Promise<QcContactRecord> {
  const values: Record<string, unknown> = {}
  if (fields.name !== undefined) values.name = fields.name.trim()
  if (fields.nickname !== undefined) values.nickname = fields.nickname?.trim() || null
  if (fields.email !== undefined) values.email = fields.email.trim()
  if (fields.phone !== undefined) values.phone = fields.phone?.trim() || null
  if (fields.whatsapp !== undefined) values.whatsapp = fields.whatsapp?.trim() || null
  if (fields.preferredLanguage !== undefined) values.preferred_language = fields.preferredLanguage
  if (fields.isGroup !== undefined) values.is_group = fields.isGroup
  const { data, error } = await db.from('contacts').update(values).eq('id', contactId).select(QC_CONTACT_COLUMNS).single()
  if (error) throw mapContactError(error)
  return data as QcContactRecord
}

/** Translate the (company_id, lower(email)) unique violation into a user-facing message. */
function mapContactError(error: unknown): Error {
  if ((error as { code?: string })?.code === '23505') {
    return new Error('That email already exists for this company.')
  }
  return error instanceof Error ? error : new Error('Database error')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/qc-contacts/upsert.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/qc-contacts/upsert.ts src/lib/qc-contacts/upsert.test.ts
git commit -m "feat(qc-contacts): upsert planner + contacts DB operations"
```

---

### Task 3: API routes (list/add + edit/remove)

**Files:**
- Create: `src/app/api/companies/[id]/qc-contacts/route.ts`
- Create: `src/app/api/companies/[id]/qc-contacts/[contactId]/route.ts`

**Interfaces:**
- Consumes: `upsertQcRecipient`, `setQcCertTag`, `updateQcContactFields` (from `@/lib/qc-contacts/upsert`); `splitQcContacts`, `QC_CONTACT_COLUMNS`, `QcContactRecord` (from `@/lib/qc-contacts/tags`); `QC_CERTIFICATES_PURPOSE` (from resolve-panels); `createClient` (from `@/lib/supabase-server`); `createClient as createSupabaseClient` (from `@supabase/supabase-js`).
- Produces (HTTP):
  - `GET /api/companies/:id/qc-contacts` → `{ people: QcContactRecord[]; groups: QcContactRecord[] }`
  - `POST /api/companies/:id/qc-contacts` body `{ email, name?, nickname?, isGroup?, phone?, whatsapp?, preferredLanguage? }` → `{ contact: QcContactRecord }`
  - `PATCH /api/companies/:id/qc-contacts/:contactId` body `QcContactFields`-shaped → `{ contact: QcContactRecord }`
  - `DELETE /api/companies/:id/qc-contacts/:contactId` → `{ ok: true }`

- [ ] **Step 1: Create the list/add route**

Create `src/app/api/companies/[id]/qc-contacts/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { QC_CERTIFICATES_PURPOSE } from '@/lib/approval-notification/resolve-panels'
import { splitQcContacts, QC_CONTACT_COLUMNS, type QcContactRecord } from '@/lib/qc-contacts/tags'
import { upsertQcRecipient } from '@/lib/qc-contacts/upsert'

const adminClient = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await adminClient()
    .from('contacts')
    .select(QC_CONTACT_COLUMNS)
    .eq('company_id', id)
    .eq('is_active', true)
    .contains('routing_purposes', [QC_CERTIFICATES_PURPOSE])
  if (error) {
    console.error('qc-contacts GET error:', error)
    return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 })
  }
  const { people, groups } = splitQcContacts((data ?? []) as QcContactRecord[])
  return NextResponse.json({ people, groups })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    email?: string; name?: string | null; nickname?: string | null; isGroup?: boolean
    phone?: string | null; whatsapp?: string | null; preferredLanguage?: string | null
  } | null
  const email = body?.email?.trim()
  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

  try {
    const contact = await upsertQcRecipient(
      adminClient(),
      id,
      {
        email,
        name: body?.name ?? null,
        nickname: body?.nickname ?? null,
        isGroup: !!body?.isGroup,
        phone: body?.phone ?? null,
        whatsapp: body?.whatsapp ?? null,
        preferredLanguage: body?.preferredLanguage ?? null,
      },
      user.id,
    )
    return NextResponse.json({ contact })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to add contact' }, { status: 400 })
  }
}
```

- [ ] **Step 2: Create the edit/remove route**

Create `src/app/api/companies/[id]/qc-contacts/[contactId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { setQcCertTag, updateQcContactFields, type QcContactFields } from '@/lib/qc-contacts/upsert'

const adminClient = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { contactId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as
    | (QcContactFields & { preferredLanguage?: string | null })
    | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  try {
    const contact = await updateQcContactFields(adminClient(), contactId, {
      name: body.name,
      nickname: body.nickname,
      email: body.email,
      phone: body.phone,
      whatsapp: body.whatsapp,
      preferredLanguage: body.preferredLanguage,
      isGroup: body.isGroup,
    })
    return NextResponse.json({ contact })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to update contact' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { contactId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await setQcCertTag(adminClient(), contactId, false) // untag only — never deletes the row
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to remove contact' }, { status: 400 })
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke (dev server)**

Start the app (`npm run dev`), log in, then in the browser console (so the session cookie rides along), pick any company UUID `<CO>` you can see under Clients and run:

```js
// list (expect { people: [...], groups: [...] })
await fetch(`/api/companies/<CO>/qc-contacts`).then(r => r.json())
// add a person (expect { contact: {...routing_purposes:["qc_certificates"]} })
await fetch(`/api/companies/<CO>/qc-contacts`, { method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ email:'smoketest@example.com', name:'Smoke Test', isGroup:false }) }).then(r => r.json())
// re-list (expect the new person present), then remove it
```
Confirm the added contact appears in the list call, then DELETE it:
```js
await fetch(`/api/companies/<CO>/qc-contacts/<NEW_ID>`, { method:'DELETE' }).then(r => r.json())
```
Expected: after DELETE, a re-list no longer includes it (the row is untagged, not deleted — verify in sys/Supabase that the `contacts` row still exists with `qc_certificates` removed). Remove the smoke-test row in Supabase afterward if it was newly inserted.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/companies/[id]/qc-contacts/route.ts" "src/app/api/companies/[id]/qc-contacts/[contactId]/route.ts"
git commit -m "feat(qc-contacts): list/add/edit/remove API routes (service-role)"
```

---

### Task 4: Contacts tab component + wire into the company detail page

**Files:**
- Create: `src/components/clients/qc-contacts-tab.tsx`
- Test: `src/components/clients/qc-contacts-tab.test.tsx`
- Modify: `src/components/clients/client-detail-view.tsx:751-787`

**Interfaces:**
- Consumes: `GET/POST /api/companies/:id/qc-contacts`, `PATCH/DELETE /api/companies/:id/qc-contacts/:contactId` (Task 3); `Button`, `Input` from `@/components/ui/*`; `cn` from `@/lib/utils`.
- Produces: `export function QcContactsTab({ companyId, companyName }: { companyId: string; companyName: string })`.

- [ ] **Step 1: Write the failing component test**

Create `src/components/clients/qc-contacts-tab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QcContactsTab } from './qc-contacts-tab'

const listResponse = {
  people: [
    { id: 'c1', company_id: 'co1', email: 'joost@ahold.nl', name: 'Joost Pollmann', nickname: 'Joost',
      phone: null, whatsapp: null, preferred_language: 'en', is_group: false, is_primary: false,
      is_active: true, routing_purposes: ['qc_certificates'] },
  ],
  groups: [
    { id: 'g1', company_id: 'co1', email: 'qc@ahold.nl', name: 'QC inbox', nickname: null,
      phone: null, whatsapp: null, preferred_language: null, is_group: true, is_primary: false,
      is_active: true, routing_purposes: ['qc_certificates'] },
  ],
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.endsWith('/qc-contacts') && (!init || !init.method || init.method === 'GET')) {
      return { ok: true, json: async () => listResponse } as Response
    }
    if (u.endsWith('/qc-contacts') && init?.method === 'POST') {
      return { ok: true, json: async () => ({ contact: { id: 'c2' } }) } as Response
    }
    return { ok: false, json: async () => ({ error: 'unexpected' }) } as Response
  }))
})

describe('QcContactsTab', () => {
  it('lists the company QC-certificate recipients (people + group inboxes)', async () => {
    render(<QcContactsTab companyId="co1" companyName="Ahold" />)
    await waitFor(() => expect(screen.getByText('Joost Pollmann')).toBeInTheDocument())
    expect(screen.getByText('qc@ahold.nl')).toBeInTheDocument()
    expect(screen.getByText('People')).toBeInTheDocument()
    expect(screen.getByText('Group inboxes')).toBeInTheDocument()
  })

  it('adds a recipient via POST', async () => {
    render(<QcContactsTab companyId="co1" companyName="Ahold" />)
    await waitFor(() => expect(screen.getByText('Joost Pollmann')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /add/i }))
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'new@ahold.nl' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      expect(calls.some((c) => String(c[0]).endsWith('/qc-contacts') && (c[1] as RequestInit | undefined)?.method === 'POST')).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/clients/qc-contacts-tab.test.tsx`
Expected: FAIL — cannot resolve `./qc-contacts-tab`.

- [ ] **Step 3: Write the component**

Create `src/components/clients/qc-contacts-tab.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Plus, Trash2, User, Users, Loader2, AlertCircle } from 'lucide-react'

interface QcContact {
  id: string
  company_id: string
  email: string | null
  name: string
  nickname: string | null
  phone: string | null
  whatsapp: string | null
  preferred_language: string | null
  is_group: boolean
  is_primary: boolean | null
  is_active: boolean
  routing_purposes: string[]
}

const LANGS = ['en', 'pt', 'de', 'fr', 'es'] as const

type Draft = {
  id: string | null
  email: string
  name: string
  nickname: string
  phone: string
  whatsapp: string
  preferredLanguage: string
  isGroup: boolean
}

const emptyDraft = (): Draft => ({
  id: null, email: '', name: '', nickname: '', phone: '', whatsapp: '',
  preferredLanguage: 'en', isGroup: false,
})

const toDraft = (c: QcContact): Draft => ({
  id: c.id,
  email: c.email ?? '',
  name: c.name ?? '',
  nickname: c.nickname ?? '',
  phone: c.phone ?? '',
  whatsapp: c.whatsapp ?? '',
  preferredLanguage: c.preferred_language ?? 'en',
  isGroup: c.is_group,
})

const initials = (name: string, email: string): string => {
  const src = (name || email || '?').trim()
  const parts = src.split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || (src[0]?.toUpperCase() ?? '?')
}

const isInternal = (email: string): boolean => /@wolthers\.com$/i.test(email.trim())

export function QcContactsTab({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [people, setPeople] = useState<QcContact[]>([])
  const [groups, setGroups] = useState<QcContact[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/companies/${companyId}/qc-contacts`)
      if (!res.ok) throw new Error('Failed to load contacts')
      const data = await res.json()
      setPeople(data.people ?? [])
      setGroups(data.groups ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contacts')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { load() }, [load])

  const startAdd = () => { setError(null); setDraft(emptyDraft()) }
  const startEdit = (c: QcContact) => { setError(null); setDraft(toDraft(c)) }
  const discard = () => { setError(null); setDraft(null) }

  const save = async () => {
    if (!draft) return
    if (!draft.email.trim()) { setError('Email is required'); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        email: draft.email.trim(),
        name: draft.name.trim() || null,
        nickname: draft.nickname.trim() || null,
        isGroup: draft.isGroup,
        phone: draft.phone.trim() || null,
        whatsapp: draft.whatsapp.trim() || null,
        preferredLanguage: draft.preferredLanguage,
      }
      const res = draft.id
        ? await fetch(`/api/companies/${companyId}/qc-contacts/${draft.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch(`/api/companies/${companyId}/qc-contacts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to save contact')
      setDraft(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save contact')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!draft?.id) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/companies/${companyId}/qc-contacts/${draft.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to remove contact')
      }
      setDraft(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove contact')
    } finally {
      setSaving(false)
    }
  }

  const total = people.length + groups.length

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
      {/* Left rail */}
      <div className="rounded-[14px] border border-border/60 p-2">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            Recipients ({total})
          </span>
          <Button variant="outline" size="sm" onClick={startAdd} className="h-7 gap-1 rounded-[8px] text-[12px]">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-6 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : total === 0 ? (
          <div className="px-2 py-6 text-[13px] text-muted-foreground">
            No one at {companyName} receives QC certificates yet.
          </div>
        ) : (
          <div className="space-y-3">
            {people.length > 0 && (
              <Section label="People" icon={<User className="h-3.5 w-3.5" />} rows={people} draftId={draft?.id ?? null} onPick={startEdit} />
            )}
            {groups.length > 0 && (
              <Section label="Group inboxes" icon={<Users className="h-3.5 w-3.5" />} rows={groups} draftId={draft?.id ?? null} onPick={startEdit} />
            )}
          </div>
        )}
      </div>

      {/* Right pane */}
      <div className="rounded-[14px] border border-border/60 p-4">
        {!draft ? (
          <div className="flex h-full items-center justify-center py-10 text-[13px] text-muted-foreground">
            Select a recipient, or add one to receive QC certificates.
          </div>
        ) : (
          <div className="max-w-xl space-y-4">
            <div className="text-[14px] font-semibold">
              {draft.id ? 'Edit recipient' : 'Add QC-certificate recipient'}
            </div>

            <Segmented
              value={draft.isGroup ? 'group' : 'person'}
              options={[{ value: 'person', label: 'Person' }, { value: 'group', label: 'Group inbox' }]}
              onChange={(v) => setDraft({ ...draft, isGroup: v === 'group' })}
            />

            <Field label="Email">
              <Input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="name@company.com" />
              {isInternal(draft.email) && (
                <p className="mt-1 text-[12px] text-amber-600">
                  Internal Wolthers address — always CC&apos;d as head office; it won&apos;t appear as a recipient.
                </p>
              )}
            </Field>

            {!draft.isGroup ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
                <Field label="Nickname (greeting)"><Input value={draft.nickname} onChange={(e) => setDraft({ ...draft, nickname: e.target.value })} /></Field>
              </div>
            ) : (
              <Field label="Label (optional)">
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. QC team inbox" />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone"><Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
              <Field label="WhatsApp"><Input value={draft.whatsapp} onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })} /></Field>
            </div>

            {!draft.isGroup && (
              <Field label="Preferred language">
                <Segmented
                  value={draft.preferredLanguage}
                  options={LANGS.map((l) => ({ value: l, label: l.toUpperCase() }))}
                  onChange={(v) => setDraft({ ...draft, preferredLanguage: v })}
                />
              </Field>
            )}

            {error && (
              <div className="flex items-center gap-1.5 text-[12px] text-red-600">
                <AlertCircle className="h-3.5 w-3.5" /> {error}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              {draft.id ? (
                <button type="button" onClick={remove} disabled={saving}
                  className="inline-flex items-center gap-1 text-[13px] text-red-600 hover:underline disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" /> Remove from QC certificates
                </button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={discard} disabled={saving} className="h-9 rounded-[9px] text-[13px]">Discard</Button>
                <Button size="sm" onClick={save} disabled={saving} className="h-9 rounded-[9px] text-[13px]">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
            </div>

            <p className="pt-1 text-[11px] text-muted-foreground">
              Other contact settings (sale confirmations, shipping, etc.) are managed in sys.wolthers.com.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ label, icon, rows, draftId, onPick }: {
  label: string; icon: ReactNode; rows: QcContact[]; draftId: string | null; onPick: (c: QcContact) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="space-y-0.5">
        {rows.map((c) => (
          <button key={c.id} type="button" onClick={() => onPick(c)}
            className={cn('flex w-full items-center gap-2 rounded-[9px] px-2 py-1.5 text-left hover:bg-muted/60', draftId === c.id && 'bg-muted')}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
              {initials(c.name, c.email ?? '')}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px]">{c.name || c.email}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{c.email}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Segmented({ value, options, onChange }: {
  value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void
}) {
  return (
    <div className="inline-flex rounded-[10px] bg-muted p-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn('rounded-[7px] px-3 py-1 text-[12px]', value === o.value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run the component test to verify it passes**

Run: `npx vitest run src/components/clients/qc-contacts-tab.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the tab into the company detail page**

In `src/components/clients/client-detail-view.tsx`:

Add the import near the other tab imports (after line 27, `import { ClientMetricsTab } ...`):

```tsx
import { QcContactsTab } from './qc-contacts-tab'
```

Add a new `TabsTrigger` immediately after the `metrics` trigger (after line 761):

```tsx
          <TabsTrigger value="contacts" className="px-4 py-1.5 text-[13px] rounded-[7px] data-[state=active]:shadow-sm">
            Contacts
          </TabsTrigger>
```

Add a new `TabsContent` immediately after the `metrics` content block closes (after line 786, before `</Tabs>`):

```tsx
        <TabsContent value="contacts" className="space-y-4 mt-4">
          <QcContactsTab companyId={client.id} companyName={client.fantasy_name || client.company} />
        </TabsContent>
```

- [ ] **Step 6: Type-check, run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all tests pass (the existing suite plus the 13 new tests from Tasks 1, 2, 4).

- [ ] **Step 7: Manual visual verification**

Start `npm run dev`, open `/clients`, click into a company, and select the **Contacts** tab. Verify:
- The tab lists existing QC-certificate recipients (people + group inboxes) for a company that has them — cross-check one against sys.wolthers.com's Contacts tab for the same company (the "QC certificates" checkbox).
- "Add" → person/group toggle, email, name, language → Save adds them; they appear in sys too (same shared row).
- Editing a field saves; "Remove from QC certificates" drops them from the list but the contact still exists in sys with the tag removed.
- Light and dark mode both render cleanly; no emojis.

- [ ] **Step 8: Commit**

```bash
git add src/components/clients/qc-contacts-tab.tsx src/components/clients/qc-contacts-tab.test.tsx src/components/clients/client-detail-view.tsx
git commit -m "feat(qc-contacts): Contacts tab on company detail page"
```

---

## Self-Review

**Spec coverage (Phase 1 scope):**
- Manage QC recipients — add/remove/edit core fields → Tasks 2 (logic), 3 (routes), 4 (UI). ✓
- Tab on `/clients/[id]` → Task 4 wire-in. ✓
- Shared upsert, set-union tag, never clobber other tags → Tasks 1–2 (`addQcCertTag`, `planQcUpsert`) with tests. ✓
- Server route + service-role (Approach A) → Task 3 admin client + auth gate. ✓
- "Remove" = untag not delete → `setQcCertTag(false)` (Task 2) + DELETE route (Task 3). ✓
- Internal `@wolthers.com` warning → Task 4 component. ✓
- 23505 friendly error → `mapContactError` (Task 2). ✓
- No migration → none in this plan. ✓
- Out of scope here (Phase 2): send-flow capture — intentionally deferred to its own plan. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command shows expected output. ✓

**Type consistency:** `QcContactRecord` (tags.ts) is the single record type used across upsert.ts and routes; `QC_CONTACT_COLUMNS` is defined once in tags.ts and imported by upsert.ts + the list route; `planQcUpsert`, `upsertQcRecipient`, `setQcCertTag`, `updateQcContactFields` names are identical in producer (Task 2) and consumers (Task 3). The component's local `QcContact` interface matches the JSON the routes return. ✓

## Phase 2 (not in this plan)

The reactive send-flow capture — stop silently dropping companies with no recipients in the batch + single composers, inline add → group/person → optional "save for the future" (reusing `upsertQcRecipient`) — is specified in `docs/superpowers/specs/2026-06-26-qc-certificate-contacts-design.md` (Section 3) and will get its own plan after Phase 1 ships, so its steps are written against the post-Phase-1 codebase.
