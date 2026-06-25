# Shell Redesign — Header Removal, Sidebar Controls & Ctrl+K Palette — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the global top header, move the logo to the top of the left sidebar and the four header controls (language, theme, notifications, user) to its bottom, and add a context-aware Ctrl/Cmd+K command palette that finds samples, certificates, and contracts by number.

**Architecture:** The sidebar (`left-sidebar.tsx`) becomes the full-height shell chrome: a new logo header on top, a new extracted `sidebar-footer.tsx` (the four controls) on the bottom. `main-layout.tsx` drops `<Header>`, threads notification props into the sidebar, adds a floating mobile menu button, registers a global Ctrl/Cmd+K listener, and mounts a new `CommandPalette`. The palette detects scope from the pathname and queries per scope (new `/api/samples/search`, existing `/api/certificates?search=`, existing `/api/contracts/search`), routing selections through `?open=<sampleId>` (auto-open) or `?q=<text>` (prefilter) query params that the two list pages consume.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, `cmdk` (already installed), Supabase, Vitest + @testing-library/react.

## Global Constraints

- No emojis anywhere in the UI (project rule).
- No mock data (project rule).
- Keep files under ~2000 lines; flag if a touched file would exceed it.
- Trunk-based: commit directly to `main` (sole developer; Vercel auto-deploys `main`). No feature branch.
- Use the `'Inter'` font and existing Tailwind tokens (`bg-background`, `text-muted-foreground`, `bg-accent`, etc.) already in use — do not hardcode new colors.
- Spec of record: `docs/superpowers/specs/2026-06-24-shell-sidebar-command-palette-design.md`.

## File Structure

**Create**
- `src/lib/search/or-filter.ts` — pure helpers to sanitize a query term and build a PostgREST `.or()` ILIKE string. Used by the samples search route; unit-tested.
- `src/lib/search/or-filter.test.ts` — tests for the above.
- `src/app/api/samples/search/route.ts` — `GET /api/samples/search?q=` lightweight server-side sample lookup by tracking #/contract #.
- `src/components/command-palette/types.ts` — shared result types (`SampleHit`, `CertHit`, `ContractHit`, `NavTarget`, `CommandScope`).
- `src/components/command-palette/command-scope.ts` — `getCommandScope(pathname)`.
- `src/components/command-palette/selection.ts` — URL builders (`sampleOpenHref`, `certOpenHref`, `samplesFilterHref`, `certsFilterHref`).
- `src/components/command-palette/nav-targets.ts` — `NAV_TARGETS` + `filterNavTargets(query)`.
- `src/components/command-palette/command-palette.test.ts` — tests for scope/selection/nav-target helpers.
- `src/components/command-palette/command-palette.tsx` — the `CommandPalette` component.
- `src/components/layout/sidebar-footer.tsx` — the four relocated controls.
- `src/components/layout/sidebar-footer.test.tsx` — component test for the footer.

**Modify**
- `src/components/ui/command.tsx` — forward `shouldFilter` from `CommandDialog` to the inner cmdk `<Command>` (one-line prop plumbing; see Task 3).
- `src/components/layout/left-sidebar.tsx` — add logo header on top; render `<SidebarFooter>`; accept `unreadNotifications` + `onNotificationsToggle` props; remove the mobile-only language button.
- `src/components/layout/main-layout.tsx` — remove `<Header>`; thread props to both sidebar instances; mobile overlay `top-16`→`top-0`; add floating mobile menu button; add Ctrl/Cmd+K listener + mount `<CommandPalette>`.
- `src/app/samples/qc/page.tsx` — consume `?open=<sampleId>` (open detail modal) and `?q=<text>` (prefill search).
- `src/app/certificates/page.tsx` — consume `?open=<sampleId>` (open cert editor) and `?q=<text>` (prefill search).

**Delete**
- `src/components/layout/header.tsx` — after nothing imports it.

---

### Task 1: `/api/samples/search` endpoint + OR-filter helper

**Files:**
- Create: `src/lib/search/or-filter.ts`
- Test: `src/lib/search/or-filter.test.ts`
- Create: `src/app/api/samples/search/route.ts`

**Interfaces:**
- Produces: `sanitizeOrTerm(q: string): string` (strips PostgREST `.or()` delimiters `, ( )` and ILIKE wildcards `% _`); `buildOrIlike(fields: string[], term: string): string` (returns e.g. `tracking_number.ilike.%abc%,wolthers_contract_nr.ilike.%abc%`).
- Produces: `GET /api/samples/search?q=&limit=` → `{ samples: SampleHit[] }` where `SampleHit = { id: string; tracking_number: string | null; wolthers_contract_nr: string | null; origin: string | null; status: string | null }`.

- [ ] **Step 1: Write the failing test for the OR-filter helper**

Create `src/lib/search/or-filter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sanitizeOrTerm, buildOrIlike } from './or-filter'

describe('sanitizeOrTerm', () => {
  it('strips PostgREST delimiters and ILIKE wildcards', () => {
    expect(sanitizeOrTerm('ab%c_(d),e')).toBe('abcde')
  })
  it('trims surrounding whitespace', () => {
    expect(sanitizeOrTerm('  42305  ')).toBe('42305')
  })
})

describe('buildOrIlike', () => {
  it('builds a comma-joined ilike expression for each field', () => {
    expect(buildOrIlike(['tracking_number', 'wolthers_contract_nr'], 'abc')).toBe(
      'tracking_number.ilike.%abc%,wolthers_contract_nr.ilike.%abc%'
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/search/or-filter.test.ts`
Expected: FAIL — cannot find module `./or-filter`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/search/or-filter.ts`:

```ts
// Pure helpers for building safe PostgREST `.or()` ILIKE filters.
// PostgREST treats ',', '(', ')' as `.or()` delimiters and '%','_' as ILIKE
// wildcards; strip them so a pasted value can't corrupt the filter string.
export function sanitizeOrTerm(q: string): string {
  return q.trim().replace(/[%_(),]/g, '')
}

export function buildOrIlike(fields: string[], term: string): string {
  return fields.map((f) => `${f}.ilike.%${term}%`).join(',')
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/search/or-filter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Create the search route**

Create `src/app/api/samples/search/route.ts`:

```ts
// GET /api/samples/search?q=<text>&limit=20
// Lightweight server-side sample lookup for the Ctrl+K command palette.
// Matches a tracking number (= certificate number) or a Wolthers contract number.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { sanitizeOrTerm, buildOrIlike } from '@/lib/search/or-filter'

const SEARCH_FIELDS = ['tracking_number', 'wolthers_contract_nr']

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const q = (searchParams.get('q') || '').trim()
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10)
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), 50)

    const safeQ = sanitizeOrTerm(q)
    if (safeQ.length < 2) {
      return NextResponse.json({ samples: [] })
    }

    const { data: samples, error } = await (supabase as any)
      .from('samples')
      .select('id, tracking_number, wolthers_contract_nr, origin, status')
      .or(buildOrIlike(SEARCH_FIELDS, safeQ))
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (error) {
      console.error('[samples/search] query error:', error)
      return NextResponse.json({ error: 'Failed to search samples' }, { status: 500 })
    }

    return NextResponse.json({ samples: samples || [] })
  } catch (err: any) {
    console.error('[samples/search] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors).

> Note: there is no API-route test precedent in this repo; the route is verified by `tsc` and manual smoke (Task 9). The escaping/field logic it depends on is unit-tested above.

- [ ] **Step 7: Commit**

```bash
git add src/lib/search/or-filter.ts src/lib/search/or-filter.test.ts src/app/api/samples/search/route.ts
git commit -m "feat(search): add /api/samples/search endpoint + or-filter helper"
```

---

### Task 2: Command palette pure helpers (scope, selection, nav targets)

**Files:**
- Create: `src/components/command-palette/types.ts`
- Create: `src/components/command-palette/command-scope.ts`
- Create: `src/components/command-palette/selection.ts`
- Create: `src/components/command-palette/nav-targets.ts`
- Test: `src/components/command-palette/command-palette.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type CommandScope = 'samples' | 'certificates' | 'global'`
  - `getCommandScope(pathname: string): CommandScope`
  - `sampleOpenHref(sampleId: string): string` → `/samples/qc?open=<id>`
  - `certOpenHref(sampleId: string): string` → `/certificates?open=<id>`
  - `samplesFilterHref(q: string): string` → `/samples/qc?q=<q>`
  - `certsFilterHref(q: string): string` → `/certificates?q=<q>`
  - `interface NavTarget { label: string; href: string; keywords?: string }`
  - `NAV_TARGETS: NavTarget[]`, `filterNavTargets(query: string): NavTarget[]`
  - `interface SampleHit { id: string; tracking_number: string | null; wolthers_contract_nr: string | null; origin: string | null; status: string | null }`
  - `interface CertHit { id: string; certificate_number: string | null; sample_id: string | null; origin: string | null; status: string | null; sample?: { tracking_number: string | null } | null }`
  - `interface ContractHit { id: string; contract_number: string | null; seller_reference: string | null; buyer_reference: string | null; sample_count?: number }`

- [ ] **Step 1: Write the failing helper tests**

Create `src/components/command-palette/command-palette.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getCommandScope } from './command-scope'
import { sampleOpenHref, certOpenHref, samplesFilterHref, certsFilterHref } from './selection'
import { filterNavTargets, NAV_TARGETS } from './nav-targets'

describe('getCommandScope', () => {
  it('maps /samples/* to samples', () => {
    expect(getCommandScope('/samples/qc')).toBe('samples')
    expect(getCommandScope('/samples/other')).toBe('samples')
  })
  it('maps /certificates to certificates', () => {
    expect(getCommandScope('/certificates')).toBe('certificates')
  })
  it('maps everything else to global', () => {
    expect(getCommandScope('/')).toBe('global')
    expect(getCommandScope('/dashboard/metrics/overview')).toBe('global')
    expect(getCommandScope('/clients')).toBe('global')
  })
})

describe('selection href builders', () => {
  it('builds open + filter hrefs with encoding', () => {
    expect(sampleOpenHref('abc-123')).toBe('/samples/qc?open=abc-123')
    expect(certOpenHref('abc-123')).toBe('/certificates?open=abc-123')
    expect(samplesFilterHref('42305/26')).toBe('/samples/qc?q=42305%2F26')
    expect(certsFilterHref('ED-001016/26')).toBe('/certificates?q=ED-001016%2F26')
  })
})

describe('filterNavTargets', () => {
  it('returns all targets for an empty query', () => {
    expect(filterNavTargets('')).toEqual(NAV_TARGETS)
  })
  it('matches by label substring, case-insensitive', () => {
    expect(filterNavTargets('cert').some((t) => t.href === '/certificates')).toBe(true)
  })
  it('returns nothing for a non-match', () => {
    expect(filterNavTargets('zzzzz')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/command-palette/command-palette.test.ts`
Expected: FAIL — cannot find modules `./command-scope`, `./selection`, `./nav-targets`.

- [ ] **Step 3: Create the types**

Create `src/components/command-palette/types.ts`:

```ts
export type CommandScope = 'samples' | 'certificates' | 'global'

export interface SampleHit {
  id: string
  tracking_number: string | null
  wolthers_contract_nr: string | null
  origin: string | null
  status: string | null
}

export interface CertHit {
  id: string
  certificate_number: string | null
  sample_id: string | null
  origin: string | null
  status: string | null
  sample?: { tracking_number: string | null } | null
}

export interface ContractHit {
  id: string
  contract_number: string | null
  seller_reference: string | null
  buyer_reference: string | null
  sample_count?: number
}

export interface NavTarget {
  label: string
  href: string
  keywords?: string
}
```

- [ ] **Step 4: Create the scope helper**

Create `src/components/command-palette/command-scope.ts`:

```ts
import type { CommandScope } from './types'

export function getCommandScope(pathname: string): CommandScope {
  if (pathname.startsWith('/samples')) return 'samples'
  if (pathname.startsWith('/certificates')) return 'certificates'
  return 'global'
}
```

- [ ] **Step 5: Create the selection href builders**

Create `src/components/command-palette/selection.ts`:

```ts
// Centralized URL contract shared by the palette and the list pages.
// `open` carries a SAMPLE id (both the samples detail modal and the cert editor
// are keyed by sample id). `q` carries free text to prefill a list page's search.
export const sampleOpenHref = (sampleId: string) => `/samples/qc?open=${encodeURIComponent(sampleId)}`
export const certOpenHref = (sampleId: string) => `/certificates?open=${encodeURIComponent(sampleId)}`
export const samplesFilterHref = (q: string) => `/samples/qc?q=${encodeURIComponent(q)}`
export const certsFilterHref = (q: string) => `/certificates?q=${encodeURIComponent(q)}`
```

- [ ] **Step 6: Create the nav targets**

Create `src/components/command-palette/nav-targets.ts`:

```ts
import type { NavTarget } from './types'

export const NAV_TARGETS: NavTarget[] = [
  { label: 'Samples', href: '/samples/qc' },
  { label: 'Certificates', href: '/certificates' },
  { label: 'Grading', href: '/grading' },
  { label: 'Cupping', href: '/cupping' },
  { label: 'Specialty (CVA)', href: '/cupping/cva' },
  { label: 'Clients', href: '/clients' },
  { label: 'Quality Specs', href: '/quality/templates', keywords: 'templates specs' },
  { label: 'Laboratories', href: '/laboratories', keywords: 'lab' },
  { label: 'Finance', href: '/finance' },
  { label: 'Users', href: '/users' },
  { label: 'Dashboard Overview', href: '/dashboard/metrics/overview', keywords: 'dashboard metrics' },
]

export function filterNavTargets(query: string): NavTarget[] {
  const q = query.trim().toLowerCase()
  if (!q) return NAV_TARGETS
  return NAV_TARGETS.filter(
    (t) => t.label.toLowerCase().includes(q) || (t.keywords?.toLowerCase().includes(q) ?? false)
  )
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/components/command-palette/command-palette.test.ts`
Expected: PASS (8 assertions across the describes).

- [ ] **Step 8: Commit**

```bash
git add src/components/command-palette/types.ts src/components/command-palette/command-scope.ts src/components/command-palette/selection.ts src/components/command-palette/nav-targets.ts src/components/command-palette/command-palette.test.ts
git commit -m "feat(palette): scope detection, selection hrefs, and nav targets"
```

---

### Task 3: CommandPalette component

**Files:**
- Create: `src/components/command-palette/command-palette.tsx`

**Interfaces:**
- Consumes: `getCommandScope`, `sampleOpenHref`/`certOpenHref`/`samplesFilterHref`/`certsFilterHref`, `filterNavTargets`, the hit types from Task 2; `CommandDialog`/`CommandInput`/`CommandList`/`CommandEmpty`/`CommandGroup`/`CommandItem` from `@/components/ui/command`.
- Produces: `CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void })` — default export not used; named export `CommandPalette`.

- [ ] **Step 1: Implement the component**

Create `src/components/command-palette/command-palette.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { getCommandScope } from './command-scope'
import { sampleOpenHref, certOpenHref, samplesFilterHref, certsFilterHref } from './selection'
import { filterNavTargets } from './nav-targets'
import type { SampleHit, CertHit, ContractHit } from './types'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MIN_CHARS = 2
const DEBOUNCE_MS = 250

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()
  const pathname = usePathname()
  const scope = getCommandScope(pathname)

  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [samples, setSamples] = useState<SampleHit[]>([])
  const [certs, setCerts] = useState<CertHit[]>([])
  const [contracts, setContracts] = useState<ContractHit[]>([])

  const navMatches = useMemo(() => filterNavTargets(query), [query])

  // Clear transient state when the palette closes.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setSamples([])
      setCerts([])
      setContracts([])
      setLoading(false)
    }
  }, [open])

  // Debounced, scope-aware search.
  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_CHARS) {
      setSamples([]); setCerts([]); setContracts([]); setLoading(false)
      return
    }
    setLoading(true)
    const handle = setTimeout(async () => {
      const wantSamples = scope === 'samples' || scope === 'global'
      const wantCerts = scope === 'certificates' || scope === 'global'
      const wantContracts = scope === 'global'
      const enc = encodeURIComponent(q)
      const [s, c, k] = await Promise.allSettled([
        wantSamples ? fetch(`/api/samples/search?q=${enc}`).then((r) => (r.ok ? r.json() : { samples: [] })) : Promise.resolve({ samples: [] }),
        wantCerts ? fetch(`/api/certificates?search=${enc}&limit=20`).then((r) => (r.ok ? r.json() : { certificates: [] })) : Promise.resolve({ certificates: [] }),
        wantContracts ? fetch(`/api/contracts/search?q=${enc}`).then((r) => (r.ok ? r.json() : { contracts: [] })) : Promise.resolve({ contracts: [] }),
      ])
      setSamples(s.status === 'fulfilled' ? (s.value.samples ?? []) : [])
      setCerts(c.status === 'fulfilled' ? (c.value.certificates ?? []) : [])
      setContracts(k.status === 'fulfilled' ? (k.value.contracts ?? []) : [])
      setLoading(false)
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [query, scope])

  const go = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }

  const hasQuery = query.trim().length >= MIN_CHARS
  const showSamples = scope === 'samples' || scope === 'global'
  const showCerts = scope === 'certificates' || scope === 'global'
  const showContracts = scope === 'global'

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Search certificate # or contract #..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {hasQuery && !loading && samples.length === 0 && certs.length === 0 && contracts.length === 0 && navMatches.length === 0 && (
          <CommandEmpty>No results.</CommandEmpty>
        )}

        {showSamples && samples.length > 0 && (
          <CommandGroup heading="Samples">
            {samples.length > 1 && (
              <CommandItem value={`samples-all-${query}`} onSelect={() => go(samplesFilterHref(query.trim()))}>
                View all {samples.length} samples matching &quot;{query.trim()}&quot;
              </CommandItem>
            )}
            {samples.map((s) => (
              <CommandItem key={s.id} value={`sample-${s.id}`} onSelect={() => go(sampleOpenHref(s.id))}>
                <span className="font-medium">{s.tracking_number || s.id}</span>
                {s.wolthers_contract_nr && <span className="ml-2 text-xs text-muted-foreground">{s.wolthers_contract_nr}</span>}
                {s.origin && <span className="ml-auto text-xs text-muted-foreground">{s.origin}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {showCerts && certs.length > 0 && (
          <CommandGroup heading="Certificates">
            {certs.length > 1 && (
              <CommandItem value={`certs-all-${query}`} onSelect={() => go(certsFilterHref(query.trim()))}>
                View all {certs.length} certificates matching &quot;{query.trim()}&quot;
              </CommandItem>
            )}
            {certs.map((c) => (
              <CommandItem
                key={c.id}
                value={`cert-${c.id}`}
                onSelect={() => go(c.sample_id ? certOpenHref(c.sample_id) : certsFilterHref(c.certificate_number || query.trim()))}
              >
                <span className="font-medium">{c.certificate_number || c.id}</span>
                {c.sample?.tracking_number && <span className="ml-2 text-xs text-muted-foreground">{c.sample.tracking_number}</span>}
                {c.origin && <span className="ml-auto text-xs text-muted-foreground">{c.origin}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {showContracts && contracts.length > 0 && (
          <CommandGroup heading="Contracts">
            {contracts.map((k) => (
              <CommandItem
                key={k.id}
                value={`contract-${k.id}`}
                onSelect={() => go(samplesFilterHref(k.contract_number || query.trim()))}
              >
                <span className="font-medium">{k.contract_number || k.id}</span>
                {typeof k.sample_count === 'number' && (
                  <span className="ml-auto text-xs text-muted-foreground">{k.sample_count} sample{k.sample_count === 1 ? '' : 's'}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {navMatches.length > 0 && (
          <CommandGroup heading="Go to">
            {navMatches.map((t) => (
              <CommandItem key={t.href} value={`nav-${t.href}`} onSelect={() => go(t.href)}>
                {t.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
```

- [ ] **Step 2: Forward `shouldFilter` through `CommandDialog`**

The existing `CommandDialog` in `src/components/ui/command.tsx` spreads `...props` onto the Radix `<Dialog>`, not the inner cmdk `<Command>`, and is typed `DialogProps` — so `shouldFilter` would be ignored AND fail `tsc`. Pull it out explicitly and forward it to `<Command>`. Replace the `CommandDialog` definition (currently lines ~26-36):

```tsx
const CommandDialog = ({ children, shouldFilter, ...props }: DialogProps & { shouldFilter?: boolean }) => {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0 shadow-lg">
        <Command shouldFilter={shouldFilter} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}
```

This is backward-compatible: callers that don't pass `shouldFilter` get cmdk's default (`true`).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. (If `CommandInput`'s `onValueChange`/`value` types differ, adapt to the cmdk signature already used by the component in `src/components/ui/command.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add src/components/command-palette/command-palette.tsx src/components/ui/command.tsx
git commit -m "feat(palette): context-aware Ctrl+K command palette component"
```

---

### Task 4: SidebarFooter component (relocated controls)

**Files:**
- Create: `src/components/layout/sidebar-footer.tsx`
- Test: `src/components/layout/sidebar-footer.test.tsx`

**Interfaces:**
- Consumes: `useTheme()` → `{ theme, setTheme, resolvedTheme }` from `@/components/providers/theme-provider`; `useAuth()` → `{ user, profile, signOut }` from `@/components/providers/auth-provider`; shadcn `Button`, `Avatar*`, `DropdownMenu*`.
- Produces: `SidebarFooter({ isExpanded, unreadNotifications, onNotificationsToggle }: { isExpanded: boolean; unreadNotifications: number; onNotificationsToggle: () => void })`.

- [ ] **Step 1: Write the failing component test**

Create `src/components/layout/sidebar-footer.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const setTheme = vi.fn()
const signOut = vi.fn()

vi.mock('@/components/providers/theme-provider', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme }),
}))
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({
    user: { email: 'daniel@wolthers.com', user_metadata: {} },
    profile: { full_name: 'Daniel Wolthers', qc_role: 'admin' },
    signOut,
  }),
}))

import { SidebarFooter } from './sidebar-footer'

describe('SidebarFooter', () => {
  beforeEach(() => { setTheme.mockClear() })

  it('renders the language label, the unread badge, and the user initials when expanded', () => {
    render(<SidebarFooter isExpanded={true} unreadNotifications={3} onNotificationsToggle={() => {}} />)
    expect(screen.getByText('EN')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('DW')).toBeInTheDocument()
  })

  it('toggles the theme when the theme button is clicked', () => {
    render(<SidebarFooter isExpanded={true} unreadNotifications={0} onNotificationsToggle={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /toggle theme/i }))
    expect(setTheme).toHaveBeenCalledWith('dark')
  })

  it('calls onNotificationsToggle when the bell is clicked', () => {
    const onToggle = vi.fn()
    render(<SidebarFooter isExpanded={true} unreadNotifications={0} onNotificationsToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    expect(onToggle).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/layout/sidebar-footer.test.tsx`
Expected: FAIL — cannot find module `./sidebar-footer`.

- [ ] **Step 3: Implement the footer**

Create `src/components/layout/sidebar-footer.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Moon, Sun, Bell, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/components/providers/theme-provider'
import { useAuth } from '@/components/providers/auth-provider'
import { cn } from '@/lib/utils'

interface SidebarFooterProps {
  isExpanded: boolean
  unreadNotifications: number
  onNotificationsToggle: () => void
}

function getInitials(name?: string) {
  if (!name) return 'U'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

export function SidebarFooter({ isExpanded, unreadNotifications, onNotificationsToggle }: SidebarFooterProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const { user, profile, signOut } = useAuth()
  const [currentLanguage, setCurrentLanguage] = useState('EN')

  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  const handleLanguageChange = (language: string) => {
    setCurrentLanguage(language)
    // TODO: wire real i18n (out of scope — relocated from the old header as-is)
  }

  const menuSide = isExpanded ? 'top' : 'right'

  return (
    <div
      className={cn(
        'border-t border-border p-1 flex gap-1',
        isExpanded ? 'flex-row items-center justify-between px-2' : 'flex-col items-center'
      )}
    >
      {/* Language */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-9 px-2 rounded-full text-muted-foreground hover:text-foreground flex items-center gap-1.5" aria-label="Language">
            <Globe className="h-4 w-4" />
            {isExpanded && <span className="text-xs font-medium">{currentLanguage}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side={menuSide} align="start" className="min-w-[120px]">
          <DropdownMenuItem onClick={() => handleLanguageChange('EN')} className={currentLanguage === 'EN' ? 'bg-accent' : ''}>English (EN)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleLanguageChange('PT')} className={currentLanguage === 'PT' ? 'bg-accent' : ''}>Português (PT)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleLanguageChange('ES')} className={currentLanguage === 'ES' ? 'bg-accent' : ''}>Español (ES)</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Theme */}
      <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Toggle theme" className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground">
        {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      {/* Notifications */}
      <Button variant="ghost" size="sm" onClick={onNotificationsToggle} aria-label="Notifications" className="h-9 w-9 rounded-full relative text-muted-foreground hover:text-foreground">
        <Bell className="h-4 w-4" />
        {unreadNotifications > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 bg-red-500 rounded-full text-[10px] font-semibold text-white flex items-center justify-center">
            {unreadNotifications > 99 ? '99+' : unreadNotifications}
          </span>
        )}
      </Button>

      {/* User */}
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0" aria-label="User menu">
              <Avatar className="h-9 w-9">
                <AvatarImage src={user.user_metadata?.avatar_url} alt={profile?.full_name || user.email || ''} />
                <AvatarFallback className="bg-green-600 dark:bg-neutral-600 text-white">{getInitials(profile?.full_name || user.email)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={menuSide} align="end" className="w-56" forceMount>
            <div className="flex flex-col space-y-1 p-2">
              <p className="text-sm font-medium leading-none">{profile?.full_name || 'User'}</p>
              <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
              {profile?.qc_role && (
                <p className="text-xs leading-none text-muted-foreground capitalize">{profile.qc_role.replace(/_/g, ' ')}</p>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile Settings</DropdownMenuItem>
            <DropdownMenuItem>Preferences</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>Sign Out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/layout/sidebar-footer.test.tsx`
Expected: PASS (3 tests). If Radix DropdownMenu needs DOM APIs jsdom lacks, the trigger buttons still render (content is portaled only on open), so the assertions on labels/initials/badge hold.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/sidebar-footer.tsx src/components/layout/sidebar-footer.test.tsx
git commit -m "feat(layout): SidebarFooter with relocated language/theme/bell/user controls"
```

---

### Task 5: Integrate logo header + footer into LeftSidebar

**Files:**
- Modify: `src/components/layout/left-sidebar.tsx`

**Interfaces:**
- Consumes: `SidebarFooter` from Task 4.
- Produces: `LeftSidebar` gains two props — `unreadNotifications?: number` and `onNotificationsToggle?: () => void` — added to `LeftSidebarProps` and forwarded to `<SidebarFooter>`.

- [ ] **Step 1: Add the import and props**

In `src/components/layout/left-sidebar.tsx`, add to the imports near the other layout imports:

```tsx
import Image from 'next/image'
import { SidebarFooter } from './sidebar-footer'
```

Extend the props interface (currently at `interface LeftSidebarProps { ... }`):

```tsx
interface LeftSidebarProps {
  isExpanded: boolean
  sidebarMode: SidebarMode
  onModeChange: (mode: SidebarMode) => void
  onHoverEnter?: () => void
  onHoverLeave?: () => void
  unreadNotifications?: number
  onNotificationsToggle?: () => void
}
```

And destructure them in the component signature:

```tsx
export function LeftSidebar({ isExpanded, sidebarMode, onModeChange, onHoverEnter, onHoverLeave, unreadNotifications = 0, onNotificationsToggle }: LeftSidebarProps) {
```

- [ ] **Step 2: Add the logo header at the top of the aside**

In the returned JSX, the structure is `<aside ...><div className="flex flex-col h-full"> <nav ...>`. Insert a logo header as the FIRST child of the `flex flex-col h-full` div, immediately before `<nav>`:

```tsx
        {/* Logo header */}
        <Link href="/" className={cn('flex items-center border-b border-border h-16 hover:opacity-80 transition-opacity', isExpanded ? 'px-4 gap-3' : 'justify-center')}>
          <img src="/images/logos/wolthers-logo-black.svg" alt="Wolthers" className="h-7 w-auto dark:hidden" />
          <img src="/images/logos/wolthers-logo-off-white.svg" alt="Wolthers" className="h-7 w-auto hidden dark:block" />
          {isExpanded && (
            <>
              <div className="h-6 w-px bg-border" />
              <span className="text-xl font-bold text-foreground">QC</span>
            </>
          )}
        </Link>
```

(Use plain `<img>` to avoid `next/image` config for SVGs; remove the unused `Image` import from Step 1 if you do not use it — keep `tsc` clean.)

- [ ] **Step 3: Render the footer and remove the mobile-only language button**

Replace the existing mobile-only Language Selector block (the `<div className="p-1 border-t border-border lg:hidden">...</div>` at the bottom of the `flex flex-col h-full` container — it renders a static `Globe` + "Language" + "EN") with the shared footer. The footer goes ABOVE the existing "Sidebar Mode Toggle" block so the collapse control stays at the very bottom. Net result, bottom of the column reads: `<SidebarFooter/>` then the mode-toggle block.

Insert immediately before the `{/* Sidebar Mode Toggle */}` block:

```tsx
        {/* Relocated header controls */}
        <SidebarFooter
          isExpanded={isExpanded}
          unreadNotifications={unreadNotifications}
          onNotificationsToggle={() => onNotificationsToggle?.()}
        />
```

And delete the entire `{/* Language Selector - Only visible on mobile */}` block.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. Resolve any unused-import error (e.g. drop `Image`/`Globe` if no longer referenced in this file — note `Globe` was only used by the deleted mobile language button).

- [ ] **Step 5: Run the footer test + a broad smoke of the suite**

Run: `npx vitest run src/components/layout/sidebar-footer.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/left-sidebar.tsx
git commit -m "feat(layout): sidebar logo header + footer controls; drop mobile-only language button"
```

---

### Task 6: Shell restructure — remove header, mobile button, Ctrl+K + palette mount

**Files:**
- Modify: `src/components/layout/main-layout.tsx`
- Delete: `src/components/layout/header.tsx`

**Interfaces:**
- Consumes: `CommandPalette` (Task 3); `LeftSidebar` now accepts `unreadNotifications` + `onNotificationsToggle` (Task 5).
- Produces: no new exports.

- [ ] **Step 1: Swap imports**

In `src/components/layout/main-layout.tsx`, remove `import { Header } from './header'` and add:

```tsx
import { Menu } from 'lucide-react'
import { CommandPalette } from '@/components/command-palette/command-palette'
```

- [ ] **Step 2: Add palette state + global Ctrl/Cmd+K listener**

Add state next to the other `useState` calls (after `notificationsSidebarOpen`):

```tsx
  const [commandOpen, setCommandOpen] = useState(false)
```

Add this effect alongside the other hooks (it MUST be above the early `return`s for loading/unauthenticated so hook order is stable):

```tsx
  // Global Ctrl/Cmd+K opens the command palette.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
```

- [ ] **Step 3: Remove the `<Header>`, full-height the shell, thread props, fix overlay offset, add the floating button, mount the palette**

Replace the entire `return ( ... )` block of the authenticated layout with:

```tsx
  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Floating mobile menu button (no header on mobile) */}
      {!mobileMenuOpen && (
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
          className="lg:hidden fixed top-3 left-3 z-30 h-10 w-10 rounded-full bg-background border border-border shadow-md flex items-center justify-center text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - reserve space based on mode */}
        <div className={cn(
          'hidden lg:block h-full flex-shrink-0 transition-all duration-300',
          isExpanded ? 'w-64' : 'w-14'
        )}>
          <LeftSidebar
            isExpanded={isExpanded}
            sidebarMode={sidebarMode}
            onModeChange={handleSidebarModeChange}
            onHoverEnter={() => { if (sidebarMode === 'hover') setHoverExpanded(true) }}
            onHoverLeave={() => { if (sidebarMode === 'hover') setHoverExpanded(false) }}
            unreadNotifications={unreadCount}
            onNotificationsToggle={() => setNotificationsSidebarOpen(!notificationsSidebarOpen)}
          />
        </div>

        {/* Mobile Sidebar Overlay */}
        {mobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="fixed left-0 top-0 bottom-0 w-64 z-50 lg:hidden">
              <LeftSidebar
                isExpanded={true}
                sidebarMode="expanded"
                onModeChange={handleSidebarModeChange}
                unreadNotifications={unreadCount}
                onNotificationsToggle={() => setNotificationsSidebarOpen(!notificationsSidebarOpen)}
              />
            </div>
          </>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto">
            <div className="max-w-[1400px]">
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* Notifications Sidebar Overlay */}
      {notificationsSidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            onClick={() => setNotificationsSidebarOpen(false)}
          />
          <div className="fixed right-0 top-0 w-80 z-50 animate-in slide-in-from-right duration-300 max-h-screen">
            <RightSidebar onClose={() => setNotificationsSidebarOpen(false)} />
          </div>
        </>
      )}

      {/* Command palette (Ctrl/Cmd+K) */}
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  )
```

(Key diffs vs. the original: `<Header>` removed; the mobile overlay panel changed `top-16` → `top-0`; both `<LeftSidebar>` instances now pass `unreadNotifications` + `onNotificationsToggle`; the floating button and `<CommandPalette>` are added.)

- [ ] **Step 4: Delete the header**

Run: `grep -rn "layout/header'" src || echo "no importers remain"`
Expected: no importers (only `main-layout.tsx` imported it; that import was removed in Step 1). If any remain, address them first. Then:

```bash
git rm src/components/layout/header.tsx
```

- [ ] **Step 5: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm run test:run`
Expected: PASS — the full suite stays green (prior count + the new scope/selection/nav-target/or-filter/footer tests).

- [ ] **Step 6: Manual smoke (record result in the commit/notes)**

Run: `npm run dev`, log in, and confirm: no top header; sidebar runs full height with logo+QC on top and the four controls at the bottom; theme/language/bell/avatar all work from the footer in expanded AND collapsed modes; the bell opens the right notifications overlay; Ctrl/Cmd+K opens the palette and Esc closes it; at mobile width the floating button opens the sidebar overlay (which shows the footer controls).

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/main-layout.tsx
git commit -m "feat(layout): remove top header; full-height sidebar; mobile menu button; mount Ctrl+K palette"
```

---

### Task 7: Samples page consumes `?open=` / `?q=`

**Files:**
- Modify: `src/app/samples/qc/page.tsx`

**Interfaces:**
- Consumes: the URL contract from `selection.ts` (`?open=<sampleId>`, `?q=<text>`). Sets existing state `setDetailSampleId` (opens `SampleDetailModal`, gated by `detailSampleId`) and `setSearchQuery`.
- Produces: nothing.

- [ ] **Step 1: Add a mount effect that reads the query params**

In `src/app/samples/qc/page.tsx`, add this effect inside the page component, after the `useState` declarations (it reads `window.location` directly to avoid the Next `useSearchParams` Suspense requirement, then strips the params so refresh/back is clean):

```tsx
  // Consume command-palette deep links: ?open=<sampleId> opens the detail modal,
  // ?q=<text> prefills the search box. Runs once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const open = params.get('open')
    const q = params.get('q')
    if (q) setSearchQuery(q)
    if (open) setDetailSampleId(open)
    if (open || q) window.history.replaceState(null, '', window.location.pathname)
  }, [])
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. (`useEffect` is already imported on line 3; `setSearchQuery` and `setDetailSampleId` already exist.)

- [ ] **Step 3: Manual smoke**

Navigate to `/samples/qc?q=4230` → the search box shows `4230` and the list is filtered; URL is cleaned to `/samples/qc`. Navigate to `/samples/qc?open=<a real sample id>` → the detail modal opens for that sample.

- [ ] **Step 4: Commit**

```bash
git add src/app/samples/qc/page.tsx
git commit -m "feat(samples): open detail modal / prefill search from palette deep links"
```

---

### Task 8: Certificates page consumes `?open=` / `?q=`

**Files:**
- Modify: `src/app/certificates/page.tsx`

**Interfaces:**
- Consumes: the URL contract (`?open=<sampleId>`, `?q=<text>`). Sets existing state `setEditSampleId` (opens `CertificateEditOverlay`, gated by `editSampleId` — keyed by SAMPLE id) and `setSearchQuery`.
- Produces: nothing.

- [ ] **Step 1: Add a mount effect that reads the query params**

In `src/app/certificates/page.tsx`, add after the `useState` declarations:

```tsx
  // Consume command-palette deep links: ?open=<sampleId> opens the certificate
  // editor (keyed by sample id), ?q=<text> prefills the search box. Runs once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const open = params.get('open')
    const q = params.get('q')
    if (q) setSearchQuery(q)
    if (open) setEditSampleId(open)
    if (open || q) window.history.replaceState(null, '', window.location.pathname)
  }, [])
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. (`useEffect` is imported on line 3; `setSearchQuery` and `setEditSampleId` already exist.)

- [ ] **Step 3: Manual smoke**

Navigate to `/certificates?q=ED-001016` → the search box shows the value and the list filters; URL is cleaned. Navigate to `/certificates?open=<a real sample id with a certificate>` → the cert editor overlay opens for that sample.

- [ ] **Step 4: Commit**

```bash
git add src/app/certificates/page.tsx
git commit -m "feat(certificates): open cert editor / prefill search from palette deep links"
```

---

### Task 9: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full type-check + test suite**

Run: `npx tsc --noEmit && npm run test:run`
Expected: both PASS.

- [ ] **Step 2: End-to-end palette smoke**

Run `npm run dev`, log in, and verify each scope:
- On `/samples/qc`: Ctrl+K, type a known tracking/cert number → a "Samples" result appears → Enter opens that sample's detail modal. Type a Wolthers contract # with multiple samples → a "View all N samples" row appears → Enter lands on the filtered list.
- On `/certificates`: Ctrl+K, type a certificate number → a "Certificates" result → Enter opens the cert editor.
- On `/` (dashboard): Ctrl+K, type a number → grouped Samples + Certificates + Contracts results appear; typing a page name (e.g. "finance") shows a "Go to" entry that navigates.

- [ ] **Step 3: Regression check**

Confirm the existing Ctrl+S save shortcuts on `/grading` and `/cupping` still work (different key — must be unaffected), and that no page has a broken top edge where the header used to be.

- [ ] **Step 4: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore: verification fixups for shell redesign + command palette"
```

(If no fixups were needed, skip this commit.)

---

## Self-Review

**Spec coverage:**
- Remove header → Task 6. ✓
- Move 4 controls to sidebar bottom → Tasks 4–5. ✓
- Sidebar full height + logo/QC on top → Task 5. ✓
- Remove search bar → deleted with the header in Task 6. ✓
- Ctrl+K palette, context-scoped (samples/certs/global) → Tasks 2–3, 6. ✓
- Smart open-or-filter selection → Task 3 (individual rows open via `?open=`; "view all" + contract rows filter via `?q=`) + Tasks 7–8 (pages honor the params). ✓
- New `/api/samples/search` → Task 1. ✓
- Mobile floating menu button → Task 6. ✓
- Language switcher relocated as stub → Task 4. ✓
- `cmdk` value-trap guard (`shouldFilter={false}`, unique `value`) → Task 3. ✓
- Logo contrast (theme-swapped asset) → Task 5 Step 2. ✓
- Collapsed-mode dropdowns open to the side → Task 4 (`side` prop). ✓

**Placeholder scan:** No TBD/TODO-as-work-item left; the one `// TODO` in `sidebar-footer.tsx` is the intentionally-preserved i18n stub (spec non-goal), not a plan gap. All code steps include full code.

**Type consistency:** `SampleHit`/`CertHit`/`ContractHit`/`NavTarget`/`CommandScope` are defined once in `types.ts` (Task 2) and imported by the palette (Task 3); `getCommandScope`, `sampleOpenHref`, `certOpenHref`, `samplesFilterHref`, `certsFilterHref`, `filterNavTargets` names match between definition (Task 2) and use (Task 3). `SidebarFooter` prop names (`isExpanded`, `unreadNotifications`, `onNotificationsToggle`) match between Task 4 (definition), Task 5 (render), and Task 6 (the props threaded into `LeftSidebar`). The `?open=` param is a SAMPLE id in both pages (Tasks 7–8), matching `sampleOpenHref`/`certOpenHref`.

**Risk to watch during execution:** Verified during planning — `CommandDialog` does NOT forward `shouldFilter` today (spreads `...props` onto Radix `<Dialog>`, typed `DialogProps`). Task 3 Step 2 makes the concrete one-line forward edit; without it cmdk's built-in filtering would fight our id-based `value`s and `tsc` would reject the prop. Other residual risk: Radix portals + jsdom may limit how much of the open palette a component test can assert — hence the palette's full open→select path is covered by manual smoke (Task 9), while its logic is unit-tested (Task 2).
