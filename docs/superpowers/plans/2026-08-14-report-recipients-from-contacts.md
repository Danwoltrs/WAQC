# Report Recipients From Contacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-fill the report send dialog's recipients from the client company's saved QC contacts, let the sender save unknown addresses as a person or group inbox without leaving the dialog, and pin the client picker to the top of the reports page.

**Architecture:** No new API routes and no migration — every endpoint and column this needs already exists, built for certificate sends. A new pure module merges two existing GET responses into one ordered recipient list. The shared chip component gains three optional props so it can show which addresses are saved contacts, leaving its existing approval-flow call site byte-identical in behaviour. A new inline panel POSTs to the existing contact upsert route.

**Tech Stack:** Next.js 14 App Router, TypeScript, React 18, Tailwind, shadcn/ui, Supabase, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-14-report-recipients-from-contacts-design.md`

## Global Constraints

- **Reports reuse the `qc_certificates` routing purpose.** Do not invent a `qc_reports` tag. Saving a report recipient also subscribes them to certificate emails; this is intended and must be stated in the UI copy.
- **No database migration.** `contacts.is_group`, `contacts.name`, `contacts.nickname`, `contacts.routing_purposes` all exist.
- **No new API routes.** Use `GET/POST /api/companies/[id]/qc-contacts`, `DELETE /api/companies/[id]/qc-contacts/[contactId]`, and `GET /api/reports/recipients`.
- **Email matching is case-insensitive everywhere**, keyed on the lower-cased full address. First occurrence's original casing is what gets sent.
- **`@wolthers.com` addresses are dropped from the contact-derived side only.** They are house CC, added server-side. Addresses coming from the last-send list are kept verbatim, internal or not.
- **Colours:** olive `#556b2f` for primary actions, red `#ef4444` for invalid. No emojis in UI (project rule).
- **Test commands:** `npm run test:run -- <path>` for a single file, `npm run test:run` for the suite.
- **Files stay under ~2000 lines.**
- **Commit directly to `main`** — this repo is trunk-based, Vercel auto-deploys `main` to production.

---

### Task 1: `buildToList` — merge contacts with the last-send list

**Files:**
- Create: `src/lib/reports/recipient-prefill.ts`
- Test: `src/lib/reports/recipient-prefill.test.ts`

**Interfaces:**
- Consumes: `QcContactRecord` and `isInternalEmail` from `@/lib/qc-contacts/tags` (both already exist).
- Produces: `PrefilledRecipient` interface and `buildToList(contacts: QcContactRecord[], lastSendTo: string[]): PrefilledRecipient[]`. Task 4 consumes both.

Contacts arrive already ordered by the API route (`splitQcContacts` sorts primary-first then name; the caller concatenates people then groups). `buildToList` **preserves the incoming order** and never re-sorts.

- [ ] **Step 1: Write the failing test**

Create `src/lib/reports/recipient-prefill.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildToList } from './recipient-prefill'
import type { QcContactRecord } from '@/lib/qc-contacts/tags'

function contact(over: Partial<QcContactRecord> & { id: string }): QcContactRecord {
  return {
    id: over.id,
    company_id: 'co1',
    email: over.email ?? `${over.id}@ahold.nl`,
    name: over.name ?? '',
    nickname: over.nickname ?? null,
    phone: null,
    whatsapp: null,
    preferred_language: 'en',
    is_group: over.is_group ?? false,
    is_primary: over.is_primary ?? null,
    is_active: true,
    routing_purposes: ['qc_certificates'],
  }
}

describe('buildToList', () => {
  it('maps contacts to recipients, preserving the given order', () => {
    const out = buildToList(
      [
        contact({ id: 'c1', email: 'marieke@ahold.nl', name: 'Marieke de Vries' }),
        contact({ id: 'c2', email: 'qc@ahold.nl', name: 'QC Team', is_group: true }),
      ],
      [],
    )
    expect(out).toEqual([
      { email: 'marieke@ahold.nl', name: 'Marieke de Vries', isGroup: false, contactId: 'c1', source: 'contact' },
      { email: 'qc@ahold.nl', name: 'QC Team', isGroup: true, contactId: 'c2', source: 'contact' },
    ])
  })

  it('appends last-send addresses after the contacts', () => {
    const out = buildToList([contact({ id: 'c1', email: 'marieke@ahold.nl', name: 'Marieke' })], [
      'jan.bakker@ahold.nl',
    ])
    expect(out.map((r) => r.email)).toEqual(['marieke@ahold.nl', 'jan.bakker@ahold.nl'])
    expect(out[1]).toEqual({
      email: 'jan.bakker@ahold.nl',
      name: null,
      isGroup: false,
      contactId: null,
      source: 'last_send',
    })
  })

  it('de-duplicates case-insensitively, first casing wins', () => {
    const out = buildToList([contact({ id: 'c1', email: 'Marieke@Ahold.nl', name: 'Marieke' })], [
      'marieke@ahold.nl',
    ])
    expect(out).toHaveLength(1)
    expect(out[0].email).toBe('Marieke@Ahold.nl')
    expect(out[0].source).toBe('contact')
  })

  it('de-duplicates repeats within the last-send list too', () => {
    const out = buildToList([], ['a@x.com', 'A@X.com'])
    expect(out.map((r) => r.email)).toEqual(['a@x.com'])
  })

  it('drops internal contacts but keeps internal last-send addresses', () => {
    const out = buildToList(
      [
        contact({ id: 'c1', email: 'daniel@wolthers.com', name: 'Daniel' }),
        contact({ id: 'c2', email: 'marieke@ahold.nl', name: 'Marieke' }),
      ],
      ['qualitycontrol@wolthers.com'],
    )
    expect(out.map((r) => r.email)).toEqual(['marieke@ahold.nl', 'qualitycontrol@wolthers.com'])
  })

  it('drops contacts with a blank or missing email', () => {
    const out = buildToList(
      [contact({ id: 'c1', email: '   ', name: 'Blank' }), contact({ id: 'c2', email: 'ok@ahold.nl', name: 'Ok' })],
      [],
    )
    expect(out.map((r) => r.email)).toEqual(['ok@ahold.nl'])
  })

  it('trims whitespace and skips blank last-send entries', () => {
    const out = buildToList([], ['  spaced@ahold.nl  ', '', '   '])
    expect(out.map((r) => r.email)).toEqual(['spaced@ahold.nl'])
  })

  it('normalises a blank contact name to null', () => {
    const out = buildToList([contact({ id: 'c1', email: 'x@ahold.nl', name: '   ' })], [])
    expect(out[0].name).toBeNull()
  })

  it('returns an empty list when both sources are empty', () => {
    expect(buildToList([], [])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/lib/reports/recipient-prefill.test.ts`
Expected: FAIL — cannot resolve `./recipient-prefill`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/reports/recipient-prefill.ts`:

```ts
/**
 * Merge a client company's saved QC contacts with the addresses used on the
 * last send into the single ordered list that pre-fills the report To field.
 *
 * Contacts are the durable list; `report_recipients` remembers one-off
 * additions. Contacts therefore come first and win on a collision, carrying
 * the name and contact id the chips need to show provenance.
 */

import { isInternalEmail, type QcContactRecord } from '@/lib/qc-contacts/tags'

export interface PrefilledRecipient {
  email: string
  name: string | null
  isGroup: boolean
  /** null means this address is not a saved contact. */
  contactId: string | null
  source: 'contact' | 'last_send'
}

/**
 * `contacts` must arrive in display order (the API route sorts primary-first
 * then name; the caller concatenates people then groups). Order is preserved.
 *
 * Internal @wolthers.com CONTACTS are dropped — they are house CC, added
 * server-side, never a TO recipient. Internal addresses in `lastSendTo` are
 * kept: a deliberate manual addition is not second-guessed.
 */
export function buildToList(
  contacts: QcContactRecord[],
  lastSendTo: string[],
): PrefilledRecipient[] {
  const out: PrefilledRecipient[] = []
  const seen = new Set<string>()

  for (const c of contacts) {
    const email = (c.email ?? '').trim()
    if (!email) continue
    if (isInternalEmail(email)) continue
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      email,
      name: (c.name ?? '').trim() || null,
      isGroup: !!c.is_group,
      contactId: c.id,
      source: 'contact',
    })
  }

  for (const raw of lastSendTo) {
    const email = (raw ?? '').trim()
    if (!email) continue
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ email, name: null, isGroup: false, contactId: null, source: 'last_send' })
  }

  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/lib/reports/recipient-prefill.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/recipient-prefill.ts src/lib/reports/recipient-prefill.test.ts
git commit -m "feat(reports): merge company QC contacts with last-send recipients"
```

---

### Task 2: Chip provenance on the shared `RecipientChips`

**Files:**
- Modify: `src/components/samples/approval/recipient-chips.tsx`
- Test: `src/components/samples/approval/recipient-chips.test.tsx:1-27` (append new cases; **do not edit the three existing tests**)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: exported `RecipientMeta { name: string | null; isGroup: boolean; contactId: string | null }` and three new optional props on `RecipientChips` — `meta?: Record<string, RecipientMeta>` (keyed by **lower-cased** email), `onSaveRequest?: (email: string) => void`, `onUntag?: (contactId: string, email: string) => void`. Task 4 consumes all of these.

The three existing tests passing **unmodified** is the backward-compatibility proof: with `meta` undefined the component must render exactly as it does today. This component is live in the certificate approval flow.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/samples/approval/recipient-chips.test.tsx` (keep the existing imports and the three existing tests untouched):

```tsx
describe('RecipientChips — provenance mode', () => {
  const META = {
    'marieke@ahold.nl': { name: 'Marieke de Vries', isGroup: false, contactId: 'c1' },
    'jan@ahold.nl': { name: null, isGroup: false, contactId: null },
  }

  it('shows the contact name for a saved contact, with the email as its title', () => {
    render(
      <RecipientChips label="TO" emails={['marieke@ahold.nl']} onChange={() => {}} meta={META} />,
    )
    const chip = screen.getByTitle('marieke@ahold.nl')
    expect(chip).toHaveTextContent('Marieke de Vries')
  })

  it('matches meta case-insensitively', () => {
    render(
      <RecipientChips label="TO" emails={['Marieke@Ahold.nl']} onChange={() => {}} meta={META} />,
    )
    expect(screen.getByTitle('Marieke@Ahold.nl')).toHaveTextContent('Marieke de Vries')
  })

  it('falls back to the email when a saved contact has no name', () => {
    const meta = { 'qc@ahold.nl': { name: null, isGroup: true, contactId: 'c2' } }
    render(<RecipientChips label="TO" emails={['qc@ahold.nl']} onChange={() => {}} meta={meta} />)
    expect(screen.getByTitle('qc@ahold.nl')).toHaveTextContent('qc@ahold.nl')
  })

  it('offers a save action on an address that is not a saved contact', async () => {
    const onSaveRequest = vi.fn()
    render(
      <RecipientChips
        label="TO"
        emails={['jan@ahold.nl']}
        onChange={() => {}}
        meta={META}
        onSaveRequest={onSaveRequest}
      />,
    )
    await userEvent.click(screen.getByLabelText('Save jan@ahold.nl'))
    expect(onSaveRequest).toHaveBeenCalledWith('jan@ahold.nl')
  })

  it('offers a save action on an address absent from meta entirely', async () => {
    const onSaveRequest = vi.fn()
    render(
      <RecipientChips
        label="TO"
        emails={['brand.new@ahold.nl']}
        onChange={() => {}}
        meta={META}
        onSaveRequest={onSaveRequest}
      />,
    )
    await userEvent.click(screen.getByLabelText('Save brand.new@ahold.nl'))
    expect(onSaveRequest).toHaveBeenCalledWith('brand.new@ahold.nl')
  })

  it('does not offer a save action on a saved contact', () => {
    render(
      <RecipientChips
        label="TO"
        emails={['marieke@ahold.nl']}
        onChange={() => {}}
        meta={META}
        onSaveRequest={() => {}}
      />,
    )
    expect(screen.queryByLabelText('Save marieke@ahold.nl')).toBeNull()
  })

  it('untags a saved contact without removing it from the list', async () => {
    const onUntag = vi.fn()
    const onChange = vi.fn()
    render(
      <RecipientChips
        label="TO"
        emails={['marieke@ahold.nl']}
        onChange={onChange}
        meta={META}
        onUntag={onUntag}
      />,
    )
    await userEvent.click(screen.getByLabelText('Stop pre-filling marieke@ahold.nl'))
    expect(onUntag).toHaveBeenCalledWith('c1', 'marieke@ahold.nl')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps the invalid treatment and offers no save action for a malformed address', () => {
    render(
      <RecipientChips
        label="TO"
        emails={['not-an-email']}
        onChange={() => {}}
        meta={META}
        onSaveRequest={() => {}}
      />,
    )
    expect(screen.getByText('not-an-email')).toBeInTheDocument()
    expect(screen.queryByLabelText('Save not-an-email')).toBeNull()
  })

  it('renders no provenance affordances when meta is omitted', () => {
    render(
      <RecipientChips
        label="TO"
        emails={['marieke@ahold.nl']}
        onChange={() => {}}
        onSaveRequest={() => {}}
        onUntag={() => {}}
      />,
    )
    expect(screen.getByText('marieke@ahold.nl')).toBeInTheDocument()
    expect(screen.queryByLabelText('Save marieke@ahold.nl')).toBeNull()
    expect(screen.queryByLabelText('Stop pre-filling marieke@ahold.nl')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/components/samples/approval/recipient-chips.test.tsx`
Expected: the three original tests PASS; the new ones FAIL (`meta` is not a prop, so no title/labels are rendered).

- [ ] **Step 3: Write the implementation**

Replace the whole of `src/components/samples/approval/recipient-chips.tsx`:

```tsx
'use client'

import { useState } from 'react'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** What is known about one address. `contactId: null` means it is not a saved contact. */
export interface RecipientMeta {
  name: string | null
  isGroup: boolean
  contactId: string | null
}

interface Props {
  label: string
  emails: string[]
  onChange: (emails: string[]) => void
  /**
   * Keyed by LOWER-CASED email. Supplying it switches the component into
   * provenance mode: saved contacts render by name with an untag action,
   * everything else gets a save affordance. Omitted (the approval flow) the
   * component renders exactly as it always has.
   */
  meta?: Record<string, RecipientMeta>
  /** Called with the raw address when the sender asks to save an unknown one. */
  onSaveRequest?: (email: string) => void
  /**
   * Called when the sender stops pre-filling a saved contact. The address
   * STAYS in the list — untagging means "don't suggest them next time", not
   * "don't send to them now". Removing from this send is the × button.
   */
  onUntag?: (contactId: string, email: string) => void
}

export function RecipientChips({
  label,
  emails,
  onChange,
  meta,
  onSaveRequest,
  onUntag,
}: Props) {
  const [draft, setDraft] = useState('')

  const commit = () => {
    const value = draft.trim().replace(/,$/, '')
    if (value && !emails.includes(value)) onChange([...emails, value])
    setDraft('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-black/10 px-2 py-1.5 dark:border-white/15">
      <span className="text-xs uppercase opacity-50">{label}</span>
      {emails.map((e) => {
        const valid = EMAIL_RE.test(e)
        const m = meta?.[e.toLowerCase()]
        const known = !!m?.contactId
        // Provenance affordances only when the caller opted in via `meta`.
        const showSave = !!meta && valid && !known && !!onSaveRequest
        const showUntag = !!meta && known && !!onUntag
        return (
          <span
            key={e}
            title={meta ? e : undefined}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
              valid
                ? 'bg-black/5 dark:bg-white/10'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
            }`}
          >
            {meta && valid && (
              <span aria-hidden className={known ? 'text-[#556b2f]' : 'opacity-40'}>
                {known ? '●' : '○'}
              </span>
            )}
            {known && m?.name ? m.name : e}
            {showSave && (
              <button
                type="button"
                aria-label={`Save ${e}`}
                onClick={() => onSaveRequest!(e)}
                className="opacity-60 hover:opacity-100"
              >
                +
              </button>
            )}
            {showUntag && (
              <button
                type="button"
                aria-label={`Stop pre-filling ${e}`}
                onClick={() => onUntag!(m!.contactId!, e)}
                className="opacity-60 hover:opacity-100"
              >
                &minus;
              </button>
            )}
            <button
              type="button"
              aria-label={`Remove ${e}`}
              onClick={() => onChange(emails.filter((x) => x !== e))}
              className="opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </span>
        )
      })}
      <input
        className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commit()
          }
        }}
        onBlur={commit}
        placeholder="Add…"
      />
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/components/samples/approval/recipient-chips.test.tsx`
Expected: PASS, all 12 (3 original + 9 new).

- [ ] **Step 5: Verify the live approval flow still compiles**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `recipient-chips` or `recipient-panel`.

- [ ] **Step 6: Commit**

```bash
git add src/components/samples/approval/recipient-chips.tsx src/components/samples/approval/recipient-chips.test.tsx
git commit -m "feat(recipients): optional provenance display on RecipientChips"
```

---

### Task 3: Inline save-contact prompt

**Files:**
- Create: `src/components/reports/save-contact-prompt.tsx`
- Test: `src/components/reports/save-contact-prompt.test.tsx`

**Interfaces:**
- Consumes: `QcContactRecord` from `@/lib/qc-contacts/tags`; the existing `POST /api/companies/[id]/qc-contacts` route.
- Produces: `SaveContactPrompt` with props `{ companyId: string; companyName: string; email: string; onSaved: (contact: QcContactRecord) => void; onSkip: () => void }`. Task 4 consumes it.

Name is optional for both kinds — a blank one falls back server-side to the email's local part, matching `planQcUpsert`. The group placeholder nudges toward a real name, which is the point of collecting it at all.

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/save-contact-prompt.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SaveContactPrompt } from './save-contact-prompt'

const SAVED = {
  id: 'c9',
  company_id: 'co1',
  email: 'jan@ahold.nl',
  name: 'Jan Bakker',
  nickname: null,
  phone: null,
  whatsapp: null,
  preferred_language: 'en',
  is_group: false,
  is_primary: null,
  is_active: true,
  routing_purposes: ['qc_certificates'],
}

function stubFetch(result: { ok: boolean; json: any } = { ok: true, json: { contact: SAVED } }) {
  const fetchMock = vi.fn(async () => ({ ok: result.ok, json: async () => result.json }) as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function body(fetchMock: ReturnType<typeof stubFetch>) {
  return JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
}

beforeEach(() => vi.restoreAllMocks())

describe('SaveContactPrompt', () => {
  it('POSTs a person with name and nickname', async () => {
    const fetchMock = stubFetch()
    const onSaved = vi.fn()
    render(
      <SaveContactPrompt
        companyId="co1"
        companyName="Ahold"
        email="jan@ahold.nl"
        onSaved={onSaved}
        onSkip={() => {}}
      />,
    )
    // Anchored: /name/i would also match the "Nickname …" placeholder.
    fireEvent.change(screen.getByPlaceholderText(/^name \(optional/i), { target: { value: 'Jan Bakker' } })
    fireEvent.change(screen.getByPlaceholderText(/nickname/i), { target: { value: 'Jan' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(SAVED))
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/companies/co1/qc-contacts')
    expect(body(fetchMock)).toEqual({
      email: 'jan@ahold.nl',
      name: 'Jan Bakker',
      nickname: 'Jan',
      isGroup: false,
    })
  })

  it('POSTs a group inbox with a name and no nickname', async () => {
    const fetchMock = stubFetch()
    render(
      <SaveContactPrompt
        companyId="co1"
        companyName="Ahold"
        email="qc@ahold.nl"
        onSaved={() => {}}
        onSkip={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /group inbox/i }))
    expect(screen.queryByPlaceholderText(/nickname/i)).toBeNull()
    fireEvent.change(screen.getByPlaceholderText(/^name \(optional/i), { target: { value: 'Ahold QC Team' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(body(fetchMock)).toEqual({
      email: 'qc@ahold.nl',
      name: 'Ahold QC Team',
      nickname: null,
      isGroup: true,
    })
  })

  it('sends a null name when the field is left blank', async () => {
    const fetchMock = stubFetch()
    render(
      <SaveContactPrompt
        companyId="co1"
        companyName="Ahold"
        email="jan@ahold.nl"
        onSaved={() => {}}
        onSkip={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(body(fetchMock)).toMatchObject({ name: null, nickname: null })
  })

  it('keeps the panel open with the server message when the save fails', async () => {
    stubFetch({ ok: false, json: { error: 'That email already exists for this company.' } })
    const onSaved = vi.fn()
    render(
      <SaveContactPrompt
        companyId="co1"
        companyName="Ahold"
        email="jan@ahold.nl"
        onSaved={onSaved}
        onSkip={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument())
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
  })

  it('calls onSkip without any request', async () => {
    const fetchMock = stubFetch()
    const onSkip = vi.fn()
    render(
      <SaveContactPrompt
        companyId="co1"
        companyName="Ahold"
        email="jan@ahold.nl"
        onSaved={() => {}}
        onSkip={onSkip}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(onSkip).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('states that saving also subscribes them to certificates', () => {
    stubFetch()
    render(
      <SaveContactPrompt
        companyId="co1"
        companyName="Ahold"
        email="jan@ahold.nl"
        onSaved={() => {}}
        onSkip={() => {}}
      />,
    )
    expect(screen.getByText(/certificates and reports/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/components/reports/save-contact-prompt.test.tsx`
Expected: FAIL — cannot resolve `./save-contact-prompt`.

- [ ] **Step 3: Write the implementation**

Create `src/components/reports/save-contact-prompt.tsx`:

```tsx
'use client'

/**
 * Inline "this address isn't on file — save it?" panel for the report send
 * dialog. Opens under the To field when an unrecognised address is committed,
 * or when the sender clicks a chip's save affordance.
 *
 * Never blocks the send: skipping leaves the address in To as an ephemeral
 * recipient. Saving POSTs to the existing QC-contacts upsert, which tags the
 * contact `qc_certificates` — so a saved report recipient also starts
 * receiving certificate emails. The panel says so; there is no separate
 * reports tag to opt into.
 */

import { useState } from 'react'
import type { QcContactRecord } from '@/lib/qc-contacts/tags'

interface Props {
  companyId: string
  companyName: string
  email: string
  onSaved: (contact: QcContactRecord) => void
  onSkip: () => void
}

export function SaveContactPrompt({ companyId, companyName, email, onSaved, onSkip }: Props) {
  const [isGroup, setIsGroup] = useState(false)
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/companies/${companyId}/qc-contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name: name.trim() || null,
          nickname: isGroup ? null : nickname.trim() || null,
          isGroup,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Could not save this contact.')
        return
      }
      onSaved(data.contact as QcContactRecord)
    } catch {
      setError('Could not save this contact.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[12px] border border-amber-400/50 bg-amber-50/50 p-3 dark:border-amber-400/30 dark:bg-amber-400/5">
      <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
        <span className="font-mono">{email}</span> isn&apos;t saved for {companyName}. Save it so
        future reports pre-fill?
      </p>

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
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={
          isGroup ? 'Name (optional, e.g. Ahold QC Team)' : 'Name (optional, for the greeting)'
        }
      />

      {!isGroup && (
        <input
          className="mb-2 w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-white/15"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Nickname (optional, preferred greeting)"
        />
      )}

      <p className="mb-2 text-xs opacity-60">
        Saved contacts receive QC certificates and reports for {companyName}.
      </p>

      {error && <p className="mb-2 text-xs text-[#ef4444]">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-[#556b2f] px-3 py-1.5 text-xs text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-xs underline opacity-70 disabled:opacity-40"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/components/reports/save-contact-prompt.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/save-contact-prompt.tsx src/components/reports/save-contact-prompt.test.tsx
git commit -m "feat(reports): inline save-contact prompt for unknown recipients"
```

---

### Task 4: Wire the send dialog to both sources

**Files:**
- Modify: `src/components/reports/send-report-modal.tsx` (whole file rewrite of the state + To/Cc/Bcc rendering; header, subject, message, footer and `handleSend` payload stay as they are)
- Test: `src/components/reports/send-report-modal.test.tsx`

**Interfaces:**
- Consumes: `buildToList` and `PrefilledRecipient` (Task 1); `RecipientChips` and `RecipientMeta` (Task 2); `SaveContactPrompt` (Task 3).
- Produces: no new exports. `SendReportModal`'s props are unchanged, so `preview-report-modal.tsx` needs no edit.

Two states carry recipients: `toEmails: string[]` is what gets sent, `metaByEmail: Record<string, RecipientMeta>` is what is known about each address (lower-cased keys) and survives adds and removes. The POST payload to `kind.sendEndpoint` does not change.

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/send-report-modal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SendReportModal } from './send-report-modal'
import type { ReportKind } from './preview-report-modal'

// Built inline rather than imported from preview-report-modal, which imports
// SendReportModal back — a type-only cycle in source, but a real one in a test.
const KIND: ReportKind = {
  reportType: 'weekly_ss',
  previewEndpoint: '/api/reports/weekly-ss',
  sendEndpoint: '/api/reports/weekly-ss/send',
  label: 'SS Report',
}

const CONTACTS = {
  people: [
    {
      id: 'c1', company_id: 'co1', email: 'marieke@ahold.nl', name: 'Marieke de Vries',
      nickname: null, phone: null, whatsapp: null, preferred_language: 'en',
      is_group: false, is_primary: true, is_active: true, routing_purposes: ['qc_certificates'],
    },
  ],
  groups: [
    {
      id: 'c2', company_id: 'co1', email: 'qc@ahold.nl', name: 'QC Team',
      nickname: null, phone: null, whatsapp: null, preferred_language: 'en',
      is_group: true, is_primary: null, is_active: true, routing_purposes: ['qc_certificates'],
    },
  ],
}

interface StubOpts {
  contactsOk?: boolean
  recipientsOk?: boolean
  lastSendTo?: string[]
}

function stubFetch(opts: StubOpts = {}) {
  const { contactsOk = true, recipientsOk = true, lastSendTo = [] } = opts
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/qc-contacts')) {
      return contactsOk
        ? ({ ok: true, json: async () => CONTACTS } as Response)
        : ({ ok: false, json: async () => ({ error: 'boom' }) } as Response)
    }
    if (u.includes('/api/reports/recipients')) {
      return recipientsOk
        ? ({ ok: true, json: async () => ({ to: lastSendTo, cc: [], bcc: [], last_sent_at: null }) } as Response)
        : ({ ok: false, json: async () => ({ error: 'boom' }) } as Response)
    }
    return { ok: false, json: async () => ({ error: 'unexpected' }) } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderModal() {
  return render(
    <SendReportModal
      open
      onOpenChange={() => {}}
      kind={KIND}
      clientId="co1"
      clientName="Ahold"
      startDate="2026-08-03"
      endDate="2026-08-07"
    />,
  )
}

beforeEach(() => vi.restoreAllMocks())

describe('SendReportModal recipient pre-fill', () => {
  it('pre-fills To from tagged contacts, people before groups', async () => {
    stubFetch()
    renderModal()
    await waitFor(() => expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument())
    expect(screen.getByTitle('marieke@ahold.nl')).toHaveTextContent('Marieke de Vries')
    expect(screen.getByTitle('qc@ahold.nl')).toHaveTextContent('QC Team')
  })

  it('unions contacts with the last-send list', async () => {
    stubFetch({ lastSendTo: ['jan@ahold.nl'] })
    renderModal()
    await waitFor(() => expect(screen.getByTitle('jan@ahold.nl')).toBeInTheDocument())
    expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument()
  })

  it('still pre-fills from last-send when the contacts fetch fails', async () => {
    stubFetch({ contactsOk: false, lastSendTo: ['jan@ahold.nl'] })
    renderModal()
    await waitFor(() => expect(screen.getByTitle('jan@ahold.nl')).toBeInTheDocument())
    expect(screen.queryByTitle('marieke@ahold.nl')).toBeNull()
  })

  it('still pre-fills from contacts when the last-send fetch fails', async () => {
    stubFetch({ recipientsOk: false })
    renderModal()
    await waitFor(() => expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument())
  })

  it('leaves usable empty inputs when both fetches fail', async () => {
    stubFetch({ contactsOk: false, recipientsOk: false })
    renderModal()
    await waitFor(() => expect(screen.getAllByPlaceholderText('Add…').length).toBe(3))
    expect(screen.queryByTitle('marieke@ahold.nl')).toBeNull()
  })
})

describe('SendReportModal save prompt', () => {
  it('opens the prompt when an unknown address is committed', async () => {
    stubFetch()
    renderModal()
    await waitFor(() => expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument())
    const toInput = screen.getAllByPlaceholderText('Add…')[0]
    fireEvent.change(toInput, { target: { value: 'jan@ahold.nl' } })
    fireEvent.keyDown(toInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/isn't saved for Ahold/i)).toBeInTheDocument())
  })

  it('does not prompt for an address that is already a saved contact', async () => {
    stubFetch()
    renderModal()
    await waitFor(() => expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument())
    const toInput = screen.getAllByPlaceholderText('Add…')[0]
    fireEvent.change(toInput, { target: { value: 'MARIEKE@ahold.nl' } })
    fireEvent.keyDown(toInput, { key: 'Enter' })
    await waitFor(() => expect(screen.queryByText(/isn't saved for Ahold/i)).toBeNull())
    // …and it is not added a second time under different casing.
    expect(screen.getByText('2 recipients')).toBeInTheDocument()
  })

  it('does not re-prompt an address that was skipped', async () => {
    stubFetch()
    renderModal()
    await waitFor(() => expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument())
    const toInput = screen.getAllByPlaceholderText('Add…')[0]
    fireEvent.change(toInput, { target: { value: 'jan@ahold.nl' } })
    fireEvent.keyDown(toInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/isn't saved for Ahold/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    await waitFor(() => expect(screen.queryByText(/isn't saved for Ahold/i)).toBeNull())
    fireEvent.click(screen.getByLabelText('Save jan@ahold.nl'))
    await waitFor(() => expect(screen.getByText(/isn't saved for Ahold/i)).toBeInTheDocument())
  })

  it('keeps Send enabled while a prompt is open', async () => {
    stubFetch()
    renderModal()
    await waitFor(() => expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument())
    const toInput = screen.getAllByPlaceholderText('Add…')[0]
    fireEvent.change(toInput, { target: { value: 'jan@ahold.nl' } })
    fireEvent.keyDown(toInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/isn't saved for Ahold/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /send report/i })).toBeEnabled()
  })

  it('disables Send when an address is malformed', async () => {
    stubFetch()
    renderModal()
    await waitFor(() => expect(screen.getByTitle('marieke@ahold.nl')).toBeInTheDocument())
    const toInput = screen.getAllByPlaceholderText('Add…')[0]
    fireEvent.change(toInput, { target: { value: 'not-an-email' } })
    fireEvent.keyDown(toInput, { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /send report/i })).toBeDisabled(),
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/components/reports/send-report-modal.test.tsx`
Expected: FAIL — no chips render, so `getByTitle('marieke@ahold.nl')` never resolves.

- [ ] **Step 3: Replace the imports and state block**

In `src/components/reports/send-report-modal.tsx`, replace the import block and everything from `const EMAIL_RE` down to the end of the recipient-loading `useEffect` (currently lines 19–138) with:

```tsx
import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Send, AlertCircle, Mail } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { RecipientChips, type RecipientMeta } from '@/components/samples/approval/recipient-chips'
import { SaveContactPrompt } from './save-contact-prompt'
import { buildToList } from '@/lib/reports/recipient-prefill'
import type { QcContactRecord } from '@/lib/qc-contacts/tags'
import type { ReportKind } from './preview-report-modal'

const AUTO_CC_MAILBOX = 'qualitycontrol@wolthers.com'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const key = (email: string) => email.trim().toLowerCase()

function formatDateLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}
```

Keep the existing `SendReportModalProps` interface and the `defaultSubject` `useMemo` exactly as they are. Then replace the recipient state and loading effect with:

```tsx
  const [toEmails, setToEmails] = useState<string[]>([])
  const [ccEmails, setCcEmails] = useState<string[]>([])
  const [bccEmails, setBccEmails] = useState<string[]>([])
  const [metaByEmail, setMetaByEmail] = useState<Record<string, RecipientMeta>>({})
  const [saveQueue, setSaveQueue] = useState<string[]>([])
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [contactsFailed, setContactsFailed] = useState(false)
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingRecipients, setLoadingRecipients] = useState(false)
  const [lastSentAt, setLastSentAt] = useState<string | null>(null)

  // Reset subject when defaults change (different client / dates).
  useEffect(() => {
    setSubject(defaultSubject)
  }, [defaultSubject])

  // Pre-fill from BOTH sources on open: the company's tagged QC contacts
  // (durable) and the addresses used on the last send (one-off extras).
  // Either failing is non-fatal — the sender can always type addresses.
  useEffect(() => {
    if (!open || !clientId) return
    let cancelled = false
    async function load() {
      setLoadingRecipients(true)
      setContactsFailed(false)
      setSaveQueue([])
      setSkipped(new Set())

      const params = new URLSearchParams({ client_id: clientId, report_type: kind.reportType })
      const [contactsRes, savedRes] = await Promise.allSettled([
        fetch(`/api/companies/${clientId}/qc-contacts`),
        fetch(`/api/reports/recipients?${params.toString()}`),
      ])

      let contacts: QcContactRecord[] = []
      if (contactsRes.status === 'fulfilled' && contactsRes.value.ok) {
        const data = await contactsRes.value.json().catch(() => ({}))
        contacts = [...(data?.people ?? []), ...(data?.groups ?? [])]
      } else if (!cancelled) {
        setContactsFailed(true)
      }

      let savedTo: string[] = []
      if (savedRes.status === 'fulfilled' && savedRes.value.ok) {
        const data = await savedRes.value.json().catch(() => ({}))
        savedTo = Array.isArray(data?.to) ? data.to : []
        if (!cancelled) {
          setCcEmails(Array.isArray(data?.cc) ? data.cc : [])
          setBccEmails(Array.isArray(data?.bcc) ? data.bcc : [])
          setLastSentAt(data?.last_sent_at ?? null)
        }
      }

      if (cancelled) return
      const list = buildToList(contacts, savedTo)
      setToEmails(list.map((r) => r.email))
      setMetaByEmail(
        Object.fromEntries(
          list.map((r) => [key(r.email), { name: r.name, isGroup: r.isGroup, contactId: r.contactId }]),
        ),
      )
      setLoadingRecipients(false)
    }
    load()
    return () => { cancelled = true }
  }, [open, kind.reportType, clientId])
```

- [ ] **Step 4: Add the recipient handlers**

Insert directly after that effect, before `handleSend`:

```tsx
  const invalidEmails = [...toEmails, ...ccEmails, ...bccEmails].filter((e) => !EMAIL_RE.test(e))
  const canSend = toEmails.length > 0 && invalidEmails.length === 0 && !sending && !loadingRecipients

  const pendingSave = saveQueue[0] ?? null

  const enqueueSave = (email: string) => {
    setSaveQueue((q) => (q.some((e) => key(e) === key(email)) ? q : [...q, email]))
  }

  // Prompt only for addresses the sender just added that we know nothing
  // about and haven't already been offered this session.
  //
  // The chip component's own duplicate check is case-sensitive, so typing
  // MARIEKE@ahold.nl next to marieke@ahold.nl would otherwise put both in the
  // list and mail the person twice. De-duplicate case-insensitively here.
  const handleToChange = (next: string[]) => {
    const deduped: string[] = []
    const seen = new Set<string>()
    for (const e of next) {
      if (seen.has(key(e))) continue
      seen.add(key(e))
      deduped.push(e)
    }
    const added = deduped.filter((e) => !toEmails.some((x) => key(x) === key(e)))
    setToEmails(deduped)
    for (const email of added) {
      if (!EMAIL_RE.test(email)) continue
      if (metaByEmail[key(email)]?.contactId) continue
      if (skipped.has(key(email))) continue
      enqueueSave(email)
    }
  }

  const handleSaved = (email: string, contact: QcContactRecord) => {
    setMetaByEmail((m) => ({
      ...m,
      [key(email)]: {
        name: (contact.name ?? '').trim() || null,
        isGroup: !!contact.is_group,
        contactId: contact.id,
      },
    }))
    setSaveQueue((q) => q.slice(1))
  }

  const handleSkip = (email: string) => {
    setSkipped((s) => new Set(s).add(key(email)))
    setSaveQueue((q) => q.slice(1))
  }

  // Untag = stop pre-filling next time. The address stays in this send.
  const handleUntag = async (contactId: string, email: string) => {
    try {
      const res = await fetch(`/api/companies/${clientId}/qc-contacts/${contactId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        toast({ title: 'Could not update the contact', variant: 'destructive' })
        return
      }
      setMetaByEmail((m) => ({
        ...m,
        [key(email)]: { name: m[key(email)]?.name ?? null, isGroup: !!m[key(email)]?.isGroup, contactId: null },
      }))
      toast({
        title: 'Removed from pre-fill',
        description: `${email} won't pre-fill for ${clientName} next time. Still on this send.`,
      })
    } catch {
      toast({ title: 'Could not update the contact', variant: 'destructive' })
    }
  }
```

- [ ] **Step 5: Update `handleSend` to use the arrays**

`handleSend` keeps its whole body; delete the three `parseAddresses` calls it relied on — `toEmails`, `ccEmails` and `bccEmails` are now state. The fetch payload is unchanged:

```tsx
        body: JSON.stringify({
          ...basePayload,
          to: toEmails,
          cc: ccEmails.length > 0 ? ccEmails : undefined,
          bcc: bccEmails.length > 0 ? bccEmails : undefined,
          subject: subject.trim() || undefined,
          body: body.trim() || undefined,
        }),
```

- [ ] **Step 6: Replace the To / Cc / Bcc markup**

Replace the three `Textarea` blocks (the To block and the Cc/Bcc grid) with:

```tsx
          <div>
            <Label className="text-xs mb-1.5 block">
              To <span className="text-[#ef4444]">*</span>
            </Label>
            <RecipientChips
              label="TO"
              emails={toEmails}
              onChange={handleToChange}
              meta={metaByEmail}
              onSaveRequest={enqueueSave}
              onUntag={handleUntag}
            />
            {loadingRecipients && (
              <p className="text-xs text-muted-foreground mt-1">Loading recipients…</p>
            )}
            {contactsFailed && !loadingRecipients && (
              <p className="text-xs text-muted-foreground mt-1">
                Couldn&apos;t load {clientName}&apos;s saved contacts — add recipients manually.
              </p>
            )}
            {toEmails.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {toEmails.length} recipient{toEmails.length === 1 ? '' : 's'}
              </p>
            )}
          </div>

          {pendingSave && (
            <SaveContactPrompt
              key={pendingSave}
              companyId={clientId}
              companyName={clientName}
              email={pendingSave}
              onSaved={(contact) => handleSaved(pendingSave, contact)}
              onSkip={() => handleSkip(pendingSave)}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">Cc</Label>
              <RecipientChips label="CC" emails={ccEmails} onChange={setCcEmails} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Bcc</Label>
              <RecipientChips label="BCC" emails={bccEmails} onChange={setBccEmails} />
            </div>
          </div>
```

Leave the auto-CC notice, Subject, Message, invalid-address banner and `DialogFooter` untouched.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test:run -- src/components/reports/send-report-modal.test.tsx`
Expected: PASS, 10 tests.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`parseAddresses` is now unused — delete it if the compiler or lint flags it.)

- [ ] **Step 9: Commit**

```bash
git add src/components/reports/send-report-modal.tsx src/components/reports/send-report-modal.test.tsx
git commit -m "feat(reports): pre-fill send dialog from company QC contacts"
```

---

### Task 5: Collect a name for group inboxes in the certificate capture form

**Files:**
- Modify: `src/components/samples/approval/recipient-capture.tsx:74` (the POST body) and `:143-158` (the name/nickname inputs)
- Test: `src/components/samples/approval/recipient-capture.test.tsx` (append one case; **do not edit the six existing tests**)

**Interfaces:**
- Consumes: nothing from earlier tasks. This task is independent of Tasks 1–4 and may be done in any order relative to them.
- Produces: nothing new. Behaviour alignment only.

Today a group inbox posts `name: null` and the server falls back to the email's local part, so the shared `contacts` table accumulates rows called `qc` that sys users also see.

- [ ] **Step 1: Write the failing test**

Append to `src/components/samples/approval/recipient-capture.test.tsx`, inside the `describe('RecipientCaptureForm — free-type (new) path', ...)` block:

```tsx
  it('group inbox: collects a name and posts it, with no nickname field', async () => {
    const fetchMock = stubFetch()
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /add a new email instead/i }))
    fireEvent.click(screen.getByRole('button', { name: /group inbox/i }))
    expect(screen.queryByPlaceholderText(/nickname/i)).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'qc@ahold.nl' } })
    fireEvent.change(screen.getByPlaceholderText(/^name \(optional/i), { target: { value: 'Ahold QC Team' } })
    fireEvent.click(screen.getByLabelText(/save as a QC-certificate recipient/i))
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('qc@ahold.nl'))
    const post = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/qc-contacts') && (c[1] as any)?.method === 'POST')!
    expect(JSON.parse((post[1] as RequestInit).body as string)).toMatchObject({
      email: 'qc@ahold.nl',
      name: 'Ahold QC Team',
      nickname: null,
      isGroup: true,
    })
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/components/samples/approval/recipient-capture.test.tsx`
Expected: the six existing tests PASS; the new one FAILS — the name input is not rendered while Group inbox is selected.

- [ ] **Step 3: Show the name field for groups**

Replace the `{!isGroup && (<>…</>)}` block (currently lines 143–158) with:

```tsx
          <input
            className="mb-2 w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-white/15"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              isGroup ? 'Name (optional, e.g. Ahold QC Team)' : 'Name (optional, for the greeting)'
            }
          />

          {!isGroup && (
            <input
              className="mb-2 w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-white/15"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Nickname (optional, preferred greeting)"
            />
          )}
```

- [ ] **Step 4: Post the name for both kinds**

In the `add` function's POST body, change the `name` line so a group's name is no longer discarded:

```tsx
          body: JSON.stringify({
            email: value,
            name: name.trim() || null,
            nickname: isGroup ? null : nickname.trim() || null,
            isGroup,
          }),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- src/components/samples/approval/recipient-capture.test.tsx`
Expected: PASS, all 7.

- [ ] **Step 6: Commit**

```bash
git add src/components/samples/approval/recipient-capture.tsx src/components/samples/approval/recipient-capture.test.tsx
git commit -m "feat(recipients): name group inboxes instead of deriving from the email"
```

---

### Task 6: Sticky client picker on the reports page

**Files:**
- Modify: `src/app/dashboard/reports/page.tsx:117-136` (the client `Card`)

**Interfaces:**
- Consumes: nothing. Independent of every other task.
- Produces: nothing.

The scroll container is `MainLayout`'s `<div className="flex-1 overflow-auto">` (`src/components/layout/main-layout.tsx:144`). The page body is `<div className="p-6 space-y-6 max-w-6xl">` with no intervening `overflow`, so `position: sticky` resolves against that scroller.

This is a visual change with no unit test — verify it in the browser.

- [ ] **Step 1: Make the client card sticky**

Replace the client-picker `Card` block with a sticky wrapper. The `-mx-6 px-6 pt-6 -mt-6` bleed matters: without it, cards scrolling past show through the 6-unit gutter beside the card's rounded corners.

```tsx
        {/* Shared client picker — one selection drives all report cards.
            Sticky so the selected client stays visible while scrolling the
            cards below. */}
        <div className="sticky top-0 z-20 -mx-6 -mt-6 bg-background px-6 pb-2 pt-6">
          <Card className="rounded-[20px]">
            <CardContent className="pt-6">
              <Label className="text-xs mb-2 block">Client</Label>
              {loadingClients ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading clients…
                </div>
              ) : (
                <SearchableSelect
                  options={clients}
                  value={clientId}
                  onValueChange={setClientId}
                  placeholder="Select a QC client"
                  searchPlaceholder="Search clients…"
                  emptyMessage="No QC clients found"
                />
              )}
            </CardContent>
          </Card>
        </div>
```

- [ ] **Step 2: Verify in the browser**

Run: `npm run dev`, open `http://localhost:3000/dashboard/reports`.

Check all of:
- The client card stays pinned at the top while the four report cards scroll under it.
- No report card is visible through the gap beside the pinned card's rounded corners.
- The `SearchableSelect` dropdown opens **over** the cards below, not clipped behind them.
- The page header ("Reports" + subtitle) scrolls away normally above it.
- Both light and dark mode.

- [ ] **Step 3: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npm run test:run`
Expected: no type errors; the whole suite passes.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/reports/page.tsx
git commit -m "feat(reports): pin the client picker to the top of the page"
```

---

## Final verification

- [ ] `npm run test:run` — whole suite green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run lint` — no new warnings in the six touched files.
- [ ] Manual pass on `/dashboard/reports` against a real client (Ahold has tagged contacts): open Preview → Send by email, confirm To pre-fills with named chips, add an unknown address and save it as a group inbox, reopen the dialog and confirm it now pre-fills as a saved contact.
- [ ] Confirm on sys.wolthers.com that the newly saved contact appears on the company's contact list with "QC certificates" ticked — the shared-tag consequence, visible where the spec says it will be.
