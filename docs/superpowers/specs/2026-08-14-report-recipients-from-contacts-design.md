# Report recipients from company contacts, and a sticky client picker

**Date:** 2026-08-14
**Status:** Approved, ready for implementation planning

## Problem

Three requests against `/dashboard/reports`:

1. The client picker scrolls away. With four report cards on the page you lose sight of which client you selected while setting a date range.
2. The send dialog's **To** field pre-fills only from `report_recipients` — what was sent last time. On the first send for a client it is empty, so the sender pastes addresses by hand even though the company's contacts are already in the database.
3. When the sender does type an address that isn't on file, nothing captures it. The next send starts from the same blank.

The machinery for (2) and (3) already exists — it was built for certificate sends in the QC Certificate Contacts phases — and the report send flow was never wired into it.

## What already exists

| Piece | Location | Note |
|---|---|---|
| Shared `contacts` table | Supabase `ojyonxplpmhvcgaycznc` | Same rows sys.wolthers.com reads and writes. Carries `is_group`, `name`, `nickname`, `routing_purposes text[]`. |
| Tagged-contact read | `GET /api/companies/[id]/qc-contacts` | Returns `{ people, groups }` filtered to `routing_purposes @> {qc_certificates}`, active only. Staff-gated by `isStaffSampleManager`. |
| Safe upsert | `POST /api/companies/[id]/qc-contacts` → `upsertQcRecipient` | Inserts tagged, or unions the tag onto an existing row filling **only blank** fields. Never clobbers sys-owned data, never flips person/group kind. |
| Untag | `DELETE /api/companies/[id]/qc-contacts/[contactId]` → `setQcCertTag(false)` | Removes only the `qc_certificates` tag. Never deletes the row. |
| Chip input | `src/components/samples/approval/recipient-chips.tsx` | 60 lines, generic `{label, emails, onChange}`. Live in the approval flow. |
| Capture form | `src/components/samples/approval/recipient-capture.tsx` | Person\|Group toggle, name, nickname, "save for future". |
| Last-send store | `GET/POST /api/reports/recipients` | `report_recipients` keyed `(client_id, report_type)`. |

`clientId` on the reports page **is** a `companies.id` — the picker loads from `/api/clients?is_qc_client=true`. So it feeds the company contact routes directly, with no lookup step.

## Scope

In scope: `/dashboard/reports` and its send dialog, for all four report kinds (SS, PSS, SS+PSS, Annual); the shared chip component; the certificate capture form's group-name alignment.

Out of scope: the certificate batch composer's own recipient flow beyond that one alignment, the partner portal, sys.wolthers.com, and any change to how reports are generated or delivered.

**No migration.** `is_group`, `name`, and `nickname` all exist on `contacts` already.

---

## Decisions taken

Recorded here because each closes off an alternative that will look attractive again later.

**Reports reuse the `qc_certificates` routing purpose.** Not a new `qc_reports` tag. A new tag would separate the two audiences properly, but it would start empty for every client, so pre-fill would do nothing until someone hand-tagged contacts on sys. Reusing the existing tag works on the first send for every client that already receives certificates — which is all of them.

**The consequence is real and must be surfaced in the UI:** saving a report recipient also subscribes them to QC certificate emails. There is no way to scope that away while the two share a tag. The save panel says so in plain words, and untagging (chip action, or the sys contact pane) reverses it.

**To = tagged contacts ∪ last-send extras, contacts first.** Tagged contacts are the durable list; `report_recipients` remembers one-off additions. Deleting a tagged person before a send removes them from that send only; the permanent fix is untagging.

**The save prompt is inline and never blocks Send.** It opens under the To field as soon as an unrecognised address is committed. A Send-time interception was rejected: it stands between the sender and the thing they came to do.

**Group inboxes get a name, not a nickname.** Today an unnamed group falls back to the email local part, so the shared table accumulates contacts called `qc`, visible to sys users too. Nickname is a personal-greeting field and stays person-only.

---

## 1 · Sticky client picker

**Files:** `src/app/dashboard/reports/page.tsx`

The scroll container is `MainLayout`'s `<div className="flex-1 overflow-auto">` (`main-layout.tsx:144`). The page body renders inside it as `<div className="p-6 space-y-6 max-w-6xl">` with no intervening `overflow` — so `position: sticky` resolves against that scroller.

The client `Card` becomes `sticky top-0 z-20`, wrapped so it carries an opaque `bg-background` and a `-mx-6 px-6 pt-6 -mt-6` bleed. Without the bleed, cards scrolling past show through the 6-unit gutter beside the card's rounded corners.

"Always fixed" is read as pinned to the top of the scrolling content area, below the app header — not `position: fixed` over the viewport. No logic changes; the picker keeps its current data loading and `SearchableSelect`.

## 2 · Pre-fill source

**Files:** `src/lib/reports/recipient-prefill.ts` (new), `src/components/reports/send-report-modal.tsx`

No new endpoints. On open the modal fetches both existing routes in parallel:

- `GET /api/companies/{clientId}/qc-contacts` → `{ people, groups }`
- `GET /api/reports/recipients?client_id=…&report_type=…` → `{ to, cc, bcc, last_sent_at }`

A pure module merges them:

```ts
export interface PrefilledRecipient {
  email: string
  name: string | null
  isGroup: boolean
  contactId: string | null          // null ⇒ not a saved contact
  source: 'contact' | 'last_send'
}

export function buildToList(
  contacts: QcContactRecord[],
  lastSendTo: string[],
): PrefilledRecipient[]
```

Rules:

1. Contacts first, in `splitQcContacts` order (primary first, then name) — people then groups.
2. Contacts with a blank email are dropped.
3. Contacts matching `isInternalEmail` (`@wolthers.com`) are dropped: they are house CC, never a TO recipient. This mirrors `toPickableContacts`.
4. Then each `lastSendTo` address not already present, **verbatim** — including internal ones. A deliberate manual addition is not second-guessed.
5. Matching and de-duplication are case-insensitive on the whole address; the first occurrence's casing wins.

Cc and Bcc continue to come from `report_recipients` alone. Contacts do not feed them.

**Failure modes.** Either fetch failing is non-fatal: the modal falls back to whatever the other returned, and to empty inputs if both fail — the current behaviour when `/api/reports/recipients` errors. The sender can always type addresses. A failed contacts fetch shows a one-line note so an empty To doesn't read as "this client has no contacts".

### Known wrinkle: one-send resurrection

Untagging a contact on sys removes them from the contact side, but they can still reappear once from the stored last-send list. Deleting the chip on that send stores the list without them and it stops.

Suppressing this properly would mean the modal telling the send endpoint which addresses are contact-derived so only the extras get persisted — a payload change across all four report send endpoints. Not worth it for a lag that clears itself on the next send. Accepted, not overlooked.

## 3 · Chips with provenance

**Files:** `src/components/samples/approval/recipient-chips.tsx`

Extended, not forked — a second near-identical chip component would drift. Two new **optional** props keep the approval-flow call site and its existing tests rendering exactly as today:

```ts
meta?: Record<string, RecipientMeta>   // keyed by lower-cased email
onSaveRequest?: (email: string) => void
onUntag?: (contactId: string, email: string) => void
```

where

```ts
interface RecipientMeta {
  name: string | null
  isGroup: boolean
  contactId: string | null    // null ⇒ not a saved contact
}
```

With `meta` absent the component behaves as it does now. With it present, each chip renders:

- **Tagged contact** — filled dot, the contact's `name` as the label (email in `title`), `×` removes it from this send. When `onUntag` is supplied, a secondary action removes the tag for good.
- **Unsaved address** — hollow `⊕`, the raw email as the label, clicking the marker calls `onSaveRequest`. `×` still just removes it.
- **Malformed address** — the existing red treatment, unchanged and taking precedence over both.

Keyboard behaviour (Enter/comma to commit, blur to commit) is untouched.

**Untag keeps the address in To.** Removing the tag means "stop pre-filling this person next time", not "don't send to them now" — the send in front of the user is unaffected. The chip flips to the unsaved treatment, and its `meta` entry drops to `contactId: null`. Removing them from *this* send is the separate `×`.

### Cc and Bcc

All three fields become `RecipientChips`, so the dialog does not mix chips and textareas. Only **To** is given `meta`, `onSaveRequest`, and `onUntag`; Cc and Bcc use the plain existing behaviour.

The "Invalid address(es)" banner stays. Malformed chips are already red, but the banner is what explains a disabled Send button, and `canSend` keeps deriving from the same check across all three lists.

## 4 · Inline save panel

**Files:** `src/components/reports/save-contact-prompt.tsx` (new)

```ts
interface Props {
  companyId: string
  companyName: string
  email: string
  onSaved: (contact: QcContactRecord) => void
  onSkip: () => void
}
```

Renders under the To field when an unrecognised address is committed, or when a `⊕` marker is clicked. Person | Group inbox toggle; **Name always shown**; Nickname shown for Person only. `POST /api/companies/{companyId}/qc-contacts` with `{ email, name, nickname, isGroup }` — nickname omitted for groups. No route change: the route already accepts a name for either kind, and `upsertQcRecipient` uses it.

On success the panel closes, the chip flips to the tagged-contact treatment, and a line confirms the subscription in full: *"Saved to {company}'s QC contacts — they'll receive QC certificates and reports."*

On failure the panel stays open with the server's message (the route already maps the `(company_id, lower(email))` unique violation to a readable sentence). The address remains in To either way — saving is orthogonal to sending.

Skips are held in component state, so an address skipped once is not re-prompted while the dialog is open; reopening the dialog offers it again.

Only one panel is open at a time. If a second unknown address is committed while a panel is open, it queues and opens after the first resolves.

## 5 · Capture-form alignment

**Files:** `src/components/samples/approval/recipient-capture.tsx`

The certificate capture form currently hides both Name and Nickname when Group inbox is selected and posts `name: null`. It now shows Name for groups, keeping Nickname person-only, so both surfaces write group contacts the same way. Its "save for future" checkbox, pick/new modes, and ephemeral path are untouched.

---

## Testing

**Unit (`recipient-prefill.test.ts`)** — contacts-only, last-send-only, both; case-insensitive de-duplication with first-casing-wins; internal contacts dropped but internal last-send entries kept; blank-email contacts dropped; ordering (people before groups, primary first); empty inputs.

**Component**

- `recipient-chips.test.tsx` — the existing tests stay green unmodified, which is the backward-compatibility proof. New cases: name shown for tagged contacts, `⊕` on unsaved, `onSaveRequest`/`onUntag` fire, malformed still wins, and untagging leaves the address in the list.
- `save-contact-prompt.test.tsx` — POST body for Person (name + nickname) and Group (name, no nickname); success closes and reports the contact; failure keeps the panel open with the message.
- `send-report-modal.test.tsx` — both fetches merge into To; one fetch failing still pre-fills from the other; both failing leaves usable empty inputs; committing an unknown address opens the panel; Send is never gated on the panel.

Vitest throughout, matching the existing files in these directories.

## Files touched

| File | Change |
|---|---|
| `src/app/dashboard/reports/page.tsx` | Sticky client card |
| `src/lib/reports/recipient-prefill.ts` | New — pure merge |
| `src/lib/reports/recipient-prefill.test.ts` | New |
| `src/components/samples/approval/recipient-chips.tsx` | Optional `meta` / `onSaveRequest` / `onUntag` |
| `src/components/reports/save-contact-prompt.tsx` | New |
| `src/components/reports/send-report-modal.tsx` | Two-source pre-fill, chips, panel wiring |
| `src/components/samples/approval/recipient-capture.tsx` | Name for group inboxes |

`send-report-modal.tsx` grows from 330 to roughly 430 lines, well inside the 2000-line guideline.
