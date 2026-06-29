# QC Cert Contacts — Pick an Existing Contact — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a sender pick one of a company's existing contacts (instead of only free-typing an email) when adding a QC-certificate recipient — in both the send-flow capture form and the Phase-1 Contacts tab.

**Architecture:** A new read-only `GET /api/companies/[id]/contacts` returns the company's pickable contacts (excluding already-tagged and internal addresses) via a pure helper. A shared client module maps them to `SearchableSelect` options. The capture form and the Contacts tab both gain the reused `SearchableSelect` creatable combobox: picking fills/​tags an existing contact; "add new" falls back to free-typing (capture form) or the tab's rich editor. Saving/tagging always reuses the existing `POST /api/companies/[id]/qc-contacts` upsert — no new write path, no migration.

**Tech Stack:** Next.js 14 App Router, TypeScript, React client components, Supabase service-role (staff-gated), `SearchableSelect` (cmdk + Radix Popover), Vitest + @testing-library/react.

## Global Constraints

- **No emojis** in any UI/string.
- **No migration**; same shared `contacts` table.
- **Set-union tag invariant:** tagging an existing contact goes ONLY through `POST /api/companies/[id]/qc-contacts` → `upsertQcRecipient` (which uses `addQcCertTag` + blank-fill-only). Never write `routing_purposes` directly; never clobber a contact's name/nickname/other tags.
- **Persist-before-send (capture form):** when "save for future" is checked, POST first; only call `onAdd(email)` on success.
- **Staff-gated, service-role:** the new route is gated with `isStaffSampleManager` → 403 for non-staff (same as the sibling qc-contacts route). No new exposure.
- **Pool rules:** pickable = `is_active`, has email, NOT already `qc_certificates`-tagged, NOT internal `@wolthers.com`.
- **Reuse `SearchableSelect` unchanged** (`src/components/ui/searchable-select.tsx`); do not fork it.
- WAQC single repo. Tests: `npx vitest run <path>`. Types: `npx tsc --noEmit`. Files under ~2000 lines.

---

### Task 1: Pure pickable-contacts helper

**Files:**
- Create: `src/lib/qc-contacts/pickable.ts`
- Test: `src/lib/qc-contacts/pickable.test.ts`

**Interfaces:**
- Consumes: raw contact rows `{ id, name, nickname, email, is_group, is_active, routing_purposes }`.
- Produces: `PickableContact = { id: string; name: string; nickname: string | null; email: string; isGroup: boolean }` and `toPickableContacts(rows): PickableContact[]`. Consumed by Task 2 (route) and the option mapper (Task 3).

- [ ] **Step 1: Write the failing test**

Create `src/lib/qc-contacts/pickable.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toPickableContacts, type RawContactRow } from './pickable'

const row = (over: Partial<RawContactRow> = {}): RawContactRow => ({
  id: 'c1', name: 'Joost Pollmann', nickname: 'Joost', email: 'joost@ahold.nl',
  is_group: false, is_active: true, routing_purposes: ['sale_confirmation'], ...over,
})

describe('toPickableContacts', () => {
  it('maps a normal contact to camelCase shape', () => {
    expect(toPickableContacts([row()])).toEqual([
      { id: 'c1', name: 'Joost Pollmann', nickname: 'Joost', email: 'joost@ahold.nl', isGroup: false },
    ])
  })

  it('excludes contacts already tagged qc_certificates', () => {
    const tagged = row({ id: 'c2', email: 'qc@ahold.nl', routing_purposes: ['qc_certificates', 'sale_confirmation'] })
    expect(toPickableContacts([row(), tagged]).map((c) => c.id)).toEqual(['c1'])
  })

  it('excludes internal @wolthers.com addresses', () => {
    const internal = row({ id: 'c3', email: 'anderson@wolthers.com' })
    expect(toPickableContacts([row(), internal]).map((c) => c.id)).toEqual(['c1'])
  })

  it('drops rows with no email', () => {
    const noEmail = row({ id: 'c4', email: null })
    expect(toPickableContacts([row(), noEmail]).map((c) => c.id)).toEqual(['c1'])
  })

  it('drops inactive rows', () => {
    const inactive = row({ id: 'c5', email: 'old@ahold.nl', is_active: false })
    expect(toPickableContacts([row(), inactive]).map((c) => c.id)).toEqual(['c1'])
  })

  it('orders by name then email, case-insensitive', () => {
    const rows = [
      row({ id: 'b', name: 'Bravo', email: 'b@x.com' }),
      row({ id: 'a', name: 'alpha', email: 'a@x.com' }),
      row({ id: 'n', name: '', email: 'zed@x.com' }),
    ]
    expect(toPickableContacts(rows).map((c) => c.id)).toEqual(['a', 'b', 'n'])
  })

  it('null routing_purposes is treated as untagged (included)', () => {
    expect(toPickableContacts([row({ routing_purposes: null })]).map((c) => c.id)).toEqual(['c1'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/qc-contacts/pickable.test.ts`
Expected: FAIL — module `./pickable` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/lib/qc-contacts/pickable.ts`:

```ts
import { QC_CERTIFICATES_PURPOSE } from '@/lib/approval-notification/resolve-panels'
import { hasQcCertTag, isInternalEmail } from './tags'

/** A raw contact row as read from the shared `contacts` table for the pickable list. */
export interface RawContactRow {
  id: string
  name: string | null
  nickname: string | null
  email: string | null
  is_group: boolean | null
  is_active: boolean | null
  routing_purposes: string[] | null
}

/** A contact the sender can pick as a QC-cert recipient (camelCase, email guaranteed). */
export interface PickableContact {
  id: string
  name: string
  nickname: string | null
  email: string
  isGroup: boolean
}

/**
 * Filter + map a company's contacts to the pickable pool: active, has an email,
 * NOT already tagged qc_certificates (those are already recipients), and NOT an
 * internal @wolthers.com address (house CC, never a TO recipient). Ordered by
 * name then email, case-insensitive. Pure — no DB.
 */
export function toPickableContacts(rows: RawContactRow[]): PickableContact[] {
  const out: PickableContact[] = []
  for (const r of rows) {
    if (r.is_active === false) continue
    const email = (r.email ?? '').trim()
    if (!email) continue
    if (isInternalEmail(email)) continue
    if (hasQcCertTag(r.routing_purposes)) continue
    out.push({
      id: r.id,
      name: (r.name ?? '').trim(),
      nickname: r.nickname,
      email,
      isGroup: !!r.is_group,
    })
  }
  out.sort((a, b) => {
    const byName = a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    return byName !== 0 ? byName : a.email.toLowerCase().localeCompare(b.email.toLowerCase())
  })
  return out
}

// Re-export so route/UI import the constant from one place if needed.
export { QC_CERTIFICATES_PURPOSE }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/qc-contacts/pickable.test.ts`
Expected: PASS (7 cases).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/qc-contacts/pickable.ts src/lib/qc-contacts/pickable.test.ts
git commit -m "feat(qc-contacts): pure pickable-contacts filter/map helper"
```

---

### Task 2: Pickable-contacts list endpoint

**Files:**
- Create: `src/app/api/companies/[id]/contacts/route.ts`

**Interfaces:**
- Consumes: `toPickableContacts` (Task 1); `isStaffSampleManager` from `@/lib/auth/sample-access`.
- Produces: `GET /api/companies/[id]/contacts` → `{ contacts: PickableContact[] }` (401 unauthenticated, 403 non-staff, 500 on db error). Consumed by Task 3 (client fetch).

This route is thin I/O over the Task-1 helper (the testable logic lives there); the codebase tests the lib, not the route (mirrors the sibling qc-contacts route). Verification is tsc + a manual shape read.

- [ ] **Step 1: Implement the route**

Create `src/app/api/companies/[id]/contacts/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import { toPickableContacts, type RawContactRow } from '@/lib/qc-contacts/pickable'

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
  if (!(await isStaffSampleManager(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await adminClient()
    .from('contacts')
    .select('id, name, nickname, email, is_group, is_active, routing_purposes')
    .eq('company_id', id)
    .eq('is_active', true)
    .not('email', 'is', null)
  if (error) {
    console.error('company contacts GET error:', error)
    return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 })
  }
  return NextResponse.json({ contacts: toPickableContacts((data ?? []) as RawContactRow[]) })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add 'src/app/api/companies/[id]/contacts/route.ts'
git commit -m "feat(qc-contacts): staff-gated GET company pickable-contacts endpoint"
```

---

### Task 3: Shared client fetch + option mapper

**Files:**
- Create: `src/lib/qc-contacts/use-pickable-contacts.ts`
- Test: `src/lib/qc-contacts/use-pickable-contacts.test.ts`

**Interfaces:**
- Consumes: `PickableContact` (Task 1); `SearchableSelectOption` from `@/components/ui/searchable-select`; the `GET /api/companies/[id]/contacts` endpoint (Task 2).
- Produces:
  - pure `toContactOptions(contacts): { options: SearchableSelectOption[]; byId: Record<string, PickableContact> }` — `value = id`, `label = name ? "{name} — {email}" : email`, `keywords = [email, nickname].filter(Boolean)`.
  - hook `usePickableContacts(companyId: string | null): { options, byId, loading, error }`.
  Consumed by Tasks 5 (capture form) and 6 (tab).

- [ ] **Step 1: Write the failing test (pure mapper only)**

Create `src/lib/qc-contacts/use-pickable-contacts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toContactOptions } from './use-pickable-contacts'
import type { PickableContact } from './pickable'

const c = (over: Partial<PickableContact> = {}): PickableContact => ({
  id: 'c1', name: 'Joost Pollmann', nickname: 'Joost', email: 'joost@ahold.nl', isGroup: false, ...over,
})

describe('toContactOptions', () => {
  it('maps id→value and "name — email"→label with email+nickname keywords', () => {
    const { options } = toContactOptions([c()])
    expect(options).toEqual([
      { value: 'c1', label: 'Joost Pollmann — joost@ahold.nl', keywords: ['joost@ahold.nl', 'Joost'] },
    ])
  })

  it('uses the bare email as the label when there is no name', () => {
    const { options } = toContactOptions([c({ id: 'g1', name: '', nickname: null, email: 'qc@ahold.nl', isGroup: true })])
    expect(options[0]).toEqual({ value: 'g1', label: 'qc@ahold.nl', keywords: ['qc@ahold.nl'] })
  })

  it('byId recovers the full contact for a picked value', () => {
    const { byId } = toContactOptions([c()])
    expect(byId['c1'].email).toBe('joost@ahold.nl')
    expect(byId['c1'].nickname).toBe('Joost')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/qc-contacts/use-pickable-contacts.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the module**

Create `src/lib/qc-contacts/use-pickable-contacts.ts`:

```ts
'use client'

import { useEffect, useState } from 'react'
import type { SearchableSelectOption } from '@/components/ui/searchable-select'
import type { PickableContact } from './pickable'

/** Pure: map pickable contacts to combobox options + an id→contact lookup. */
export function toContactOptions(contacts: PickableContact[]): {
  options: SearchableSelectOption[]
  byId: Record<string, PickableContact>
} {
  const options: SearchableSelectOption[] = []
  const byId: Record<string, PickableContact> = {}
  for (const c of contacts) {
    const label = c.name ? `${c.name} — ${c.email}` : c.email
    const keywords = [c.email, c.nickname].filter((k): k is string => !!k && !!k.trim())
    options.push({ value: c.id, label, keywords })
    byId[c.id] = c
  }
  return { options, byId }
}

/**
 * Fetch a company's pickable QC-cert contacts and expose them as combobox options.
 * Degrades gracefully: on error, options is empty (the free-type/create path still
 * works) and `error` is set for an optional inline note. No fetch when companyId is null.
 */
export function usePickableContacts(companyId: string | null): {
  options: SearchableSelectOption[]
  byId: Record<string, PickableContact>
  loading: boolean
  error: string | null
} {
  const [contacts, setContacts] = useState<PickableContact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!companyId) {
      setContacts([])
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/companies/${companyId}/contacts`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Failed to load contacts')
        return (await r.json()) as { contacts: PickableContact[] }
      })
      .then((data) => { if (!cancelled) setContacts(data.contacts ?? []) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load contacts') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [companyId])

  const { options, byId } = toContactOptions(contacts)
  return { options, byId, loading, error }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/qc-contacts/use-pickable-contacts.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/qc-contacts/use-pickable-contacts.ts src/lib/qc-contacts/use-pickable-contacts.test.ts
git commit -m "feat(qc-contacts): shared pickable-contacts hook + option mapper"
```

---

### Task 4: jsdom interaction polyfills for combobox tests

**Files:**
- Modify: `vitest.setup.ts`

**Interfaces:**
- Produces: jsdom stubs (`hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`/`scrollIntoView`/`ResizeObserver`) so Radix Popover + cmdk open and items are selectable under `fireEvent`. Consumed by Tasks 5 and 6 (combobox tests).

This is enabling infrastructure — Radix Popover/cmdk call these DOM APIs that jsdom does not implement; without them, opening the `SearchableSelect` popover in a test throws. Verification is that the full existing suite still passes (the stubs are additive no-ops).

- [ ] **Step 1: Add the polyfills**

Replace the contents of `vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'

// jsdom lacks the pointer-capture / layout APIs that Radix Popover + cmdk call
// when opening. Stub them so combobox (SearchableSelect) interactions work under test.
if (typeof window !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {}
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {}
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
  if (!('ResizeObserver' in window)) {
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
}
```

- [ ] **Step 2: Run the full suite to verify nothing regressed**

Run: `npx vitest run`
Expected: PASS — same count as before plus none broken (the stubs are no-ops for existing tests).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add vitest.setup.ts
git commit -m "test: jsdom pointer/resize polyfills for combobox interaction tests"
```

---

### Task 5: Capture form — pick existing or add new

**Files:**
- Modify: `src/components/samples/approval/recipient-capture.tsx`
- Modify: `src/components/samples/approval/recipient-capture.test.tsx`

**Interfaces:**
- Consumes: `usePickableContacts` (Task 3); `SearchableSelect` (`@/components/ui/searchable-select`).
- Produces: the same `RecipientCaptureForm` props/contract (`{ companyId, companyName, onAdd }`; `onAdd(email)` once on success; persist-before-send preserved); internally a pick path (combobox) and a new path (free-type incl. nickname). No prop changes — Tasks 3's batch/single composers keep working unchanged.

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `src/components/samples/approval/recipient-capture.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { usePickableContacts } from '@/lib/qc-contacts/use-pickable-contacts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Props {
  /** Company the recipient belongs to; null disables pick + "save for future" (ephemeral free-type only). */
  companyId: string | null
  companyName: string
  /** Called once with the email after a successful add (post-persist when saving). */
  onAdd: (email: string) => void
}

/**
 * Inline capture for a missing QC-certificate recipient, shared by the single and
 * batch send composers. When the company is known, the sender can PICK an existing
 * contact (combobox) or add a NEW one (free-type: group/person, name, nickname).
 * "Save as a QC-cert recipient" persists via the Phase 1 upsert BEFORE the email is
 * accepted, so a failed save surfaces first; unchecked is ephemeral (this send only).
 */
export function RecipientCaptureForm({ companyId, companyName, onAdd }: Props) {
  const { options, byId, error: loadError } = usePickableContacts(companyId)
  // No company → no pool to pick from; go straight to free-type.
  const [mode, setMode] = useState<'pick' | 'new'>(companyId ? 'pick' : 'new')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [isGroup, setIsGroup] = useState(false)
  const [picked, setPicked] = useState<string>('') // contact id, '' when none
  const [saveForFuture, setSaveForFuture] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setEmail(''); setName(''); setNickname(''); setIsGroup(false); setPicked('')
    setSaveForFuture(false); setError(null); setMode(companyId ? 'pick' : 'new')
  }

  const onPick = (id: string) => {
    setPicked(id)
    const c = id ? byId[id] : undefined
    if (c) { setEmail(c.email); setName(c.name); setNickname(c.nickname ?? ''); setIsGroup(c.isGroup) }
    else { setEmail('') }
    setError(null)
  }

  const goNew = () => {
    setMode('new'); setPicked(''); setEmail(''); setName(''); setNickname(''); setIsGroup(false); setError(null)
  }
  const goPick = () => {
    setMode('pick'); setEmail(''); setName(''); setNickname(''); setIsGroup(false); setError(null)
  }

  const add = async () => {
    const value = email.trim()
    if (!EMAIL_RE.test(value)) {
      setError('Choose a contact or enter a valid email address.')
      return
    }
    setError(null)
    if (saveForFuture && companyId) {
      setBusy(true)
      try {
        const res = await fetch(`/api/companies/${companyId}/qc-contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: value,
            name: isGroup ? null : name.trim() || null,
            nickname: isGroup ? null : nickname.trim() || null,
            isGroup,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setError(data?.error || 'Failed to save recipient.'); return }
      } catch {
        setError('Failed to save recipient.'); return
      } finally {
        setBusy(false)
      }
    }
    onAdd(value)
    reset()
  }

  return (
    <div className="rounded-[12px] border border-amber-400/50 bg-amber-50/50 p-3 dark:border-amber-400/30 dark:bg-amber-400/5">
      <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
        No QC-certificate recipient for {companyName}. Pick an existing contact or add a new one to send.
      </p>

      {mode === 'pick' && companyId ? (
        <div className="mb-2 space-y-2">
          <SearchableSelect
            options={options}
            value={picked}
            onValueChange={onPick}
            substringMatch
            allowCreate
            onCreateNew={goNew}
            createLabel="+ Add new email"
            placeholder="Choose an existing contact…"
            searchPlaceholder="Search contacts…"
            emptyMessage="No matching contacts."
          />
          {loadError && (
            <p className="text-xs opacity-60">Couldn&apos;t load existing contacts — add a new email instead.</p>
          )}
          <button type="button" onClick={goNew} className="text-xs text-[#556b2f] underline">
            Add a new email instead
          </button>
        </div>
      ) : (
        <>
          <div className="mb-2 inline-flex rounded-[10px] bg-black/5 p-1 dark:bg-white/10">
            <button
              type="button"
              onClick={() => setIsGroup(false)}
              className={`rounded-[7px] px-3 py-1 text-xs ${!isGroup ? 'bg-white font-medium shadow-sm dark:bg-[#2A2A2A]' : 'opacity-60'}`}
            >
              Person
            </button>
            <button
              type="button"
              onClick={() => setIsGroup(true)}
              className={`rounded-[7px] px-3 py-1 text-xs ${isGroup ? 'bg-white font-medium shadow-sm dark:bg-[#2A2A2A]' : 'opacity-60'}`}
            >
              Group inbox
            </button>
          </div>

          <input
            className="mb-2 w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-white/15"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          />

          {!isGroup && (
            <>
              <input
                className="mb-2 w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-white/15"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (optional, for the greeting)"
              />
              <input
                className="mb-2 w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-white/15"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Nickname (optional, preferred greeting)"
              />
            </>
          )}

          {companyId && (
            <button type="button" onClick={goPick} className="mb-2 block text-xs text-[#556b2f] underline">
              Pick an existing contact instead
            </button>
          )}
        </>
      )}

      {companyId && (
        <label className="mb-2 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={saveForFuture} onChange={(e) => setSaveForFuture(e.target.checked)} />
          Also save as a QC-certificate recipient for {companyName}.
        </label>
      )}

      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      <button
        type="button"
        onClick={add}
        disabled={busy}
        className="rounded-lg bg-[#556b2f] px-3 py-1.5 text-xs text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Add recipient'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Update the existing tests + add pick/new coverage**

Replace the entire contents of `src/components/samples/approval/recipient-capture.test.tsx`. The existing free-type assertions are preserved but now reach the inputs via the "Add a new email instead" button; a new test exercises the pick path through the combobox (enabled by Task 4's polyfills). The fetch mock must answer BOTH the pickable-contacts GET and the qc-contacts POST.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RecipientCaptureForm } from './recipient-capture'

const CONTACTS = [
  { id: 'c1', name: 'Joost Pollmann', nickname: 'Joost', email: 'joost@ahold.nl', isGroup: false },
]

function stubFetch(postImpl?: (body: any) => { ok: boolean; json: any }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.endsWith('/contacts') && (!init || init.method === undefined || init.method === 'GET')) {
      return { ok: true, json: async () => ({ contacts: CONTACTS }) } as Response
    }
    if (u.endsWith('/qc-contacts') && init?.method === 'POST') {
      const body = JSON.parse((init.body as string) || '{}')
      const r = postImpl ? postImpl(body) : { ok: true, json: { contact: { id: 'c9' } } }
      return { ok: r.ok, json: async () => r.json } as Response
    }
    return { ok: false, json: async () => ({ error: 'unexpected' }) } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => vi.restoreAllMocks())

describe('RecipientCaptureForm — free-type (new) path', () => {
  it('ephemeral add: no POST when save-for-future is unchecked', async () => {
    const fetchMock = stubFetch()
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /add a new email instead/i }))
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'one@ahold.nl' } })
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('one@ahold.nl'))
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/qc-contacts') && (c[1] as any)?.method === 'POST')).toBe(false)
  })

  it('persist: POSTs email + nickname then adds when save-for-future is checked', async () => {
    const fetchMock = stubFetch()
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /add a new email instead/i }))
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'two@ahold.nl' } })
    fireEvent.change(screen.getByPlaceholderText(/nickname/i), { target: { value: 'Twoey' } })
    fireEvent.click(screen.getByLabelText(/save as a QC-certificate recipient/i))
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('two@ahold.nl'))
    const post = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/qc-contacts') && (c[1] as any)?.method === 'POST')!
    expect(JSON.parse((post[1] as RequestInit).body as string)).toMatchObject({ email: 'two@ahold.nl', nickname: 'Twoey', isGroup: false })
  })

  it('does NOT add when the save POST fails', async () => {
    stubFetch(() => ({ ok: false, json: { error: 'That email already exists for this company.' } }))
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /add a new email instead/i }))
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'dupe@ahold.nl' } })
    fireEvent.click(screen.getByLabelText(/save as a QC-certificate recipient/i))
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument())
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('rejects an invalid email without calling onAdd', () => {
    stubFetch()
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /add a new email instead/i }))
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    expect(screen.getByText(/valid email/i)).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('no company → free-type directly, no save checkbox', () => {
    stubFetch()
    render(<RecipientCaptureForm companyId={null} companyName="Unknown" onAdd={() => {}} />)
    expect(screen.getByPlaceholderText('name@company.com')).toBeInTheDocument()
    expect(screen.queryByLabelText(/save as a QC-certificate recipient/i)).toBeNull()
  })
})

describe('RecipientCaptureForm — pick existing path', () => {
  it('picking a contact then saving POSTs that contact email + nickname', async () => {
    const fetchMock = stubFetch()
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    // Open the combobox and pick the loaded contact.
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('combobox'))
    await waitFor(() => expect(screen.getByText(/Joost Pollmann — joost@ahold\.nl/)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Joost Pollmann — joost@ahold\.nl/))
    fireEvent.click(screen.getByLabelText(/save as a QC-certificate recipient/i))
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('joost@ahold.nl'))
    const post = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/qc-contacts') && (c[1] as any)?.method === 'POST')!
    expect(JSON.parse((post[1] as RequestInit).body as string)).toMatchObject({ email: 'joost@ahold.nl', nickname: 'Joost', isGroup: false })
  })
})
```

- [ ] **Step 3: Run the test to verify it fails, then passes after Step 1**

Run: `npx vitest run src/components/samples/approval/recipient-capture.test.tsx`
Expected after the component rewrite: PASS (6 tests). If the pick test cannot drive the cmdk popover even with Task 4's polyfills, report BLOCKED with the error — do not delete the assertion; the controller will decide whether to assert the pick path via the pure mapper instead.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/samples/approval/recipient-capture.tsx src/components/samples/approval/recipient-capture.test.tsx
git commit -m "feat(qc-contacts): capture form can pick an existing contact (+ nickname)"
```

---

### Task 6: Contacts tab — pick existing or add new

**Files:**
- Modify: `src/components/clients/qc-contacts-tab.tsx`
- Modify: `src/components/clients/qc-contacts-tab.test.tsx`

**Interfaces:**
- Consumes: `usePickableContacts` (Task 3); `SearchableSelect`.
- Produces: the tab's "Add" flow opens the combobox: picking POSTs that contact's email to `qc-contacts` (tags) then reloads; "+ Add new contact" opens the existing Draft editor prefilled with the typed email. Existing edit/remove flows unchanged.

- [ ] **Step 1: Add an add-mode that shows the combobox before the editor**

In `src/components/clients/qc-contacts-tab.tsx`, add imports near the top (after the existing imports):

```tsx
import { SearchableSelect } from '@/components/ui/searchable-select'
import { usePickableContacts } from '@/lib/qc-contacts/use-pickable-contacts'
```

Add state + the pick handler inside `QcContactsTab`, next to the existing `useState` hooks:

```tsx
  const [adding, setAdding] = useState(false) // showing the pick combobox
  const { options: pickOptions, byId: pickById } = usePickableContacts(companyId)

  const startPick = () => { setError(null); setDraft(null); setAdding(true) }

  const pickExisting = async (id: string) => {
    const c = id ? pickById[id] : undefined
    if (!c) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/companies/${companyId}/qc-contacts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: c.email, name: c.name || null, nickname: c.nickname, isGroup: c.isGroup }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to add contact')
      setAdding(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add contact')
    } finally {
      setSaving(false)
    }
  }

  const addNew = () => { setAdding(false); startAdd() }
```

Change the existing header "Add" button to open the picker instead of the editor — replace the `onClick={startAdd}` on the header Add button with `onClick={startPick}`:

```tsx
          <Button variant="outline" size="sm" onClick={startPick} className="h-7 gap-1 rounded-[8px] text-[12px]">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
```

In the right pane, render the picker when `adding` (before the `!draft` empty-state branch). Replace the right-pane opening:

```tsx
      {/* Right pane */}
      <div className="rounded-[14px] border border-border/60 p-4">
        {adding ? (
          <div className="max-w-xl space-y-3">
            <div className="text-[14px] font-semibold">Add a QC-certificate recipient</div>
            <p className="text-[12px] text-muted-foreground">
              Pick someone already on file for {companyName}, or add a brand-new contact.
            </p>
            <SearchableSelect
              options={pickOptions}
              value=""
              onValueChange={pickExisting}
              substringMatch
              allowCreate
              onCreateNew={addNew}
              createLabel="+ Add new contact"
              placeholder="Choose an existing contact…"
              searchPlaceholder="Search contacts…"
              emptyMessage="No other contacts on file."
            />
            {error && (
              <div className="flex items-center gap-1.5 text-[12px] text-red-600 dark:text-red-400">
                <AlertCircle className="h-3.5 w-3.5" /> {error}
              </div>
            )}
            <div>
              <button type="button" onClick={() => setAdding(false)} className="text-[13px] text-muted-foreground hover:underline">
                Cancel
              </button>
            </div>
          </div>
        ) : !draft ? (
```

(The rest of the right pane — the `!draft` empty state, and the `draft` editor — is unchanged. This adds `adding ?` as a new first branch of the same ternary; keep the existing `: !draft ? (...) : (...)` intact after it.)

- [ ] **Step 2: Update the tab tests + add a pick test**

In `src/components/clients/qc-contacts-tab.test.tsx`: the existing "adds a recipient via POST" test currently clicks Add → fills `name@company.com` → Save. Now Add opens the picker, so it must click "+ Add new contact" first to reach the editor. Add a pick test. Extend the `beforeEach` fetch mock to also answer the `/contacts` GET.

Update the mock's `beforeEach` to add a `/contacts` branch (before the existing `/qc-contacts` GET branch):

```tsx
    if (u.endsWith('/contacts') && (!init || !init.method || init.method === 'GET')) {
      return { ok: true, json: async () => ({ contacts: [
        { id: 'p1', name: 'Pim de Vries', nickname: null, email: 'pim@ahold.nl', isGroup: false },
      ] }) } as Response
    }
```

Update the existing add test to route through the create affordance — change the body so it clicks Add, then "+ Add new contact", then fills and saves:

```tsx
  it('adds a NEW recipient via POST (through the picker create path)', async () => {
    render(<QcContactsTab companyId="co1" companyName="Ahold" />)
    await waitFor(() => expect(screen.getByText('Joost Pollmann')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    fireEvent.click(screen.getByRole('button', { name: /add new contact/i }))
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'new@ahold.nl' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect((fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith('/qc-contacts') && c[1]?.method === 'POST')).toBe(true),
    )
  })

  it('tags an existing contact picked from the combobox', async () => {
    render(<QcContactsTab companyId="co1" companyName="Ahold" />)
    await waitFor(() => expect(screen.getByText('Joost Pollmann')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    fireEvent.click(screen.getByRole('combobox'))
    await waitFor(() => expect(screen.getByText(/Pim de Vries — pim@ahold\.nl/)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Pim de Vries — pim@ahold\.nl/))
    await waitFor(() => {
      const post = (fetch as any).mock.calls.find((c: any[]) => String(c[0]).endsWith('/qc-contacts') && c[1]?.method === 'POST')
      expect(post).toBeTruthy()
      expect(JSON.parse(post[1].body)).toMatchObject({ email: 'pim@ahold.nl' })
    })
  })
```

(Keep the existing "lists the company QC-certificate recipients" test unchanged. If the combobox-driven pick test cannot drive cmdk even with Task 4's polyfills, report BLOCKED — do not delete it.)

- [ ] **Step 3: Run the tab tests**

Run: `npx vitest run src/components/clients/qc-contacts-tab.test.tsx`
Expected: PASS (list test + updated add test + new pick test).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/clients/qc-contacts-tab.tsx src/components/clients/qc-contacts-tab.test.tsx
git commit -m "feat(qc-contacts): Contacts tab can pick an existing contact to tag"
```

---

### Task 7: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: PASS — all prior tests plus the new `pickable`, `use-pickable-contacts`, the rewritten capture-form tests, and the tab tests.

- [ ] **Step 2: Final typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Hand back for visual QA**

Report tests + tsc green. Ask Daniel to QA both surfaces (light/dark): the capture form (pick a known contact, "+ add new email" with a nickname, save-for-future persists to the Contacts tab, ephemeral does not), and the Contacts tab Add flow (pick tags + appears in the list; "+ add new contact" opens the editor prefilled).

---

## Self-Review

**Spec coverage:**
- List endpoint excluding tagged + internal + no-email → Task 1 (pure filter) + Task 2 (route).
- Reuse the existing upsert write path → Tasks 5 + 6 POST to `qc-contacts` (no new write route).
- Creatable combobox (`SearchableSelect`, `substringMatch`, `allowCreate`) in both surfaces → Tasks 5 + 6.
- Pick respects save-for-future in capture form; tab pick always tags → Task 5 (checkbox gates POST) + Task 6 (pick POSTs immediately).
- Nickname carried through: endpoint returns it (Task 1/2), capture form add-new has a nickname field and POSTs it (Task 5), picked contact's nickname flows to the POST (Tasks 5 + 6). ✓
- Staff-gated, no migration → Task 2 gate; no schema task. ✓
- Graceful degrade on list-fetch failure → Task 3 hook + Task 5 inline note. ✓

**Placeholder scan:** No TBD/"handle errors"/"similar to". Every code step is complete.

**Type consistency:** `PickableContact { id, name, nickname, email, isGroup }` defined in Task 1, consumed by Tasks 2/3/5/6 identically. `toContactOptions` returns `{ options, byId }` (Task 3), destructured the same way in Tasks 5/6. `usePickableContacts` returns `{ options, byId, loading, error }`; Task 5 uses `options/byId/error`, Task 6 uses `options/byId` (renamed `pickOptions/pickById`). `SearchableSelect` props (`options/value/onValueChange/substringMatch/allowCreate/onCreateNew/createLabel/placeholder/searchPlaceholder/emptyMessage`) all exist on the real component.

**Test-fragility note (called out, not hidden):** the pick-path tests (Tasks 5/6) drive the cmdk/Radix popover, enabled by Task 4's jsdom polyfills. Each such test instructs the implementer to report BLOCKED rather than delete the assertion if the popover proves undrivable — the controller then decides whether to cover the pick path via the pure `toContactOptions`/`byId` seam instead (the branching that matters — what gets POSTed — is already fully covered by the free-type tests and the pure helper tests).
