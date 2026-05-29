# WAQC — Client Edit View Redesign

**Repo:** qc.wolthers.com · **Stack:** Next.js 14 · TypeScript · Supabase · Tailwind · shadcn/ui
**Reference mockup:** `qc-client-edit-v2.html`
**Depends on:** the `is_qc_client` flag (Phase 0 of the clients spec)

## Goal

Rebuild the "Editing client information" form. Current problems: fields thrown into a rigid 3-across grid with no grouping, VAT/CNPJ wedged into the address, country as free text, roles as single-select radios, and address retyped by hand when it already exists in sys. Keep the green/black/white shadcn language — refinement only.

---

## 1 — Regroup the form

Four labeled groups (small uppercase faint label + hairline divider), replacing the flat grid:

- **Company** — Fantasy name · Legal/company name · VAT/CNPJ, then the status toggles (see §2). Fantasy name is the **narrow** column (short value); the legal name gets the extra width. Drop the bold on fantasy — it shouldn't dominate.
- **Contact** — Contact name · Email · Phone.
- **Address** — see §3.
- **Client roles** — see §4.

Field styling: white inputs, 1px `--border-strong`, radius 9px, height 42px, label 12px muted above. Focus = green border + `0 0 0 3px rgba(21,102,63,.10)` ring.

---

## 2 — QC client + Active as toggles

Replace the static QC client / Active **badges** with **toggles**, placed inline at the **end of the Company row, after VAT/CNPJ**, bottom-aligned to the inputs:

- **Stacked** (QC client on top, Active below), **right-aligned** (switches line up on the right edge, labels to their left).
- **No bordered box** around them. Small switches (~30×18). QC client switch = green when on; Active = ink/black when on.
- **QC client toggle gates dependent sections.** When off → the **QC services** card and **Quality specs** section hide and the client becomes trading-only. Existing QC config is **kept, not deleted** — restored when toggled back on. Show a brief inline note on toggle-off explaining this.

---

## 3 — Address synced from the Wolthers System

sys and qc share the same database — the address already lives in sys. The QC client links to a sys company (`sys_company_id` or equivalent) and the address is read from there.

**Linked state (default):**
- A **sync banner** above the fields: "Synced from Wolthers System · {company} · SYS#{ref}", blue/info styling.
- Address fields are **populated and read-only**, marked with a small blue sync glyph.
- **Re-pull** action — refresh values from sys.
- **Edit manually** action — unlocks the fields for a **QC-only override**. Banner turns **amber** ("Manual override — won't sync"); action flips to **Re-link & sync**.
- Legal name and VAT/CNPJ can ride the same link (also sys master data).

**Unlinked state:**
- Banner becomes a **"Find company in Wolthers System"** search to link.
- **Google Places autocomplete** on the street field as the manual fallback (we already use Maps) — auto-fills city/state/postal/country.

**Field layout inside the group:**
- **Country** (select) first — drives the labels below.
- **Street address** (full width / spans 2).
- **City · State/Province · ZIP·CEP** on one line.
- **Adaptive labels** by country: Brazil → `CNPJ` / `CEP`; US → `ZIP`; EU → `VAT` / `Postcode`. Stops the form looking Brazil-only.

---

## 4 — Roles as multi-select chips

Client roles were radios but a client is often several at once (e.g. Exporter **and** Trader). Convert **Producer · Cooperative · Exporter · Importer · Roaster · Final Importer · End Client** to **multi-select chips** (checkbox semantics): green fill + check when selected, matching the cert-modal toggle language.

---

## Open decisions (confirm before building)

1. **Sync direction.** Mockup assumes address is **read-only from sys** with manual edits staying **local to QC** (sys = single source of truth). If traders expect edits here to **write back** to sys, that's different wiring — decide first.
2. **Adaptive labels.** Wire the country→label map (CNPJ/CEP vs VAT/ZIP, etc.) or keep static `VAT / CNPJ / CEP` since most clients are Brazilian?
3. **What the sys link feeds.** Address only, or also legal name + VAT/CNPJ + contact?

---

## Checkpoints (ralph-loop)

1. Form regrouped (Company/Contact/Address/Roles), fantasy narrowed, fields restyled — typecheck + lint, commit.
2. QC client + Active toggles in place, stacked/right-aligned/boxless, QC toggle hides dependent sections (config retained) — typecheck + lint, commit.
3. Address sync: linked banner, read-only synced fields, re-pull, manual override (amber), unlinked search + Places fallback — typecheck + lint, commit.
4. Roles → multi-chips; country select + adaptive labels (if approved) — typecheck + lint, commit.

## Out of scope

No schema changes beyond the `sys_company_id` link (if not already present) and `is_qc_client`. Address remains owned by sys; this is presentation + linking only.
