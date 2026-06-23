# WAQC Partner Portal — Program Overview

**Date:** 2026-06-22
**Status:** Decomposition approved; sub-projects to be specced individually.

## Why

QC clients/partners (starting with the broad set of all QC clients) currently have no
authenticated place to follow their coffee end-to-end. They want a **dedicated login** where
they can follow every detail of the lifecycle — **PSS → SS → shipped → in-transit** — see
approvals/rejections, and **download a full-data Excel** (screen sizes, defects, cupping —
everything). Container traceability (separately specced) becomes one module inside this portal.

This is a **program**, not a single feature, so it is decomposed into sub-projects that each
get their own spec → plan → build cycle.

## Scope decisions (locked)

- **Audience:** all QC clients at once (architecture generic; suppliers/buyers a later
  extension — note their data scoping differs: clients scope by `client_id`/`end_client_id`,
  suppliers/exporters would scope by `seller_id`/`exporter_id`).
- **Sequence:** A → B → C → D.
- Partner access is **read-only** (view + download; no editing of QC data).

## What already exists (reuse, do not rebuild)

- **Partner auth + scoping foundation:** external roles `client`/`supplier`/`buyer`
  (`src/lib/supabase.ts`), `profiles.client_id` → companies link, working invitation /
  accept-invite onboarding (`src/app/auth/accept-invite/page.tsx`,
  `database/migrations/087_*`), and sample scoping by company in both RLS
  (`20260528000010_*`) and app layer (`src/lib/auth/sample-access.ts`,
  `canUserManageSample()`). Missing: the partner-facing UI + role-based route gating
  (`/clients` is staff-only today).
- **Cross-system lifecycle merge:** "shipped"/in-transit lives on sys.wolthers.com
  (`shipment_samples.status`, `shipments.load_status`), and an endpoint already merges WAQC
  samples + sys `shipment_samples` + status history:
  `Wolthers-system/.../api/contracts/[id]/all-samples/route.ts`.
- **Full per-sample QC aggregation** already implemented in `src/lib/certificate-data.ts`
  (screen sizes, defects, roast, cupping). **No Excel library installed** (only `jszip`) —
  `exceljs` to be added for module C.

## Sub-projects

- **A — Portal Foundation:** partner-facing authenticated shell (role-based post-login routing
  into a `/portal` namespace, company-scoped layout, onboarding), landing/overview, navigation
  that later modules mount into. *~Half-built underneath.* **(Designing first.)**
- **B — Unified Lifecycle View:** per-contract/sample timeline merging PSS → SS → shipped →
  in-transit with approvals/rejections + dates; reuses the sys all-samples merge.
- **C — Full-data Excel Export:** add `exceljs`; comprehensive multi-sheet export reusing the
  certificate-data aggregator; surfaced to partners (own data) and internal staff.
- **D — Container Traceability:** already specced
  (`2026-06-22-dunkin-container-traceability-design.md`); its Dunkin timeline becomes a portal
  tab. Built last.

## Relationships & build order

A is the foundation everything mounts on. B is the core value (the "follow everything" view)
and is tightly coupled to A's information architecture. C is largely independent and slots into
A/B. D nests its partner-facing view into A/B once they exist. Each sub-project ships before the
next begins.
