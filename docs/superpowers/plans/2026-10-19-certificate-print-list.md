# Certificates Print List, Multi-Number Search, Pagination — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/certificates`, ticked certificates stay in a print list across searches, filters, pages and reloads; one hover/tap Print menu prints big or small tins, bag sleeves or today's batch from it; the search takes a pasted list of numbers; the list pages through every certificate with server-side filters; bag sleeves stop printing the SAN.

**Architecture:** The list API (`GET /api/certificates`) moves every filter, the sort and an exact count into the PostgREST query (helpers in `src/lib/certificate-list-query.ts`), resolves multi-term searches in `src/lib/search/cert-search-multi.ts`, and gains an `ids` mode for refreshing a stored list. Filter dropdowns come from a new SQL function via `GET /api/certificates/filter-options`. On the page, a `usePrintList` hook replaces the `selectedCertificates` id set with persisted snapshots, a `PrintMenu` component replaces the "Today · N" button and the print entries of the Actions menu, and a pager drives `offset`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgREST 12) via `@/lib/supabase-server`, shadcn/ui (Popover, Button, Checkbox, Toast), vitest + Testing Library, `@react-pdf/renderer`.

**Spec:** `docs/superpowers/specs/2026-10-19-certificate-print-list-design.md`

## Global Constraints

- Never render `samples.tracking_number` (SAN-xxxxx/yy): not in UI, list rows, stored list, PDFs, QR payloads, file names. Use the certificate number, else the lot identifier / contract refs.
- Route files (`route.ts`/`route.tsx`) export only HTTP handlers; helpers live in `src/lib/` (`next build` rejects other exports while tsc/vitest pass).
- shadcn/ui only (`src/components/ui`); Inter; existing toolbar button styles; no emojis; no mock data.
- Keep `src/app/certificates/page.tsx` under ~2,000 lines; new pieces go in their own files.
- Page size 100. Caps: 50 search terms (`MAX_SEARCH_TERMS`), 300 certificates in the list and for "Add all" (`MAX_PRINT_LIST`), 50 for Download ZIP (the route refuses more).
- Dates are Santos calendar days (`America/Sao_Paulo`, `santosDayRangeUtc` in `src/lib/tin-label-batch.ts`).
- Every `localStorage` access is wrapped in try/catch; the page works without storage.
- SQL is handed to Daniel as paste-ready SQL; he applies it. WAQC migrations live in `database/migrations/`.
- Trunk-based: work and commit on `main`. Push only when Daniel says so (push = Production deploy). Commit only this work's files by path; the tree carries unrelated edits (`docs/superpowers/handoffs/2026-10-07-…`, `supabase/.temp/cli-latest`, untracked docs) that must not be committed.
- Copy (exact): "Print", "Print · {n}", "Tin labels 4 cm", "Tin labels 2.5 cm", "Bag sleeves (6 per A4)", "Today's batch · {n}", "Clear list", "Tick certificates to add them", "Restore list", "Add all {n} to list", "No certificate for: {terms}", "Only the first 50 numbers were searched".

## Review Focus

1. A pasted Excel column (`\r\n`, blank lines, trailing commas, the same number twice in different case) must become clean, distinct terms. Pinned in Task 1.
2. A stored list that is corrupt JSON, an old shape, or belongs to another user on a shared lab PC must load as empty (or that user's own), never crash or leak across users. Pinned in Task 6.
3. Paging past the end after the result set shrinks (on page 5, then a narrower filter or a deletion) must land on page 1 / the last page, never an empty table with a non-zero total. Pinned in Task 10.
4. A date filter with only one end, or from > to, or a certificate issued at 22:00 Santos (01:00 UTC next day) must count on the Santos day. Pinned in Task 3.
5. A lab unit and its contract sibling both in the list print one tin and say "2 certificates → 1 tin"; a restore that drops deleted certificates must say how many it dropped. Pinned in Tasks 6 and 7.

---

### Task 0: Branch and the already-made row fixes

**Files:**
- Modify (already edited, uncommitted): `src/app/certificates/page.tsx` (Sent cell two lines; Certificate # cell = number + bare Wolthers nr), `src/app/certificates/page.test.tsx`
- Add: `docs/superpowers/specs/2026-10-19-certificate-print-list-design.md`, this plan

- [ ] **Step 1:** `git switch main` (the working tree is on `feat/report-layout-rejection-reasons`, one docs commit ahead of main; uncommitted edits carry over). Then `git pull --ff-only`.
- [ ] **Step 2:** Run `npx vitest run src/app/certificates/page.test.tsx` — expect 4 passed.
- [ ] **Step 3: Commit**

```bash
git add src/app/certificates/page.tsx src/app/certificates/page.test.tsx docs/superpowers/specs/2026-10-19-certificate-print-list-design.md docs/superpowers/plans/2026-10-19-certificate-print-list.md
git commit -m "fix(certificates): rows two lines max — Sent date under initials, no quality or Wolthers label under the number; spec + plan for the print list"
```

---

### Task 1: Search-term splitter

**Files:**
- Create: `src/lib/search/search-terms.ts`
- Test: `src/lib/search/search-terms.test.ts`

**Interfaces:**
- Produces: `export const MAX_SEARCH_TERMS = 50`; `export interface SearchTerms { terms: string[]; capped: boolean }`; `export function splitSearchTerms(input: string): SearchTerms`

Rule: split on `[,;\r\n]+`; trim each piece; a piece containing whitespace is split on whitespace only when every whitespace-separated token contains a digit; drop empties; dedupe case-insensitively keeping the first spelling; keep the first 50 (`capped: true` when more existed).

- [ ] **Step 1: Write the failing tests**

```ts
it.each([
  ['S-1548, S-1547; 520/26', ['S-1548', 'S-1547', '520/26']],
  ['S-1548\r\nS-1547\n\n', ['S-1548', 'S-1547']],
  ['S-1548 S-1547 520/26', ['S-1548', 'S-1547', '520/26']],
  ['Comexim EU', ['Comexim EU']],
  ['Wolthers 43020', ['Wolthers 43020']],
  ['TEMU 565.799-2', ['TEMU 565.799-2']],
  [' , ,42270 ,', ['42270']],
  ['S-1548, s-1548', ['S-1548']],
  ['', []],
])('splitSearchTerms(%j)', (input, terms) => {
  expect(splitSearchTerms(input)).toEqual({ terms, capped: false })
})
it('keeps the first 50 terms and says it cut', () => {
  const input = Array.from({ length: 60 }, (_, i) => `S-${1000 + i}`).join(',')
  const r = splitSearchTerms(input)
  expect(r.terms).toHaveLength(50)
  expect(r.terms[49]).toBe('S-1049')
  expect(r.capped).toBe(true)
})
```

- [ ] **Step 2:** `npx vitest run src/lib/search/search-terms.test.ts` — FAIL (module not found).
- [ ] **Step 3:** Implement `splitSearchTerms` in `src/lib/search/search-terms.ts`.
- [ ] **Step 4:** Same command — PASS.
- [ ] **Step 5: Commit** `git add src/lib/search/search-terms.ts src/lib/search/search-terms.test.ts && git commit -m "feat(search): split a pasted list of numbers into search terms"`

---

### Task 2: Multi-term certificate search

**Files:**
- Create: `src/lib/search/cert-search-multi.ts`
- Test: `src/lib/search/cert-search-multi.test.ts`

**Interfaces:**
- Consumes: `splitSearchTerms` (Task 1); existing `resolveCertificateSearchIds(db, term)`, `SAMPLE_SCAN_LIMIT`, `MAX_SEARCH_SAMPLE_IDS` (`src/lib/search/cert-search-resolve.ts`), `buildCertificateSearchOr(like, ids)` (`src/lib/search/cert-search-filter.ts`), `sanitizeOrTerm` (`src/lib/search/or-filter.ts`), `selectInChunks` (`src/lib/supabase-in-chunks.ts`).
- Produces:
  ```ts
  export interface CertificateSearch {
    or: string | null        // PostgREST .or() filter for the certificates query; null = no search
    truncated: boolean
    failed: boolean
    unmatchedTerms: string[] // multi-term searches only; [] otherwise
    termsCapped: boolean
  }
  export const NO_MATCH_OR = 'sample_id.eq.00000000-0000-0000-0000-000000000000'
  export async function resolveCertificateSearch(db: any, input: string): Promise<CertificateSearch>
  ```

Behaviour:
- 0 terms → `{ or: null, … }`.
- 1 term → exactly today's path: `safeQ = sanitizeOrTerm(term)`; empty → `or: null`; else `or = buildCertificateSearchOr(`%${safeQ}%`, await resolveCertificateSearchIds(db, term))`, `truncated`/`failed` from the resolver.
- ≥2 terms → per term, at most 5 terms in flight: `resolveCertificateSearchIds(db, term)` plus a certificate-number scan `db.from('certificates').select('sample_id').or(`certificate_number.ilike.%${safeQ}%,issued_to.ilike.%${safeQ}%`).not('sample_id', 'is', null).limit(SAMPLE_SCAN_LIMIT)`. A term's ids = its `sampleIds` ∪ `clientSampleIds` ∪ scanned `sample_id`s. Union in term order; above `MAX_SEARCH_SAMPLE_IDS` keep the first 300 and set `truncated`. Then read which of the union have a certificate (`selectInChunks(union, c => db.from('certificates').select('sample_id').in('sample_id', c))`); a term none of whose ids has one is unmatched. `or = union.length ? `sample_id.in.(${union.join(',')})` : NO_MATCH_OR` (the URI never carries per-term ilike parts, so 50 terms stay under the ~24 KB proxy limit). Any errored scan sets `failed`.

- [ ] **Step 1: Write the failing tests** (mock `./cert-search-resolve` with `vi.mock`, a fake `db` whose `from('certificates')` chain records calls and resolves rows per test)

```ts
it('a single term takes today\'s path unchanged', async () => {
  resolveMock.mockResolvedValue({ sampleIds: ['s1'], clientSampleIds: [], truncated: false, failed: false })
  const r = await resolveCertificateSearch(db, '42270')
  expect(r.or).toBe(buildCertificateSearchOr('%42270%', { sampleIds: ['s1'], clientSampleIds: [] }))
  expect(r.unmatchedTerms).toEqual([])
})
it('two terms search the union of their samples and name the one with no certificate', async () => {
  // S-1548 → s1 (certified), S-1549 → s2 (sample exists, never certified)
  const r = await resolveCertificateSearch(db, 'S-1548, S-1549')
  expect(r.or).toBe('sample_id.in.(s1,s2)')
  expect(r.unmatchedTerms).toEqual(['S-1549'])
})
it('a certificate number in a list matches through the certificates scan', async () => {
  // resolver empty for 'SAG-011960'; certificates scan returns { sample_id: 's9' }
  expect((await resolveCertificateSearch(db, 'SAG-011960, 42270')).or).toContain('s9')
})
it('nothing matched at all filters to no rows', async () => {
  expect((await resolveCertificateSearch(db, 'zzz1, zzz2')).or).toBe(NO_MATCH_OR)
})
it('cuts the union at 300 and says so', async () => { /* two terms × 160 ids */ expect(r.truncated).toBe(true) })
it('a failed lookup marks the search incomplete', async () => { /* resolver failed: true */ expect(r.failed).toBe(true) })
it('passes on the 50-term cap', async () => { expect((await resolveCertificateSearch(db, sixtyTerms)).termsCapped).toBe(true) })
```

- [ ] **Step 2:** `npx vitest run src/lib/search/cert-search-multi.test.ts` — FAIL.
- [ ] **Step 3:** Implement `resolveCertificateSearch` in `src/lib/search/cert-search-multi.ts`.
- [ ] **Step 4:** Same command — PASS; also `npx vitest run src/lib/search` — all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(search): resolve a list of numbers as one certificate search, naming the ones with no certificate"` (add both files).

---

### Task 3: Certificate list query helpers

**Files:**
- Create: `src/lib/certificate-list-query.ts`
- Test: `src/lib/certificate-list-query.test.ts`

**Interfaces:**
- Consumes: `santosDayRangeUtc(now: Date)` from `src/lib/tin-label-batch.ts`.
- Produces:
  ```ts
  export const CERTIFICATE_PAGE_SIZE = 100
  export const MAX_CERTIFICATE_IDS = 300
  export type CertificateSortField = 'certificate_number' | 'created_at' | 'issued_to' | 'origin' | 'status'
  export type CertificateStatus = 'issued' | 'draft' | 'revoked'
  export interface CertificateListParams {
    search: string; status: CertificateStatus | null; clientId: string | null; qualityId: string | null
    dateFrom: string | null; dateTo: string | null   // YYYY-MM-DD, Santos days
    sortBy: CertificateSortField; ascending: boolean
    limit: number; offset: number                     // limit 1..300 (default 100), offset >= 0
    ids: string[]                                     // non-empty = ids mode, at most 300
  }
  export function parseCertificateListParams(sp: URLSearchParams): CertificateListParams
  export function santosDateBoundsUtc(dateFrom: string | null, dateTo: string | null): { gte: string | null; lt: string | null }
  export function applyCertificateListQuery<Q>(query: Q, p: CertificateListParams, searchOr: string | null): Q
  export function certificateListUrl(p: Partial<CertificateListParams>): string
  export interface FilterOptionRow { client_id: string; client_name: string; quality_id: string | null; quality_name: string | null }
  export function foldFilterOptions(rows: FilterOptionRow[]): { clients: { id: string; name: string }[]; qualities: { id: string; name: string; client_id: string }[] }
  ```

Query params: `search`, `status`, `client_id`, `quality_id`, `date_from`, `date_to`, `sort_by`, `sort_order` (`asc` else desc), `limit`, `offset`, `ids` (comma list). Invalid values fall back to defaults; dates must match `^\d{4}-\d{2}-\d{2}$`.

`applyCertificateListQuery` (the select must alias the embed `sample:samples(...)`):
- always `.is('sample.deleted_at', null)`;
- ids mode: `.in('id', p.ids)` and nothing else (no range, no other filters);
- `clientId` → `.eq('sample.client_id', …)`; `qualityId` → `.eq('sample.quality_spec_id', …)`; when either is set `.not('sample', 'is', null)`, otherwise `.or('sample.not.is.null,sample_id.is.null')` (a deleted sample's embed is nulled by the `.is` above, so its certificate drops; a certificate without a sample stays);
- `status` → `.eq('status', …)`; date bounds → `.gte('created_at', gte)` / `.lt('created_at', lt)`;
- `searchOr` → `.or(searchOr)` (a second `.or()` param; PostgREST ANDs them);
- sort: `origin` → `.order('sample(origin)', { ascending, nullsFirst: false })`, else `.order(sortBy, { ascending })`; then `.order('id', { ascending: false })` as tie-break so pages are stable;
- `.range(offset, offset + limit - 1)`.

`santosDateBoundsUtc`: `gte` = start of the Santos day `dateFrom` (use `santosDayRangeUtc(new Date(`${dateFrom}T12:00:00Z`)).startUtc`), `lt` = end of the Santos day `dateTo`; either may be null.

`certificateListUrl`: `/api/certificates` plus only non-default params, `search` first, in the order listed above (so the default load is exactly `/api/certificates` and a search starts `/api/certificates?search=`).

`foldFilterOptions`: clients deduped by id, sorted by name; qualities deduped by `id`+`client_id`, rows with null quality skipped.

- [ ] **Step 1: Write the failing tests** (a recording fake: every builder method pushes `[name, ...args]` to `calls` and returns the fake)

```ts
it('default list: live samples only, newest first, first page', () => {
  applyCertificateListQuery(fake, parseCertificateListParams(new URLSearchParams()), null)
  expect(calls).toEqual(expect.arrayContaining([
    ['is', 'sample.deleted_at', null], ['or', 'sample.not.is.null,sample_id.is.null'],
    ['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: false }], ['range', 0, 99],
  ]))
})
it('a client filter needs a sample', () => {
  applyCertificateListQuery(fake, parseCertificateListParams(new URLSearchParams('client_id=ahold&quality_id=q1')), null)
  expect(calls).toEqual(expect.arrayContaining([['eq', 'sample.client_id', 'ahold'], ['eq', 'sample.quality_spec_id', 'q1'], ['not', 'sample', 'is', null]]))
  expect(calls).not.toContainEqual(['or', 'sample.not.is.null,sample_id.is.null'])
})
it('sorts by the sample\'s origin', () => { /* sort_by=origin&sort_order=asc */ expect(calls).toContainEqual(['order', 'sample(origin)', { ascending: true, nullsFirst: false }]) })
it('page 3', () => { /* offset=200 */ expect(calls).toContainEqual(['range', 200, 299]) })
it('ids mode reads just those certificates', () => { /* ids=a,b */ expect(calls).toContainEqual(['in', 'id', ['a', 'b']]); expect(calls.some(c => c[0] === 'range')).toBe(false) })
it('rejects junk params', () => {
  const p = parseCertificateListParams(new URLSearchParams('limit=5000&offset=-4&sort_by=drop&status=x&date_from=yesterday'))
  expect(p).toMatchObject({ limit: 300, offset: 0, sortBy: 'created_at', status: null, dateFrom: null })
})
it('Santos days', () => {
  expect(santosDateBoundsUtc('2026-10-16', '2026-10-16')).toEqual({ gte: '2026-10-16T03:00:00.000Z', lt: '2026-10-17T03:00:00.000Z' })
  expect(santosDateBoundsUtc(null, '2026-10-16')).toEqual({ gte: null, lt: '2026-10-17T03:00:00.000Z' })
})
it('a certificate at 22:00 Santos on the 16th is inside the 16th', () => {
  const { gte, lt } = santosDateBoundsUtc('2026-10-16', '2026-10-16')
  const at = '2026-10-17T01:00:00.000Z'
  expect(at >= gte! && at < lt!).toBe(true)
})
it('builds list URLs without defaults', () => {
  expect(certificateListUrl({})).toBe('/api/certificates')
  expect(certificateListUrl({ search: '42270', offset: 100 })).toBe('/api/certificates?search=42270&offset=100')
})
it('folds filter options', () => {
  expect(foldFilterOptions([
    { client_id: 'a', client_name: 'Ahold', quality_id: 'q1', quality_name: 'SAG' },
    { client_id: 'a', client_name: 'Ahold', quality_id: 'q2', quality_name: 'SAK' },
    { client_id: 'd', client_name: 'Dunkin', quality_id: null, quality_name: null },
  ])).toEqual({
    clients: [{ id: 'a', name: 'Ahold' }, { id: 'd', name: 'Dunkin' }],
    qualities: [{ id: 'q1', name: 'SAG', client_id: 'a' }, { id: 'q2', name: 'SAK', client_id: 'a' }],
  })
})
```

- [ ] **Step 2:** `npx vitest run src/lib/certificate-list-query.test.ts` — FAIL.
- [ ] **Step 3:** Implement the module.
- [ ] **Step 4:** Same command — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(certificates): list query helpers — server-side filters, Santos days, stable paging"` (add both files).

---

### Task 4: Filter options (SQL + route)

**Files:**
- Create: `database/migrations/20261019000000_certificate_list_filter_options.sql`
- Create: `src/app/api/certificates/filter-options/route.ts`
- Test: `src/app/api/certificates/filter-options/route.test.ts`

**Interfaces:**
- Consumes: `foldFilterOptions`, `FilterOptionRow` (Task 3).
- Produces: `GET /api/certificates/filter-options` → `200 { clients: {id,name}[], qualities: {id,name,client_id}[] }`, `401` without a user, `500 { error }` when the RPC fails.

- [ ] **Step 1: Write the migration** (paste-ready; no `SELECT … INTO`, no `CREATE TABLE`, so the Supabase editor appends nothing):

```sql
-- Every QC client and quality that has a live certificate, for the
-- /certificates Client and Quality filters. Security invoker: RLS applies.
create or replace function public.certificate_list_filter_options()
returns table (client_id uuid, client_name text, quality_id uuid, quality_name text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct
    s.client_id,
    coalesce(nullif(c.fantasy_name, ''), c.name) as client_name,
    s.quality_spec_id as quality_id,
    case when s.quality_spec_id is null then null
         else coalesce(nullif(cq.custom_name, ''), qt.name, 'Unknown') end as quality_name
  from certificates ce
  join samples s on s.id = ce.sample_id and s.deleted_at is null
  join companies c on c.id = s.client_id
  left join client_qualities cq on cq.id = s.quality_spec_id
  left join quality_templates qt on qt.id = cq.template_id;
$$;

grant execute on function public.certificate_list_filter_options() to authenticated;
```

- [ ] **Step 2:** Hand Daniel the SQL above to run in the Supabase SQL editor, plus this check, and wait for his result:

```sql
select count(*) as rows, count(distinct client_id) as clients from public.certificate_list_filter_options();
select count(*) filter (where sample_id is null) as certificates_without_sample from certificates;
```

(The second number decides Task 5's fallback: see Task 5 Step 6.)

- [ ] **Step 3: Write the failing route test** — mock `@/lib/supabase-server` with a client whose `auth.getUser` returns a user and whose `rpc('certificate_list_filter_options')` resolves two rows; expect the folded body. A second test: `rpc` returns `{ error: { message: 'boom' } }` → status 500.
- [ ] **Step 4:** `npx vitest run src/app/api/certificates/filter-options` — FAIL.
- [ ] **Step 5:** Implement `GET` (auth first, then `supabase.rpc`, then `foldFilterOptions`). Export only `GET`.
- [ ] **Step 6:** Same command — PASS.
- [ ] **Step 7: Commit** `git commit -m "feat(certificates): filter options from every certificate, not the newest 100"` (add the three files).

---

### Task 5: Certificates list route — paging, filters, ids, multi-term search

**Files:**
- Modify: `src/app/api/certificates/route.ts` (params block ~lines 42-53, filters/search/sort/range ~132-185, the post-range deleted/client filter ~194-205, the clients/qualities maps ~207-230, response ~354-367)
- Test: `src/app/api/certificates/route.test.ts`

**Interfaces:**
- Consumes: `parseCertificateListParams`, `applyCertificateListQuery`, `santosDateBoundsUtc` (Task 3); `resolveCertificateSearch` (Task 2).
- Produces: response `{ certificates, total: number, has_more: boolean, search_truncated, search_incomplete, unmatched_terms: string[], terms_capped: boolean }`. `total` is the exact count of the filtered set (`select(…, { count: 'exact' })`); in ids mode `total = certificates.length`. `has_more = offset + certificates.length < total`. `clients` / `qualities` leave this response (Task 4 serves them).

Changes: parse params with `parseCertificateListParams`; resolve search with `resolveCertificateSearch(supabase, p.search)` (skip in ids mode); build the query with `applyCertificateListQuery(query, p, search.or)`; delete the post-range `deleted_at` and `client_id` filters and the clients/qualities maps; the send-status and approved-with-comments enrichment stay as they are, over the returned rows.

- [ ] **Step 1: Write the failing tests** — turn the user-DB fake in `route.test.ts` into a recording builder (methods `select, eq, neq, is, not, or, in, gte, lt, order, range`; `select` records its options; resolves `{ data: [certRow], error: null, count: 1346 }`). Keep the existing send-status test. Add:

```ts
it('pages and filters in the query and returns the exact total', async () => {
  const res = await GET({ nextUrl: new URL('http://localhost/api/certificates?client_id=ahold&sort_by=origin&sort_order=asc&offset=100') } as never)
  const body = await res.json()
  expect(calls).toEqual(expect.arrayContaining([
    ['select', expect.any(String), { count: 'exact' }],
    ['eq', 'sample.client_id', 'ahold'], ['order', 'sample(origin)', { ascending: true, nullsFirst: false }], ['range', 100, 199],
  ]))
  expect(body.total).toBe(1346)
  expect(body.has_more).toBe(true)
  expect(body).not.toHaveProperty('clients')
})
it('ids mode returns just those certificates', async () => {
  await GET({ nextUrl: new URL('http://localhost/api/certificates?ids=cert-877') } as never)
  expect(calls).toContainEqual(['in', 'id', ['cert-877']])
})
it('a list search reports the numbers with no certificate', async () => {
  // vi.mock('@/lib/search/cert-search-multi') → { or: 'sample_id.in.(san-921)', unmatchedTerms: ['S-1549'], termsCapped: false, truncated: false, failed: false }
  const body = await (await GET({ nextUrl: new URL('http://localhost/api/certificates?search=S-1548,S-1549') } as never)).json()
  expect(calls).toContainEqual(['or', 'sample_id.in.(san-921)'])
  expect(body.unmatched_terms).toEqual(['S-1549'])
})
```

- [ ] **Step 2:** `npx vitest run src/app/api/certificates/route.test.ts` — the new tests FAIL.
- [ ] **Step 3:** Implement the route changes.
- [ ] **Step 4:** Same command — PASS; `npx tsc --noEmit -p .` shows no errors in the touched files.
- [ ] **Step 5: Live check against the real database.** With `npm run dev -- -p 3000` running and Daniel signed in in the browser, open `http://localhost:3000/api/certificates?limit=1` and `…?limit=1&offset=100&sort_by=origin&sort_order=asc` and `…?client_id=<an Ahold id from filter-options>`. Expected: 200, `total` equals Daniel's `select count(*) from certificates ce left join samples s on s.id = ce.sample_id where ce.sample_id is null or s.deleted_at is null;`, and no `PGRST` error.
- [ ] **Step 6: Fallback, only if Step 5 fails** with a PGRST parse error on the `sample.not.is.null` / `sample(origin)` syntax or a wrong total: if Task 4 Step 2 reported `certificates_without_sample = 0`, switch the embed to `sample:samples!inner(...)` and replace the `or(...)`/`not(...)` calls in `applyCertificateListQuery` with nothing (inner join already requires a sample); update Task 3's tests to match; re-run Step 5. If that count is not 0, stop and report to Daniel.
- [ ] **Step 7: Commit** `git commit -m "feat(certificates): the list API pages, filters and counts on the server, reads a list by id, takes a list of numbers"` (route + test).

---

### Task 6: Print list core

**Files:**
- Create: `src/lib/print-list.ts`
- Test: `src/lib/print-list.test.ts`

**Interfaces:**
- Consumes: `clientContractRef`, `CertificateListSample` (`src/lib/certificate-list.ts`); `certificatesToTinSampleIds`, `PrintSelectionCertificate` (`src/lib/print-selection.ts`).
- Produces:
  ```ts
  export const MAX_PRINT_LIST = 300
  export interface PrintListEntry {
    id: string; certificate_number: string; sample_id: string | null; lab_source_sample_id: string | null
    client_name: string | null; contract_ref: string | null; buyer_id: string | null; seller_id: string | null
  }
  export interface PrintListSource {
    id: string; certificate_number: string; issued_to?: string | null; sample_id: string | null
    buyer_id?: string | null; seller_id?: string | null
    sample?: (CertificateListSample & { lab_source_sample_id?: string | null; client?: { name?: string | null; company?: string | null; fantasy_name?: string | null } | null }) | null
  }
  export function toPrintListEntry(cert: PrintListSource): PrintListEntry
  export function printListStorageKey(userId: string): string        // `waqc:certificates:print-list:v1:${userId}`
  export function readPrintList(storage: Pick<Storage, 'getItem'> | null, userId: string): PrintListEntry[]
  export function writePrintList(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, userId: string, entries: PrintListEntry[]): void
  export function printListSelection(entries: PrintListEntry[]): PrintSelectionCertificate[]
  export function tinCountLine(entries: PrintListEntry[]): string                  // "7 certificates → 5 tins"
  export function tinCountNote(entries: PrintListEntry[]): string | undefined      // today's page copy, moved here
  ```

`client_name` = `fantasy_name || company || name || issued_to || null`; `contract_ref` = `clientContractRef(sample)`. `readPrintList` returns `[]` on missing/corrupt JSON, a non-array, or entries without string `id` and `certificate_number`; keeps at most 300. `writePrintList` removes the key for an empty list; both swallow storage exceptions. `tinCountNote` keeps today's text exactly (`"{n} certificates -> {m} tin label(s) (contract siblings share their lot's label)."`, undefined when nothing collapses) and replaces `tinLabelCountNote` in `page.tsx` (Task 11).

- [ ] **Step 1: Write the failing tests**

```ts
it('round-trips through storage under the user\'s own key', () => { /* write for u-1, read for u-1 → same; read for u-2 → [] */ })
it.each(['not json', '{"a":1}', '[{"id":3}]'])('a corrupt stored list (%s) loads empty', (raw) => {
  expect(readPrintList({ getItem: () => raw }, 'u-1')).toEqual([])
})
it('storage that throws never breaks the page', () => {
  const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => {} }
  expect(readPrintList(broken, 'u-1')).toEqual([])
  expect(() => writePrintList(broken, 'u-1', [entry('c1')])).not.toThrow()
})
it('an entry never carries the SAN', () => {
  const e = toPrintListEntry({ id: 'c1', certificate_number: 'SAG-011960/26', sample_id: 's1', sample: { lab_source_sample_id: null, tracking_number: 'SAN-00921/26' } as never })
  expect(JSON.stringify(e)).not.toContain('SAN-')
})
it('a lab unit and its sibling are one tin', () => {
  const list = [entry('c1', { sample_id: 'lab' }), entry('c2', { sample_id: 'sib', lab_source_sample_id: 'lab' })]
  expect(tinCountLine(list)).toBe('2 certificates → 1 tin')
})
it('singular copy', () => { expect(tinCountLine([entry('c1')])).toBe('1 certificate → 1 tin') })
```

- [ ] **Step 2:** `npx vitest run src/lib/print-list.test.ts` — FAIL.
- [ ] **Step 3:** Implement the module.
- [ ] **Step 4:** Same command — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(certificates): print list entries, per-user storage, tin count"` (add both files).

---

### Task 7: `usePrintList` hook

**Files:**
- Create: `src/components/certificates/print-list/use-print-list.ts`
- Test: `src/components/certificates/print-list/use-print-list.test.tsx`

**Interfaces:**
- Consumes: Task 6 exports; `certificateListUrl` (Task 3) for the refresh URL (`certificateListUrl({ ids })`).
- Produces:
  ```ts
  export interface PrintList {
    entries: PrintListEntry[]; count: number; full: boolean; ready: boolean
    has(id: string): boolean
    toggle(cert: PrintListSource): boolean        // false = refused, the list is full
    addMany(certs: PrintListSource[]): number     // how many were added (cap respected, duplicates skipped)
    remove(id: string): void
    removeMany(ids: string[]): void
    clear(): void
    restore(entries: PrintListEntry[]): void
  }
  export function usePrintList(userId: string | null, opts?: { onRestored?: (r: { kept: number; dropped: number }) => void }): PrintList
  ```

On a non-null `userId`: read `window.localStorage` via `readPrintList`; if it holds entries, fetch `certificateListUrl({ ids })`; on 200 keep the returned certificates in stored order (mapped through `toPrintListEntry`), report `{ kept, dropped }` via `onRestored`; on a failed fetch keep the stored entries unchanged. `ready` turns true after that. Every change after `ready` is written with `writePrintList`; nothing is written before `ready` (so a slow refresh cannot wipe the stored list).

- [ ] **Step 1: Write the failing tests** (`renderHook`; `localStorage.clear()` in `beforeEach`; stub `fetch`)

```ts
it('restores the stored list, refreshed, and says how many left', async () => {
  writePrintList(localStorage, 'u-1', [entry('c1'), entry('c2')])
  fetchMock.mockResolvedValue(json({ certificates: [apiCert('c2')], total: 1 }))
  const onRestored = vi.fn()
  const { result } = renderHook(() => usePrintList('u-1', { onRestored }))
  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(fetchMock).toHaveBeenCalledWith('/api/certificates?ids=c1%2Cc2', expect.anything())
  expect(result.current.entries.map(e => e.id)).toEqual(['c2'])
  expect(onRestored).toHaveBeenCalledWith({ kept: 1, dropped: 1 })
})
it('keeps the stored list when the refresh fails', async () => { /* fetch rejects → entries c1,c2 */ })
it('toggle adds then removes, and persists', async () => { /* toggle(apiCert('c3')) → readPrintList(localStorage,'u-1') has c3; again → gone */ })
it('refuses the 301st certificate', async () => { /* addMany 300 → toggle returns false, count 300, full true */ })
it('another user on the same browser starts with their own list', async () => { /* stored for u-1, hook for u-2 → [] and no fetch */ })
```

(Use whatever URL encoding `certificateListUrl` produces; assert with that helper rather than a literal if it differs.)

- [ ] **Step 2:** `npx vitest run src/components/certificates/print-list/use-print-list.test.tsx` — FAIL.
- [ ] **Step 3:** Implement the hook.
- [ ] **Step 4:** Same command — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(certificates): usePrintList — ticks survive searches, pages and reloads"`.

---

### Task 8: Today's batch hook + tin dialog with a preset size

**Files:**
- Modify: `src/components/samples/print-today-tin-labels-button.tsx`
- Modify: `src/components/samples/tin-label-size-dialog.tsx`
- Test: `src/components/samples/tin-label-size-dialog.test.tsx` (new), `src/components/samples/print-today-tin-labels-button.test.tsx` (new)

**Interfaces:**
- Produces:
  - `export function useTodayTinBatch(refreshToken?: number): { sampleIds: string[]; error: string | null; loaded: boolean; refresh: () => Promise<void> }` — the fetch/state logic now inside `PrintTodayTinLabelsButton`, moved out unchanged; the button uses it (its look and behaviour on `/samples/qc` do not change).
  - `TinLabelSizeDialog` gains `size?: TinLabelSize`. When set: no radio step; on open it generates at that size at once, the first dialog shows `Generating {n} tin label(s) at {size}…` with a spinner, then the preview opens as today; on failure the existing error toast fires and the dialog closes (`onOpenChange(false)`). Without `size`, behaviour is unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
it('with a preset size it generates straight away at that size', async () => {
  render(<TinLabelSizeDialog open sampleIds={['s1', 's2']} size="2.5cm" onOpenChange={() => {}} />)
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ sample_ids: ['s1', 's2'], size: '2.5cm' })
  expect(screen.queryByText('Select tin label size')).not.toBeInTheDocument()
})
it('without a size it still asks first', () => { /* 'Select tin label size' shown, no fetch */ })
it('the Today button still shows the count', async () => { /* pending-today → { sample_ids: ['a','b'] } → 'Today · 2' */ })
```

- [ ] **Step 2:** `npx vitest run src/components/samples/tin-label-size-dialog.test.tsx src/components/samples/print-today-tin-labels-button.test.tsx` — FAIL.
- [ ] **Step 3:** Implement both changes.
- [ ] **Step 4:** Same command — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(print): today's tin batch as a hook; tin dialog can start at a chosen size"`.

---

### Task 9: `PrintMenu`

**Files:**
- Create: `src/components/certificates/print-list/print-menu.tsx`
- Test: `src/components/certificates/print-list/print-menu.test.tsx`

**Interfaces:**
- Consumes: `PrintListEntry`, `tinCountLine`, `printListSelection` (Task 6); `certificatesToTinSampleIds` (`src/lib/print-selection.ts`); `TinLabelSize` (`src/components/samples/tin-label-size-dialog.tsx`).
- Produces:
  ```ts
  export interface PrintMenuProps {
    entries: PrintListEntry[]
    today: { count: number; loaded: boolean; error: string | null }
    onPrintTins: (size: TinLabelSize) => void
    onPrintBagSleeves: () => void
    onPrintToday: () => void
    onRemove: (id: string) => void
    onClear: () => void
  }
  export function PrintMenu(props: PrintMenuProps): JSX.Element
  ```

shadcn `Popover`, controlled. Opens 120 ms after the pointer enters the trigger, stays open while the pointer is over trigger or content, closes 200 ms after it leaves both; a click or tap toggles it. Trigger: outline `Button` size sm with `Printer` icon, "Print" or "Print · {n}". Content top to bottom: `tinCountLine(entries)` (or "Tick certificates to add them" when empty); "Tin labels 4 cm"; "Tin labels 2.5 cm"; "Bag sleeves (6 per A4)" — all three disabled when `certificatesToTinSampleIds(printListSelection(entries))` is empty; separator; "Today's batch · {count}" ("Today's batch unavailable" with the error as title when `today.error`; disabled when count is 0); separator; the entries (certificate number in mono, client name, contract ref; an × button with `aria-label="Remove {certificate_number}"`), scrolling past ~8 rows (`max-h-72 overflow-y-auto`); "Clear list" (hidden when empty). Each action closes the menu.

- [ ] **Step 1: Write the failing tests**

```ts
it('a tap opens it (iPads have no hover)', async () => { fireEvent.click(screen.getByRole('button', { name: /Print/ })); expect(await screen.findByText('Tin labels 4 cm')).toBeVisible() })
it('a resting mouse opens it', async () => { vi.useFakeTimers(); fireEvent.mouseEnter(trigger); act(() => vi.advanceTimersByTime(150)); expect(screen.getByText('Bag sleeves (6 per A4)')).toBeInTheDocument() })
it('shows the count and the tin dedupe', () => { /* 2 entries, siblings → 'Print · 2' and '2 certificates → 1 tin' */ })
it('an empty list offers only today\'s batch', () => { /* tin/bag items aria-disabled, 'Tick certificates to add them', "Today's batch · 3" enabled */ })
it('picks a size', () => { /* click 'Tin labels 2.5 cm' → onPrintTins('2.5cm') */ })
it('removes one certificate', () => { /* click 'Remove SAG-011960/26' → onRemove('c1') */ })
```

- [ ] **Step 2:** `npx vitest run src/components/certificates/print-list/print-menu.test.tsx` — FAIL.
- [ ] **Step 3:** Implement `PrintMenu`.
- [ ] **Step 4:** Same command — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(certificates): Print menu — tins big or small, bag sleeves, today's batch, the list itself"`.

---

### Task 10: Page — server-side paging and filters, pager, SAN-free sample cell

**Files:**
- Create: `src/components/certificates/certificate-pager.tsx`
- Modify: `src/app/certificates/page.tsx` (state ~264-300, the load effect + `loadCertificates` ~338-397, `filteredCertificates` memo ~399-468, count/notice ~870-882, sample cell ~1080-1105, table footer)
- Test: `src/app/certificates/page.test.tsx`

**Interfaces:**
- Consumes: `certificateListUrl`, `CERTIFICATE_PAGE_SIZE` (Task 3); `GET /api/certificates/filter-options` (Task 4); response fields from Task 5; `sampleIdentifier` (`src/lib/sample-reference.ts`).
- Produces: `export function CertificatePager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }): JSX.Element | null` — "Previous" / "Page {page} of {pages}" / "Next" (buttons disabled at the ends), renders nothing when `total <= pageSize`.

Page changes:
- `loadCertificates` requests `certificateListUrl({ search, status, clientId, qualityId, dateFrom, dateTo, sortBy, ascending, offset: (page - 1) * 100 })`; stores `certificates` and `total`. The `latestRequestGate` stays. Debounce 300 ms while the search box is non-empty, immediate otherwise.
- The rows are the response as returned: delete the client-side status/client/quality/date filtering and sorting (keep the `filteredCertificates` name only if it saves churn; it is now just `certificates`).
- Any change to search, status chip, client, quality, dates or sort sets `page` to 1. If a response has no rows, `total > 0` and `page > 1`, jump to the last page.
- Client and Quality options come from one `fetch('/api/certificates/filter-options')` on mount; a failure leaves the dropdowns as "All" only.
- The count reads `{total.toLocaleString('en-US')} certificates`; the "newest N only — narrow the search" notice is removed; the incomplete / too-broad notices stay.
- Pager under the table.
- Sample cell: PSS → `exporter_sample_number || '-'`; SS → ICO on line 1, container on line 2 with `truncate` and `title={container}` (the wrapping `div` gets `min-w-0`); any other type → `sampleIdentifier(cert.sample)?.value ?? '-'`. `parseTrackingNumber` goes if nothing else uses it (the row link `href` keeps `trackingNumberToSlug`).

- [ ] **Step 1: Write the failing tests** (keep the four existing tests; their URLs stay valid because `certificateListUrl` omits defaults and puts `search` first; add `total` to their stubbed bodies)

```ts
it('asks the server for the next page', async () => {
  // stub: any /api/certificates* → { certificates: [cert(1)], total: 250 }
  render(<CertificatesPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
  await waitFor(() => expect(urls()).toContain('/api/certificates?offset=100'))
  expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
  expect(screen.getByTestId('certificates-count')).toHaveTextContent('250 certificates')
})
it('a status chip filters on the server and goes back to page 1', async () => {
  // on page 2, click 'Draft' → last URL is '/api/certificates?status=draft'
})
it('a page that emptied after a narrower filter jumps back to the last page', async () => {
  // offset=200 → { certificates: [], total: 120 } → next request offset=100
})
it('the sample cell never shows the SAN', async () => {
  // cert(1) with sample_type 'type', no identifiers, tracking_number 'SAN-0991/26' → row text has no 'SAN-'
  // cert(2) SS with container 'TEMU 565.799-2' → that text inside an element with class 'truncate'
})
```

- [ ] **Step 2:** `npx vitest run src/app/certificates/page.test.tsx` — new tests FAIL.
- [ ] **Step 3:** Implement `CertificatePager` and the page changes.
- [ ] **Step 4:** Same command — PASS; `npx tsc --noEmit -p .` clean for these files; `wc -l src/app/certificates/page.tsx` under 2,000.
- [ ] **Step 5: Commit** `git commit -m "feat(certificates): pages of 100 with server-side filters and the real total; sample cell shows no SAN"`.

---

### Task 11: Page — print list, Print menu, Add all, pasted lists

**Files:**
- Modify: `src/app/certificates/page.tsx` (selection state + handlers ~293-299 / 518-535, bulk download ~538, Actions menu ~884-958, `PrintTodayTinLabelsButton` ~959, row + header checkboxes, tin/bag dialogs ~1404-1430, `BatchApprovalSendView` `onSent`, search `Input` ~860, notices)
- Test: `src/app/certificates/page.test.tsx`

**Interfaces:**
- Consumes: `usePrintList` (Task 7), `PrintMenu` (Task 9), `useTodayTinBatch`, `TinLabelSizeDialog` `size` prop (Task 8), `printListSelection`, `tinCountNote`, `MAX_PRINT_LIST` (Task 6), `certificateListUrl` (Task 3), response `unmatched_terms` / `terms_capped` (Task 5), `ToastAction` (`src/components/ui/toast.tsx`).

Page changes:
- `const list = usePrintList(profile?.id ?? null, { onRestored })`; `onRestored` with `dropped > 0` toasts "{n} certificate(s) left the print list: no longer available."
- Row checkbox: `checked={list.has(cert.id)}`, change → `list.toggle(cert)`; a `false` return toasts "The print list holds at most 300 certificates." Header checkbox: checked when every row on the page is in the list; toggles the page's rows (`removeMany` / `addMany`).
- The Actions menu shows when `list.count > 0` and acts on `list.entries`: Download ZIP (sends the list's ids; disabled above 50 with the hint "Download at most 50 at once"); Send to buyer / Send to seller (single-party gating over the list's `buyer_id` / `seller_id`; sample ids from the list). Tin Label and Print Bag Sleeves leave Actions. The send queue still takes `sampleIds` in its GET query: at the 300 cap that is ~11 KB of ids, inside the URL limit and the 350-id `.in()` measured in `cert-search-resolve.ts`, so no POST is needed.
- `PrintMenu` replaces `PrintTodayTinLabelsButton` in the toolbar. `today` from `useTodayTinBatch(todayBatchToken)`. `onPrintTins(size)` opens `TinLabelSizeDialog` with `size`, `sampleIds = certificatesToTinSampleIds(printListSelection(list.entries))`, `countNote = tinCountNote(list.entries)`. `onPrintBagSleeves` opens `PrintBagSleevesDialog` with `certificatesToBagSleeveEntries(printListSelection(list.entries), true)`. `onPrintToday` opens `TinLabelSizeDialog` (no `size`) with `today.sampleIds`.
- After a list print (`onSuccess` of either dialog): keep a copy of `list.entries`, `list.clear()`, bump `todayBatchToken`, and toast `{ title: 'Print list cleared', duration: 8000, action: <ToastAction altText="Restore list" onClick={() => list.restore(copy)}>Restore list</ToastAction> }`. Today's-batch prints do not touch the list. A completed send (`BatchApprovalSendView` `onSent`) clears the list without a toast, as today.
- `selectedCertificates`, `tinLabelCerts`, `bagSleeveCerts`, `tinLabelCountNote` and the `PrintTodayTinLabelsButton` import go.
- Search `Input` `onPaste`: when the pasted text contains a line break, prevent the default and set the query to the current text plus the pasted lines joined with ", ".
- Under the bar: `unmatched_terms` → "No certificate for: {terms joined with ', '}"; `terms_capped` → "Only the first 50 numbers were searched".
- While the search box is non-empty and `total > 0`: a small "Add all {total} to list" button; it fetches `certificateListUrl({ …current filters, limit: 300, offset: 0 })` and calls `list.addMany(rows)`, then toasts "Added {n} to the print list". Disabled when `total > 300`, title "More than 300 matches: narrow the search".

- [ ] **Step 1: Write the failing tests** (`localStorage.clear()` in `beforeEach`; stub `/api/samples/bulk/print-tin-sleeves` to return a PDF blob)

```ts
it('keeps the first tick when a second search replaces the rows, and prints both', async () => {
  // search 'S-1548' → [cert(1)]; tick; search 'S-1547' → [cert(2)]; tick
  // open Print, click 'Tin labels 4 cm'
  await waitFor(() => expect(tinCall()).toBeDefined())
  expect(JSON.parse(tinCall()![1].body)).toEqual({ sample_ids: ['s-1', 's-2'], size: '4cm' })
})
it('the list survives a reload', async () => {
  // render, tick cert(1), unmount; render again; refresh stub for ids=cert-1 returns [cert(1)]
  // → row 1 checkbox is checked and the trigger reads 'Print · 1'
})
it('a pasted column searches each number', async () => {
  // paste 'S-1548\nS-1547' → a request starting '/api/certificates?search=' whose search param is 'S-1548, S-1547'
})
it('names the numbers that found nothing', async () => {
  // response unmatched_terms ['S-1549'] → 'No certificate for: S-1549'
})
it('Add all puts every match in the list', async () => {
  // search → total 2, click 'Add all 2 to list' → request with limit=300 → 'Print · 2'
})
it('a print clears the list and Restore list brings it back', async () => {
  // tick cert(1); Print → 'Tin labels 4 cm'; in the preview press Print (PrintPreviewDialog onPrinted), then close it
  await waitFor(() => expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()) // no count: list cleared
  fireEvent.click(screen.getByRole('button', { name: 'Restore list' }))
  expect(screen.getByRole('button', { name: 'Print · 1' })).toBeInTheDocument()
})
```

- [ ] **Step 2:** `npx vitest run src/app/certificates/page.test.tsx` — new tests FAIL.
- [ ] **Step 3:** Implement the page changes.
- [ ] **Step 4:** Same command — PASS; `npx tsc --noEmit -p .` clean; `wc -l src/app/certificates/page.tsx` under 2,000.
- [ ] **Step 5: Commit** `git commit -m "feat(certificates): ticks become a print list across searches and pages; Print menu, Add all, pasted lists"`.

---

### Task 12: Bag sleeves without the SAN

**Files:**
- Create: `src/lib/bag-sleeve-label.ts`, `src/lib/bag-sleeve-label.test.ts`
- Modify: `src/components/pdf/sample-bag-sleeve-label.tsx` (data interface ~lines 5-30, headline ~240)
- Modify: `src/app/api/samples/bulk/print-bag-sleeves/route.tsx` (select ~50-75, `buildLabel` ~112-200)
- Modify: `src/app/api/samples/[id]/print-bag-sleeve/route.tsx` (select ~37-60, QR ~182-195, label ~197-213, filename ~231)
- Test: `src/app/api/samples/bulk/print-bag-sleeves/route.test.tsx` (new)

**Interfaces:**
- Consumes: `sampleIdentifier` (`src/lib/sample-reference.ts`); `getCertificatePageUrl`, `generateQRCode` (`src/lib/qr-code.ts`); `resolveCompanyName` (`src/lib/sleeve-label-data.ts`); `selectInChunks`; `trackingNumberToSlug` (`src/lib/utils.ts`, slugs any number).
- Produces:
  - `export function bagSleeveHeadline(s: { container_nr?: string | null; ico_number?: string | null; exporter_sample_number?: string | null; certificate_number?: string | null }): string` → `sampleIdentifier(s)?.value` ?? certificate number ?? `'Sample'`.
  - `SampleBagSleeveLabelData`: `tracking_number` is replaced by `headline: string`; new `certificate_number?: string`. The label prints `headline` where the SAN was and, when `certificate_number` is set and differs from the headline, a "Certificate: {number}" row under it.

Route changes (both): select `exporter_sample_number` and `client:companies!samples_client_id_fkey(name, fantasy_name)`; read `certificates (sample_id, certificate_number, created_at)` for the samples (`selectInChunks`, newest per sample wins); `headline = bagSleeveHeadline(...)`; QR only when requested AND the sample has a certificate: `generateQRCode(getCertificatePageUrl(certNumber, resolveCompanyName(sample.client)), { width: 150, margin: 1 })`; drop `fetchCertificateQRData` / `buildCertificateQRText` from these routes. Single route filename: `bag-sleeve-${trackingNumberToSlug(certNumber ?? headline)}.pdf`. Nothing reads `tracking_number` into a label, QR or filename any more (it may stay in the select only if something internal needs it; otherwise remove it).

- [ ] **Step 1: Write the failing tests**

```ts
// bag-sleeve-label.test.ts
it.each([
  [{ container_nr: 'TEMU 565.799-2', certificate_number: 'BR-037529/26' }, 'TEMU 565.799-2'],
  [{ exporter_sample_number: '520/26', certificate_number: 'SAG-011960/26' }, '520/26'],
  [{ certificate_number: 'RM1-001270/26' }, 'RM1-001270/26'],
  [{}, 'Sample'],
])('bagSleeveHeadline(%j)', (s, out) => expect(bagSleeveHeadline(s)).toBe(out))

// route.test.tsx — mock '@/lib/supabase-server' (samples + certificates rows), mock
// '@/components/pdf/sample-bag-sleeve-label' so SampleBagSleeveLabelDocument records its `labels`,
// mock '@react-pdf/renderer' renderToStream to yield one chunk, spy generateQRCode
it('leads with the container, prints the certificate, and the QR opens the certificate page', async () => {
  // SS sample tracking_number 'SAN-00921/26', container 'TEMU 565.799-2', certificate 'BR-037529/26', client Dunkin
  const res = await POST(req({ samples: [{ id: 's1', includeQrCode: true }] }))
  expect(res.status).toBe(200)
  expect(labels[0]).toMatchObject({ headline: 'TEMU 565.799-2', certificate_number: 'BR-037529/26' })
  expect(JSON.stringify(labels)).not.toContain('SAN-')
  expect(qrSpy.mock.calls[0][0]).toContain('BR-037529_26')
  expect(qrSpy.mock.calls[0][0]).not.toContain('SAN')
})
it('an uncertified sleeve gets no QR', async () => { /* no certificate row → labels[0].qr_code undefined, qrSpy not called */ })
```

- [ ] **Step 2:** `npx vitest run src/lib/bag-sleeve-label.test.ts src/app/api/samples/bulk/print-bag-sleeves` — FAIL.
- [ ] **Step 3:** Implement the helper, the label component change and both routes.
- [ ] **Step 4:** Same command — PASS; `npx tsc --noEmit -p .` clean (the renamed field must compile everywhere it is used).
- [ ] **Step 5: Commit** `git commit -m "fix(print): bag sleeves lead with the lot's own number and the certificate, QR from the certificate number — never the SAN"`.

---

### Task 13: Whole-suite verification and hand-off

- [ ] **Step 1:** `npx vitest run` — all pass (report any pre-existing failures separately, with output).
- [ ] **Step 2:** `npx tsc --noEmit -p .` — no errors.
- [ ] **Step 3:** `npx next build` — succeeds (catches non-handler exports from route files).
- [ ] **Step 4: Live check on `http://localhost:3000/certificates`** with Daniel's session: tick a row, search something else, tick another, hover Print → both listed, "2 certificates → 2 tins"; Tin labels 2.5 cm opens the preview straight away (do not press Print unless Daniel wants the stamp); reload → list still there; Next → page 2 and a real total; Client filter → a client outside the newest 100 is pickable; a date range from last month returns rows; origin sort works; paste three numbers from a column → three matches plus a "No certificate for:" line for a made-up one; Bag sleeves preview shows the container/sample number headline and a "Certificate:" row, no SAN; rows are at most two lines.
- [ ] **Step 5:** Report to Daniel: what passed, what was checked live, anything skipped. Confirm the Task 4 SQL is applied. Push only on his go: `git push origin main`.
