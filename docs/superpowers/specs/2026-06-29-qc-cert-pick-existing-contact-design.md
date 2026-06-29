# QC Certificate Contacts — Pick an Existing Contact (Phase 2 follow-up) — Design Spec

## Problem

The QC-certificate recipient capture flow (the inline `RecipientCaptureForm` in both send composers, and
the Phase-1 Contacts tab's "Add" form) only lets a sender **free-type an email**. When a counterparty has no
`qc_certificates` recipient but already has people on file in the shared `contacts` table (tagged for other
sys SENDS purposes, or untagged), the sender has to retype an address that already exists. This is slow and
invites typos / near-duplicates. The follow-up: let the sender **pick an existing contact** for that company,
while keeping the free-type path for genuinely new people.

This builds directly on the shipped Phase 2 (LIVE prod, `origin/main` `978fb41..a11dccc`). It does NOT change
how certificates are sent or how recipients are resolved at send time.

## Key facts (verified)

- The only company-contacts endpoint today is `GET /api/companies/[id]/qc-contacts`, which returns ONLY
  `qc_certificates`-tagged contacts (the existing recipients). There is no endpoint that lists a company's
  broader contact pool.
- `upsertQcRecipient` (`src/lib/qc-contacts/upsert.ts`) finds a contact by `(company_id, lower(email))` and
  **set-unions** the `qc_certificates` tag onto `routing_purposes`, filling only blank fields and reviving a
  deactivated row. So "tag an existing contact as a QC-cert recipient" is already exactly what a `POST
  /api/companies/[id]/qc-contacts` with that contact's email does — no new write path is needed.
- `SearchableSelect` (`src/components/ui/searchable-select.tsx`, built on cmdk + Radix Popover) already
  supports `allowCreate` / `onCreateNew` / `createLabel` and a `substringMatch` mode that avoids cmdk's fuzzy
  scoring noise (and the value-trap that breaks type-to-search). It is the creatable-combobox primitive this
  feature reuses unchanged.
- The capture form (`src/components/samples/approval/recipient-capture.tsx`) today has: a person/group toggle,
  an email `<input>`, an optional name input (person only), a "save as a QC-certificate recipient for {company}"
  checkbox (hidden when `companyId` is null), and an "Add recipient" button. It calls `onAdd(email)` once on a
  successful add; when save-for-future is checked it POSTs to `/api/companies/[id]/qc-contacts` FIRST and only
  calls `onAdd` on success.
- The Contacts tab (`src/components/clients/qc-contacts-tab.tsx`) has a rich Draft editor (email, name,
  nickname, phone, whatsapp, preferred_language, person/group) and POSTs to the same qc-contacts endpoint.
- The recipient resolver (`resolve-panels.ts`) treats `@wolthers.com` addresses as house-CC, never as TO
  recipients. The greeting prefers a contact's `nickname`, else first name.

## Locked decisions

1. **Pool = all of the company's other contacts** with an email, EXCLUDING those already `qc_certificates`-tagged
   (already recipients) and EXCLUDING internal `@wolthers.com` addresses (house-CC, never TO). No grouping or
   sectioning of the list.
2. **Approach A — creatable combobox**, reusing `SearchableSelect` (`allowCreate`, `substringMatch`). No new
   combobox is built; the primitive is reused unchanged.
3. **Both surfaces** get it: the send-flow capture form (batch + single composers) and the Phase-1 Contacts tab.
4. **Reuse the existing write path** — saving/tagging always goes through `POST /api/companies/[id]/qc-contacts`
   → `upsertQcRecipient`. No new write endpoint; the set-union tag invariant is preserved.
5. **Capture form: picking respects the save-for-future checkbox** — pick + unchecked = use this send only
   (ephemeral); pick + checked = upsert (tag for next time). **Tab: picking always tags** (the tab only manages
   QC-cert recipients; there is no one-off-send concept there).
6. **Nickname is carried through.** The list endpoint returns each contact's `nickname`; the capture form's
   "add new" person path gains an optional nickname field (matching the tab) so a new person can get a greeting
   nickname. A picked existing contact keeps its own nickname (the upsert's blank-fill-only never clobbers it).
7. **Staff-gated, service-role** like every WAQC contacts route (`isStaffSampleManager` → 403). NO migration.

## Architecture: one new read endpoint + one shared fetch, two surfaces

### Section 1 — list endpoint (`GET /api/companies/[id]/contacts`)

New route `src/app/api/companies/[id]/contacts/route.ts`. Service-role client, gated with
`isStaffSampleManager(supabase, user.id)` (401 unauthenticated, 403 non-staff). Returns the company's pickable
contacts:

- `is_active = true`, `email` not null.
- EXCLUDE rows whose `routing_purposes` already contains `qc_certificates`.
- EXCLUDE internal `@wolthers.com` emails.
- Response: `{ contacts: Array<{ id, name, nickname, email, isGroup }> }`, ordered name-then-email.

A small pure helper (`src/lib/qc-contacts/pickable.ts`) does the exclusion + mapping from raw contact rows, unit
tested in isolation (no DB). The route fetches, calls the helper, returns. (Mirrors how `splitQcContacts` keeps
the qc-contacts GET thin.)

### Section 2 — shared client fetch + option mapping

A tiny shared module `src/lib/qc-contacts/use-pickable-contacts.ts` that, given a
`companyId`, fetches `/api/companies/[id]/contacts` and maps the result to `SearchableSelectOption[]`
(`value = contact.id`, `label = name || email`, `keywords = [email, nickname]` so search matches all three).
It also returns the raw contacts keyed by id, so a pick can recover `{ email, name, nickname, isGroup }`. Both
surfaces use this one module so they behave identically. Graceful degrade: on fetch failure it yields an empty
option list (the create/free-type path still works) plus an error flag the UI can surface subtly.

### Section 3 — capture form (`recipient-capture.tsx`)

Replace the plain email `<input>` with `SearchableSelect` (options from Section 2; `allowCreate`,
`substringMatch`, `createLabel="+ Add new email"`):

- **Pick existing** (`onValueChange` with a contact id) → set the selected email/name/nickname/isGroup from the
  recovered contact; HIDE the person/group toggle, name, and nickname inputs (all known from the record). The
  save-for-future checkbox still shows (when `companyId` present).
- **"+ Add new email"** (`onCreateNew`) → switch to free-type mode: reveal the person/group toggle, an email
  input, and (person only) optional name + **nickname** inputs — same as today plus nickname.
- **Add recipient** button behavior is unchanged in contract:
  - save-for-future checked → `POST /api/companies/[id]/qc-contacts` with `{ email, name, nickname, isGroup }`
    FIRST; only on success call `onAdd(email)`. (Pick + save = upsert finds the contact by email and unions the
    tag, filling only blanks — never clobbers their nickname/name.)
  - unchecked → ephemeral: `onAdd(email)` directly, no POST.
  - invalid/missing email → inline error, no `onAdd`.
- The component grows; extract the free-type sub-fields if it approaches the size limit, but the combobox itself
  is the `SearchableSelect` primitive, so net new lines are modest.

### Section 4 — Contacts tab (`qc-contacts-tab.tsx`)

The "Add" action opens the same `SearchableSelect` (a small add-bar above the editor, or replacing the current
empty-state Add button):

- **Pick existing** → `POST /api/companies/[id]/qc-contacts` with that contact's email (tags them) → reload the
  list. (Tab always tags; no ephemeral path.)
- **"+ Add new"** → open the existing rich Draft editor prefilled with the typed email (keeps phone / whatsapp /
  language / nickname). This is today's add-flow, now reached via the combobox's create affordance.

The tab's edit/remove flows for already-tagged recipients are unchanged.

## Error handling

- Endpoint failure (list) → combobox shows no options but the create/free-type path still works; a subtle inline
  note ("Couldn't load existing contacts — you can still type a new email"). Never blocks adding.
- Duplicate email on save → existing `23505` friendly mapping in `upsertQcRecipient`/`mapContactError`
  ("That email already exists for this company."). Picking an existing contact + save unions the tag, so it does
  not 23505 (it updates, not inserts).
- Internal `@wolthers.com` typed in the create path → existing capture-form behavior is unchanged; such addresses
  are house-CC at resolve time. (They're already excluded from the pickable list.)
- Service-role write/read are auth-gated to Wolthers staff in-route (`isStaffSampleManager`).

## Testing

- **Unit (`pickable.ts`):** excludes `qc_certificates`-tagged rows; excludes `@wolthers.com`; drops rows with no
  email; maps to `{ id, name, nickname, email, isGroup }`; ordering name-then-email.
- **Route:** 401 unauthenticated; 403 non-staff; happy path returns the filtered+mapped pool.
- **Component (capture form):** pick existing + save → POSTs `{ email, nickname, ... }` then `onAdd`; pick +
  ephemeral → no POST, `onAdd`; "+ add new" reveals the toggle + nickname field; new + save → POSTs; the existing
  5 capture-form tests still pass.
- **Component (tab):** pick existing → POST + reload; "+ add new" → opens the Draft editor prefilled with the
  typed email. Existing tab tests still pass.

## Out of scope (v1)

- Grouping / sectioning the pickable list (e.g. "tagged for other sends" vs "untagged").
- Editing a contact's non-QC SENDS purposes (sys-only).
- Any new write endpoint or schema change (no migration).
- Multi-select (add several at once) — one pick per Add, same as today.

## Key file anchors

| Concern | File |
| --- | --- |
| New list endpoint | `src/app/api/companies/[id]/contacts/route.ts` (new) |
| Pure exclusion/mapping helper | `src/lib/qc-contacts/pickable.ts` (new) |
| Shared client fetch + option mapping | `src/lib/qc-contacts/use-pickable-contacts.ts` (new) |
| Creatable combobox primitive (reused) | `src/components/ui/searchable-select.tsx` |
| Capture form | `src/components/samples/approval/recipient-capture.tsx` |
| Contacts tab | `src/components/clients/qc-contacts-tab.tsx` |
| Existing upsert (reused write path) | `src/lib/qc-contacts/upsert.ts` (`upsertQcRecipient`) |
| Existing tagged-only GET (sibling) | `src/app/api/companies/[id]/qc-contacts/route.ts` |
