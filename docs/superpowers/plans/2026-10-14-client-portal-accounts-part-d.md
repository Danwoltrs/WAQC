# Client Portal Accounts — Part D: Existing pages, portal shell, accept page (Tasks 15–17)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Read first: the plan index `docs/superpowers/plans/2026-10-14-client-portal-accounts.md` and the spec `docs/superpowers/specs/2026-10-14-client-portal-accounts-design.md`. Parts A–C must be done.

---

### Task 15: Existing portal data routes onto the gate; SAN out; certificate PDF by id

**Files:**
- Replace: `src/lib/portal/portal-samples.ts`, `src/lib/portal/portal-samples.test.ts`
- Replace: `src/lib/portal/portal-certificates.ts`, `src/lib/portal/portal-certificates.test.ts`
- Replace: `src/app/api/portal/overview/route.ts`, `src/app/api/portal/samples/route.ts`, `src/app/api/portal/contracts/route.ts`, `src/app/api/portal/certificates/route.ts`
- Create: `src/app/api/portal/certificates/[id]/pdf/route.ts`
- Delete: `src/app/api/portal/certificate/[slug]/pdf/route.ts` (and its empty folders)
- Modify (one cell each, so `tsc` stays green and no SAN shows until Task 16 rewrites these pages): `src/app/portal/samples/page.tsx:51`, `src/app/portal/certificates/page.tsx:51`, `src/app/portal/page.tsx` (`RecentRow` and its row label)
- Test: `src/app/api/portal/samples/route.test.ts`

**Interfaces:**
- Consumes: `requireQcPortal`, `isUuid` (Task 8); `sampleLabelText`, `sampleIdentifier` (`src/lib/sample-reference.ts`); `buildCertificatePdfResponse` (`src/lib/certificate-pdf.ts`); `trackingNumberToSlug` (`src/lib/utils.ts`, works for certificate numbers too).
- Produces:
  - `PORTAL_SAMPLE_COLUMNS: string`
  - `interface PortalSampleRow { id: string; label: string; contract: string | null; buyerRef: string | null; origin: string | null; quality: string | null; sampleType: string | null; stage: string | null; status: string | null; certificateUrl: string | null }`
  - `certificatePdfUrl(certificateId: string, companyId: string): string`
  - `mapSampleRow(row: any, companyId: string): PortalSampleRow`
  - `sampleSearchFilter(q: string): string | null` (a PostgREST `or` expression, or null for an empty search)
  - `interface PortalCertRow { id: string; certificateNumber: string; sample: string | null; contract: string | null; status: 'approved' | 'rejected'; issuedDate: string | null; downloadUrl: string }`
  - `mapCertRow(row: any, companyId: string): PortalCertRow`
  - Overview JSON: `{ rollup: StatusRollup; recent: Array<{ id: string; label: string; status: string; updatedAt: string | null }> }`
  - `GET /api/portal/certificates/[id]/pdf?company=` → the PDF

- [ ] **Step 1: Write the failing mapper tests**

```ts
// src/lib/portal/portal-samples.test.ts
import { describe, expect, it } from 'vitest'
import { certificatePdfUrl, mapSampleRow, sampleSearchFilter } from './portal-samples'

const CO = '11111111-1111-4111-8111-111111111111'

describe('mapSampleRow', () => {
  it('names a certified sample by its certificate number and links the PDF by certificate id', () => {
    const row = mapSampleRow({
      id: 's1', tracking_number: 'SAN-00231/26', origin: 'Brazil', quality_name: 'GC17', sample_type: 'pss',
      workflow_stage: 'certified', status: 'approved', wolthers_contract_nr: '42089/26', buyer_contract_nr: 'B-77',
      container_nr: null, ico_number: null, exporter_sample_number: '144/26',
      certificates: [{ id: 'cert-1', certificate_number: 'SAG-011895/26' }],
    }, CO)
    expect(row).toEqual({
      id: 's1', label: 'SAG-011895/26', contract: '42089/26', buyerRef: 'B-77', origin: 'Brazil', quality: 'GC17',
      sampleType: 'pss', stage: 'certified', status: 'approved',
      certificateUrl: `/api/portal/certificates/cert-1/pdf?company=${CO}`,
    })
    expect(JSON.stringify(row)).not.toContain('SAN-')
  })

  it('names an uncertified sample by its own identifier, else by contract', () => {
    expect(mapSampleRow({ id: 's2', exporter_sample_number: '144/26', certificates: [] }, CO).label).toBe('SMP 144/26')
    expect(mapSampleRow({ id: 's3', wolthers_contract_nr: '42090/26', certificates: [] }, CO).label).toBe('Contract 42090/26')
    expect(mapSampleRow({ id: 's4', tracking_number: 'SAN-1/26', certificates: null }, CO).label).toBe('Sample')
    expect(mapSampleRow({ id: 's4', certificates: null }, CO).certificateUrl).toBeNull()
  })
})

describe('sampleSearchFilter', () => {
  it('searches contract, buyer ref, container, ICO and sample number, never the SAN', () => {
    expect(sampleSearchFilter(' 42089 ')).toBe(
      'wolthers_contract_nr.ilike.*42089*,buyer_contract_nr.ilike.*42089*,container_nr.ilike.*42089*,ico_number.ilike.*42089*,exporter_sample_number.ilike.*42089*',
    )
  })
  it('drops characters PostgREST would read as syntax, and empty searches', () => {
    expect(sampleSearchFilter('a,b(c)*%\\')).toContain('*abc*')
    expect(sampleSearchFilter('  ')).toBeNull()
  })
})

describe('certificatePdfUrl', () => {
  it('carries the company', () => {
    expect(certificatePdfUrl('c1', CO)).toBe(`/api/portal/certificates/c1/pdf?company=${CO}`)
  })
})
```

```ts
// src/lib/portal/portal-certificates.test.ts
import { describe, expect, it } from 'vitest'
import { mapCertRow } from './portal-certificates'

const CO = '11111111-1111-4111-8111-111111111111'

describe('mapCertRow', () => {
  it('shows the certificate number, the sample\'s own identifier and the contract, never the SAN', () => {
    const row = mapCertRow({
      id: 'cert-1', certificate_number: 'SAG-011895/26', is_rejected: false, created_at: '2026-10-01T10:00:00Z',
      samples: { tracking_number: 'SAN-00231/26', wolthers_contract_nr: '42089/26', container_nr: 'HASU 155.201-6', ico_number: null, exporter_sample_number: null },
    }, CO)
    expect(row).toEqual({
      id: 'cert-1', certificateNumber: 'SAG-011895/26', sample: 'CTR HASU 155.201-6', contract: '42089/26',
      status: 'approved', issuedDate: '2026-10-01T10:00:00Z', downloadUrl: `/api/portal/certificates/cert-1/pdf?company=${CO}`,
    })
    expect(JSON.stringify(row)).not.toContain('SAN-')
  })

  it('marks rejected certificates', () => {
    expect(mapCertRow({ id: 'c', certificate_number: 'R-SAG-1/26', is_rejected: true, samples: null }, CO)).toMatchObject({ status: 'rejected', sample: null, contract: null })
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/portal/portal-samples.test.ts src/lib/portal/portal-certificates.test.ts`
Expected: FAIL (old mappers return `trackingNumber`).

- [ ] **Step 3: Implement the mappers**

```ts
// src/lib/portal/portal-samples.ts
import { sampleLabelText } from '@/lib/sample-reference'

/**
 * Portal sample rows. Never the SAN tracking number (CLAUDE.md): a sample is
 * named by its certificate number, else its own identifier, else its contract.
 */

export const PORTAL_SAMPLE_COLUMNS =
  'id, origin, quality_name, sample_type, workflow_stage, status, wolthers_contract_nr, buyer_contract_nr, container_nr, ico_number, exporter_sample_number, certificates(id, certificate_number)'

export interface PortalSampleRow {
  id: string
  label: string
  contract: string | null
  buyerRef: string | null
  origin: string | null
  quality: string | null
  sampleType: string | null
  stage: string | null
  status: string | null
  certificateUrl: string | null
}

export function certificatePdfUrl(certificateId: string, companyId: string): string {
  return `/api/portal/certificates/${encodeURIComponent(certificateId)}/pdf?company=${encodeURIComponent(companyId)}`
}

function firstCertificate(row: any): { id: string; certificate_number: string } | null {
  const c = row.certificates
  if (Array.isArray(c)) return c[0] ?? null
  return c ?? null
}

export function mapSampleRow(row: any, companyId: string): PortalSampleRow {
  const certificate = firstCertificate(row)
  const contract: string | null = row.wolthers_contract_nr ?? null
  return {
    id: row.id,
    label: sampleLabelText(
      {
        container_nr: row.container_nr ?? null,
        ico_number: row.ico_number ?? null,
        exporter_sample_number: row.exporter_sample_number ?? null,
        certificate_id: certificate?.id ?? null,
        certificate_number: certificate?.certificate_number ?? null,
      },
      contract ? `Contract ${contract}` : 'Sample',
    ),
    contract,
    buyerRef: row.buyer_contract_nr ?? null,
    origin: row.origin ?? null,
    quality: row.quality_name ?? null,
    sampleType: row.sample_type ?? null,
    stage: row.workflow_stage ?? null,
    status: row.status ?? null,
    certificateUrl: certificate ? certificatePdfUrl(certificate.id, companyId) : null,
  }
}

const SEARCH_COLUMNS = ['wolthers_contract_nr', 'buyer_contract_nr', 'container_nr', 'ico_number', 'exporter_sample_number']

/** A PostgREST `or` filter over the sample's own references, or null for an empty search. */
export function sampleSearchFilter(q: string): string | null {
  const term = q.replace(/[,()*%\\"]/g, '').trim()
  if (!term) return null
  return SEARCH_COLUMNS.map((c) => `${c}.ilike.*${term}*`).join(',')
}
```

```ts
// src/lib/portal/portal-certificates.ts
import { sampleIdentifier } from '@/lib/sample-reference'
import { certificatePdfUrl } from './portal-samples'

export interface PortalCertRow {
  id: string
  certificateNumber: string
  sample: string | null
  contract: string | null
  status: 'approved' | 'rejected'
  issuedDate: string | null
  downloadUrl: string
}

export function mapCertRow(row: any, companyId: string): PortalCertRow {
  const sample = row.samples ?? null
  const identifier = sample ? sampleIdentifier(sample) : null
  return {
    id: row.id,
    certificateNumber: row.certificate_number,
    sample: identifier ? `${identifier.tag} ${identifier.value}` : null,
    contract: sample?.wolthers_contract_nr ?? null,
    status: row.is_rejected ? 'rejected' : 'approved',
    issuedDate: row.created_at ?? null,
    downloadUrl: certificatePdfUrl(row.id, companyId),
  }
}
```

- [ ] **Step 4: Run the mapper tests**

Run: `npx vitest run src/lib/portal/portal-samples.test.ts src/lib/portal/portal-certificates.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace the four data routes**

```ts
// src/app/api/portal/overview/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { buildStatusRollup } from '@/lib/portal/portal-overview'
import { mapSampleRow, PORTAL_SAMPLE_COLUMNS } from '@/lib/portal/portal-samples'

export async function GET(request: NextRequest) {
  const gate = await requireQcPortal(request)
  if (!gate.ok) return gate.response
  const { admin, companyId } = gate.ctx
  const scope = `client_id.eq.${companyId},end_client_id.eq.${companyId}`

  const [{ data: rows }, { data: recent }] = await Promise.all([
    admin.from('samples').select('sample_type, status, workflow_stage').or(scope).is('deleted_at', null),
    admin
      .from('samples')
      .select(`${PORTAL_SAMPLE_COLUMNS}, updated_at`)
      .or(scope)
      .is('deleted_at', null)
      .in('status', ['approved', 'rejected'])
      .order('updated_at', { ascending: false })
      .limit(8),
  ])

  return NextResponse.json({
    rollup: buildStatusRollup(rows ?? []),
    recent: (recent ?? []).map((r: any) => {
      const s = mapSampleRow(r, companyId)
      return { id: s.id, label: s.label, status: s.status, updatedAt: r.updated_at ?? null }
    }),
  })
}
```

```ts
// src/app/api/portal/samples/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { mapSampleRow, PORTAL_SAMPLE_COLUMNS, sampleSearchFilter } from '@/lib/portal/portal-samples'

export async function GET(request: NextRequest) {
  const gate = await requireQcPortal(request, { view: 'qc_samples' })
  if (!gate.ok) return gate.response
  const { admin, companyId } = gate.ctx

  let query = admin
    .from('samples')
    .select(PORTAL_SAMPLE_COLUMNS)
    .or(`client_id.eq.${companyId},end_client_id.eq.${companyId}`)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)
  const search = sampleSearchFilter(request.nextUrl.searchParams.get('q') ?? '')
  if (search) query = query.or(search)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Could not load samples' }, { status: 500 })
  return NextResponse.json({ samples: (data ?? []).map((r: any) => mapSampleRow(r, companyId)) })
}
```

```ts
// src/app/api/portal/contracts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { groupSamplesByContract } from '@/lib/portal/portal-contracts'

export async function GET(request: NextRequest) {
  const gate = await requireQcPortal(request, { view: 'qc_samples' })
  if (!gate.ok) return gate.response
  const { admin, companyId } = gate.ctx
  const { data, error } = await admin
    .from('samples')
    .select('wolthers_contract_nr, status, origin')
    .or(`client_id.eq.${companyId},end_client_id.eq.${companyId}`)
    .is('deleted_at', null)
  if (error) return NextResponse.json({ error: 'Could not load contracts' }, { status: 500 })
  return NextResponse.json({ contracts: groupSamplesByContract(data ?? []) })
}
```

```ts
// src/app/api/portal/certificates/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { mapCertRow } from '@/lib/portal/portal-certificates'

export async function GET(request: NextRequest) {
  const gate = await requireQcPortal(request, { view: 'qc_certificates' })
  if (!gate.ok) return gate.response
  const { admin, companyId } = gate.ctx

  // Filtered in the database through the inner join, then checked again here.
  const { data, error } = await admin
    .from('certificates')
    .select('id, certificate_number, is_rejected, created_at, samples!inner(client_id, end_client_id, deleted_at, wolthers_contract_nr, container_nr, ico_number, exporter_sample_number)')
    .or(`client_id.eq.${companyId},end_client_id.eq.${companyId}`, { referencedTable: 'samples' })
    .is('samples.deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ error: 'Could not load certificates' }, { status: 500 })

  const rows = (data ?? []).filter((c: any) =>
    c.samples && c.samples.deleted_at == null &&
    (c.samples.client_id === companyId || c.samples.end_client_id === companyId))
  return NextResponse.json({ certificates: rows.map((c: any) => mapCertRow(c, companyId)) })
}
```

- [ ] **Step 6: The certificate PDF by id**

```ts
// src/app/api/portal/certificates/[id]/pdf/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { isUuid, requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { buildCertificatePdfResponse } from '@/lib/certificate-pdf'
import { trackingNumberToSlug } from '@/lib/utils'

/** The certificate PDF, served only when its sample belongs to the caller's company. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireQcPortal(request, { view: 'qc_certificates' })
  if (!gate.ok) return gate.response
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { admin, companyId, userId } = gate.ctx

  const { data: certificate } = await admin.from('certificates').select('id, certificate_number, sample_id').eq('id', id).maybeSingle()
  if (!certificate) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: sample } = await admin
    .from('samples')
    .select('id, client_id, end_client_id, deleted_at')
    .eq('id', certificate.sample_id)
    .maybeSingle()
  if (!sample || sample.deleted_at || (sample.client_id !== companyId && sample.end_client_id !== companyId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return buildCertificatePdfResponse(admin, trackingNumberToSlug(certificate.certificate_number), {
    sampleId: sample.id,
    audit: { channel: 'portal', actorUserId: userId },
  })
}
```

Delete the old route: `git rm "src/app/api/portal/certificate/[slug]/pdf/route.ts"`.

- [ ] **Step 7: Route test — no SAN leaves the samples route, and the gate is honoured**

```ts
// src/app/api/portal/samples/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const m = vi.hoisted(() => ({ gate: null as any, orCalls: [] as string[] }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({ ...(await orig<any>()), requireQcPortal: async () => m.gate }))

import { GET } from './route'

const CO = '11111111-1111-4111-8111-111111111111'
const rows = [{
  id: 's1', tracking_number: 'SAN-00231/26', origin: 'Brazil', quality_name: 'GC17', sample_type: 'pss', workflow_stage: 'certified',
  status: 'approved', wolthers_contract_nr: '42089/26', buyer_contract_nr: null, container_nr: null, ico_number: null,
  exporter_sample_number: null, certificates: [{ id: 'cert-1', certificate_number: 'SAG-011895/26' }],
}]
const admin = {
  from() {
    const chain: any = {
      select() { return chain }, is() { return chain }, order() { return chain }, limit() { return chain },
      or(expr: string) { m.orCalls.push(expr); return chain },
      then(ok: any, bad: any) { return Promise.resolve({ data: rows, error: null }).then(ok, bad) },
    }
    return chain
  },
}
const req = (q = '') => ({ url: `http://x/api/portal/samples?company=${CO}${q}`, nextUrl: new URL(`http://x/api/portal/samples?company=${CO}${q}`) }) as any

beforeEach(() => {
  m.orCalls = []
  m.gate = { ok: true, ctx: { admin, companyId: CO, userId: 'u', keys: { views: ['qc_samples'], capabilities: [] }, isCompanyAdmin: false, isStaffViewAs: false } }
})

describe('GET /api/portal/samples', () => {
  it('scopes to the gate company and never returns a SAN number', async () => {
    const res = await GET(req())
    const text = JSON.stringify(await res.json())
    expect(m.orCalls[0]).toBe(`client_id.eq.${CO},end_client_id.eq.${CO}`)
    expect(text).toContain('SAG-011895/26')
    expect(text).not.toContain('SAN-')
  })

  it('adds the search filter as a second condition', async () => {
    await GET(req('&q=42089'))
    expect(m.orCalls[1]).toContain('wolthers_contract_nr.ilike.*42089*')
  })

  it('returns the gate refusal unchanged', async () => {
    m.gate = { ok: false, response: NextResponse.json({ error: 'nope' }, { status: 403 }) }
    expect((await GET(req())).status).toBe(403)
  })
})
```

- [ ] **Step 8: Point the three existing pages at the new fields** (Task 16 rewrites these pages; until then they must compile and show no SAN)

In `src/app/portal/samples/page.tsx`, line 51 becomes:

```tsx
                <td className="px-5 py-3 text-neutral-900">{r.label}</td>
```

In `src/app/portal/certificates/page.tsx`, line 51 becomes:

```tsx
                  <td className="px-5 py-3 text-neutral-600">{r.sample ?? '—'}</td>
```

In `src/app/portal/page.tsx`, the local `interface RecentRow` field `tracking_number: string` becomes `label: string`, and the row cell `<span className="text-neutral-900">{r.tracking_number}</span>` becomes:

```tsx
                  <span className="text-neutral-900">{r.label}</span>
```

Then run `grep -rn "trackingNumber\|tracking_number" src/app/portal src/components/portal`. Expected: no hits.

- [ ] **Step 9: Run, typecheck, commit**

Run: `npx vitest run src/lib/portal src/app/api/portal src/app/api/route-exports.test.ts` and `npx tsc --noEmit -p .`
Expected: PASS, no type errors.

```bash
git add src/lib/portal/portal-samples.ts src/lib/portal/portal-samples.test.ts src/lib/portal/portal-certificates.ts \
  src/lib/portal/portal-certificates.test.ts src/app/api/portal/overview/route.ts src/app/api/portal/samples \
  src/app/api/portal/contracts/route.ts src/app/api/portal/certificates \
  src/app/portal/samples/page.tsx src/app/portal/certificates/page.tsx src/app/portal/page.tsx
git rm -q "src/app/api/portal/certificate/[slug]/pdf/route.ts"
git commit -m "fix(portal): data routes behind requireQcPortal with server-side company scope; no SAN numbers; certificate PDF by certificate id"
```

---

### Task 16: Portal shell — identity, company switcher, nav by keys, `portalFetch`

**Files:**
- Create: `src/lib/portal/portal-fetch.ts`, `src/lib/portal/portal-fetch.test.ts`
- Create: `src/components/portal/portal-context.tsx`
- Replace: `src/components/portal/portal-nav.ts`; Create: `src/components/portal/portal-nav.test.ts`
- Replace: `src/components/portal/portal-top-nav.tsx`, `src/components/portal/portal-top-nav.test.tsx`
- Replace: `src/components/portal/portal-shell.tsx`
- Modify: `src/app/portal/layout.tsx`
- Replace: `src/app/portal/page.tsx`, `src/app/portal/samples/page.tsx`, `src/app/portal/contracts/page.tsx`, `src/app/portal/certificates/page.tsx`

**Interfaces:**
- Consumes: `PortalMe`, `PortalCompany` (Task 14); `QcView` (Task 2); row types from Task 15.
- Produces:
  - `withCompany(path: string, companyId: string | null): string`
  - `class PortalSessionEnded extends Error`
  - `portalFetch(path: string, companyId: string | null, init?: RequestInit, go?: (url: string) => void): Promise<Response>`
  - `interface PortalState { me: PortalMe; company: PortalCompany; switchCompany(id: string): void; fetch(path: string, init?: RequestInit): Promise<Response> }`
  - `PortalProvider`, `usePortal(): PortalState`, `PortalNotice({ children })` (the shared "not part of your access" state, also in `portal-context.tsx`; Task 19 uses it)
  - `interface PortalNavItem { label: string; href: string; view?: QcView; adminOnly?: boolean }`, `PORTAL_NAV`, `visibleNav(company: Pick<PortalCompany, 'keys' | 'isCompanyAdmin'>): PortalNavItem[]` (Team needs `isCompanyAdmin`, which is `qc_manage_users` on this company; Contracts and Samples both need `qc_samples`)
  - `PortalTopNav` props: `{ pathname: string; items: PortalNavItem[]; companyId: string; companies: { id: string; name: string }[]; onSwitchCompany(id: string): void; onSignOut(): void }`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/portal/portal-fetch.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PortalSessionEnded, portalFetch, withCompany } from './portal-fetch'

afterEach(() => vi.unstubAllGlobals())

describe('withCompany', () => {
  it('adds or replaces the company and keeps other parameters', () => {
    expect(withCompany('/api/portal/samples', 'c1')).toBe('/api/portal/samples?company=c1')
    expect(withCompany('/api/portal/samples?q=42&company=old', 'c1')).toBe('/api/portal/samples?q=42&company=c1')
    expect(withCompany('/portal', null)).toBe('/portal')
  })
})

describe('portalFetch', () => {
  it('sends the person to sign in when the session has ended, instead of returning an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    const go = vi.fn()
    await expect(portalFetch('/api/portal/samples', 'c1', undefined, go)).rejects.toBeInstanceOf(PortalSessionEnded)
    expect(go).toHaveBeenCalledWith('/')
  })

  it('passes other answers through with the company attached', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await portalFetch('/api/portal/samples?q=1', 'c1', { method: 'GET' }, vi.fn())
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/samples?q=1&company=c1', { method: 'GET' })
  })
})
```

```ts
// src/components/portal/portal-nav.test.ts
import { describe, expect, it } from 'vitest'
import { visibleNav } from './portal-nav'

describe('visibleNav', () => {
  it('shows only the pages the keys allow, and Team only to company admins', () => {
    expect(visibleNav({ keys: { views: ['qc_certificates'], capabilities: [] }, isCompanyAdmin: false }).map((i) => i.label))
      .toEqual(['Overview', 'Certificates'])
    expect(visibleNav({ keys: { views: ['qc_samples', 'qc_certificates'], capabilities: [] }, isCompanyAdmin: true }).map((i) => i.label))
      .toEqual(['Overview', 'Contracts', 'Samples', 'Certificates', 'Team'])
  })
})
```

```tsx
// src/components/portal/portal-top-nav.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PortalTopNav } from './portal-top-nav'
import { PORTAL_NAV } from './portal-nav'

describe('PortalTopNav', () => {
  it('links every item with the company and marks the active one', () => {
    render(<PortalTopNav pathname="/portal/samples" items={PORTAL_NAV.slice(0, 4)} companyId="c1"
      companies={[{ id: 'c1', name: 'Roastery One' }]} onSwitchCompany={() => {}} onSignOut={() => {}} />)
    expect(screen.getByRole('link', { name: 'Samples' })).toHaveAttribute('href', '/portal/samples?company=c1')
    expect(screen.getByRole('link', { name: 'Samples' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Roastery One')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('offers a company switcher only with more than one company', () => {
    const onSwitch = vi.fn()
    render(<PortalTopNav pathname="/portal" items={PORTAL_NAV.slice(0, 1)} companyId="c1"
      companies={[{ id: 'c1', name: 'Roastery One' }, { id: 'c2', name: 'Roastery Two' }]} onSwitchCompany={onSwitch} onSignOut={() => {}} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Company' }), { target: { value: 'c2' } })
    expect(onSwitch).toHaveBeenCalledWith('c2')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/portal/portal-fetch.test.ts src/components/portal`
Expected: FAIL.

- [ ] **Step 3: Implement `portal-fetch.ts`, `portal-nav.ts`, `portal-top-nav.tsx`**

```ts
// src/lib/portal/portal-fetch.ts
/** Portal requests always carry the current company; an ended session goes to sign-in. */

export function withCompany(path: string, companyId: string | null): string {
  if (!companyId) return path
  const [base, query = ''] = path.split('?')
  const params = new URLSearchParams(query)
  params.set('company', companyId)
  return `${base}?${params.toString()}`
}

export class PortalSessionEnded extends Error {
  constructor() {
    super('Your session has ended')
    this.name = 'PortalSessionEnded'
  }
}

export async function portalFetch(
  path: string,
  companyId: string | null,
  init?: RequestInit,
  go: (url: string) => void = (url) => window.location.assign(url),
): Promise<Response> {
  const res = await fetch(withCompany(path, companyId), init)
  if (res.status === 401) {
    go('/')
    throw new PortalSessionEnded()
  }
  return res
}
```

```ts
// src/components/portal/portal-nav.ts
import type { PortalCompany } from '@/lib/portal/portal-me'
import type { QcView } from '@/lib/portal/qc-keys'

export interface PortalNavItem {
  label: string
  href: string
  view?: QcView
  adminOnly?: boolean
}

export const PORTAL_NAV: PortalNavItem[] = [
  { label: 'Overview', href: '/portal' },
  { label: 'Contracts', href: '/portal/contracts', view: 'qc_samples' },
  { label: 'Samples', href: '/portal/samples', view: 'qc_samples' },
  { label: 'Certificates', href: '/portal/certificates', view: 'qc_certificates' },
  { label: 'Team', href: '/portal/team', adminOnly: true },
]

export function visibleNav(company: Pick<PortalCompany, 'keys' | 'isCompanyAdmin'>): PortalNavItem[] {
  return PORTAL_NAV.filter(
    (item) => (!item.view || company.keys.views.includes(item.view)) && (!item.adminOnly || company.isCompanyAdmin),
  )
}
```

```tsx
// src/components/portal/portal-top-nav.tsx
'use client'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { withCompany } from '@/lib/portal/portal-fetch'
import type { PortalNavItem } from './portal-nav'

export function PortalTopNav({
  pathname, items, companyId, companies, onSwitchCompany, onSignOut,
}: {
  pathname: string
  items: PortalNavItem[]
  companyId: string
  companies: { id: string; name: string }[]
  onSwitchCompany: (id: string) => void
  onSignOut: () => void
}) {
  const current = companies.find((c) => c.id === companyId)
  return (
    <header className="bg-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <span className="text-base font-semibold tracking-tight text-neutral-900">Wolthers QC</span>
          <nav className="hidden items-center gap-1 md:flex">
            {items.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={withCompany(item.href, companyId)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm transition-colors',
                    active ? 'bg-[#556b2f]/10 font-medium text-[#556b2f]' : 'text-neutral-500 hover:text-neutral-900',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {companies.length > 1 ? (
            <select
              aria-label="Company"
              value={companyId}
              onChange={(e) => onSwitchCompany(e.target.value)}
              className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-neutral-500">{current?.name}</span>
          )}
          <button onClick={onSignOut} className="text-sm text-neutral-500 hover:text-neutral-900">Sign out</button>
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/portal/portal-fetch.test.ts src/components/portal`
Expected: PASS.

- [ ] **Step 5: Context and shell**

```tsx
// src/components/portal/portal-context.tsx
'use client'
import { createContext, useContext, type ReactNode } from 'react'
import type { PortalCompany, PortalMe } from '@/lib/portal/portal-me'

export interface PortalState {
  me: PortalMe
  company: PortalCompany
  switchCompany: (id: string) => void
  fetch: (path: string, init?: RequestInit) => Promise<Response>
}

const PortalContext = createContext<PortalState | null>(null)

export function PortalProvider({ value, children }: { value: PortalState; children: ReactNode }) {
  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
}

export function usePortal(): PortalState {
  const value = useContext(PortalContext)
  if (!value) throw new Error('usePortal must be used inside PortalShell')
  return value
}
```

```tsx
// src/components/portal/portal-shell.tsx
'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { portalFetch, withCompany } from '@/lib/portal/portal-fetch'
import type { PortalMe } from '@/lib/portal/portal-me'
import { PortalTopNav } from './portal-top-nav'
import { visibleNav } from './portal-nav'
import { PortalProvider } from './portal-context'

/** The portal is light-only: undo the app theme's `dark` class while it is open. */
function useForceLightTheme() {
  useEffect(() => {
    const root = document.documentElement
    const previous = root.className
    root.classList.remove('dark')
    root.classList.add('light')
    return () => {
      root.className = previous
    }
  }, [])
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  useForceLightTheme()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requested = searchParams.get('company')
  const [me, setMe] = useState<PortalMe | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const res = await fetch(withCompany('/api/portal/me', requested))
      if (!active) return
      if (res.status === 401) { router.replace('/'); return }
      if (res.status === 403) { router.replace('/auth/no-access'); return }
      if (!res.ok) { setError('The portal could not load. Please refresh the page.'); return }
      setMe(await res.json())
    })()
    return () => { active = false }
  }, [requested, router])

  const company = useMemo(
    () => (me ? me.companies.find((c) => c.id === requested) ?? me.companies[0] ?? null : null),
    [me, requested],
  )

  const switchCompany = useCallback((id: string) => router.push(withCompany(pathname, id)), [router, pathname])
  const scopedFetch = useCallback(
    (path: string, init?: RequestInit) => portalFetch(path, company?.id ?? null, init),
    [company?.id],
  )

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/')
  }

  if (error) {
    return <div className="flex min-h-screen items-center justify-center bg-white text-sm text-neutral-500">{error}</div>
  }
  if (!me || !company) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#556b2f]" />
      </div>
    )
  }

  return (
    <PortalProvider value={{ me, company, switchCompany, fetch: scopedFetch }}>
      <div className="min-h-screen bg-white text-neutral-900">
        {me.viewAs && (
          <div className="bg-[#556b2f] px-6 py-2 text-center text-xs text-white">
            Viewing the portal as {company.name} sees it. Read-only.
          </div>
        )}
        <PortalTopNav
          pathname={pathname}
          items={visibleNav(company)}
          companyId={company.id}
          companies={me.companies.map((c) => ({ id: c.id, name: c.name }))}
          onSwitchCompany={switchCompany}
          onSignOut={signOut}
        />
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </div>
    </PortalProvider>
  )
}
```

```tsx
// src/app/portal/layout.tsx
import { Suspense } from 'react'
import { PortalShell } from '@/components/portal/portal-shell'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <PortalShell>{children}</PortalShell>
    </Suspense>
  )
}
```

- [ ] **Step 6: A shared "not part of your access" state**

Add to `src/components/portal/portal-context.tsx`:

```tsx
export function PortalNotice({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-neutral-50 px-6 py-8 text-center text-sm text-neutral-500">{children}</p>
}
```

- [ ] **Step 7: Rewrite the four pages onto `usePortal()`**

```tsx
// src/app/portal/page.tsx
'use client'
import { useEffect, useState } from 'react'
import type { StatusRollup } from '@/lib/portal/portal-overview'
import { usePortal } from '@/components/portal/portal-context'

interface RecentRow {
  id: string
  label: string
  status: string
  updatedAt: string | null
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-100">
      <div className="text-3xl font-semibold text-neutral-900">{value}</div>
      <div className="mt-1 text-sm text-neutral-500">{label}</div>
    </div>
  )
}

export default function PortalOverviewPage() {
  const { fetch: portalFetch, company } = usePortal()
  const [rollup, setRollup] = useState<StatusRollup | null>(null)
  const [recent, setRecent] = useState<RecentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const res = await portalFetch('/api/portal/overview')
      if (!active) return
      if (res.ok) {
        const d = await res.json()
        setRollup(d.rollup)
        setRecent(d.recent)
      }
      setLoading(false)
    })().catch(() => {})
    return () => { active = false }
  }, [portalFetch, company.id])

  if (loading) return <div className="text-sm text-neutral-500">Loading...</div>

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Overview</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="PSS approved" value={rollup?.pssApproved ?? 0} />
        <StatCard label="PSS pending" value={rollup?.pssPending ?? 0} />
        <StatCard label="PSS rejected" value={rollup?.pssRejected ?? 0} />
        <StatCard label="Certified" value={rollup?.certified ?? 0} />
      </div>
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-100">
        <h2 className="mb-4 text-sm font-medium text-neutral-900">Recent approvals &amp; rejections</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500">No decisions yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                <span className="text-neutral-900">{r.label}</span>
                <span className={r.status === 'approved' ? 'text-[#22c55e]' : 'text-[#ef4444]'}>
                  {r.status === 'approved' ? 'Approved' : 'Rejected'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

```tsx
// src/app/portal/samples/page.tsx
'use client'
import { useEffect, useState } from 'react'
import type { PortalSampleRow } from '@/lib/portal/portal-samples'
import { PortalNotice, usePortal } from '@/components/portal/portal-context'

export default function PortalSamplesPage() {
  const { fetch: portalFetch, company } = usePortal()
  const [rows, setRows] = useState<PortalSampleRow[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    let active = true
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await portalFetch(`/api/portal/samples${q ? `?q=${encodeURIComponent(q)}` : ''}`)
        if (!active) return
        setDenied(res.status === 403)
        setRows(res.ok ? (await res.json()).samples : [])
      } catch {
        // session ended: portalFetch already sent the person to sign in
      }
      if (active) setLoading(false)
    }, 250)
    return () => { active = false; clearTimeout(t) }
  }, [q, portalFetch, company.id])

  if (denied) return <PortalNotice>Samples are not part of your access.</PortalNotice>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Samples</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search contract, container or sample number"
          className="w-80 rounded-full border border-neutral-200 px-4 py-2 text-sm outline-none focus:border-[#556b2f]"
        />
      </div>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-100">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">Sample</th>
              <th className="px-5 py-3 font-medium">Contract</th>
              <th className="px-5 py-3 font-medium">Origin</th>
              <th className="px-5 py-3 font-medium">Quality</th>
              <th className="px-5 py-3 font-medium">Stage</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Certificate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-neutral-500">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-neutral-500">No samples found.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 text-neutral-900">{r.label}</td>
                <td className="px-5 py-3 text-neutral-600">{r.contract ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.origin ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.quality ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.stage ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.status ?? '—'}</td>
                <td className="px-5 py-3">
                  {r.certificateUrl
                    ? <a href={r.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-[#556b2f] hover:underline">View</a>
                    : <span className="text-neutral-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

```tsx
// src/app/portal/contracts/page.tsx
'use client'
import { useEffect, useState } from 'react'
import type { PortalContractRow } from '@/lib/portal/portal-contracts'
import { PortalNotice, usePortal } from '@/components/portal/portal-context'

export default function PortalContractsPage() {
  const { fetch: portalFetch, company } = usePortal()
  const [rows, setRows] = useState<PortalContractRow[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const res = await portalFetch('/api/portal/contracts')
      if (!active) return
      setDenied(res.status === 403)
      setRows(res.ok ? (await res.json()).contracts : [])
      setLoading(false)
    })().catch(() => {})
    return () => { active = false }
  }, [portalFetch, company.id])

  if (denied) return <PortalNotice>Contracts are not part of your access.</PortalNotice>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Contracts</h1>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-100">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">Contract</th>
              <th className="px-5 py-3 font-medium">Origins</th>
              <th className="px-5 py-3 font-medium">Samples</th>
              <th className="px-5 py-3 font-medium">Approved</th>
              <th className="px-5 py-3 font-medium">Rejected</th>
              <th className="px-5 py-3 font-medium">Pending</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-neutral-500">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-neutral-500">No contracts found.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.contractNumber} className="transition-colors hover:bg-neutral-50">
                <td className="px-5 py-3 font-medium text-neutral-900">{r.contractNumber}</td>
                <td className="px-5 py-3 text-neutral-600">{r.origins.join(', ') || '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.sampleCount}</td>
                <td className="px-5 py-3 font-medium text-[#22c55e]">{r.approved}</td>
                <td className="px-5 py-3 font-medium text-[#ef4444]">{r.rejected}</td>
                <td className="px-5 py-3 text-neutral-600">{r.pending}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

```tsx
// src/app/portal/certificates/page.tsx
'use client'
import { useEffect, useState } from 'react'
import type { PortalCertRow } from '@/lib/portal/portal-certificates'
import { PortalNotice, usePortal } from '@/components/portal/portal-context'

export default function PortalCertificatesPage() {
  const { fetch: portalFetch, company } = usePortal()
  const [rows, setRows] = useState<PortalCertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const res = await portalFetch('/api/portal/certificates')
      if (!active) return
      setDenied(res.status === 403)
      setRows(res.ok ? (await res.json()).certificates ?? [] : [])
      setLoading(false)
    })().catch(() => {})
    return () => { active = false }
  }, [portalFetch, company.id])

  if (denied) return <PortalNotice>Certificates are not part of your access.</PortalNotice>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Certificates</h1>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-100">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">Certificate #</th>
              <th className="px-5 py-3 font-medium">Sample</th>
              <th className="px-5 py-3 font-medium">Contract</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Issued</th>
              <th className="px-5 py-3 font-medium">Download</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-neutral-500">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-neutral-500">No certificates found.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 font-medium text-neutral-900">{r.certificateNumber}</td>
                <td className="px-5 py-3 text-neutral-600">{r.sample ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.contract ?? '—'}</td>
                <td className="px-5 py-3">
                  <span className={r.status === 'approved'
                    ? 'inline-block rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-xs font-medium text-[#22c55e]'
                    : 'inline-block rounded-full bg-[#fee2e2] px-2.5 py-0.5 text-xs font-medium text-[#ef4444]'}>
                    {r.status === 'approved' ? 'Approved' : 'Rejected'}
                  </span>
                </td>
                <td className="px-5 py-3 text-neutral-600">
                  {r.issuedDate ? new Date(r.issuedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </td>
                <td className="px-5 py-3">
                  <a href={r.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-[#556b2f] hover:underline">Download</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Typecheck, test, commit**

Run: `npx tsc --noEmit -p .` and `npx vitest run src/lib/portal src/components/portal`
Expected: no errors; PASS.

```bash
git add src/lib/portal/portal-fetch.ts src/lib/portal/portal-fetch.test.ts src/components/portal/portal-context.tsx \
  src/components/portal/portal-nav.ts src/components/portal/portal-nav.test.ts src/components/portal/portal-top-nav.tsx \
  src/components/portal/portal-top-nav.test.tsx src/components/portal/portal-shell.tsx src/app/portal
git commit -m "feat(portal): shell from /api/portal/me — company switcher, nav by keys, staff view-as banner, light-only, session-end handling"
```

---

### Task 17: Accept page `/auth/portal-invite`

**Files:**
- Create: `src/app/auth/portal-invite/page.tsx`
- Modify: `src/components/auth/login-form.tsx` ("Forgot password?" on the password step)
- Create: `src/app/auth/reset-password/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/portal/accept` (Task 13); `supabase` browser client (`src/lib/supabase.ts`). The Microsoft button shows only when the GET answers `microsoft: true` (`NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN`, which stays unset until Daniel runs the deferred Task 1 spike).

- [ ] **Step 1: Write the page**

```tsx
// src/app/auth/portal-invite/page.tsx
'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Invitation {
  email: string
  firstName: string
  companyName: string
  inviterName: string
  expiresAt: string
  microsoft: boolean
}

function AcceptPortalInvitation() {
  const router = useRouter()
  const token = useSearchParams().get('token') ?? ''
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      const res = await fetch(`/api/portal/accept?token=${encodeURIComponent(token)}`)
      const body = await res.json().catch(() => ({}))
      if (res.ok) setInvitation(body)
      else setError(body.error ?? 'This invitation is no longer valid.')
    })()
  }, [token])

  async function accept(method: 'password' | 'microsoft') {
    if (!invitation) return
    if (method === 'password') {
      if (password.length < 8) { setError('Use a password of at least 8 characters.'); return }
      if (password !== confirm) { setError('The two passwords do not match.'); return }
    }
    setBusy(true)
    setError(null)
    const res = await fetch('/api/portal/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, method, password: method === 'password' ? password : undefined }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(body.error ?? 'Something went wrong. Please try again.')
      setBusy(false)
      return
    }
    if (method === 'password') {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: invitation.email, password })
      if (signInError) {
        setError('Your account is ready, but signing in failed. Please sign in from the home page.')
        setBusy(false)
        return
      }
      router.replace('/portal')
      return
    }
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { scopes: 'email profile openid', redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 text-neutral-900">
      <div className="w-full max-w-md">
        <h1 className="text-base font-semibold">Wolthers QC portal</h1>
        {!invitation && !error && <p className="mt-4 text-sm text-neutral-500">Loading your invitation...</p>}
        {error && <p className="mt-4 rounded-xl bg-[#fee2e2] px-4 py-3 text-sm text-[#b91c1c]">{error}</p>}
        {invitation && (
          <div className="mt-4 space-y-5">
            <p className="text-sm text-neutral-600">
              {invitation.inviterName} invited you to see {invitation.companyName}&apos;s quality control results.
            </p>
            <div>
              <label className="text-xs text-neutral-500">Email</label>
              <input value={invitation.email} readOnly className="mt-1 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="pw" className="text-xs text-neutral-500">Choose a password</label>
              <input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm outline-none focus:border-[#556b2f]" />
            </div>
            <div>
              <label htmlFor="pw2" className="text-xs text-neutral-500">Repeat the password</label>
              <input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm outline-none focus:border-[#556b2f]" />
            </div>
            <button disabled={busy} onClick={() => accept('password')}
              className="w-full rounded-full bg-[#556b2f] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">
              {busy ? 'Setting up your access...' : 'Accept and sign in'}
            </button>
            {invitation.microsoft && (
              <button disabled={busy} onClick={() => accept('microsoft')}
                className="w-full rounded-full border border-neutral-200 px-5 py-2.5 text-sm text-neutral-700 disabled:opacity-60">
                Continue with Microsoft
              </button>
            )}
            <p className="text-xs text-neutral-400">
              This invitation expires on {new Date(invitation.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PortalInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptPortalInvitation />
    </Suspense>
  )
}
```

- [ ] **Step 2: "Forgot password?" on the sign-in form** (spec §6.4: clients sign in later with email + password; WAQC has no reset flow today)

In `src/components/auth/login-form.tsx` add state and a handler next to the existing ones:

```ts
  const [resetSent, setResetSent] = useState(false)

  const handleForgotPassword = async () => {
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // The callback exchanges the recovery code for a session, then follows `next`.
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    })
    if (error) setError(error.message)
    else setResetSent(true)
  }
```

and, in the password step, directly under the "Sign In" `<Button type="submit" ...>`:

```tsx
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading || resetSent}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                >
                  {resetSent ? 'Check your email for a link to set a new password' : 'Forgot password?'}
                </button>
```

- [ ] **Step 3: The reset page**

```tsx
// src/app/auth/reset-password/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (password.length < 8) { setError('Use a password of at least 8 characters.'); return }
    if (password !== confirm) { setError('The two passwords do not match.'); return }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) { setError('The link has expired. Ask for a new one from the sign-in page.'); return }
    router.replace('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 text-neutral-900">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-base font-semibold">Set a new password</h1>
        {error && <p className="rounded-xl bg-[#fee2e2] px-4 py-3 text-sm text-[#b91c1c]">{error}</p>}
        <input type="password" autoComplete="new-password" placeholder="New password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm outline-none focus:border-[#556b2f]" />
        <input type="password" autoComplete="new-password" placeholder="Repeat the new password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm outline-none focus:border-[#556b2f]" />
        <button disabled={busy} onClick={save}
          className="w-full rounded-full bg-[#556b2f] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">
          {busy ? 'Saving...' : 'Save and sign in'}
        </button>
      </div>
    </div>
  )
}
```

(`/auth/reset-password` is under `/auth`, which middleware allows for every signed-in kind; the person arrives signed in from the recovery link. `router.replace('/')` then lands them by kind.)

Ask Daniel to check two Supabase settings before relying on this: Authentication → URL Configuration must allow `https://qc.wolthers.com/auth/callback*` (it already does if Microsoft sign-in works), and Authentication → Emails: with the built-in mailer Supabase sends only a few emails an hour; a custom SMTP sender is needed for real use.

The recovery email is sent by Supabase, not by WAQC, and carries no `HOUSE_CC`: it is an auth credential, not a QC email, and is exempt from the house rule (plan index, Global Constraints). Do not try to copy head office on it.

- [ ] **Step 4: Typecheck and local check**

Run: `npx tsc --noEmit -p .` → no errors. With `npm run dev`: open `/auth/portal-invite?token=nonsense` signed out → the invalid-invitation message, no crash; the sign-in form shows "Forgot password?" on the password step.

- [ ] **Step 5: Commit**

```bash
git add src/app/auth/portal-invite/page.tsx src/app/auth/reset-password/page.tsx src/components/auth/login-form.tsx
git commit -m "feat(portal): invitation accept page (password; Microsoft behind a flag) and a forgot-password flow"
```
