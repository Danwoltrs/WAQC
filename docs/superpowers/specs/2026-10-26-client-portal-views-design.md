# Client portal views overhaul: design

Date: 2026-10-26. Owner: Daniel. Status: written for review.

This is piece 2 ("views") of client portal v2. Piece 1 (accounts, access and hardening) shipped on 2026-10-20; see `2026-10-14-client-portal-accounts-design.md`. Container door-QR traceability is a separate project that comes after this one (section 9).

Visual reference: the mockups in `docs/superpowers/specs/prototypes/client-portal/`. They use the real app tokens and are the agreed look:
- `overview-v3.html` is the approved single-origin overview.
- `overview-v5.html` + `overview-v5.js` is the multi-origin overview with click-to-filter.

## 1. Intent

The portal at `/portal` today is a thin list of samples, contracts and certificates. Daniel called it "so simple and outdated". QC clients need one place that shows their whole QC picture:
- where their coffee comes from and which paths fail
- every quality they buy, across every origin
- how each supplier performs and why its lots are rejected
- their certificates
- where their containers are

The guiding idea for qualities: **the client owns the quality; Wolthers approves on their behalf.** The client sets and changes their own specification. The lab grades against it.

Primary readers: buyer QC and quality managers (for example Dunkin, Ahold), and roasters or partners invited by the client.

## 2. Goals, non-goals, anti-goals

**Goals**
- A clean, friendly lab-like portal in the qc.wolthers.com look, with the client's logo and ours.
- An overview that reads the client's whole book at a glance, with a supply-chain flow that can be clicked through.
- Client-owned quality specifications with versioned, schedulable changes that the lab grades against.
- Supplier pages that explain rejections by their real cause.
- A Containers tab fed by the sys shipment data that already exists.

**Non-goals (this project)**
- Door QR codes, open scanning, photos and the public journey page (section 9).
- Cupping with Wolthers, reports downloads and any finance or lab views.
- Changing how the lab grades, except that it reads the version of the client's spec that applies to the lot.

**Anti-goals: a failure even if it works**
- Any SAN tracking number visible anywhere, including URLs and exports. Show certificate numbers or contract refs (CLAUDE.md rule).
- Prices, commissions or any commercial term from sys.
- Numbers that disagree with the period and annual reports, which are the same data seen twice.
- One coffee counted twice in MT (PSS and SS of the same contract).
- Mock data in the product, or emojis in the UI.
- An old certificate re-judged by a spec that changed after it was issued.

## 3. Constraints

- **Stack and conventions:** Next.js 14, Supabase, shadcn/ui, Recharts / d3-sankey (already deps).
  - Files stay under ~2,000 lines; split into modules beyond that.
  - Daniel applies all SQL himself. Every migration is pasted for him as SQL and goes in `database/migrations/`.
  - Trunk-based on `main`.
- **Access:** every portal data route goes through `requireQcPortal(request, need)` (`src/lib/portal/qc-portal-gate.ts`) and reads with `ctx.admin`, scoped to the company. Staff "view as" stays read-only.
- **Scope (my call):**
  - **Overview, Suppliers and Qualities** count by `client_id` only, exactly as the reports do (`reportRowClientId()` in `src/lib/report-data.ts`), so the portal and the reports never disagree. Reuse the report data layer as it is.
  - **Certificates and Containers** list `client_id = X OR end_client_id = X`, as the current portal routes do, so an end client still finds its documents.
  - Qualities belong to the `client_id` company. Partners get access to the client's company, not their own.
- **Access keys** (`src/lib/portal/qc-keys.ts`), one per tab:
  - Overview: `qc_dashboard`
  - Qualities: `qc_specs`. Editing also needs `qc_spec_edit`, a capability that already exists.
  - Certificates: `qc_certificates`
  - Suppliers: `qc_supplier_review`
  - Containers: a new key `qc_containers`. My call: a backfill SQL grants it to everyone who already holds `qc_dashboard`; staff can remove it per person.
  - Team: `qc_manage_users`
  - `qc_samples` stops having a tab but stays a valid key.
- **Unit of counting:** one certificate per contract (non-voided, sample not deleted), as in the reports.
- **Look:**
  - The app's light tokens and Inter.
  - Radius scale: containers 10px, controls 6px, badges 4px, tables and rows 0.
  - Charcoal by default; colour only where it signals something. The Sankey keeps its existing bands: olive `#556b2f` at 90% and up, `#a9a454` from 70 to 89%, red `#ef4444` below 70%. Validation green and red as in CLAUDE.md.
  - Dark mode tokens wired through even though the portal shell currently forces light.
- **Companies** are always labelled with `companyDisplayName()` (fantasy name first).

## 4. Shell

- **Header**, left to right:
  - the client's logo (`companies.logo_url`; add it to `/api/portal/me`), with the fantasy name as text when there is no logo
  - the tabs: Overview · Qualities · Certificates · Suppliers · Containers · Team
  - the Wolthers logo (`public/logos/wolthers-logo-green.svg`) on its own, with no "Quality control by" text
  - Sign out
- The company switcher stays for people with access to several companies.
- **Samples and Contracts tabs are removed.** Their routes and pages go.
- **The view-as banner for staff stays.**
- **Shared filter:** a filter chosen on the Overview (section 5.2) carries over to Certificates and Suppliers. It shows there as the same removable tags and clears the same way.
  - Builder's call: keep it in the URL query string so links and reloads keep it.

## 5. Overview

### 5.1 Layout (approved)
- **Title row:** "Overview", then scope tags on the same line, then on the right the crop-year selector and a toggle **Certificates | Quantity (MT)**.
  - The page opens on **Certificates**.
  - **MT counts SS certificates only** (shipped coffee). PSS quantity is never added, so nothing is counted twice.
- **Five compact KPI cards** (number and label side by side, 20px number):
  - Certificates
  - Approved (with %)
  - Rejected
  - PSS approved %
  - SS approved %
  - Problem values in red.
- **Flow card:** "Where your coffee comes from".
  - A Sankey over five possible steps: **origin → lab → seller → importer → roaster**.
  - Bands are sized by certificates, or by MT on the MT toggle.
  - Colour = approval rate on that path.
  - Hover shows count and rate.
- **Qualities card:** every quality the client buys, with columns quality, origin, lab, certificates, PSS approved (%, approved/total), SS approved (%, approved/total). Low rates in red. Links to the Qualities tab.
- **Latest certificates card:** certificate number, origin, type (PSS/SS), seller, issued date. Links to Certificates.

### 5.2 Behaviour (approved)
- **One-party rule.** A step with only one party in the current selection is not drawn. It becomes a scope tag instead: "Brazil", "Santos lab", "Importer: Ahold".
  - A step with several parties is drawn, and its count shows as a tag ("7 origins", "3 labs").
  - The quality count is always a tag.
- **Too little left to draw.** When fewer than two steps vary, the flow card becomes a ranking table of the step that does vary, usually sellers: "Seller performance".
  - Columns: #, name, certificates, rejected, approval rate with bar.
  - Ranked by Wilson lower bound; "few lots" shown under 10.
  - This is what Ahold sees today: one origin, one lab, Ahold is its own importer, no roaster recorded.
- **Click to filter.** Clicking any bar (origin, lab, seller, importer, roaster) narrows the whole page to it: flow, KPIs, Qualities and Latest certificates.
  - Filters stack. Each shows as a dark tag with ×, plus a Clear link. Clicking the same bar again removes it.
  - After every change the one-party rule runs again. For example, Brazil collapses Origin and Lab back into tags.
- **Missing parties** show as "Not recorded". Today 310 Dunkin certificates have no roaster.
  - Builder's call: whether that node gets a muted style.

### 5.3 Data
- One route, e.g. `GET /api/portal/overview?crop_year=&filters...`. It returns per-path aggregates (origin, lab, seller, importer, roaster, certificates, approved, SS MT) plus the quality rows and latest certificates. All filtering and collapsing can then happen client-side without a refetch.
- Reuse the report data layer where it already computes these per client: `getPerformanceReportData`, `buildSupplierRatings`, the rejection analytics.
- **Period (Daniel, 2026-10-26):** the selector is the crop year, September to August, using the existing helpers in `src/lib/crop-year.ts` (`cropYearRange`, `formatCropYear`). It is labelled the way the trade writes it ("Crop 26/27"), with a calendar-year option kept so a client can match a report.
  - Certificates fall into a period by their issue date.
  - A lot can be a **mixed crop** (for example 26/27 and 27/28). Its own crop (`samples.crop` / `crop_year`) is shown as an attribute on certificates and qualities, and never decides the period.
  - The shared reports stay calendar-year. In the calendar-year view the portal's numbers equal them.

## 6. Qualities

### 6.1 What the client sees
- **List:** every quality the client buys (`client_qualities`, active), grouped or labelled by origin, with certificates and PSS/SS approval for the crop year.
- **Opening a quality** shows its specification built step by step, in the same sections, order and wording as the lab's spec editor (`src/components/quality/spec-editor/`, one page per section):
  - screen sizes (largest first, Pan last)
  - moisture
  - green and roast aspect
  - defects and limits
  - quakers
  - cupping attributes and scales
  - taints and faults
  - clean cups
- **My call:** next to each limit, show how the client's recent lots landed against it (for example "18 of 20 lots within"). Changes are then informed. Use the compliance results the certificates already carry; don't add a new grading computation.
- **Editing:** a person with `qc_spec_edit` can press Change on any step, edit it, and choose when it takes effect: **now**, or **from a date** ("from 1 September 2027").
  - **Daniel, 2026-10-26: clients can change anything.** That covers limits, and also adding, removing or renaming screen sizes, defect types, aspect wordings, cupping attributes and scales, taints and faults.
  - Grading, compliance, the certificate render and cupping must therefore draw whatever structure the lot's version has. They must never assume a fixed set of fields.
  - Renaming a cupping attribute starts a new history line, because attribute names are keys. The editor warns the client before saving such a rename.
  - **Every change emails Wolthers:** the house address wolthers@wolthers.com, plus the lab that grades that quality. The email says what changed (old value, new value), who changed it, and from when.
  - Without `qc_spec_edit` the quality is read-only.
  - No Wolthers sign-off. The change takes effect on its date. The email above is the notice.

### 6.2 Versions
- Every change creates a **new version** of that client quality, with its effective date, who made it, when, and an optional note. Versions are never edited after the fact.
  - Scheduled versions can be cancelled before they start.
  - The list of versions is visible to the client and to staff.
- **Shared templates (Daniel, 2026-10-26: "create a copy"):**
  - Every client quality gets its **own private copy** of its spec, through the existing duplicate flow (`is_client_variant`). Version 1 is its resolved spec at migration.
  - From then on, an edit to a shared base template never changes a client's quality.
  - Staff can still edit a client's quality directly. That creates a version like any other, shown as "Changed by Wolthers".
- **Which version applies to a lot:** the version in force on the **contract date**.
  - sys holds `contracts.contract_date`. Only 450 of 1,334 live 2026 samples are linked to a sys contract today; all of those have the date.
  - When there is no contract date, the lab asks the shipper and enters it on the sample.
  - **When the date is still unknown at grading time, grade by the newest version already in force on the grading day.**
- **When the version is fixed (my call):** at grading start. The resolver picks the version, and the sample records its id. Finalize, certificate issue, re-grades inside the 7-day lock, and a contract date entered later all keep that version.
  - A later contract date that points at a different version does not re-grade. Staff see a flag ("graded under v3, contract date implies v2"). This follows Daniel's rule that an unknown date grades by the newest spec.
- **Old lots stay judged** by the version they were approved under. Certificates, reports and the portal always show that version.
- **Today the spec is read live in several places**, for example `src/app/api/samples/[id]/quality-template/route.ts`, which merges `client_qualities.custom_parameters` over `quality_templates.parameters`. Others are compliance, the certificate render, the reports and cupping. All of them must read the applicable version through **one resolver**.
  - Builder's call: migrate the current spec as version 1 for every client quality.
  - Builder's call: model versions as their own table, or as snapshots on `client_qualities`.

## 7. Suppliers

- **List:** the client's sellers, ranked by Wilson lower bound (`buildSupplierRatings`). Columns: certificates, rejected, approval rate, PSS / SS approval, MT on SS.
- **Opening a seller (e.g. Cooxupé)** shows its **five main rejection reasons**:
  - Each rejected certificate counts **once, under its single worst reason**, in Daniel's severity order: Cup fault > Primary defects > Secondary defects > Cup taint > Quakers > Screen size, then Cup score, Moisture, Cupper's decision, Status override, Not recorded.
  - Reasons are **named**, never just a category: "Primary defects: black beans", "Cup fault: phenolic", "Cup taint: earthy".
  - Under the five: "Rejected for more than one reason: N".
  - Reuse `classifyRejection` / `summarizeWorstReasons` and `rejection_detail` (`src/lib/reports/rejection-*.ts`). Never re-derive reasons.
- **Each reason opens the certificates behind it**, with the measured value against the limit ("12, max 8"), as on the report's rejected-certificates page (`rejection-overview.ts`).
- **The page follows the shared filter.** For example, Cooxupé via Sucafina shows only that path.
- **My call:** a small monthly approval-rate line for the crop year. Daniel was asked and didn't answer, so drop it if it costs real effort.

## 8. Certificates, Containers, Team

### Certificates
- The current list, extended with origin, quality, seller and type columns, and following the shared filter.
- Search by certificate number, contract ref or container.
- Download stays as is (`/api/portal/certificates/[id]/pdf`).

### Containers (from sys data, no scanning yet)
- One row per container linked to the client's contracts. The join is samples.contract_id → shipments.contract_id → shipment_containers → containers.
- Columns:
  - container
  - seal
  - certificate(s)
  - quality
  - seller
  - vessel and voyage
  - BL
  - ETD and ETA (actual when known)
  - milestone (`empty_to_shipper` → `received_at_cy` → `loaded_on_vessel` → `departed_awaiting_docs`, in plain words)
- Daniel cleared showing vessel, voyage, booking, BL, dates, container and seal numbers. Never prices or commissions.
- WAQC does not read these sys tables today. Check the RLS and RESTRICTIVE deny policies on them, and read through the service role inside the portal gate.
- `shipment_tracking_events` is empty. Don't build on it yet.

### Team
- Unchanged from piece 1.

## 9. Next project: container custody traceability (not in this build)

Recorded so this build leaves room for it.
- The exporter or shipper prints a QR for the container door at stuffing and records a stuffing scan with a photo.
- Every later stop scans the **same** QR and adds a photo:
  - each warehouse
  - the roasting plant
  - roasted (photo optional)
  - the distribution centre after roasting and packing
  - the coffee shops
- **Scanning needs no login**; anyone with a phone camera can scan. The journey page is **public, no login**. The sea leg fills in from sys.
- That project will add a journey strip to each container row of the Containers tab.

## 10. Decisions and open items

**Decided by Daniel**
- Readers are buyer QC and quality managers, and roasters or partners.
- QC only: no Samples or Contracts tabs.
- Overview: the layout and behaviour in section 5, opening on Certificates, MT on SS only.
- Logos: the client's on the left, ours alone on the right.
- Qualities:
  - The client owns the spec and can change anything in it, now or from a date. Wolthers gets an email.
  - Each client quality is its own copy.
  - Old lots keep their version.
  - The version is chosen by contract date; with no date, the newest version in force.
- Period: crop year September to August. Mixed-crop lots exist.
- Suppliers: five named worst reasons per seller, one per certificate.
- Logistics fields may show.
- Order: views first, traceability second.

**My calls (check these)**
- The scope split: analytics by `client_id` like the reports; the Certificates and Containers lists also include end-client lots.
- The version is fixed at grading start; a later contract date flags, never re-grades.
- `qc_containers` is backfilled to everyone with `qc_dashboard`.
- A calendar-year option next to the crop year.
- "Lots within limit" counts next to each spec step.
- The filter lives in the URL.
- A monthly trend line on the seller page.
- Container milestones shown in plain words.
- A new `qc_containers` key.

**Data issues the portal will expose** (fix on sys, not in WAQC)
- Roaster missing on many Dunkin contracts.
- Duplicate importer names (SUCAFINA / Sucafina).
- About 66% of 2026 samples not linked to a sys contract, so no contract date.

## 11. Suggested build order

1. Shell, Overview, Certificates (reads only, no migrations).
2. Suppliers.
3. Containers (sys reads; RLS check first).
4. Qualities: versions table and resolver migration; every spec reader switched to the resolver; contract-date field on intake; the portal spec view and editor; notifications.

Step 4 changes how grading reads specs and carries the most risk. It gets its own plan and review.
