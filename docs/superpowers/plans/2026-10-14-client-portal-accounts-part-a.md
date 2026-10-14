# Client Portal Accounts — Part A: Foundation (Tasks 1–7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Read first: the plan index `docs/superpowers/plans/2026-10-14-client-portal-accounts.md` (Global Constraints, Review Focus, Ship order) and the spec `docs/superpowers/specs/2026-10-14-client-portal-accounts-design.md`.

---

### Task 1: Spike — Microsoft sign-in for a server-created external login

> **Deferred to Daniel after ship (ruling, 2026-10-14).** The spike needs Daniel's Supabase dashboard and a non-Wolthers Microsoft work account. Implementers skip this task: `NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN` stays unset, so the accept page offers email + password only. Daniel runs the steps below later and sets the flag only if it passes.

The accept flow (Task 13) creates the login on the server, then the person may sign in with Microsoft. That only works if (a) the Supabase Azure provider accepts accounts outside the Wolthers tenant and (b) Supabase links the Microsoft identity to the existing login by email. This task finds out. It produces a decision, not code. Daniel has to do the dashboard and Microsoft steps; the implementer prepares and reads results.

**Files:** none committed. Scratch script in the session scratchpad only.

**Produces:** a recorded decision: `NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN` is set to `true` on Vercel only if the spike passes. Task 13 reads that flag on the server (`microsoftSignInEnabled()`), and the accept page (Task 17) shows "Continue with Microsoft" only when `GET /api/portal/accept` answers `microsoft: true`; unset means the accept page offers email + password only.

- [ ] **Step 1: Ask Daniel for the Azure provider tenant**

Ask Daniel to open Supabase Dashboard → Authentication → Sign In / Providers → Azure and read the **Azure Tenant URL**.
- `https://login.microsoftonline.com/<a tenant GUID>` (Wolthers only): Microsoft sign-in cannot work for client companies. Record "password only" and go to Step 6. Opening it up (multi-tenant app + `organizations` tenant URL) is Daniel's separate decision, not part of this plan.
- Ends in `/common` or `/organizations`: continue.

- [ ] **Step 2: Create a server-side test login** (only with a non-Wolthers Microsoft work account Daniel controls)

Scratch file `$SCRATCHPAD/spike-ms-link.mjs`:

```js
// node --env-file=.env.local spike-ms-link.mjs someone@client-domain.com
import { createClient } from '@supabase/supabase-js'

const email = process.argv[2].trim().toLowerCase()
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const { data, error } = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
  user_metadata: { full_name: 'Portal spike' },
})
console.log(error ? { error: error.message } : { id: data.user.id })
```

Run from the WAQC repo root: `node --env-file=.env.local $SCRATCHPAD/spike-ms-link.mjs <email>`. Expected: `{ id: '<uuid>' }`.

- [ ] **Step 3: Daniel signs in with Microsoft**

In a private window on https://qc.wolthers.com, "Continue with Microsoft" with that account.

- [ ] **Step 4: Check the identities** (Daniel pastes)

```sql
SELECT u.id, u.email, i.provider, i.created_at
FROM auth.users u
LEFT JOIN auth.identities i ON i.user_id = u.id
WHERE lower(u.email) = lower('someone@client-domain.com')
ORDER BY i.created_at;
```

Pass: exactly one `u.id`, with an `email` identity and an `azure` identity. Fail: two different `u.id` values, or the sign-in showed an error (for example "email not verified" or "already registered").

- [ ] **Step 5: Clean up**

```sql
SELECT id FROM public.profiles WHERE lower(email) = lower('someone@client-domain.com');
```

If that returns a row, Daniel deletes it in the Table editor. Then delete the login in Supabase → Authentication → Users (or `admin.auth.admin.deleteUser(id)` from the scratch script).

- [ ] **Step 6: Record the decision**

Tell Daniel the result and write it in the SDD ledger / session notes. Pass: Daniel sets `NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN=true` on Vercel (Production) when Part C ships. Fail or Wolthers-only tenant: leave it unset.

---

### Task 2: QC key registry

QC owns every grant key that starts with `qc_`, including its own company-admin key `qc_manage_users`. sys's `manage_users` is sys's key: WAQC never grants it, removes it or treats it as QC admin (spec §2 decision 5, revised 2026-10-14). Because `qc_manage_users` is a `qc_` key, sys keeps it on every sys write like any other QC key (Task 3), and `mergeQcKeys` needs no special case for it. It never comes out of `normalizeQcKeys` or `clampQcKeys`: only staff set it, through the explicit company-admin flag (Task 9 `setQcAccess({ manageUsers })`).

**Files:**
- Create: `src/lib/portal/qc-keys.ts`
- Test: `src/lib/portal/qc-keys.test.ts`

**Interfaces:**
- Produces:
  - `QC_VIEWS`, `QC_CAPABILITIES` (readonly tuples), types `QcView`, `QcCapability`
  - `QC_MANAGE_USERS = 'qc_manage_users'` (QC company admin; not in `QC_CAPABILITIES`, never in a `QcKeySet`)
  - `interface QcKeySet { views: QcView[]; capabilities: QcCapability[] }`
  - `QC_KEY_LABELS: Record<QcView | QcCapability, string>`
  - `type QcPresetKey = 'full' | 'cupper' | 'viewer'`; `QC_PRESETS: { key: QcPresetKey; label: string; keys: QcKeySet }[]`
  - `isQcKey(key: string): boolean`
  - `normalizeQcKeys(input: { views?: unknown; capabilities?: unknown }): QcKeySet`
  - `clampQcKeys(requested: QcKeySet, ceiling: { views?: readonly string[] | null; capabilities?: readonly string[] | null }): QcKeySet`
  - `qcKeysOf(grant: { views?: readonly string[] | null; capabilities?: readonly string[] | null }): QcKeySet`
  - `hasQcView(grant): boolean` (at least one `qc_` view)
  - `holdsQcKey(grant): boolean` (any `qc_` key in `views` or `capabilities`, the admin key included)
  - `isQcAccessRow(row: { source?: string | null; views?: readonly string[] | null; capabilities?: readonly string[] | null }): boolean` (a direct row, `source <> 'group'`, with at least one `qc_` view: the only kind of row that opens the QC portal)
  - `mergeQcKeys(existing: readonly string[] | null | undefined, nextQc: readonly string[]): string[]`
  - `isCompanyAdmin(grant: { capabilities?: readonly string[] | null }): boolean` (holds `qc_manage_users`)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/portal/qc-keys.test.ts
import { describe, expect, it } from 'vitest'
import {
  QC_CAPABILITIES, QC_MANAGE_USERS, QC_PRESETS, QC_VIEWS, clampQcKeys, hasQcView, holdsQcKey, isCompanyAdmin,
  isQcAccessRow, isQcKey, mergeQcKeys, normalizeQcKeys, qcKeysOf,
} from './qc-keys'

describe('registry', () => {
  it('lists the QC views and capabilities', () => {
    expect(QC_VIEWS).toEqual([
      'qc_samples', 'qc_certificates', 'qc_dashboard', 'qc_supplier_review', 'qc_reports', 'qc_specs', 'qc_cupping',
    ])
    expect(QC_CAPABILITIES).toEqual(['qc_spec_edit', 'qc_cupping_score'])
  })

  it('owns its own company-admin key, outside the grantable capabilities', () => {
    expect(QC_MANAGE_USERS).toBe('qc_manage_users')
    expect(QC_CAPABILITIES as readonly string[]).not.toContain(QC_MANAGE_USERS)
  })

  it('has presets that only use registry keys and never an admin key', () => {
    for (const preset of QC_PRESETS) {
      expect(normalizeQcKeys(preset.keys)).toEqual(preset.keys)
      expect(preset.keys.capabilities as string[]).not.toContain('qc_manage_users')
      expect(preset.keys.capabilities as string[]).not.toContain('manage_users')
    }
    expect(QC_PRESETS.map((p) => p.key)).toEqual(['full', 'cupper', 'viewer'])
  })
})

describe('isQcKey', () => {
  it('is the qc_ prefix, the admin key included', () => {
    expect(isQcKey('qc_samples')).toBe(true)
    expect(isQcKey('qc_manage_users')).toBe(true)
    expect(isQcKey('manage_users')).toBe(false)
    expect(isQcKey('samples')).toBe(false)
  })
})

describe('normalizeQcKeys', () => {
  it('keeps known QC keys in registry order without duplicates and drops everything else', () => {
    expect(normalizeQcKeys({
      views: ['qc_reports', 'contracts', 'qc_samples', 'qc_samples', 42, 'qc_unknown'],
      capabilities: ['manage_users', 'qc_manage_users', 'qc_cupping_score', 'fixation_request'],
    })).toEqual({ views: ['qc_samples', 'qc_reports'], capabilities: ['qc_cupping_score'] })
  })

  it('treats a non-array as empty', () => {
    expect(normalizeQcKeys({ views: 'qc_samples', capabilities: null })).toEqual({ views: [], capabilities: [] })
  })
})

describe('clampQcKeys', () => {
  it('intersects with the ceiling', () => {
    expect(clampQcKeys(
      { views: ['qc_samples', 'qc_dashboard'], capabilities: ['qc_spec_edit'] },
      { views: ['qc_samples', 'contracts'], capabilities: ['qc_manage_users'] },
    )).toEqual({ views: ['qc_samples'], capabilities: [] })
  })

  it('never yields an admin key, even when the ceiling holds it', () => {
    const requested = { views: [], capabilities: ['qc_manage_users', 'manage_users'] } as any
    expect(clampQcKeys(requested, { capabilities: ['qc_manage_users', 'manage_users'] }).capabilities).toEqual([])
  })

  it('treats a missing ceiling as empty', () => {
    expect(clampQcKeys({ views: ['qc_samples'], capabilities: [] }, {})).toEqual({ views: [], capabilities: [] })
  })
})

describe('mergeQcKeys', () => {
  it('replaces only the QC part and keeps every other key in its order', () => {
    expect(mergeQcKeys(['contracts', 'qc_samples', 'shipments', 'qc_reports'], ['qc_dashboard']))
      .toEqual(['contracts', 'shipments', 'qc_dashboard'])
  })

  it('treats qc_manage_users like any QC key and sys manage_users like any sys key', () => {
    expect(mergeQcKeys(['manage_users', 'qc_manage_users', 'qc_spec_edit', 'see_prices'], []))
      .toEqual(['manage_users', 'see_prices'])
    expect(mergeQcKeys(['fixation_request'], ['qc_spec_edit', 'qc_manage_users']))
      .toEqual(['fixation_request', 'qc_spec_edit', 'qc_manage_users'])
  })

  it('ignores non-QC keys in the new set and drops duplicates', () => {
    expect(mergeQcKeys(null, ['qc_samples', 'contracts', 'qc_samples'])).toEqual(['qc_samples'])
  })
})

describe('grant readers', () => {
  const grant = { views: ['contracts', 'qc_samples'], capabilities: ['manage_users', 'qc_manage_users', 'qc_cupping_score'] }

  it('reads the grantable QC keys of a grant, never the admin key', () => {
    expect(qcKeysOf(grant)).toEqual({ views: ['qc_samples'], capabilities: ['qc_cupping_score'] })
  })

  it('needs a QC view, not just a QC capability, to open the portal', () => {
    expect(hasQcView(grant)).toBe(true)
    expect(hasQcView({ views: ['contracts'], capabilities: ['qc_spec_edit'] })).toBe(false)
    expect(hasQcView({ views: null, capabilities: null })).toBe(false)
  })

  it('knows a QC company admin by qc_manage_users only', () => {
    expect(isCompanyAdmin(grant)).toBe(true)
    expect(isCompanyAdmin({ capabilities: ['manage_users', 'qc_spec_edit'] })).toBe(false)
    expect(isCompanyAdmin({ capabilities: null })).toBe(false)
  })

  it('holdsQcKey sees any qc_ key, the admin key included', () => {
    expect(holdsQcKey({ views: ['contracts'], capabilities: ['qc_manage_users'] })).toBe(true)
    expect(holdsQcKey({ views: ['contracts'], capabilities: ['manage_users', 'see_prices'] })).toBe(false)
  })

  it('only a direct row with a QC view opens the portal; a group copy never does', () => {
    expect(isQcAccessRow({ ...grant, source: 'admin' })).toBe(true)
    expect(isQcAccessRow({ ...grant, source: 'group' })).toBe(false)
    expect(isQcAccessRow({ views: ['contracts'], capabilities: ['qc_spec_edit'], source: 'manager' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/portal/qc-keys.test.ts`
Expected: FAIL, cannot resolve `./qc-keys`.

- [ ] **Step 3: Implement**

```ts
// src/lib/portal/qc-keys.ts
/**
 * QC keys on sys's external_user_company_grants rows (spec §5). QC owns every
 * key that starts with `qc_`; sys owns every other key and never adds or
 * removes a qc_ key (sys keepForeignKeys).
 *
 * QC's company admin is `qc_manage_users`, a QC key. sys's `manage_users` is
 * sys's own: WAQC never grants it, removes it or reads it as QC admin
 * (decision 5, revised 2026-10-14 after sys D3 let any sys portal admin grant
 * manage_users). Only Wolthers staff set qc_manage_users, through the explicit
 * company-admin flag; it never comes out of normalizeQcKeys or clampQcKeys.
 */

export const QC_VIEWS = [
  'qc_samples',
  'qc_certificates',
  'qc_dashboard',
  'qc_supplier_review',
  'qc_reports',
  'qc_specs',
  'qc_cupping',
] as const
export type QcView = (typeof QC_VIEWS)[number]

export const QC_CAPABILITIES = ['qc_spec_edit', 'qc_cupping_score'] as const
export type QcCapability = (typeof QC_CAPABILITIES)[number]

/** QC company admin: manages the company's QC team. Staff-granted only. */
export const QC_MANAGE_USERS = 'qc_manage_users'

export interface QcKeySet {
  views: QcView[]
  capabilities: QcCapability[]
}

export const QC_KEY_LABELS: Record<QcView | QcCapability, string> = {
  qc_samples: 'Samples and contracts',
  qc_certificates: 'Certificates',
  qc_dashboard: 'Dashboard',
  qc_supplier_review: 'Supplier review',
  qc_reports: 'Reports',
  qc_specs: 'Quality specs',
  qc_cupping: 'Cupping sessions',
  qc_spec_edit: 'Create and edit quality specs',
  qc_cupping_score: 'Score in cupping sessions',
}

export type QcPresetKey = 'full' | 'cupper' | 'viewer'

export const QC_PRESETS: { key: QcPresetKey; label: string; keys: QcKeySet }[] = [
  { key: 'full', label: 'Full', keys: { views: [...QC_VIEWS], capabilities: [...QC_CAPABILITIES] } },
  {
    key: 'cupper',
    label: 'Cupper',
    keys: { views: ['qc_samples', 'qc_certificates', 'qc_cupping'], capabilities: ['qc_cupping_score'] },
  },
  {
    key: 'viewer',
    label: 'Viewer',
    keys: { views: ['qc_samples', 'qc_certificates', 'qc_dashboard', 'qc_reports'], capabilities: [] },
  },
]

export function isQcKey(key: string): boolean {
  return key.startsWith('qc_')
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** Known grantable QC keys only, in registry order, without duplicates. Never the admin key. */
export function normalizeQcKeys(input: { views?: unknown; capabilities?: unknown }): QcKeySet {
  const views = new Set(strings(input.views))
  const capabilities = new Set(strings(input.capabilities))
  return {
    views: QC_VIEWS.filter((k) => views.has(k)),
    capabilities: QC_CAPABILITIES.filter((k) => capabilities.has(k)),
  }
}

/**
 * What a company admin may hand out: the requested QC keys that the admin
 * holds. Neither admin key is in QC_CAPABILITIES, so none can come out of here.
 */
export function clampQcKeys(
  requested: QcKeySet,
  ceiling: { views?: readonly string[] | null; capabilities?: readonly string[] | null },
): QcKeySet {
  const views = new Set(ceiling.views ?? [])
  const capabilities = new Set(ceiling.capabilities ?? [])
  const wanted = normalizeQcKeys(requested)
  return {
    views: wanted.views.filter((k) => views.has(k)),
    capabilities: wanted.capabilities.filter((k) => capabilities.has(k)),
  }
}

/** The grantable QC keys a grant row holds (the admin flag is read with isCompanyAdmin). */
export function qcKeysOf(grant: { views?: readonly string[] | null; capabilities?: readonly string[] | null }): QcKeySet {
  return normalizeQcKeys({ views: grant.views ?? [], capabilities: grant.capabilities ?? [] })
}

/** A grant opens the QC portal only with at least one QC view. */
export function hasQcView(grant: { views?: readonly string[] | null; capabilities?: readonly string[] | null }): boolean {
  return qcKeysOf(grant).views.length > 0
}

/** Any qc_ key on the row, the admin key included. */
export function holdsQcKey(grant: { views?: readonly string[] | null; capabilities?: readonly string[] | null }): boolean {
  return (grant.views ?? []).some(isQcKey) || (grant.capabilities ?? []).some(isQcKey)
}

/**
 * The only kind of row that gives QC portal access: a direct grant (not a
 * source = 'group' copy, which sys's 0770 trigger makes of a sister
 * company's grant) holding a QC view. QC access is granted per company.
 */
export function isQcAccessRow(row: {
  source?: string | null
  views?: readonly string[] | null
  capabilities?: readonly string[] | null
}): boolean {
  return row.source !== 'group' && hasQcView(row)
}

/**
 * Replace the QC part of a key array; every other key stays, in its order.
 * qc_manage_users is a QC key like any other: a caller that wants to keep it
 * passes it in nextQc.
 */
export function mergeQcKeys(existing: readonly string[] | null | undefined, nextQc: readonly string[]): string[] {
  const kept = (existing ?? []).filter((k) => !isQcKey(k))
  const qc = nextQc.filter(isQcKey)
  return [...kept, ...qc.filter((k, i) => qc.indexOf(k) === i)]
}

/** QC company admin. sys's manage_users does not count. */
export function isCompanyAdmin(grant: { capabilities?: readonly string[] | null }): boolean {
  return (grant.capabilities ?? []).includes(QC_MANAGE_USERS)
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/portal/qc-keys.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal/qc-keys.ts src/lib/portal/qc-keys.test.ts
git commit -m "feat(portal): QC key registry for sys grant rows — qc_ views, capabilities, qc_manage_users, presets, clamp and merge"
```

---

### Task 3: sys — keep foreign `qc_` keys on every sys grant write

**Repo:** sys, `/Users/danielwolthers/Documents/GitHub/Wolthers-system/wolthers-app`. Its local `main` is far out of sync with `origin/main` and other sessions use worktrees there, so **never work on or read the local `main`**. This task was written against sys `origin/main` at `cb1171376` (the library, route and test files below are unchanged since `e3dd96c3c`, when portal admins & partners, D3/D4 and invite-only landed; line numbers quoted are from `cb1171376`). Work in a fresh worktree from `origin/main`:

```bash
cd /Users/danielwolthers/Documents/GitHub/Wolthers-system/wolthers-app
git fetch origin
git worktree add "$SCRATCHPAD/sys-qc-keys" -b feat/keep-qc-grant-keys origin/main
cd "$SCRATCHPAD/sys-qc-keys" && npm ci
git log --oneline cb1171376..HEAD -- src/lib/portal/capabilities.ts "src/app/api/portal/team" "src/app/api/management/users/[id]/company-grants" vitest.config.ts
```

If that last command prints anything, those files moved after this task was written: re-read them, apply the same changes at the new places, and say so in your report.

**What this changes, and why.** QC (qc.wolthers.com) writes keys starting with `qc_` onto the same `external_user_company_grants` rows sys uses. Today every sys write of `views`/`capabilities` replaces the whole arrays (the clamps drop unknown keys), and the staff editor answers 400 on a `qc_` key. After this task sys treats every `qc_` key as foreign: each sys write keeps the `qc_` keys the row already has, and a sys removal of a person who also has QC access drops only sys's keys. QC's company admin is `qc_manage_users`, a `qc_` key, so it needs no special case. sys's own `manage_users` gets no special handling either: D3 (promote/demote within the ceiling) stays exactly as it is.

Paths and what each needs (sys `origin/main`):

| Path | Today | Change |
|---|---|---|
| Portal PATCH `team/[userId]` (edit, promote, demote) | replaces both arrays; mirrors them to `contacts` | merge `qc_` keys back; mirror, log and answer with sys's keys only |
| Portal DELETE `team/[userId]` (Remove) | deletes the row | a row with `qc_` keys keeps them and loses only sys's keys |
| Portal POST `team` (invite, re-invite, Resend) | upsert replaces both arrays | merge `qc_` keys back; `contacts` stays sys-only (it already is) |
| Staff PATCH `management/users/[id]/company-grants` (grant editor, Matrix, contact drawer) | 400 on any `qc_` key; replaces arrays | skip `qc_` keys when validating; merge them back through the existing `current` read |
| Staff POST `company-grants` | writes no arrays | none |
| Staff DELETE `company-grants` | full delete | none (a Wolthers admin removing a grant removes it entirely) |
| `grantInvitedOnActivation` (`src/lib/auth/provision-user.ts`) | insert only | none |

Every grant read in these routes keeps `source, staff_locked`: `canPortalEditGrant` (`src/lib/portal/grant-guard.ts`) reads both, and dropping them would switch off the Wolthers lock and the group-row refusal.

**Files (sys repo):**
- Modify: `src/lib/portal/capabilities.ts` (helpers; backfill convention comment)
- Modify: `src/lib/portal/capabilities.test.ts` (already registered in `vitest.config.ts`)
- Modify: `src/app/api/portal/team/[userId]/route.ts` (PATCH and DELETE)
- Modify: `src/app/api/portal/team/route.ts` (POST)
- Modify: `src/app/api/management/users/[id]/company-grants/route.ts` (PATCH)
- Modify: `src/app/api/portal/team/route.test.ts` (already registered; it runs both team routes on fake tables with the real manager gate)
- Create: `src/app/api/management/users/[id]/company-grants/route.test.ts`
- Modify: `vitest.config.ts` (register the new staff route test)

**Interfaces:**
- Produces (sys): `FOREIGN_KEY_PREFIX = "qc_"`, `isForeignKey(key: string): boolean`, `keepForeignKeys(existing: readonly string[] | null | undefined, next: readonly string[]): string[]` (sys's keys from `next`, then the foreign keys `existing` had)

- [ ] **Step 1: Write the failing pure test**

In `src/lib/portal/capabilities.test.ts`, extend the import at the top to

```ts
import {
  ALL_CAPABILITIES, ALL_VIEWS, DEFAULT_ON_CAPABILITIES, DEFAULT_VIEWS, DETAIL_CAPABILITIES,
  clampToCeiling, clampViewsToCeiling, isDetailCapability, isForeignKey, keepForeignKeys, viewForCapability,
} from "./capabilities";
```

and append at the end of the file:

```ts
describe("foreign (QC app) keys on a grant", () => {
  it("recognises the qc_ prefix only", () => {
    expect(isForeignKey("qc_samples")).toBe(true);
    expect(isForeignKey("qc_manage_users")).toBe(true);
    expect(isForeignKey("samples")).toBe(false);
    expect(isForeignKey("manage_users")).toBe(false);
  });

  it("keeps the existing qc_ keys when sys rewrites its own keys", () => {
    expect(keepForeignKeys(["contracts", "qc_samples", "qc_reports"], ["shipments"]))
      .toEqual(["shipments", "qc_samples", "qc_reports"]);
  });

  it("never lets a sys write add or drop a qc_ key", () => {
    expect(keepForeignKeys(["qc_samples"], ["contracts", "qc_dashboard"])).toEqual(["contracts", "qc_samples"]);
    expect(keepForeignKeys(null, ["contracts", "qc_dashboard"])).toEqual(["contracts"]);
    expect(keepForeignKeys(["manage_users", "qc_manage_users"], ["booking_quotes"]))
      .toEqual(["booking_quotes", "qc_manage_users"]);
  });

  it("the clamps still drop qc_ keys, so the merge is what keeps them", () => {
    expect(clampToCeiling(["qc_spec_edit", "booking_quotes"], ["qc_spec_edit", "booking_quotes"])).toEqual(["booking_quotes"]);
    expect(clampViewsToCeiling(["qc_samples", "contracts"], ["qc_samples", "contracts"])).toEqual(["contracts"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/portal/capabilities.test.ts`
Expected: FAIL, `isForeignKey` / `keepForeignKeys` are not exported.

- [ ] **Step 3: Implement the helpers and the backfill convention** (`src/lib/portal/capabilities.ts`)

Replace the doc comment directly above `export const DEFAULT_ON_CAPABILITIES` (`/** Backfilled onto every pre-0316 grant; these actions are on by default.` … `Mirrors the grants column DEFAULT (last re-set by 0871). */`) with:

```ts
/** Backfilled onto every pre-0316 grant; these actions are on by default.
 *  Mirrors the grants column DEFAULT (last re-set by 0871).
 *
 *  Convention for any future "new default-on key, backfilled onto every
 *  grant" migration (0860 did it with the dashboard view, 0868 and 0871 with
 *  capabilities): skip rows that hold no sys view, i.e. add
 *  `WHERE views && ARRAY['contracts','shipments','fixations','documents','samples','dashboard']`.
 *  Rows without a sys view exist only for the QC app (qc.wolthers.com, keys
 *  starting with qc_, see keepForeignKeys below); a sys view backfilled onto
 *  them opens sys pages to people who were only given QC access. */
```

Append at the end of the file:

```ts
/**
 * Keys owned by the QC app (qc.wolthers.com) on the same grant rows, its
 * company-admin key qc_manage_users included. sys never adds or removes them:
 * every sys write of views/capabilities on an existing grant passes through
 * keepForeignKeys, so a sys team edit, Remove, re-invite or staff edit cannot
 * strip a person's QC access. The clamps above drop them from what a caller
 * sends; this puts back what the row already had. WAQC spec:
 * docs/superpowers/specs/2026-10-14-client-portal-accounts-design.md §5.
 */
export const FOREIGN_KEY_PREFIX = "qc_";

export function isForeignKey(key: string): boolean {
  return key.startsWith(FOREIGN_KEY_PREFIX);
}

/** sys's own keys from `next`, then the foreign keys `existing` already had. */
export function keepForeignKeys(
  existing: readonly string[] | null | undefined,
  next: readonly string[],
): string[] {
  return [...next.filter((k) => !isForeignKey(k)), ...(existing ?? []).filter(isForeignKey)];
}
```

- [ ] **Step 4: Run the pure test**

Run: `npx vitest run src/lib/portal/capabilities.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route tests** (`src/app/api/portal/team/route.test.ts`)

Append at the end of the file (it already defines `db`, `COMPANY`, `INVITE`, `post`, `remove`, `patch`, `seedMember`, `grantsOf` and `profileOf`; `seedMember` puts the person at `${id}@adcoffee.nl` with the grant you pass):

```ts
describe("the QC app's qc_ keys survive every sys team write (2026-10-14)", () => {
  it("PATCH rewrites sys's keys and keeps the row's qc_ keys; contacts, activity and response get sys's keys only", async () => {
    seedMember("q-1", { views: ["contracts", "qc_samples"], capabilities: ["booking_quotes", "qc_cupping_score", "qc_manage_users"] });
    db.tables.contacts.push({
      id: "c-q1", company_id: COMPANY, email: "q-1@adcoffee.nl", name: "Q",
      portal_views: ["contracts"], portal_capabilities: ["booking_quotes"], is_active: true,
    });

    const { status, json } = await patch("q-1", {
      company_id: COMPANY, views: ["shipments", "qc_dashboard"], capabilities: ["qc_spec_edit"],
    });

    expect(status).toBe(200);
    expect(grantsOf("q-1")[0]).toMatchObject({
      views: ["shipments", "qc_samples"],
      capabilities: ["qc_cupping_score", "qc_manage_users"],
    });
    expect(db.tables.contacts.find((c) => c.id === "c-q1")).toMatchObject({ portal_views: ["shipments"], portal_capabilities: [] });
    expect(json).toEqual({ ok: true, views: ["shipments"], capabilities: [] });
    expect(JSON.stringify(db.tables.portal_activity)).not.toContain("qc_");
  });

  it("DELETE of a member who also has QC access drops only sys's keys and keeps the row", async () => {
    seedMember("q-2", { views: ["contracts", "qc_samples"], capabilities: ["booking_quotes", "see_prices", "qc_manage_users"] });

    expect((await remove("q-2")).status).toBe(200);

    expect(grantsOf("q-2")).toEqual([expect.objectContaining({ views: ["qc_samples"], capabilities: ["qc_manage_users"] })]);
    expect(profileOf("q-2")?.status).toBe("active");
  });

  it("DELETE of a sys-only member still deletes the row", async () => {
    seedMember("s-1");
    expect((await remove("s-1")).status).toBe(200);
    expect(grantsOf("s-1")).toEqual([]);
  });

  it("a re-invite (and so Resend) keeps the row's qc_ keys; the contact gets sys's keys only", async () => {
    seedMember("q-3", { views: ["qc_samples"], capabilities: ["qc_cupping_score"] });

    const { status } = await post({ ...INVITE, email: "q-3@adcoffee.nl", views: ["contracts"], capabilities: ["booking_quotes"] });

    expect(status).toBe(200);
    expect(grantsOf("q-3")[0]).toMatchObject({
      views: ["contracts", "qc_samples"],
      capabilities: ["booking_quotes", "qc_cupping_score"],
    });
    expect(db.tables.contacts).toEqual([
      expect.objectContaining({ email: "q-3@adcoffee.nl", portal_views: ["contracts"], portal_capabilities: ["booking_quotes"] }),
    ]);
  });

  it("the Wolthers lock and the group refusal still hold with the wider selects", async () => {
    seedMember("q-4", { views: ["contracts", "qc_samples"], capabilities: ["manage_users", "qc_manage_users"], staff_locked: true });
    seedMember("q-5", { source: "group", views: ["qc_samples"], capabilities: [] });
    const before = JSON.stringify(db.tables.external_user_company_grants);

    expect((await patch("q-4", { company_id: COMPANY, views: [] })).status).toBe(409);
    expect((await remove("q-4")).status).toBe(409);
    expect((await patch("q-5", { company_id: COMPANY, views: [] })).status).toBe(409);
    expect((await remove("q-5")).status).toBe(409);
    expect(JSON.stringify(db.tables.external_user_company_grants)).toBe(before);
  });
});
```

Run: `npx vitest run src/app/api/portal/team/route.test.ts`
Expected: the five new tests FAIL (qc_ keys stripped, row deleted); every older test in the file still passes.

- [ ] **Step 6: Team member PATCH keeps QC keys** (`src/app/api/portal/team/[userId]/route.ts`)

Import line (line 12) becomes:

```ts
import { clampToCeiling, clampViewsToCeiling, isForeignKey, keepForeignKeys } from "@/lib/portal/capabilities";
```

In PATCH, the target grant read (line 60) keeps `source, staff_locked` and adds `views`:

```ts
    .select("views, capabilities, source, staff_locked")
```

Replace the `const update: Record<string, string[]> = {};` block with its two `if (body.… !== undefined)` branches (lines 80–92) with:

```ts
  // `update` is what the row gets: sys's clamped keys plus the qc_ keys the
  // row already holds (the QC app's access is not this panel's to change).
  // `sysOnly` is sys's part alone: the contacts mirror, the activity log and
  // the response use it.
  const update: Record<string, string[]> = {};
  const sysOnly: Record<string, string[]> = {};
  if (body.views !== undefined) {
    const requested = (body.views as unknown[]).filter(
      (v): v is string => typeof v === "string",
    );
    sysOnly.views = clampViewsToCeiling(requested, managerGrant?.views ?? []);
    update.views = keepForeignKeys(targetGrant.views, sysOnly.views);
  }
  if (body.capabilities !== undefined) {
    const requested = (body.capabilities as unknown[]).filter(
      (c): c is string => typeof c === "string",
    );
    sysOnly.capabilities = clampToCeiling(requested, managerGrant?.capabilities ?? []);
    update.capabilities = keepForeignKeys(targetGrant.capabilities, sysOnly.capabilities);
  }
```

The `Object.keys(update).length === 0` check, `resultCaps`, `grantWrite`, the update itself, and `wasAdmin`/`isAdmin` (lines 93–112, 143–152) stay as they are: `manage_users` is not a foreign key, so D3 promote/demote is unchanged.

The contacts mirror (lines 130–132) takes sys's keys only (`contacts.portal_*` is sys's staged access; a `qc_` key there would be copied onto a grant at activation):

```ts
      const contactUpdate: Record<string, string[]> = {};
      if (sysOnly.views) contactUpdate.portal_views = sysOnly.views;
      if (sysOnly.capabilities) contactUpdate.portal_capabilities = sysOnly.capabilities;
```

The `team_update` activity payload (line 141) becomes `payload: { target_user_id: targetUserId, ...sysOnly },` and the final response (line 154) becomes:

```ts
  return NextResponse.json({ ok: true, views: sysOnly.views, capabilities: sysOnly.capabilities });
```

- [ ] **Step 7: Team member DELETE keeps QC access** (same file)

The target grant read (line 193) keeps `source, staff_locked` and adds the arrays:

```ts
    .select("source, staff_locked, views, capabilities")
```

Replace only the delete block and its two checks (lines 201–210, from `const { data: deleted, error: delErr } = await admin` through the `No such grant` 404) with:

```ts
  const qcViews = (targetGrant.views ?? []).filter(isForeignKey);
  const qcCaps = (targetGrant.capabilities ?? []).filter(isForeignKey);
  if (qcViews.length + qcCaps.length > 0) {
    // The person also has QC portal access on this row (qc.wolthers.com). That
    // is not this panel's to remove: drop only sys's keys and keep the row.
    const { data: kept, error: updErr } = await admin
      .from("external_user_company_grants")
      .update({ views: qcViews, capabilities: qcCaps })
      .eq("user_id", targetUserId)
      .eq("company_id", companyId)
      .select("user_id");
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    if (!kept || kept.length === 0) {
      return NextResponse.json({ error: "No such grant for this company." }, { status: 404 });
    }
  } else {
    const { data: deleted, error: delErr } = await admin
      .from("external_user_company_grants")
      .delete()
      .eq("user_id", targetUserId)
      .eq("company_id", companyId)
      .select("user_id");
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: "No such grant for this company." }, { status: 404 });
    }
  }
```

Keep the switch-off block that follows (lines 212–228) and the `team_remove` activity unchanged. A QC person keeps a row, so `remaining` is never empty for them and they are never switched off.

- [ ] **Step 8: Team POST keeps QC keys on an existing row** (`src/app/api/portal/team/route.ts`)

Import line (line 17) becomes:

```ts
import { clampToCeiling, clampViewsToCeiling, DEFAULT_ON_CAPABILITIES, keepForeignKeys } from "@/lib/portal/capabilities";
```

The existing-grant type (line 388) and its read inside `if (existingProfile) {` (line 392) add `views` and keep the guard fields:

```ts
  let existingGrant: { views: string[] | null; capabilities: string[] | null; source: string; staff_locked: boolean | null } | null = null;
```

```ts
      .select("views, capabilities, source, staff_locked")
```

Replace the grant upsert (lines 461–478, `const { error: grantErr } = await admin.from("external_user_company_grants").upsert(` through `{ onConflict: "user_id,company_id" },` and `);`) with:

```ts
  const { error: grantErr } = await admin.from("external_user_company_grants").upsert(
    {
      user_id: targetUserId,
      company_id: companyId,
      source: "manager",
      created_by: user.id,
      // qc_ keys the row already holds (QC app) survive a re-invite or Resend.
      views: keepForeignKeys(existingGrant?.views, clampedViews),
      capabilities: keepForeignKeys(existingGrant?.capabilities, clampedCaps),
      staff_locked: false,
      // A promotion must not reach sister companies the promoter cannot.
      ...(clampedCaps.includes("manage_users") && managerGrant?.group_access !== true ? { group_access: false } : {}),
      // A NEW grant takes the manager's own group_access, never the column
      // default (true) — the manager can't hand out sister companies they
      // can't see. An existing row keeps whatever it had.
      ...(existingGrant ? {} : { group_access: managerGrant?.group_access === true }),
    },
    { onConflict: "user_id,company_id" },
  );
```

Leave the `contacts` writes (lines 428 and 439–440) and the `team_invite` activity payload (lines 539–540) on `clampedViews` / `clampedCaps`: they are sys's keys only.

- [ ] **Step 9: Run the team route tests**

Run: `npx vitest run src/app/api/portal/team/route.test.ts`
Expected: PASS, the whole file.

- [ ] **Step 10: Write the failing staff PATCH test**

```ts
// src/app/api/management/users/[id]/company-grants/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeDb } from "@/lib/test-support/fake-supabase";

// The staff grant editor, the Matrix and the contact drawer all PATCH here.
// The row's qc_ keys (QC app, qc.wolthers.com) are neither validated nor
// written from here: they survive every staff edit of sys's keys (2026-10-14).

let db: FakeDb;
const STAFF = "staff-1";
const USER = "u-1";
const COMPANY = "co-1";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ ...db.client, auth: { getUser: async () => ({ data: { user: { id: STAFF } } }) } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));

beforeEach(() => {
  db = fakeSupabase({
    user_profiles: [{ id: STAFF, permissions: ["admin"] }],
    external_user_company_grants: [{
      user_id: USER, company_id: COMPANY, source: "admin", group_access: false, staff_locked: false,
      views: ["contracts", "qc_samples"], capabilities: ["booking_quotes", "qc_manage_users"],
    }],
  });
});

async function patch(body: unknown) {
  const { PATCH } = await import("./route");
  const res = await PATCH(
    new Request(`http://localhost/api/management/users/${USER}/company-grants`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id: USER }) },
  );
  return { status: res.status, json: await res.json() };
}

const row = () => db.tables.external_user_company_grants[0];

describe("PATCH /api/management/users/[id]/company-grants — qc_ keys", () => {
  it("accepts a body that still carries qc_ keys, and keeps the row's own", async () => {
    const { status } = await patch({
      company_id: COMPANY,
      views: ["shipments", "qc_samples", "qc_dashboard"],
      capabilities: ["request_amendment", "qc_spec_edit"],
    });
    expect(status).toBe(200);
    expect(row()).toMatchObject({
      views: ["shipments", "qc_samples"],
      capabilities: ["request_amendment", "qc_manage_users"],
    });
  });

  it("still refuses an unknown sys key and writes nothing", async () => {
    expect((await patch({ company_id: COMPANY, capabilities: ["nonsense"] })).status).toBe(400);
    expect(row().capabilities).toEqual(["booking_quotes", "qc_manage_users"]);
  });

  it("the Wolthers lock follows sys's manage_users, never qc_manage_users", async () => {
    await patch({ company_id: COMPANY, capabilities: ["booking_quotes"] });
    expect(row().staff_locked).toBe(false);
    await patch({ company_id: COMPANY, capabilities: ["booking_quotes", "manage_users"] });
    expect(row()).toMatchObject({ capabilities: ["booking_quotes", "manage_users", "qc_manage_users"], staff_locked: true });
  });
});
```

Register it in `vitest.config.ts` directly under the existing `"src/app/api/management/invite/route.test.ts",` entry (the "[id]" escape is the config's own convention):

```ts
      // Staff grant PATCH keeps the QC app's qc_ keys (2026-10-14). "[id]" escaped — same trap as above.
      "src/app/api/management/users/\\[id\\]/company-grants/route.test.ts",
```

Run: `npx vitest run src/app/api/management/users`
Expected: FAIL — the first test answers 400 "Unknown views: qc_samples, qc_dashboard".

- [ ] **Step 11: Staff grant PATCH keeps QC keys** (`src/app/api/management/users/[id]/company-grants/route.ts`)

Import line (line 4) becomes:

```ts
import { ALL_CAPABILITIES, ALL_VIEWS, isForeignKey, keepForeignKeys } from "@/lib/portal/capabilities";
```

Replace the two validation blocks in PATCH (lines 123–142, `if (capabilities !== undefined) {` through the `update.views = views;` block's closing brace) with:

```ts
  // qc_ keys belong to the QC app: a client may send back what GET returned,
  // and they are neither validated nor written from here (merged back below).
  if (capabilities !== undefined) {
    if (!Array.isArray(capabilities)) {
      return NextResponse.json({ error: "capabilities must be an array" }, { status: 400 });
    }
    const own = capabilities.filter((c: unknown) => !(typeof c === "string" && isForeignKey(c)));
    const unknown = own.filter((c: unknown) => !(ALL_CAPABILITIES as readonly unknown[]).includes(c));
    if (unknown.length) {
      return NextResponse.json({ error: `Unknown capabilities: ${unknown.join(", ")}` }, { status: 400 });
    }
    update.capabilities = own as string[];
  }
  if (views !== undefined) {
    if (!Array.isArray(views)) {
      return NextResponse.json({ error: "views must be an array" }, { status: 400 });
    }
    const own = views.filter((v: unknown) => !(typeof v === "string" && isForeignKey(v)));
    const unknown = own.filter((v: unknown) => !(ALL_VIEWS as readonly unknown[]).includes(v));
    if (unknown.length) {
      return NextResponse.json({ error: `Unknown views: ${unknown.join(", ")}` }, { status: 400 });
    }
    update.views = own as string[];
  }
```

Extend the existing `current` read (lines 145–149) with `views` and merge right after its 404 check, before `nextStaffLock` (no second read):

```ts
  const { data: current } = await admin
    .from("external_user_company_grants")
    .select("views, capabilities, staff_locked")
    .eq("user_id", id).eq("company_id", company_id).maybeSingle();
  if (!current) return NextResponse.json({ error: "No such grant" }, { status: 404 });
  // The row's qc_ keys (QC app) survive every staff edit of sys's keys.
  if (update.capabilities) update.capabilities = keepForeignKeys(current.capabilities, update.capabilities as string[]);
  if (update.views) update.views = keepForeignKeys(current.views, update.views as string[]);
```

`nextStaffLock` and everything after it stay as they are (the lock follows `manage_users`, which is not foreign).

- [ ] **Step 12: Confirm there is no other sys writer of existing grant arrays**

Run: `git grep -n "external_user_company_grants" -- 'src/*.ts' 'src/*.tsx' | grep -v "\.test\."` and open every hit that calls `.update(`, `.upsert(` or `.insert(` on the table.
Expected writers, all handled above or needing nothing: `src/app/api/portal/team/route.ts` (upsert), `src/app/api/portal/team/[userId]/route.ts` (update, delete), `src/app/api/management/users/[id]/company-grants/route.ts` (POST upsert without arrays, PATCH update, DELETE), `src/lib/auth/provision-user.ts` (insert only). Any other `.update(`/`.upsert(` that writes `views` or `capabilities` on a row that may already exist gets the same `keepForeignKeys(existingRow.views/capabilities, …)` wrap, with its row read keeping any `source, staff_locked` it already selects; list it in the commit message.

- [ ] **Step 13: Typecheck and test**

Run: `npx tsc --noEmit` and `npx vitest run src/lib/portal/capabilities.test.ts src/app/api/portal/team/route.test.ts src/app/api/management/users`
Expected: no type errors; PASS.

- [ ] **Step 14: Commit (sys worktree, branch `feat/keep-qc-grant-keys`)**

```bash
git add src/lib/portal/capabilities.ts src/lib/portal/capabilities.test.ts vitest.config.ts \
  "src/app/api/portal/team/[userId]/route.ts" src/app/api/portal/team/route.ts src/app/api/portal/team/route.test.ts \
  "src/app/api/management/users/[id]/company-grants/route.ts" "src/app/api/management/users/[id]/company-grants/route.test.ts"
git commit -m "fix(portal): sys grant writes keep the QC app's qc_ keys — team edit/remove, re-invite/Resend and staff PATCH no longer strip QC portal access; backfill convention"
```

Report the commit hash and the worktree path. The controller pushes the branch to sys `origin/main` at the end; it must be live on sys before WAQC writes any `qc_` key (plan index, Ship order step 2).

---

### Task 4: SQL foundation — access kind, staff helper, invitations table

**Files:**
- Create: `database/migrations/20261014000001_portal_accounts_foundation.sql`

**Interfaces:**
- Produces (SQL):
  - `public.waqc_access_kind() RETURNS text` — `'external' | 'staff' | 'none'` for `auth.uid()`
  - `public.waqc_is_staff() RETURNS boolean`
  - table `public.portal_invitations` (spec §6.5), RLS on, no policies

- [ ] **Step 1: Write the migration**

```sql
-- Client portal accounts, foundation (spec 2026-10-14-client-portal-accounts-design.md).
--
-- 1. waqc_access_kind(): how WAQC treats the caller. Same rule as
--    classifyAccessKind() in src/lib/auth/access-kind.ts; keep them equal.
--      external: user_profiles.user_type = 'external' (always wins)
--      staff:    a profiles row with a role other than client/supplier/buyer
--      none:     everyone else
-- 2. waqc_is_staff(): the staff test for row-level policies (the older
--    is_waqc_staff never reached the live database).
-- 3. portal_invitations: pending QC portal invitations. Only the SHA-256
--    of each token is stored. Service role only: RLS on, no policies.
--
-- Paste-safe for the Supabase editor.

CREATE OR REPLACE FUNCTION public.waqc_access_kind()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 'none'
    WHEN EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.user_type = 'external'
    ) THEN 'external'
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.qc_role IS NOT NULL
        AND p.qc_role::text NOT IN ('client', 'supplier', 'buyer')
    ) THEN 'staff'
    ELSE 'none'
  END
$$;

GRANT EXECUTE ON FUNCTION public.waqc_access_kind() TO authenticated;

CREATE OR REPLACE FUNCTION public.waqc_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.waqc_access_kind() = 'staff'
$$;

GRANT EXECUTE ON FUNCTION public.waqc_is_staff() TO authenticated;

CREATE TABLE IF NOT EXISTS public.portal_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email <> ''),
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  views text[] NOT NULL DEFAULT '{}',
  capabilities text[] NOT NULL DEFAULT '{}',
  is_company_admin boolean NOT NULL DEFAULT false,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  invited_by_kind text NOT NULL CHECK (invited_by_kind IN ('staff', 'manager')),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_company_admin OR invited_by_kind = 'staff')
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_invitations_one_pending
  ON public.portal_invitations (company_id, email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS portal_invitations_company
  ON public.portal_invitations (company_id, created_at DESC);

ALTER TABLE public.portal_invitations ENABLE ROW LEVEL SECURITY;

-- Verification: three rows, each true.
SELECT 'waqc_access_kind exists' AS check_name,
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'waqc_access_kind') AS ok
UNION ALL
SELECT 'waqc_is_staff exists',
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'waqc_is_staff')
UNION ALL
SELECT 'portal_invitations has RLS on',
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.portal_invitations'::regclass);
```

- [ ] **Step 2: Lint it for the editor traps**

Run: `grep -n -i -E 'into|create (temp )?table' database/migrations/20261014000001_portal_accounts_foundation.sql`
Expected: exactly one hit, the top-level `CREATE TABLE IF NOT EXISTS public.portal_invitations` (allowed: it enables RLS itself). Any `into` hit must be reworded.

- [ ] **Step 3: Commit and hand the SQL to Daniel**

```bash
git add database/migrations/20261014000001_portal_accounts_foundation.sql
git commit -m "feat(db): waqc_access_kind(), waqc_is_staff() and portal_invitations for client portal accounts"
```

Paste the full SQL to Daniel. Expected result: three rows, `ok = true`. Task 7's middleware must not be pushed before Daniel confirms.

---

### Task 5: SQL — the sign-up trigger creates no WAQC profile for strangers

**Files:**
- Create: `database/migrations/20261014000002_handle_new_user_no_stranger_profiles.sql`

**Interfaces:**
- Consumes: the live `public.handle_new_user()` body (read 2026-10-14, reproduced below as the base).
- Produces: a trigger that writes a WAQC `profiles` row only for a pending staff invitation (role not `client`/`supplier`/`buyer`) or an `@wolthers.com` email, inside its own sub-block so a `profiles` failure can never undo the `user_profiles` row; and keeps the `user_profiles` insert exactly as live.

**Known sys finding, not fixed here (ruling R10).** sys's `inviteExternalUser` (invite-only, sys `78f6cd956`) calls `generateLink`, which creates the auth user and so fires this trigger, and then does a plain insert of an `invited` `user_profiles` row. With the trigger's `user_profiles` insert in place that insert fails with 23505 for every brand-new address. This task keeps the insert unchanged (no regression from WAQC); tell Daniel it is a sys finding (sys-side fix: `inviteExternalUser` takes over an `external`/`pending` row that has no grants).

- [ ] **Step 1: Re-read the live body and the column types** (Daniel pastes; read-only)

```sql
SELECT pg_get_functiondef('public.handle_new_user'::regproc) AS live_body;
```

```sql
SELECT table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'user_invitations')
  AND column_name = 'qc_role';
```

The 2026-10-14 base is: invitation lookup by email (pending, unexpired, newest first); a `profiles` insert from the invitation (including `client_id = invitation_record.company_id`); otherwise a `profiles` insert with `lab_personnel` / `global_admin` for the three admin emails, Santos lab and `qc_enabled` only for `@wolthers.com`; then `INSERT ... user_profiles (id, full_name, email, status 'pending', permissions '{}', department_ids '{}', user_type internal-for-wolthers else external) ON CONFLICT DO NOTHING`; `EXCEPTION WHEN OTHERS` raises a warning and returns NEW. If the live body differs in anything else, stop and merge those differences into Step 2 before going on.

Column types: the live policies compare `(qc_role)::text` with `'x'::character varying`, so `profiles.qc_role` is expected to be `character varying` (and `user_invitations.qc_role` `text`). The SQL below therefore uses no enum casts. If the query shows `USER-DEFINED` / `user_role` for `profiles.qc_role`, tell Daniel: the WAQC profile branch would then fail on a text-to-enum assignment, but the inner block below keeps the `user_profiles` row safe either way, and `ensureWaqcProfile` (Task 6) creates the profile at first sign-in.

- [ ] **Step 2: Write the migration**

```sql
-- handle_new_user (on auth.users, fires for EVERY new login on the shared
-- database, sys's included): stop creating WAQC profiles for strangers.
--
-- Before: any sign-in without a WAQC invitation got a lab_personnel profile,
-- which much of WAQC treats as staff. Now a WAQC profile is written only for
--   * a pending staff invitation (role not client / supplier / buyer), or
--   * an @wolthers.com email (unchanged defaults).
-- Client logins come from portal_invitations and never get a WAQC profile.
--
-- The WAQC profile part runs in its own BEGIN ... EXCEPTION block: if it
-- fails, it is skipped with a warning (ensureWaqcProfile creates the profile
-- at first sign-in) and can never roll back the user_profiles row below.
--
-- The user_profiles insert is unchanged on purpose: external / pending for
-- strangers is how sys denies them by default (2026-07-07).
--
-- No enum casts: the live profiles.qc_role is character varying.
-- Paste-safe: assignments use := and a FOR loop, no select-to-variable.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  invitation_record public.user_invitations%ROWTYPE;
  has_staff_invitation boolean := false;
  default_lab_id uuid;
  is_wolthers_email boolean;
  is_admin_email boolean;
BEGIN
  is_wolthers_email := NEW.email ILIKE '%@wolthers.com';
  is_admin_email := lower(NEW.email) IN ('daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com');

  -- WAQC profile: its own block, so nothing here can undo the user_profiles row.
  BEGIN
    default_lab_id := (SELECT l.id FROM public.laboratories l WHERE l.code = 'SANTOS_HQ' LIMIT 1);

    FOR invitation_record IN
      SELECT *
      FROM public.user_invitations ui
      WHERE lower(ui.email) = lower(NEW.email)
        AND ui.status = 'pending'
        AND ui.expires_at > now()
        AND ui.qc_role NOT IN ('client', 'supplier', 'buyer')
      ORDER BY ui.created_at DESC
      LIMIT 1
    LOOP
      has_staff_invitation := true;
    END LOOP;

    IF has_staff_invitation THEN
      INSERT INTO public.profiles (
        id, email, first_name, last_name, full_name,
        qc_role, laboratory_id, is_cupper, is_q_grader,
        qc_enabled, is_global_admin, created_at, updated_at
      )
      VALUES (
        NEW.id, NEW.email,
        COALESCE(invitation_record.first_name, ''),
        COALESCE(invitation_record.last_name, ''),
        COALESCE(NULLIF(btrim(COALESCE(invitation_record.first_name, '') || ' ' || COALESCE(invitation_record.last_name, '')), ''),
                 split_part(NEW.email, '@', 1)),
        invitation_record.qc_role,
        COALESCE(invitation_record.laboratory_id, default_lab_id),
        COALESCE(invitation_record.is_cupper, FALSE),
        COALESCE(invitation_record.is_q_grader, FALSE),
        COALESCE(invitation_record.qc_enabled, TRUE),
        invitation_record.qc_role IN ('global_admin', 'global_quality_admin'),
        now(), now()
      )
      ON CONFLICT (id) DO NOTHING;

      UPDATE public.user_invitations
      SET status = 'accepted', accepted_at = now(), updated_at = now()
      WHERE id = invitation_record.id;
    ELSIF is_wolthers_email THEN
      INSERT INTO public.profiles (
        id, email, first_name, last_name, full_name,
        qc_role, laboratory_id, qc_enabled, is_global_admin,
        created_at, updated_at
      )
      VALUES (
        NEW.id, NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        CASE WHEN is_admin_email THEN 'global_admin' ELSE 'lab_personnel' END,
        default_lab_id,
        TRUE,
        is_admin_email,
        now(), now()
      )
      ON CONFLICT (id) DO NOTHING;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user: no WAQC profile for % (%); ensureWaqcProfile creates it at first sign-in', NEW.email, SQLERRM;
  END;

  -- Unchanged from live: sys's default-deny row for strangers.
  INSERT INTO public.user_profiles (id, full_name, email, status, permissions, department_ids, user_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    lower(NEW.email),
    'pending',
    '{}',
    '{}',
    CASE WHEN is_wolthers_email THEN 'internal' ELSE 'external' END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$function$;

-- Verification: both true once the new body is live.
SELECT position('Unchanged from live' in pg_get_functiondef('public.handle_new_user'::regproc)) > 0 AS rewritten,
       position('its own block' in pg_get_functiondef('public.handle_new_user'::regproc)) > 0 AS profile_block_isolated;
```

- [ ] **Step 3: Lint**

Run: `grep -n -i -E '\binto\b' database/migrations/20261014000002_handle_new_user_no_stranger_profiles.sql`
Expected: only the three `INSERT INTO public.profiles` / `INSERT INTO public.user_profiles` lines (allowed: `INSERT INTO <table>`). Both tables already have RLS on, so the ENABLE RLS statements the editor appends for them are harmless no-ops. Any other hit must be reworded.

- [ ] **Step 4: Commit and hand the SQL to Daniel**

```bash
git add database/migrations/20261014000002_handle_new_user_no_stranger_profiles.sql
git commit -m "fix(db): handle_new_user writes a WAQC profile only for staff invitations and @wolthers.com, in its own block"
```

Paste the full SQL to Daniel with the R10 note above. Expected result after he applies it: `rewritten = true`, `profile_block_isolated = true`. The behaviour is verified end to end in Task 22.

---

### Task 6: One rule for creating WAQC profiles

The sign-up trigger (Task 5), the login callback and `/api/profiles/ensure` all create profiles. They must follow the same rule. This task puts the rule in one pure function and one server helper, and closes the two app-side paths that turned strangers into staff.

**Files:**
- Create: `src/lib/auth/new-profile.ts`, `src/lib/auth/new-profile.test.ts`
- Create: `src/lib/auth/ensure-profile.ts`, `src/lib/auth/ensure-profile.test.ts`
- Modify: `src/app/auth/callback/route.ts` (replace the body of `ensureUserProfile`, lines ~138–296)
- Replace: `src/app/api/profiles/ensure/route.ts`
- Modify: `src/components/providers/auth-provider.tsx:311-330` (drop the self-promotion to `lab_personnel`)
- Modify: `src/lib/auth/invite-permissions.ts` + test (no client/supplier/buyer staff invitations)
- Modify: `src/components/admin/user-management-panel.tsx:765-766` and `:860-861` (role lists)

**Interfaces:**
- Produces:
  - `EXTERNAL_QC_ROLES: readonly ['client', 'supplier', 'buyer']`, `isExternalQcRole(role: string | null | undefined): boolean`
  - `interface StaffInvitationRow { id: string; first_name: string | null; last_name: string | null; qc_role: string; laboratory_id: string | null; is_cupper: boolean | null; is_q_grader: boolean | null; qc_enabled: boolean | null }`
  - `interface NewProfileFields { first_name: string; last_name: string; full_name: string; qc_role: string; qc_enabled: boolean; is_cupper: boolean; is_q_grader: boolean; is_global_admin: boolean; laboratory_id: string | null }`
  - `decideNewProfile(args: { email: string; userType: string | null; invitation: StaffInvitationRow | null; metadataName: string | null; santosLabId: string | null }): NewProfileFields | null`
  - `ensureWaqcProfile(admin: SupabaseClient<any>, user: { id: string; email?: string | null; user_metadata?: Record<string, any> | null }, invitationToken?: string | null): Promise<{ profile: Record<string, any> | null; created: boolean }>`

- [ ] **Step 1: Write the failing test for the rule**

```ts
// src/lib/auth/new-profile.test.ts
import { describe, expect, it } from 'vitest'
import { decideNewProfile, isExternalQcRole, type StaffInvitationRow } from './new-profile'

const SANTOS = 'lab-santos'
const invitation = (over: Partial<StaffInvitationRow> = {}): StaffInvitationRow => ({
  id: 'inv-1', first_name: 'Ana', last_name: 'Lima', qc_role: 'lab_personnel', laboratory_id: 'lab-gt',
  is_cupper: true, is_q_grader: false, qc_enabled: true, ...over,
})

describe('isExternalQcRole', () => {
  it('is true for client, supplier and buyer only', () => {
    expect(['client', 'supplier', 'buyer'].every(isExternalQcRole)).toBe(true)
    expect(isExternalQcRole('lab_personnel')).toBe(false)
    expect(isExternalQcRole(null)).toBe(false)
  })
})

describe('decideNewProfile', () => {
  it('builds the profile from a staff invitation', () => {
    expect(decideNewProfile({ email: 'ana@lab.com', userType: null, invitation: invitation(), metadataName: null, santosLabId: SANTOS }))
      .toEqual({
        first_name: 'Ana', last_name: 'Lima', full_name: 'Ana Lima', qc_role: 'lab_personnel', qc_enabled: true,
        is_cupper: true, is_q_grader: false, is_global_admin: false, laboratory_id: 'lab-gt',
      })
  })

  it('marks global roles from an invitation as global admin and falls back to Santos', () => {
    const p = decideNewProfile({
      email: 'x@lab.com', userType: null, invitation: invitation({ qc_role: 'global_quality_admin', laboratory_id: null }),
      metadataName: null, santosLabId: SANTOS,
    })
    expect(p?.is_global_admin).toBe(true)
    expect(p?.laboratory_id).toBe(SANTOS)
  })

  it('ignores an invitation for an external role', () => {
    expect(decideNewProfile({ email: 'buyer@client.com', userType: null, invitation: invitation({ qc_role: 'client' }), metadataName: null, santosLabId: SANTOS }))
      .toBeNull()
  })

  it('gives @wolthers.com staff defaults, admins by email', () => {
    expect(decideNewProfile({ email: ' Joao@Wolthers.com ', userType: 'internal', invitation: null, metadataName: 'Joao Silva', santosLabId: SANTOS }))
      .toEqual({
        first_name: 'Joao', last_name: 'Silva', full_name: 'Joao Silva', qc_role: 'lab_personnel', qc_enabled: true,
        is_cupper: false, is_q_grader: false, is_global_admin: false, laboratory_id: SANTOS,
      })
    expect(decideNewProfile({ email: 'daniel@wolthers.com', userType: null, invitation: null, metadataName: null, santosLabId: SANTOS })?.qc_role)
      .toBe('global_admin')
  })

  it('creates nothing for a stranger', () => {
    expect(decideNewProfile({ email: 'someone@gmail.com', userType: null, invitation: null, metadataName: 'Someone', santosLabId: SANTOS })).toBeNull()
  })

  it('creates nothing for an external user, even with a staff invitation or a wolthers address', () => {
    expect(decideNewProfile({ email: 'x@wolthers.com', userType: 'external', invitation: invitation(), metadataName: null, santosLabId: SANTOS })).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/auth/new-profile.test.ts`
Expected: FAIL, cannot resolve `./new-profile`.

- [ ] **Step 3: Implement the rule**

```ts
// src/lib/auth/new-profile.ts
/**
 * Who gets a WAQC profile when they first sign in (spec §4.1–4.2). The same
 * rule lives in the SQL trigger handle_new_user (migration 20261014000002):
 *   * external users (sys user_profiles.user_type = 'external'): never
 *   * a pending STAFF invitation: the profile it describes
 *   * an @wolthers.com email: lab_personnel at Santos (three admins by email)
 *   * anyone else: nothing — no access to WAQC
 * Client logins come from portal_invitations and never get a profile.
 */

export const EXTERNAL_QC_ROLES = ['client', 'supplier', 'buyer'] as const
export const ADMIN_EMAILS = ['daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com']

export function isExternalQcRole(role: string | null | undefined): boolean {
  return !!role && (EXTERNAL_QC_ROLES as readonly string[]).includes(role)
}

export interface StaffInvitationRow {
  id: string
  first_name: string | null
  last_name: string | null
  qc_role: string
  laboratory_id: string | null
  is_cupper: boolean | null
  is_q_grader: boolean | null
  qc_enabled: boolean | null
}

export interface NewProfileFields {
  first_name: string
  last_name: string
  full_name: string
  qc_role: string
  qc_enabled: boolean
  is_cupper: boolean
  is_q_grader: boolean
  is_global_admin: boolean
  laboratory_id: string | null
}

export function decideNewProfile(args: {
  email: string
  userType: string | null
  invitation: StaffInvitationRow | null
  metadataName: string | null
  santosLabId: string | null
}): NewProfileFields | null {
  if (args.userType === 'external') return null
  const email = args.email.trim().toLowerCase()
  const localPart = email.split('@')[0] ?? ''

  const inv = args.invitation && !isExternalQcRole(args.invitation.qc_role) ? args.invitation : null
  if (inv) {
    const first = inv.first_name ?? ''
    const last = inv.last_name ?? ''
    return {
      first_name: first,
      last_name: last,
      full_name: `${first} ${last}`.trim() || localPart,
      qc_role: inv.qc_role,
      qc_enabled: inv.qc_enabled ?? true,
      is_cupper: inv.is_cupper ?? false,
      is_q_grader: inv.is_q_grader ?? false,
      is_global_admin: inv.qc_role === 'global_admin' || inv.qc_role === 'global_quality_admin',
      laboratory_id: inv.laboratory_id ?? args.santosLabId,
    }
  }

  if (!email.endsWith('@wolthers.com')) return null
  const isAdmin = ADMIN_EMAILS.includes(email)
  const fullName = args.metadataName?.trim() || localPart
  const [first, ...rest] = fullName.split(' ')
  return {
    first_name: first ?? '',
    last_name: rest.join(' '),
    full_name: fullName,
    qc_role: isAdmin ? 'global_admin' : 'lab_personnel',
    qc_enabled: true,
    is_cupper: false,
    is_q_grader: false,
    is_global_admin: isAdmin,
    laboratory_id: args.santosLabId,
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/auth/new-profile.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the server helper**

```ts
// src/lib/auth/ensure-profile.test.ts
import { describe, expect, it } from 'vitest'
import { ensureWaqcProfile } from './ensure-profile'

/** Tiny fake of the service-role client: canned rows per table, records writes. */
function fakeAdmin(rows: Record<string, any[]>) {
  const writes: Array<{ table: string; op: string; values: any }> = []
  const db: any = {
    writes,
    from(table: string) {
      const preds: Array<(r: any) => boolean> = []
      let op = 'select'
      let values: any = null
      const chain: any = {
        select() { return chain },
        insert(v: any) { op = 'insert'; values = v; return chain },
        update(v: any) { op = 'update'; values = v; return chain },
        eq(c: string, v: unknown) { preds.push((r) => r[c] === v); return chain },
        ilike(c: string, v: string) { preds.push((r) => String(r[c]).toLowerCase() === v.toLowerCase()); return chain },
        gt() { return chain },
        not(c: string, _op: string, list: string) {
          const banned = list.replace(/[()"]/g, '').split(',')
          preds.push((r) => !banned.includes(r[c]))
          return chain
        },
        order() { return chain },
        limit() { return chain },
        maybeSingle() {
          if (op !== 'select') writes.push({ table, op, values })
          const hit = (rows[table] ?? []).find((r) => preds.every((p) => p(r)))
          if (op === 'insert') return Promise.resolve({ data: { id: values.id, ...values }, error: null })
          return Promise.resolve({ data: hit ?? null, error: null })
        },
        then(ok: any, bad: any) {
          if (op !== 'select') writes.push({ table, op, values })
          return Promise.resolve({ data: null, error: null }).then(ok, bad)
        },
      }
      return chain
    },
  }
  return db
}

describe('ensureWaqcProfile', () => {
  it('returns an existing profile untouched', async () => {
    const admin = fakeAdmin({ profiles: [{ id: 'u1', qc_role: 'lab_personnel' }] })
    expect(await ensureWaqcProfile(admin, { id: 'u1', email: 'x@wolthers.com' }))
      .toEqual({ profile: { id: 'u1', qc_role: 'lab_personnel' }, created: false })
    expect(admin.writes).toEqual([])
  })

  it('creates nothing for an external user', async () => {
    const admin = fakeAdmin({ profiles: [], user_profiles: [{ id: 'u2', user_type: 'external' }], laboratories: [{ id: 'santos', code: 'SANTOS_HQ' }] })
    expect(await ensureWaqcProfile(admin, { id: 'u2', email: 'buyer@client.com' })).toEqual({ profile: null, created: false })
    expect(admin.writes).toEqual([])
  })

  it('creates nothing for a stranger', async () => {
    const admin = fakeAdmin({ profiles: [], user_profiles: [], user_invitations: [], laboratories: [{ id: 'santos', code: 'SANTOS_HQ' }] })
    expect(await ensureWaqcProfile(admin, { id: 'u3', email: 'a@gmail.com' })).toEqual({ profile: null, created: false })
  })

  it('creates a staff profile for a wolthers address', async () => {
    const admin = fakeAdmin({ profiles: [], user_profiles: [{ id: 'u4', user_type: 'internal' }], user_invitations: [], laboratories: [{ id: 'santos', code: 'SANTOS_HQ' }] })
    const result = await ensureWaqcProfile(admin, { id: 'u4', email: 'joao@wolthers.com', user_metadata: { full_name: 'Joao Silva' } })
    expect(result.created).toBe(true)
    expect(admin.writes[0]).toMatchObject({ table: 'profiles', op: 'insert', values: { id: 'u4', email: 'joao@wolthers.com', qc_role: 'lab_personnel', laboratory_id: 'santos' } })
  })
})
```

- [ ] **Step 6: Run it to see it fail**

Run: `npx vitest run src/lib/auth/ensure-profile.test.ts`
Expected: FAIL, cannot resolve `./ensure-profile`.

- [ ] **Step 7: Implement the helper**

```ts
// src/lib/auth/ensure-profile.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { decideNewProfile, EXTERNAL_QC_ROLES, type StaffInvitationRow } from './new-profile'

const PROFILE_COLUMNS = 'id, email, full_name, qc_role, qc_enabled, is_global_admin, laboratory_id'
const INVITATION_COLUMNS = 'id, first_name, last_name, qc_role, laboratory_id, is_cupper, is_q_grader, qc_enabled'
const EXTERNAL_LIST = `(${EXTERNAL_QC_ROLES.join(',')})`

/**
 * Make sure a signed-in user has the WAQC profile the rule in
 * decideNewProfile gives them — and nothing when it gives none. Service-role
 * client only. Used by /auth/callback and /api/profiles/ensure.
 */
export async function ensureWaqcProfile(
  admin: SupabaseClient<any>,
  user: { id: string; email?: string | null; user_metadata?: Record<string, any> | null },
  invitationToken?: string | null,
): Promise<{ profile: Record<string, any> | null; created: boolean }> {
  const { data: existing } = await admin.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).maybeSingle()
  if (existing) return { profile: existing, created: false }

  const email = (user.email ?? '').trim().toLowerCase()
  if (!email) return { profile: null, created: false }

  const { data: userProfile } = await admin.from('user_profiles').select('user_type').eq('id', user.id).maybeSingle()
  const userType: string | null = userProfile?.user_type ?? null
  if (userType === 'external') return { profile: null, created: false }

  let invitation: StaffInvitationRow | null = null
  if (invitationToken) {
    const { data } = await admin
      .from('user_invitations')
      .select(INVITATION_COLUMNS)
      .eq('invitation_token', invitationToken)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .not('qc_role', 'in', EXTERNAL_LIST)
      .maybeSingle()
    invitation = (data as StaffInvitationRow | null) ?? null
  }
  if (!invitation) {
    const { data } = await admin
      .from('user_invitations')
      .select(INVITATION_COLUMNS)
      .ilike('email', email)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .not('qc_role', 'in', EXTERNAL_LIST)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    invitation = (data as StaffInvitationRow | null) ?? null
  }

  const { data: santos } = await admin.from('laboratories').select('id').eq('code', 'SANTOS_HQ').maybeSingle()
  const meta = user.user_metadata ?? {}
  const fields = decideNewProfile({
    email,
    userType,
    invitation,
    metadataName: (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? null,
    santosLabId: santos?.id ?? null,
  })
  if (!fields) return { profile: null, created: false }

  const { data: created, error } = await admin
    .from('profiles')
    .insert({ id: user.id, email, ...fields })
    .select(PROFILE_COLUMNS)
    .maybeSingle()
  if (error) {
    if (error.code === '23505') {
      const { data: raced } = await admin.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).maybeSingle()
      return { profile: raced ?? null, created: false }
    }
    throw error
  }

  if (invitation) {
    await admin
      .from('user_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)
  }
  return { profile: created ?? null, created: true }
}
```

- [ ] **Step 8: Run the helper test**

Run: `npx vitest run src/lib/auth/ensure-profile.test.ts`
Expected: PASS.

- [ ] **Step 9: Use the helper in the login callback**

In `src/app/auth/callback/route.ts` replace the whole `ensureUserProfile` function (from its doc comment at ~line 132 to the end of the file) with:

```ts
/**
 * Make sure the user has the WAQC profile the shared rule gives them
 * (src/lib/auth/new-profile.ts) — none for clients and strangers.
 */
async function ensureUserProfile(user: { id: string; email?: string; user_metadata?: any }, invitationToken?: string | null) {
  try {
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    await ensureWaqcProfile(supabaseAdmin as any, user, invitationToken)
  } catch (error) {
    console.error('Error in ensureUserProfile:', error)
  }
}
```

and add `import { ensureWaqcProfile } from '@/lib/auth/ensure-profile'` at the top. (The landing-path change in the same file is Task 7.)

- [ ] **Step 10: Replace `/api/profiles/ensure`**

```ts
// src/app/api/profiles/ensure/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { ensureWaqcProfile } from '@/lib/auth/ensure-profile'

/**
 * POST /api/profiles/ensure
 *
 * Fallback when the sign-up trigger did not create a profile. Applies the
 * shared rule (src/lib/auth/new-profile.ts): clients and strangers get none,
 * and the answer is then `{ success: true, profile: null }`.
 */
export async function POST() {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { profile, created } = await ensureWaqcProfile(supabaseAdmin, user)
    return NextResponse.json({ success: true, profile, created })
  } catch (error: any) {
    console.error('[API] profiles/ensure failed:', error)
    return NextResponse.json({ error: 'Failed to ensure profile' }, { status: 500 })
  }
}
```

Check the caller still compiles: `grep -n "ensureProfileViaAPI" -A20 src/components/providers/auth-provider.tsx` — it already handles `result.profile` being absent (it only sets the profile `if (result.profile)`).

- [ ] **Step 11: Stop the auth provider promoting itself**

In `src/components/providers/auth-provider.tsx` replace

```ts
        // Ensure user has a QC role
        let finalProfile = profileData
        if (!profileData.qc_role) {
          ...the whole block through its closing brace...
        }
```

with

```ts
        // A profile without a role stays without one: roles are granted by
        // administrators only (the profiles guard trigger refuses
        // self-promotion, and middleware sends role-less users to
        // /auth/no-access).
        const finalProfile = profileData
```

- [ ] **Step 12: Staff invitations refuse client roles** (`src/lib/auth/invite-permissions.ts`)

Add a test to `src/lib/auth/invite-permissions.test.ts`:

```ts
  it('refuses client, supplier and buyer even for a global admin — they use portal invitations', () => {
    const admin = { qc_role: 'global_admin', is_global_admin: true, laboratory_id: null }
    for (const role of ['client', 'supplier', 'buyer']) {
      expect(checkInvitePermission(admin, { qc_role: role, laboratory_id: null })).toMatchObject({ ok: false, status: 400 })
    }
  })
```

Run `npx vitest run src/lib/auth/invite-permissions.test.ts` → FAIL on the new test. Then in `checkInvitePermission`, put the check **inside the global-admin branch**, after the inviter-scope checks have run, so a lab quality manager inviting those roles still gets its 403 (the existing test "stops a lab quality manager inviting their own level or higher, or outside roles" expects 403 and stays as it is). The branch becomes:

```ts
  if (inviter.is_global_admin === true || GLOBAL_ADMIN_ROLES.has(inviter.qc_role ?? '')) {
    if (isExternalQcRole(target.qc_role)) {
      return { ok: false, status: 400, error: 'Client logins are invited from the client page (Portal access)' }
    }
    return { ok: true }
  }
```

with `import { isExternalQcRole } from './new-profile'`. Leave `client`, `supplier` and `buyer` in `KNOWN_ROLES` (an unknown role is still a 400 before the inviter checks). Run again → PASS, the whole file.

- [ ] **Step 13: Hide the external roles in the staff Users screens**

In `src/components/admin/user-management-panel.tsx`, both role lists (`.filter((role) => canPromoteToRole(role))` at ~766 and ~861) become:

```tsx
                    .filter((role) => canPromoteToRole(role) && !isExternalQcRole(role))
```

with `import { isExternalQcRole } from '@/lib/auth/new-profile'`.

- [ ] **Step 14: Typecheck and run the touched tests**

Run: `npx tsc --noEmit -p .` and `npx vitest run src/lib/auth src/app/api/route-exports.test.ts`
Expected: no errors; all PASS.

- [ ] **Step 15: Commit**

```bash
git add src/lib/auth/new-profile.ts src/lib/auth/new-profile.test.ts src/lib/auth/ensure-profile.ts \
  src/lib/auth/ensure-profile.test.ts src/app/auth/callback/route.ts src/app/api/profiles/ensure/route.ts \
  src/components/providers/auth-provider.tsx src/lib/auth/invite-permissions.ts \
  src/lib/auth/invite-permissions.test.ts src/components/admin/user-management-panel.tsx
git commit -m "fix(auth): one rule for WAQC profiles — none for clients and strangers; no self-promotion; staff invites refuse client roles"
```

---

### Task 7: Access kind, route rules, middleware, no-access page, landing path

**Files:**
- Create: `src/lib/auth/access-kind.ts`, `src/lib/auth/access-kind.test.ts`
- Create: `src/lib/auth/route-access.ts`, `src/lib/auth/route-access.test.ts`
- Replace: `middleware.ts`
- Create: `src/app/auth/no-access/page.tsx`
- Modify: `src/app/auth/callback/route.ts` (landing destination, ~lines 99–110)
- Modify: `src/lib/portal/portal-auth.ts` + `portal-auth.test.ts` (remove `resolveLandingPath` there)

**Interfaces:**
- Consumes: `isExternalQcRole` (Task 6); SQL `waqc_access_kind()` (Task 4).
- Produces:
  - `type AccessKind = 'staff' | 'external' | 'none'`
  - `parseAccessKind(value: unknown): AccessKind`
  - `classifyAccessKind(row: { userType: string | null; qcRole: string | null }): AccessKind`
  - `fetchAccessKind(supabase: SupabaseClient<any>): Promise<AccessKind>` (RPC; throws on error)
  - `accessKindForUser(admin: SupabaseClient<any>, userId: string): Promise<AccessKind>` (service-role reads)
  - `resolveLandingPath(kind: AccessKind): '/portal' | '/dashboard' | '/auth/no-access'`
  - `type RouteDecision = { action: 'allow' } | { action: 'redirect'; to: string } | { action: 'deny'; status: 403 }`
  - `isPublicRoute(pathname: string): boolean`
  - `decideRouteAccess(pathname: string, kind: AccessKind | null): RouteDecision` (`null` = not signed in)

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/auth/access-kind.test.ts
import { describe, expect, it } from 'vitest'
import { classifyAccessKind, parseAccessKind, resolveLandingPath } from './access-kind'

describe('classifyAccessKind (mirrors SQL waqc_access_kind)', () => {
  it('external always wins', () => {
    expect(classifyAccessKind({ userType: 'external', qcRole: 'global_admin' })).toBe('external')
  })
  it('a staff role makes staff', () => {
    expect(classifyAccessKind({ userType: 'internal', qcRole: 'lab_personnel' })).toBe('staff')
    expect(classifyAccessKind({ userType: null, qcRole: 'global_admin' })).toBe('staff')
  })
  it('no role, or a client role, is none', () => {
    expect(classifyAccessKind({ userType: 'internal', qcRole: null })).toBe('none')
    expect(classifyAccessKind({ userType: null, qcRole: 'client' })).toBe('none')
    expect(classifyAccessKind({ userType: 'co_broker', qcRole: null })).toBe('none')
  })
})

describe('parseAccessKind', () => {
  it('accepts the three kinds and maps anything else to none', () => {
    expect(parseAccessKind('staff')).toBe('staff')
    expect(parseAccessKind('external')).toBe('external')
    expect(parseAccessKind('admin')).toBe('none')
    expect(parseAccessKind(null)).toBe('none')
  })
})

describe('resolveLandingPath', () => {
  it('lands each kind on its home', () => {
    expect(resolveLandingPath('external')).toBe('/portal')
    expect(resolveLandingPath('staff')).toBe('/dashboard')
    expect(resolveLandingPath('none')).toBe('/auth/no-access')
  })
})
```

```ts
// src/lib/auth/route-access.test.ts
import { describe, expect, it } from 'vitest'
import { decideRouteAccess, isPublicRoute } from './route-access'

const allow = { action: 'allow' }
const deny = { action: 'deny', status: 403 }
const to = (path: string) => ({ action: 'redirect', to: path })

describe('isPublicRoute', () => {
  it('keeps today\'s public routes and adds the two new auth pages', () => {
    for (const p of ['/', '/auth/callback', '/auth/accept-invite', '/auth/portal-invite', '/auth/no-access',
      '/api/samples', '/certificate/SAG-1-26', '/embed/quadrant/1']) {
      expect(isPublicRoute(p)).toBe(true)
    }
    expect(isPublicRoute('/dashboard')).toBe(false)
    expect(isPublicRoute('/portal')).toBe(false)
  })
})

describe('decideRouteAccess', () => {
  it('not signed in: public allowed, the rest goes to sign-in', () => {
    expect(decideRouteAccess('/api/portal/accept', null)).toEqual(allow)
    expect(decideRouteAccess('/auth/portal-invite', null)).toEqual(allow)
    expect(decideRouteAccess('/dashboard', null)).toEqual(to('/'))
    expect(decideRouteAccess('/portal', null)).toEqual(to('/'))
  })

  it('staff: everything', () => {
    for (const p of ['/', '/dashboard', '/portal', '/api/samples', '/api/portal/me']) {
      expect(decideRouteAccess(p, 'staff')).toEqual(allow)
    }
  })

  it('external: portal, auth and public certificates only', () => {
    for (const p of ['/portal', '/portal/team', '/api/portal/samples', '/auth/no-access', '/certificate/X', '/api/certificate/X/pdf', '/embed/a']) {
      expect(decideRouteAccess(p, 'external')).toEqual(allow)
    }
    expect(decideRouteAccess('/', 'external')).toEqual(to('/portal'))
    expect(decideRouteAccess('/dashboard', 'external')).toEqual(to('/portal'))
    expect(decideRouteAccess('/portalx', 'external')).toEqual(to('/portal'))
    expect(decideRouteAccess('/api/samples', 'external')).toEqual(deny)
    expect(decideRouteAccess('/api/cupping/scores/aggregate', 'external')).toEqual(deny)
    expect(decideRouteAccess('/api/portalx', 'external')).toEqual(deny)
  })

  it('none: the no-access page, accepting an invitation and getting a first staff profile', () => {
    for (const p of ['/auth/no-access', '/auth/callback', '/api/portal/accept', '/api/profiles/ensure', '/api/auth/invitation', '/certificate/X']) {
      expect(decideRouteAccess(p, 'none')).toEqual(allow)
    }
    expect(decideRouteAccess('/', 'none')).toEqual(to('/auth/no-access'))
    expect(decideRouteAccess('/portal', 'none')).toEqual(to('/auth/no-access'))
    expect(decideRouteAccess('/api/portal/me', 'none')).toEqual(deny)
    expect(decideRouteAccess('/api/samples', 'none')).toEqual(deny)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/auth/access-kind.test.ts src/lib/auth/route-access.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement `access-kind.ts`**

```ts
// src/lib/auth/access-kind.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { isExternalQcRole } from './new-profile'

/**
 * How WAQC treats a signed-in caller (spec §4). The same rule is the SQL
 * function waqc_access_kind() (migration 20261014000001); keep them equal.
 */
export type AccessKind = 'staff' | 'external' | 'none'

export function parseAccessKind(value: unknown): AccessKind {
  return value === 'staff' || value === 'external' ? value : 'none'
}

export function classifyAccessKind(row: { userType: string | null; qcRole: string | null }): AccessKind {
  if (row.userType === 'external') return 'external'
  if (row.qcRole && !isExternalQcRole(row.qcRole)) return 'staff'
  return 'none'
}

/** One RPC with the caller's own session (middleware). Throws on failure. */
export async function fetchAccessKind(supabase: SupabaseClient<any>): Promise<AccessKind> {
  const { data, error } = await supabase.rpc('waqc_access_kind')
  if (error) throw error
  return parseAccessKind(data)
}

/** The same answer for any user id, read with the service role. */
export async function accessKindForUser(admin: SupabaseClient<any>, userId: string): Promise<AccessKind> {
  const [{ data: userProfile }, { data: profile }] = await Promise.all([
    admin.from('user_profiles').select('user_type').eq('id', userId).maybeSingle(),
    admin.from('profiles').select('qc_role').eq('id', userId).maybeSingle(),
  ])
  return classifyAccessKind({ userType: userProfile?.user_type ?? null, qcRole: profile?.qc_role ?? null })
}

export function resolveLandingPath(kind: AccessKind): '/portal' | '/dashboard' | '/auth/no-access' {
  if (kind === 'external') return '/portal'
  if (kind === 'staff') return '/dashboard'
  return '/auth/no-access'
}
```

- [ ] **Step 4: Implement `route-access.ts`**

```ts
// src/lib/auth/route-access.ts
import type { AccessKind } from './access-kind'

/**
 * Which pages and APIs each kind of caller may reach (spec §7.2). Every API
 * route still checks its own caller; this is the outer wall that stops
 * clients and strangers reaching staff routes that only check for a login.
 */

export type RouteDecision =
  | { action: 'allow' }
  | { action: 'redirect'; to: string }
  | { action: 'deny'; status: 403 }

const PUBLIC_PAGES = new Set(['/', '/auth/callback', '/auth/accept-invite', '/auth/portal-invite', '/auth/no-access'])

/** `path` is `base` itself or below it ("/portal" and "/portal/team", never "/portalx"). */
function under(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`)
}

const ALLOW: RouteDecision = { action: 'allow' }
const DENY: RouteDecision = { action: 'deny', status: 403 }

/** Not signed in: unchanged from before (API routes check for themselves). */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PAGES.has(pathname) || under(pathname, '/api') || under(pathname, '/certificate') || under(pathname, '/embed')
}

function isPublicDocument(p: string): boolean {
  return under(p, '/certificate') || under(p, '/api/certificate') || under(p, '/embed') || under(p, '/api/embed')
}

export function decideRouteAccess(pathname: string, kind: AccessKind | null): RouteDecision {
  if (kind === null) return isPublicRoute(pathname) ? ALLOW : { action: 'redirect', to: '/' }
  if (kind === 'staff') return ALLOW

  const isApi = under(pathname, '/api')

  if (kind === 'external') {
    const allowed = under(pathname, '/portal') || under(pathname, '/api/portal') || under(pathname, '/auth') || isPublicDocument(pathname)
    if (allowed) return ALLOW
    return isApi ? DENY : { action: 'redirect', to: '/portal' }
  }

  const allowed =
    under(pathname, '/auth') ||
    isPublicDocument(pathname) ||
    pathname === '/api/portal/accept' ||
    pathname === '/api/profiles/ensure' ||
    under(pathname, '/api/auth')
  if (allowed) return ALLOW
  return isApi ? DENY : { action: 'redirect', to: '/auth/no-access' }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/auth/access-kind.test.ts src/lib/auth/route-access.test.ts`
Expected: PASS.

- [ ] **Step 6: Replace `middleware.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { fetchAccessKind } from '@/lib/auth/access-kind'
import { decideRouteAccess, isPublicRoute, type RouteDecision } from '@/lib/auth/route-access'

// /embed/* pages carry no session of their own — they authenticate via a
// sys.wolthers.com access token handed over by postMessage, and their API
// (/api/embed/*) enforces it. Redirecting them to '/' breaks the iframe:
// '/' is served with X-Frame-Options: SAMEORIGIN, so sys sees an eternal
// "Loading..." whenever the viewer lacks a qc.wolthers.com cookie.
// (isPublicRoute keeps /embed/* public for exactly that reason.)

/** Carry refreshed session cookies over to a redirect or error response. */
function withCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie)
  return to
}

function applyDecision(decision: RouteDecision, request: NextRequest, response: NextResponse): NextResponse {
  if (decision.action === 'allow') return response
  if (decision.action === 'redirect') {
    return withCookies(response, NextResponse.redirect(new URL(decision.to, request.url)))
  }
  return withCookies(response, NextResponse.json({ error: 'Forbidden' }, { status: decision.status }))
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            const cookieOptions = {
              ...options,
              path: options?.path || '/',
              sameSite: options?.sameSite || 'lax',
              secure: process.env.NODE_ENV === 'production',
            }
            request.cookies.set({ name, value, ...cookieOptions })
            response = NextResponse.next({ request: { headers: request.headers } })
            response.cookies.set({ name, value, ...cookieOptions })
          },
          remove(name: string, options: any) {
            const cookieOptions = { ...options, path: options?.path || '/' }
            request.cookies.set({ name, value: '', ...cookieOptions })
            response = NextResponse.next({ request: { headers: request.headers } })
            response.cookies.set({ name, value: '', ...cookieOptions })
          },
        },
      }
    )

    const pathname = request.nextUrl.pathname

    // Auth callback routes: getUser() can clear the PKCE code verifier the
    // code exchange needs, so these are left untouched.
    if (pathname === '/auth/callback' || pathname === '/auth/accept-invite') return response

    // IMPORTANT: awaiting getUser() refreshes the session cookie.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return applyDecision(decideRouteAccess(pathname, null), request, response)

    let kind
    try {
      kind = await fetchAccessKind(supabase as any)
    } catch (error) {
      console.error('[middleware] access check failed:', error)
      // Fail closed for data, open for page shells (their data comes from
      // the API, which is closed).
      if (pathname.startsWith('/api/')) {
        return withCookies(response, NextResponse.json({ error: 'Access check failed, please retry' }, { status: 503 }))
      }
      return response
    }

    return applyDecision(decideRouteAccess(pathname, kind), request, response)
  } catch (error) {
    if (!isPublicRoute(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return response
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 7: The no-access page**

```tsx
// src/app/auth/no-access/page.tsx
'use client'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function NoAccessPage() {
  const router = useRouter()
  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/')
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-base font-semibold text-neutral-900">No access to Wolthers QC</h1>
        <p className="mt-3 text-sm text-neutral-500">
          This account is signed in but has no access. If you were invited, open the link in your
          invitation email. Otherwise, ask your Wolthers contact to invite you.
        </p>
        <button
          onClick={signOut}
          className="mt-6 rounded-full border border-neutral-200 px-5 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Land each kind on its home after a Microsoft sign-in**

In `src/app/auth/callback/route.ts` replace the destination block

```ts
    let destination = next
    if (next === '/' && user) {
      ...
      destination = resolveLandingPath((profile as any)?.qc_role)
    }
```

with

```ts
    let destination = next
    if (next === '/' && user) {
      const supabaseAdmin = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      destination = resolveLandingPath(await accessKindForUser(supabaseAdmin as any, user.id))
    }
```

and change its import from `@/lib/portal/portal-auth` to `import { accessKindForUser, resolveLandingPath } from '@/lib/auth/access-kind'`.

- [ ] **Step 9: Remove the old landing helper from `portal-auth.ts`**

Delete `resolveLandingPath` from `src/lib/portal/portal-auth.ts`. In `src/lib/portal/portal-auth.test.ts`, delete its `describe('resolveLandingPath', ...)` block **and** remove `resolveLandingPath` from the test file's import on line 3 (the rest of that file goes in Task 22). Then `grep -rn "resolveLandingPath" src` — every remaining hit must import from `@/lib/auth/access-kind`.

- [ ] **Step 10: Typecheck and test**

Run: `npx tsc --noEmit -p .` and `npx vitest run src/lib/auth src/lib/portal src/app/api/route-exports.test.ts`
Expected: no errors; PASS.

- [ ] **Step 11: Local smoke**

Run `npm run dev`, sign in as staff: `/dashboard` and a few staff API calls work as before (Network tab: no 403/503). Visit `/auth/no-access`: the page renders. Only after Daniel has applied migration `20261014000001` (otherwise every signed-in API call returns 503 by design).

- [ ] **Step 12: Commit**

```bash
git add src/lib/auth/access-kind.ts src/lib/auth/access-kind.test.ts src/lib/auth/route-access.ts \
  src/lib/auth/route-access.test.ts middleware.ts src/app/auth/no-access/page.tsx \
  src/app/auth/callback/route.ts src/lib/portal/portal-auth.ts src/lib/portal/portal-auth.test.ts
git commit -m "feat(auth): middleware routes by access kind — clients reach only the portal, strangers only sign-in; landing by kind"
```
