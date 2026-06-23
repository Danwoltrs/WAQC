# Dunkin' Container Traceability — Design Spec

**Date:** 2026-06-22
**Status:** Approved design, ready for implementation planning
**Scope:** Dunkin'-only chain-of-custody traceability for green coffee from WAQC certificate
through roasting to NDPC departure.

## Context & problem

Dunkin' is the **final buyer**, not the roaster. After WAQC approves a sample and issues a
certificate, Dunkin' has **no visibility into the physical journey** of that coffee: when the
container arrived, where it was warehoused, when it was sold/trucked to a roaster, when it was
roasted, and when it shipped to / arrived at / left the NDPC factory.

We will build a **chain-of-custody trail attached to physical containers via QR codes**. The
people who actually handle the coffee — third-party warehouse staff, the roaster, NDPC — are
**not Wolthers users**, so they record checkpoints by scanning a QR and self-identifying. The
trail is surfaced to Dunkin' as a **live, per-container timeline** that traces back to the WAQC
certificate (shipper → origin → quality → roasted → NDPC).

This is a **Dunkin'-only** capability, built generically but feature-gated.

### Existing infrastructure this builds on (reuse, do not rebuild)

- Public, no-login certificate page + route: `src/app/certificate/[slug]/page.tsx`,
  `src/app/api/certificate/[slug]/route.ts`.
- QR helper: `src/lib/qr-code.ts` (`generateQRCode`, `getCertificatePageUrl`).
- Public-route handling in `middleware.ts` (`/api/`, `/certificate/` bypass auth).
- `activity_feed` + `notifications` tables with Supabase Realtime hooks
  (`src/hooks/use-notifications.ts`) and the right-sidebar feed.
- `storage_history` audit-table shape (`database/migrations/003_phase2_schema.sql`) as the
  model for an append-only event log.
- `@react-pdf/renderer` for the printable container passport.

## Locked decisions

1. **Tracked unit = the container**, made first-class. **One certificate can cover many
   containers**, so there is **one QR per container**, and each container **traces back to its
   certificate**. The container↔lot link is many-to-many (to also tolerate a container holding
   several lots), but the dominant direction is **cert → many containers**.
2. **Scans are anonymous + public** (no accounts). The scanner **self-identifies with name +
   location** (required); we auto-capture timestamp and, with browser consent, geolocation.
3. **Append-only event log** rendered as a **milestone timeline** — not a rigid state
   machine — so it absorbs branches (first scan at warehouse *or* directly at the roaster), the
   "unsold" gap (`roaster_id IS NULL`), and missed / out-of-order scans.
4. **Full chain with blend convergence** (many input containers → one roast batch), tracked
   **through NDPC departure**. **Shop-level fan-out is deferred** to a later phase.
5. The QR lives on a **standalone per-container passport/label** (printable + emailable), not on
   the certificate PDF — a single cert spans many containers, so one cert QR can't represent
   them.

## Event vocabulary (controlled enum)

Pre-roast — attached to the **container**:
`container_arrived` → `stored_warehouse` → `sold_to_roaster` → `dispatched_to_roaster` →
`arrived_at_roaster`.

Roast + downstream — attached to the **roast batch**:
`roasted` → `dispatched_to_ndpc` → `arrived_at_ndpc` → `left_ndpc`.

`shop_*` event types are reserved but **not implemented** in this scope.

## Data model (new migrations in `database/migrations/`)

- **`tracking_containers`** — `id`, `container_nr`, unguessable URL-safe `public_token`,
  `client_id` (Dunkin gate), `laboratory_id`, `created_at`; optional cached `current_stage`
  (derived from latest event) for fast list rendering.
- **`tracking_container_lots`** — `container_id`, `sample_id`. Many-to-many container ↔ lot;
  dominant case is many rows sharing one `sample_id` (one cert, many containers).
- **`tracking_roast_batches`** — `id`, `public_token`, `roaster_company_id` (nullable; may be
  self-identified text in metadata when not a known company), `roast_date`, `created_at`. The
  convergence node.
- **`tracking_roast_batch_containers`** — `roast_batch_id`, `container_id`. Many-to-many: one
  batch ties to N input containers (the blend model).
- **`tracking_events`** — append-only: `id`, `subject_type` (`'container' | 'roast_batch'`),
  `subject_id`, `event_type` (enum above), `occurred_at`, `recorded_by_name`,
  `recorded_location`, `geo_lat`, `geo_lng`, `photo_url` (Supabase Storage), `note`,
  `metadata jsonb`, `flagged boolean DEFAULT false` (lab moderation; events stay immutable),
  `created_at`.

**RLS:** events insertable via the service role from the public scan API (Dunkin-gated
server-side); readable by the owning Dunkin client + lab staff. Mirror the `storage_history` /
`activity_feed` policies.

## Container registration & QR passport

- **Source of container numbers:** a "Generate container passports" action on an approved
  Dunkin sample/certificate. The user enters the 1..n container numbers for that cert (seeded
  from `samples.container_nr` and, where available, sys.wolthers.com logistics /
  `shipment_samples` data). Each entry creates a `tracking_containers` row + `public_token` + a
  `tracking_container_lots` link to the sample.
- **Passport PDF:** one page per container — container QR (encodes
  `https://qc.wolthers.com/track/{public_token}`), container number, and a parent-cert summary
  (shipper, origin, quality, link to the public cert page). Reuse `src/lib/qr-code.ts` +
  `@react-pdf/renderer`. Printable and emailable to the origin/shipping party to affix.
- **After roast** the steel container empties, so the roaster re-prints a label (roast-batch
  QR) and scanning continues on the batch subject.

## Public scan flow — `/track/[token]` (no login)

- Extend `middleware.ts` public-route handling to allow `/track/` and `/api/track/`.
- Page shows: container number, parent cert (shipper → origin → quality + link to the existing
  public cert page), and the current event timeline. If roasted as part of a blend, also shows
  the batch + sibling containers.
- **Record event:** a context-aware list of plausible next events → `name` + `location`
  (required) → optional photo + note → auto timestamp + geolocation (with consent). The
  `roasted` step prompts "other containers in this roast batch?" → scan/enter their tokens →
  builds the `tracking_roast_batch_containers` convergence and moves the subject to the batch.
- **APIs (service role, Dunkin-gated):** `GET /api/track/[token]` (summary + timeline),
  `POST /api/track/[token]/events` (append event; validates token + loose ordering).
- **Anti-abuse:** unguessable token; events immutable but lab staff can `flag`/hide bad ones;
  rate-limit POSTs; show "self-reported" provenance on each event.

## Dunkin-facing view

- A **Traceability** page in Dunkin's client portal: a container list with current stage + a
  per-container timeline (container → roast batch → NDPC), live via the existing
  `use-notifications`-style Realtime subscription on `tracking_events`.
- Milestone **notifications** to Dunkin (e.g. `roasted`, `arrived_at_ndpc`) reuse the
  `notifications` table + right sidebar.
- **Gating:** a `traceability_enabled` flag on `qc_client_settings`, enabled for Dunkin only.

## Delivery phases

- **Phase 1 — Green leg:** `tracking_containers` + `tracking_container_lots` + container
  registration UI + per-container passport PDF/QR + public `/track/[token]` scan page +
  `tracking_events` + pre-roast events + Dunkin timeline view (read) + gating flag.
- **Phase 2 — Roast + downstream:** `tracking_roast_batches` +
  `tracking_roast_batch_containers` (blend convergence) + `roasted` / NDPC events + Dunkin
  notifications.
- **Phase 3 — deferred (out of scope now):** shop-level fan-out (registered stores,
  distribution graph, `shop_*` events).

## Open implementation items (resolve at build time)

- Exact source/UX for entering multiple container numbers per cert (manual entry vs. pull from
  sys logistics / `shipment_samples`).
- Whether the roaster scans a new roast-batch label or re-uses a container token at the
  `roasted` step (UX detail; both supported by the model).

## Verification (end-to-end)

- Create a test Dunkin' cert, register 2+ containers, generate passports, confirm each QR
  resolves to `/track/{token}`.
- Post events through the chain on the public page (no login), including a 2-container
  `roasted` blend, confirming convergence and that name/location/geo/timestamp are captured.
- Confirm the Dunkin timeline view stitches container → batch → NDPC and updates live via
  Realtime; confirm a milestone notification fires.
- Confirm gating: a non-Dunkin client cannot see traceability and the API rejects events for
  non-enabled clients.
- Unit tests: token generation/uniqueness, event-ordering validation, blend-convergence
  linking, gating.
