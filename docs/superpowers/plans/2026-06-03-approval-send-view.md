# Approval Send View + sys write-back — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the thin approval composer with a two-panel (seller/buyer) full-screen send view that emails each counterparty a personalized approval with the certificate attached, opens from all three approval paths, and marks the matching sys.wolthers.com `shipment_samples` row approved on send.

**Architecture:** Pure logic (email template, recipient panels, write-back decision) lives in `src/lib/approval-notification/` with unit tests. Two API routes (`approval-recipients` prefill, `notify-approval` send) consume the pure logic and do DB I/O with the service-role client behind a `canUserManageSample` gate. The UI is a full-screen overlay split into small components. Same Supabase DB → write-back is a direct query, no cross-system call.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vitest + @testing-library/react, Supabase (service-role + SSR clients), Microsoft Graph (`src/lib/graph/send.ts`), React-PDF certificate (existing).

**Spec:** `docs/superpowers/specs/2026-06-03-approval-send-view-design.md`

---

## Shared types (referenced by multiple tasks)

Defined in Task 1. Reproduced here for reference:

```ts
// src/lib/approval-notification/types.ts
export type ApprovalDecision = 'approved' | 'rejected'
export type ApprovalSide = 'seller' | 'buyer'

export interface RecipientChip {
  email: string
  name: string | null
  nickname: string | null
  isGroupMailbox: boolean
}

export interface PanelPrefill {
  greeting: string
  to: RecipientChip[]
  cc: RecipientChip[]
}

export interface ApprovalSampleFields {
  trackingNumber: string
  status: ApprovalDecision
  contractNumber: string | null
  sampleCode: string | null
  awb: string | null
  courier: string | null
  sellerReference: string | null
  buyerReference: string | null
}

export interface ApprovalPrefill {
  sample: ApprovalSampleFields
  panels: { seller: PanelPrefill; buyer: PanelPrefill }
  certificateAvailable: boolean
}
```

---

## Task 1: Shared types module

**Files:**
- Create: `src/lib/approval-notification/types.ts`

- [ ] **Step 1: Create the types file**

Paste exactly the "Shared types" block above into `src/lib/approval-notification/types.ts`.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep approval-notification/types || echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/lib/approval-notification/types.ts
git commit -m "feat(approval): shared types for approval send view"
```

---

## Task 2: Sys-style email template builder

**Files:**
- Create: `src/lib/approval-notification/sample-approved-template.ts`
- Test: `src/lib/approval-notification/sample-approved-template.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/approval-notification/sample-approved-template.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildSampleApprovedSubject,
  buildSampleApprovedBody,
} from './sample-approved-template'

const base = {
  decision: 'approved' as const,
  greeting: 'Regula',
  contractNumber: '42221/26',
  sellerReference: null,
  buyerReference: '106197',
  sampleType: 'pss',
  sampleCode: 'PSS',
  trackingNumber: 'BR-036991/26',
  awb: '872243057708',
  courier: 'FedEx',
}

describe('buildSampleApprovedSubject', () => {
  it('uses contract and sample code when present', () => {
    expect(buildSampleApprovedSubject(base)).toBe('Sample approved · 42221/26 · PSS')
  })
  it('drops sample code when absent', () => {
    expect(buildSampleApprovedSubject({ ...base, sampleCode: null })).toBe(
      'Sample approved · 42221/26',
    )
  })
  it('says rejected for a rejection', () => {
    expect(buildSampleApprovedSubject({ ...base, decision: 'rejected' })).toBe(
      'Sample rejected · 42221/26 · PSS',
    )
  })
})

describe('buildSampleApprovedBody', () => {
  it('includes greeting, approval line, and conditional ref/AWB lines', () => {
    const body = buildSampleApprovedBody(base)
    expect(body).toContain('Dear Regula,')
    expect(body).toContain('Wolthers has approved the following sample.')
    expect(body).toContain('Contract: 42221/26')
    expect(body).toContain('Buyer ref: 106197')
    expect(body).not.toContain('Seller ref:') // null → omitted
    expect(body).toContain('Sample: PSS · PSS')
    expect(body).toContain('AWB: 872243057708 · FedEx')
    expect(body).toContain('Best regards,')
    expect(body).toContain('Wolthers & Associates')
  })
  it('omits AWB line when awb is null', () => {
    expect(buildSampleApprovedBody({ ...base, awb: null })).not.toContain('AWB:')
  })
  it('falls back to tracking number for the sample label when no code', () => {
    const body = buildSampleApprovedBody({ ...base, sampleCode: null })
    expect(body).toContain('Sample: PSS · BR-036991/26')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/approval-notification/sample-approved-template.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/approval-notification/sample-approved-template.ts
import type { ApprovalDecision } from './types'

export interface SampleApprovedInput {
  decision: ApprovalDecision
  greeting: string
  contractNumber: string | null
  sellerReference: string | null
  buyerReference: string | null
  sampleType: string
  sampleCode: string | null
  trackingNumber: string
  awb: string | null
  courier: string | null
}

const isTbi = (s: string | null): boolean =>
  !s || /^t\.?b\.?i\.?$/i.test(s.trim())

export function buildSampleApprovedSubject(input: SampleApprovedInput): string {
  const verb = input.decision === 'approved' ? 'approved' : 'rejected'
  const head = `Sample ${verb} · ${input.contractNumber ?? input.trackingNumber}`
  return input.sampleCode ? `${head} · ${input.sampleCode}` : head
}

export function buildSampleApprovedBody(input: SampleApprovedInput): string {
  const verb = input.decision === 'approved' ? 'approved' : 'rejected'
  const sampleTypeLabel = input.sampleType.toUpperCase().replace(/_/g, ' ')
  const sampleLabel = input.sampleCode ?? input.trackingNumber ?? '—'
  const lines: string[] = [
    `Dear ${input.greeting},`,
    '',
    `Wolthers has ${verb} the following sample.`,
    '',
  ]
  if (input.contractNumber) lines.push(`Contract: ${input.contractNumber}`)
  if (!isTbi(input.sellerReference)) lines.push(`Seller ref: ${input.sellerReference}`)
  if (!isTbi(input.buyerReference)) lines.push(`Buyer ref: ${input.buyerReference}`)
  lines.push(`Sample: ${sampleTypeLabel} · ${sampleLabel}`)
  if (input.awb) {
    lines.push(`AWB: ${input.awb}${input.courier ? ` · ${input.courier}` : ''}`)
  }
  lines.push('', 'Best regards,', 'Wolthers & Associates')
  return lines.join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/approval-notification/sample-approved-template.test.ts`
Expected: PASS (3 + 3 assertions across both describes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/approval-notification/sample-approved-template.ts src/lib/approval-notification/sample-approved-template.test.ts
git commit -m "feat(approval): sys-style 'Sample approved' email builder"
```

---

## Task 3: Per-panel recipient resolver (sys semantics)

**Files:**
- Create: `src/lib/approval-notification/resolve-panels.ts`
- Test: `src/lib/approval-notification/resolve-panels.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/approval-notification/resolve-panels.test.ts
import { describe, it, expect } from 'vitest'
import { resolvePanel, type ContactRow } from './resolve-panels'

const QC = 'qualitycontrol@wolthers.com'

const row = (over: Partial<ContactRow>): ContactRow => ({
  company_id: 'C1',
  email: 'a@x.com',
  name: 'A',
  nickname: null,
  role: null,
  is_primary: false,
  is_group_mailbox: false,
  routing_purposes: [],
  ...over,
})

describe('resolvePanel', () => {
  it('puts the sample_approvals contact in TO and greets by nickname', () => {
    const rows = [
      row({ email: 'reg@buyer.com', name: 'Regula Heiniger', nickname: 'Regula', routing_purposes: ['sample_approvals'] }),
      row({ email: 'other@buyer.com', name: 'Other', is_primary: true }),
    ]
    const p = resolvePanel(rows, 'C1', 'Blaser', QC)
    expect(p.to.map((c) => c.email)).toEqual(['reg@buyer.com'])
    expect(p.greeting).toBe('Regula')
    expect(p.cc.some((c) => c.email === QC)).toBe(true)
  })

  it('falls back to is_primary, then first, when no sample_approvals tag', () => {
    const rows = [
      row({ email: 'first@buyer.com', name: 'First' }),
      row({ email: 'prim@buyer.com', name: 'Primary', is_primary: true }),
    ]
    const p = resolvePanel(rows, 'C1', 'Blaser', QC)
    expect(p.to.map((c) => c.email)).toEqual(['prim@buyer.com'])
    expect(p.greeting).toBe('Primary')
  })

  it('drops TO entirely when every candidate is internal', () => {
    const rows = [row({ email: 'staff@wolthers.com', name: 'Staff', routing_purposes: ['sample_approvals'] })]
    const p = resolvePanel(rows, 'C1', 'Blaser', QC)
    expect(p.to).toEqual([])
    expect(p.greeting).toBe('Blaser team')
  })

  it('routes group mailboxes to CC and skips them for greeting', () => {
    const rows = [
      row({ email: 'docs@buyer.com', name: 'Docs', is_group_mailbox: true, routing_purposes: ['sample_approvals'] }),
      row({ email: 'reg@buyer.com', name: 'Regula', nickname: 'Reg', routing_purposes: ['sample_approvals'] }),
    ]
    const p = resolvePanel(rows, 'C1', 'Blaser', QC)
    expect(p.greeting).toBe('Reg')
    expect(p.cc.some((c) => c.email === 'docs@buyer.com')).toBe(true)
  })

  it('returns only the QC mailbox in CC when companyId is null', () => {
    const p = resolvePanel([], null, null, QC)
    expect(p.to).toEqual([])
    expect(p.cc).toEqual([{ email: QC, name: 'Quality Control', nickname: null, isGroupMailbox: false }])
    expect(p.greeting).toBe('team')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/approval-notification/resolve-panels.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/approval-notification/resolve-panels.ts
import type { PanelPrefill, RecipientChip } from './types'

export interface ContactRow {
  company_id: string
  email: string | null
  name: string | null
  nickname: string | null
  role: string | null
  is_primary: boolean | null
  is_group_mailbox: boolean | null
  routing_purposes: string[] | null
}

const isInternal = (email: string): boolean => /@wolthers\.com$/i.test(email)

const toChip = (r: ContactRow): RecipientChip => ({
  email: r.email as string,
  name: r.name,
  nickname: r.nickname,
  isGroupMailbox: !!r.is_group_mailbox,
})

function hasPurpose(r: ContactRow, p: string): boolean {
  return Array.isArray(r.routing_purposes) && r.routing_purposes.includes(p)
}

/**
 * Resolve one panel (seller or buyer) from the contact rows of one company.
 * TO = sample_approvals contacts (∪ primary ∪ first), minus internal-only.
 * CC = QC mailbox + group mailboxes + logistics-role contacts.
 * Greeting = first non-group-mailbox TO contact's nickname/name, else "{team} team".
 */
export function resolvePanel(
  allRows: ContactRow[],
  companyId: string | null,
  teamName: string | null,
  qcMailbox: string,
): PanelPrefill {
  const qcChip: RecipientChip = {
    email: qcMailbox,
    name: 'Quality Control',
    nickname: null,
    isGroupMailbox: false,
  }
  if (!companyId) {
    return { greeting: teamName ? `${teamName} team` : 'team', to: [], cc: [qcChip] }
  }

  const rows = allRows.filter(
    (r) => r.company_id === companyId && !!r.email,
  )

  const tagged = rows.filter((r) => hasPurpose(r, 'sample_approvals'))
  let toRows: ContactRow[]
  if (tagged.length > 0) {
    toRows = tagged
  } else {
    const primary = rows.find((r) => r.is_primary)
    toRows = primary ? [primary] : rows[0] ? [rows[0]] : []
  }

  // Never email Wolthers as the counterparty: if all TO are internal, drop them.
  const toExternal = toRows.filter((r) => !isInternal(r.email as string))
  const to = toExternal.map(toChip)

  const greetSource = to.find((c) => !c.isGroupMailbox)
  const greeting = greetSource
    ? greetSource.nickname ?? greetSource.name ?? (teamName ? `${teamName} team` : 'team')
    : teamName
      ? `${teamName} team`
      : 'team'

  const cc: RecipientChip[] = [qcChip]
  const seen = new Set<string>([qcMailbox.toLowerCase(), ...to.map((c) => c.email.toLowerCase())])
  for (const r of rows) {
    const email = r.email as string
    const wantCc = r.is_group_mailbox || /logistic|docs|shipping/i.test(r.role ?? '')
    if (wantCc && !seen.has(email.toLowerCase())) {
      cc.push(toChip(r))
      seen.add(email.toLowerCase())
    }
  }

  return { greeting, to, cc }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/approval-notification/resolve-panels.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/approval-notification/resolve-panels.ts src/lib/approval-notification/resolve-panels.test.ts
git commit -m "feat(approval): per-panel recipient resolver (sys routing_purposes semantics)"
```

---

## Task 4: shipment_samples write-back — pure decision logic

**Files:**
- Create: `src/lib/approval-notification/shipment-sample-writeback.ts`
- Test: `src/lib/approval-notification/shipment-sample-writeback.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/approval-notification/shipment-sample-writeback.test.ts
import { describe, it, expect } from 'vitest'
import {
  pickShipmentSampleMatch,
  buildWritebackUpdate,
  buildWritebackInsert,
  type ShipmentSampleRow,
} from './shipment-sample-writeback'

const r = (over: Partial<ShipmentSampleRow>): ShipmentSampleRow => ({
  id: 'id1',
  waqc_ref: null,
  sample_type: 'pss',
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

describe('pickShipmentSampleMatch', () => {
  it('prefers an exact waqc_ref match', () => {
    const rows = [r({ id: 'a', waqc_ref: 'OTHER' }), r({ id: 'b', waqc_ref: 'BR-036991/26' })]
    expect(pickShipmentSampleMatch(rows, 'BR-036991/26')).toBe('b')
  })
  it('falls back to the latest pss row when no waqc_ref match', () => {
    const rows = [
      r({ id: 'old', sample_type: 'pss', created_at: '2026-01-01T00:00:00Z' }),
      r({ id: 'new', sample_type: 'pss', created_at: '2026-05-01T00:00:00Z' }),
      r({ id: 'ss', sample_type: 'ss', created_at: '2026-06-01T00:00:00Z' }),
    ]
    expect(pickShipmentSampleMatch(rows, 'BR-036991/26')).toBe('new')
  })
  it('returns null when there are no rows', () => {
    expect(pickShipmentSampleMatch([], 'X')).toBeNull()
  })
})

describe('buildWritebackUpdate / buildWritebackInsert', () => {
  it('builds an approved update payload', () => {
    const p = buildWritebackUpdate({
      decision: 'approved',
      userId: 'u1',
      today: '2026-06-03',
      certificateUrl: 'path/cert.pdf',
    })
    expect(p).toEqual({
      status: 'approved',
      approved_by: 'u1',
      approved_date: '2026-06-03',
      certificate_url: 'path/cert.pdf',
    })
  })
  it('builds an insert payload with contract link and waqc_ref', () => {
    const p = buildWritebackInsert({
      contractId: 'k1',
      waqcRef: 'BR-036991/26',
      decision: 'rejected',
      userId: 'u1',
      today: '2026-06-03',
      certificateUrl: null,
    })
    expect(p).toEqual({
      contract_id: 'k1',
      sample_type: 'pss',
      waqc_ref: 'BR-036991/26',
      status: 'rejected',
      approved_by: 'u1',
      approved_date: '2026-06-03',
      certificate_url: null,
      created_by: 'u1',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/approval-notification/shipment-sample-writeback.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/approval-notification/shipment-sample-writeback.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalDecision } from './types'

export interface ShipmentSampleRow {
  id: string
  waqc_ref: string | null
  sample_type: string | null
  created_at: string
}

/** Match by exact waqc_ref, else the latest pss row, else null. */
export function pickShipmentSampleMatch(
  rows: ShipmentSampleRow[],
  waqcRef: string,
): string | null {
  const exact = rows.find((r) => r.waqc_ref === waqcRef)
  if (exact) return exact.id
  const pss = rows
    .filter((r) => (r.sample_type ?? 'pss') === 'pss')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  return pss[0]?.id ?? null
}

export interface WritebackUpdateOpts {
  decision: ApprovalDecision
  userId: string
  today: string
  certificateUrl: string | null
}

export function buildWritebackUpdate(opts: WritebackUpdateOpts) {
  return {
    status: opts.decision,
    approved_by: opts.userId,
    approved_date: opts.today,
    certificate_url: opts.certificateUrl,
  }
}

export interface WritebackInsertOpts extends WritebackUpdateOpts {
  contractId: string
  waqcRef: string
}

export function buildWritebackInsert(opts: WritebackInsertOpts) {
  return {
    contract_id: opts.contractId,
    sample_type: 'pss',
    waqc_ref: opts.waqcRef,
    status: opts.decision,
    approved_by: opts.userId,
    approved_date: opts.today,
    certificate_url: opts.certificateUrl,
    created_by: opts.userId,
  }
}

/**
 * I/O wrapper: find/create the contract's shipment_samples row and mark it
 * approved/rejected. Best-effort optional columns (approval_comments) are set
 * in a second guarded update so a missing column never fails the send.
 * Returns the affected row id, or null on failure (non-fatal to the caller).
 */
export async function applyShipmentSampleApproval(
  admin: SupabaseClient,
  args: {
    contractId: string
    waqcRef: string
    decision: ApprovalDecision
    userId: string
    today: string
    certificateUrl: string | null
    comments?: string | null
  },
): Promise<string | null> {
  try {
    const { data: rows } = await admin
      .from('shipment_samples')
      .select('id, waqc_ref, sample_type, created_at')
      .eq('contract_id', args.contractId)
    const matchId = pickShipmentSampleMatch((rows ?? []) as ShipmentSampleRow[], args.waqcRef)

    let rowId: string | null
    if (matchId) {
      await admin
        .from('shipment_samples')
        .update(buildWritebackUpdate(args))
        .eq('id', matchId)
      rowId = matchId
    } else {
      const { data: inserted } = await admin
        .from('shipment_samples')
        .insert(buildWritebackInsert(args))
        .select('id')
        .single()
      rowId = (inserted as { id: string } | null)?.id ?? null
    }

    if (rowId && args.comments) {
      // Optional column; ignore failure if it does not exist yet.
      await admin
        .from('shipment_samples')
        .update({ approval_comments: args.comments })
        .eq('id', rowId)
        .then(undefined, () => undefined)
    }
    return rowId
  } catch (e) {
    console.error('[approval] shipment_samples write-back failed (non-fatal):', e)
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/approval-notification/shipment-sample-writeback.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/approval-notification/shipment-sample-writeback.ts src/lib/approval-notification/shipment-sample-writeback.test.ts
git commit -m "feat(approval): shipment_samples write-back (match/update/insert)"
```

---

## Task 5: (Optional) migration for approval_comments / notification columns

> The write-back tolerates these columns being absent. This task only enables persisting approval comments + notification audit on the sys `shipment_samples` row. The user applies migrations manually.

**Files:**
- Create: `../Wolthers-system/wolthers-app/supabase/migrations/20260603000000_shipment_samples_approval_columns.sql`

- [ ] **Step 1: Verify whether the columns already exist**

Run:
```bash
grep -rln "approval_comments\|notification_sent_at" ../Wolthers-system/supabase/migrations/*.sql || echo "ABSENT"
```
If a migration already adds them, skip this task. Otherwise continue.

- [ ] **Step 2: Write the migration**

```sql
-- 20260603000000_shipment_samples_approval_columns.sql
-- Adds optional approval/notification audit columns used by WAQC write-back.
ALTER TABLE shipment_samples
  ADD COLUMN IF NOT EXISTS approval_comments  TEXT,
  ADD COLUMN IF NOT EXISTS notification_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notification_sent_by  UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS notification_sent_to  TEXT;
```

- [ ] **Step 3: Hand the SQL to the user to apply**

Present the SQL block from Step 2 in chat for the user to run in Supabase. Do not attempt to apply it.

- [ ] **Step 4: Commit**

```bash
git add ../Wolthers-system/wolthers-app/supabase/migrations/20260603000000_shipment_samples_approval_columns.sql
git commit -m "feat(approval): migration for shipment_samples approval/notification columns"
```

---

## Task 6: Upgrade the recipients prefill route

**Files:**
- Modify: `src/app/api/samples/[id]/approval-recipients/route.ts` (full rewrite of the handler body)

- [ ] **Step 1: Rewrite the route to return panels + email fields**

Replace the whole file with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { canUserManageSample } from '@/lib/auth/sample-access'
import { resolvePanel, type ContactRow } from '@/lib/approval-notification/resolve-panels'
import type { ApprovalPrefill } from '@/lib/approval-notification/types'

const QC_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX || 'qualitycontrol@wolthers.com'

const admin = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const server = await createServerClient()
  const {
    data: { user },
  } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await canUserManageSample(server as any, user.id, id)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = admin()
  const { data: sample, error } = await supabase
    .from('samples')
    .select('id, tracking_number, status, contract_id, sample_type')
    .eq('id', id)
    .single()
  if (error || !sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })

  const s = sample as any
  if (!s.contract_id) {
    return NextResponse.json({ error: 'Sample is not contract-linked' }, { status: 400 })
  }
  if (s.status !== 'approved' && s.status !== 'rejected') {
    return NextResponse.json({ error: 'Sample is not approved/rejected' }, { status: 400 })
  }

  const { data: contract } = await supabase
    .from('contracts')
    .select('contract_number, buyer_id, seller_id, buyer_reference, seller_reference')
    .eq('id', s.contract_id)
    .single()
  const c = (contract ?? {}) as any

  // Companies for team-name greeting fallback.
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, fantasy_name')
    .in('id', [c.buyer_id, c.seller_id].filter(Boolean))
  const nameOf = (cid: string | null): string | null => {
    const co = (companies ?? []).find((x: any) => x.id === cid) as any
    return co ? co.fantasy_name ?? co.name ?? null : null
  }

  const { data: contactRows } = await supabase
    .from('contacts')
    .select('company_id, email, name, nickname, role, is_primary, is_group_mailbox, routing_purposes')
    .in('company_id', [c.buyer_id, c.seller_id].filter(Boolean))
    .eq('is_active', true)
    .not('email', 'is', null)
  const rows = (contactRows ?? []) as ContactRow[]

  // Matched shipment_samples row gives sample_code / AWB / courier for the body.
  const { data: ssRows } = await supabase
    .from('shipment_samples')
    .select('sample_code, tracking_number, courier_company, waqc_ref, sample_type, created_at')
    .eq('contract_id', s.contract_id)
  const ss =
    (ssRows ?? []).find((r: any) => r.waqc_ref === s.tracking_number) ??
    (ssRows ?? [])
      .filter((r: any) => (r.sample_type ?? 'pss') === 'pss')
      .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))[0] ??
    null

  const { data: cert } = await supabase
    .from('certificates')
    .select('id')
    .eq('sample_id', id)
    .is('sample_contract_id', null)
    .limit(1)
    .maybeSingle()

  const payload: ApprovalPrefill = {
    sample: {
      trackingNumber: s.tracking_number,
      status: s.status,
      contractNumber: c.contract_number ?? null,
      sampleCode: (ss as any)?.sample_code ?? null,
      awb: (ss as any)?.tracking_number ?? null,
      courier: (ss as any)?.courier_company ?? null,
      sellerReference: c.seller_reference ?? null,
      buyerReference: c.buyer_reference ?? null,
    },
    panels: {
      seller: resolvePanel(rows, c.seller_id ?? null, nameOf(c.seller_id ?? null), QC_MAILBOX),
      buyer: resolvePanel(rows, c.buyer_id ?? null, nameOf(c.buyer_id ?? null), QC_MAILBOX),
    },
    certificateAvailable: !!cert,
  }
  return NextResponse.json(payload)
}
```

- [ ] **Step 2: Type-check the route**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "approval-recipients/route" || echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/samples/[id]/approval-recipients/route.ts"
git commit -m "feat(approval): prefill route returns seller/buyer panels + email fields"
```

---

## Task 7: Rework the send route for per-panel send + write-back

**Files:**
- Modify: `src/app/api/samples/[id]/notify-approval/route.ts` (full rewrite)

- [ ] **Step 1: Rewrite the route**

Replace the whole file with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { canUserManageSample } from '@/lib/auth/sample-access'
import { sendMail, type GraphSendAttachment } from '@/lib/graph/send'
import { getCachedCertificatePdf, uploadCertificatePdf } from '@/lib/certificate-storage'
import { renderCertificatePdfBuffer } from '@/lib/certificate-render'
import { approvalBodyToHtml } from '@/lib/approval-notification/template'
import { applyShipmentSampleApproval } from '@/lib/approval-notification/shipment-sample-writeback'
import type { ApprovalDecision, ApprovalSide } from '@/lib/approval-notification/types'

const QC_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX || 'qualitycontrol@wolthers.com'

const admin = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

interface PanelInput {
  side: ApprovalSide
  to: string[]
  cc?: string[]
  subject: string
  bodyText: string
}
interface Body {
  panels: PanelInput[]
  includeCertificate?: boolean
  comments?: string | null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = (await req.json()) as Body
  const panels = (body.panels ?? []).filter((p) => p.to?.length && p.subject && p.bodyText)
  if (panels.length === 0) {
    return NextResponse.json({ error: 'At least one panel with to/subject/body is required' }, { status: 400 })
  }

  const server = await createServerClient()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await canUserManageSample(server as any, user.id, id)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = admin()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()
  const senderEmail = (profile as any)?.email || user.email || undefined
  const senderName = (profile as any)?.full_name || senderEmail || undefined

  const { data: sample } = await supabase
    .from('samples')
    .select('id, tracking_number, status, contract_id')
    .eq('id', id)
    .single()
  if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
  const s = sample as any
  if (s.status !== 'approved' && s.status !== 'rejected') {
    return NextResponse.json({ error: 'Sample is not approved/rejected' }, { status: 400 })
  }
  if (!s.contract_id) {
    return NextResponse.json({ error: 'Sample is not contract-linked' }, { status: 400 })
  }
  const decision = s.status as ApprovalDecision
  const tracking = s.tracking_number as string
  const contractId = s.contract_id as string

  const { data: contract } = await supabase
    .from('contracts')
    .select('buyer_id, seller_id')
    .eq('id', contractId)
    .single()

  // Certificate bytes (shared across panels)
  let attachment: GraphSendAttachment | null = null
  if (body.includeCertificate !== false) {
    const { data: cert } = await supabase
      .from('certificates')
      .select('id, pdf_url')
      .eq('sample_id', id)
      .is('sample_contract_id', null)
      .limit(1)
      .maybeSingle()
    if (!cert) return NextResponse.json({ error: 'No certificate for this sample' }, { status: 400 })
    let pdf: Buffer | null = null
    if ((cert as any).pdf_url) pdf = await getCachedCertificatePdf(supabase, (cert as any).pdf_url)
    if (!pdf) {
      pdf = await renderCertificatePdfBuffer(supabase, id)
      if (!pdf) return NextResponse.json({ error: 'Certificate could not be generated' }, { status: 500 })
      uploadCertificatePdf(supabase, id, (cert as any).id, pdf).catch(() => {})
    }
    attachment = { name: `${tracking}.pdf`, contentType: 'application/pdf', bytes: new Uint8Array(pdf) }
  }

  const testTo = process.env.MICROSOFT_GRAPH_TEST_RECIPIENT
  const results: { side: ApprovalSide; ok: boolean; error?: string }[] = []

  for (const panel of panels) {
    const to = testTo ? [testTo] : panel.to
    const cc = testTo ? undefined : panel.cc
    const subject = testTo ? `[TEST] ${panel.subject}` : panel.subject
    try {
      await sendMail({
        mailbox: QC_MAILBOX,
        to,
        cc,
        subject,
        bodyText: panel.bodyText,
        bodyHtml: approvalBodyToHtml(panel.bodyText),
        attachments: attachment ? [attachment] : undefined,
        saveToSentItems: true,
        senderEmail,
        senderName,
      })
      results.push({ side: panel.side, ok: true })

      await supabase.from('email_messages').insert({
        direction: 'outbound',
        status: 'sent',
        mailbox: QC_MAILBOX,
        from_email: QC_MAILBOX,
        sender_email: senderEmail ?? null,
        to_recipients: to.map((e) => ({ email: e })),
        cc_recipients: (cc ?? []).map((e) => ({ email: e })),
        subject,
        body_text: panel.bodyText,
        body_html: approvalBodyToHtml(panel.bodyText),
        contract_id: contractId,
        buyer_id: (contract as any)?.buyer_id ?? null,
        seller_id: (contract as any)?.seller_id ?? null,
        sent_at: new Date().toISOString(),
        sent_by: user.id,
        metadata: {
          source: 'sample_approval',
          sample_id: id,
          decision,
          side: panel.side,
          sandbox: !!testTo,
          requested_to: panel.to,
          requested_cc: panel.cc ?? [],
        },
      }).then(undefined, (e) => console.error('[notify-approval] log failed (non-fatal):', e))
    } catch (err) {
      results.push({ side: panel.side, ok: false, error: err instanceof Error ? err.message : 'send failed' })
    }
  }

  const anySent = results.some((r) => r.ok)

  // Annex the certificate to the sys contract Docs once.
  let certificatePath: string | null = null
  if (anySent && attachment) {
    try {
      const { data: dt } = await supabase
        .from('document_types')
        .select('id')
        .eq('name', 'Quality Certificate')
        .eq('scope', 'contract')
        .maybeSingle()
      const storagePath = `${contractId}/quality-certificate-${tracking.replace(/\//g, '_')}.pdf`
      await supabase.storage
        .from('logistics-documents')
        .upload(storagePath, Buffer.from(attachment.bytes), { contentType: 'application/pdf', upsert: true })
      await supabase.from('documents').insert({
        contract_id: contractId,
        document_type_id: (dt as any)?.id ?? null,
        file_name: `${tracking}.pdf`,
        storage_path: storagePath,
        mime_type: 'application/pdf',
        file_size: attachment.bytes.byteLength,
        source: 'manual',
        status: 'confirmed',
        created_by: user.id,
      })
      certificatePath = storagePath
    } catch (e) {
      console.error('[notify-approval] annex failed (non-fatal):', e)
    }
  }

  // Mark the sys shipment_samples row approved (insert if missing).
  if (anySent) {
    await applyShipmentSampleApproval(supabase, {
      contractId,
      waqcRef: tracking,
      decision,
      userId: user.id,
      today: new Date().toISOString().slice(0, 10),
      certificateUrl: certificatePath,
      comments: body.comments ?? null,
    })
  }

  return NextResponse.json({ ok: anySent, results })
}
```

- [ ] **Step 2: Type-check the route**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "notify-approval/route" || echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/samples/[id]/notify-approval/route.ts"
git commit -m "feat(approval): per-panel send + sys shipment_samples write-back"
```

---

## Task 8: Recipient chip input component

**Files:**
- Create: `src/components/samples/approval/recipient-chips.tsx`
- Test: `src/components/samples/approval/recipient-chips.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/samples/approval/recipient-chips.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecipientChips } from './recipient-chips'

describe('RecipientChips', () => {
  it('renders existing emails as chips', () => {
    render(<RecipientChips label="TO" emails={['a@x.com', 'b@y.com']} onChange={() => {}} />)
    expect(screen.getByText('a@x.com')).toBeInTheDocument()
    expect(screen.getByText('b@y.com')).toBeInTheDocument()
  })

  it('adds an email on Enter', async () => {
    const onChange = vi.fn()
    render(<RecipientChips label="TO" emails={[]} onChange={onChange} />)
    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'new@z.com{Enter}')
    expect(onChange).toHaveBeenCalledWith(['new@z.com'])
  })

  it('removes an email when its × is clicked', async () => {
    const onChange = vi.fn()
    render(<RecipientChips label="TO" emails={['a@x.com', 'b@y.com']} onChange={onChange} />)
    await userEvent.click(screen.getByLabelText('Remove a@x.com'))
    expect(onChange).toHaveBeenCalledWith(['b@y.com'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/samples/approval/recipient-chips.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/samples/approval/recipient-chips.tsx
'use client'

import { useState } from 'react'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Props {
  label: string
  emails: string[]
  onChange: (emails: string[]) => void
}

export function RecipientChips({ label, emails, onChange }: Props) {
  const [draft, setDraft] = useState('')

  const commit = () => {
    const value = draft.trim().replace(/,$/, '')
    if (value && !emails.includes(value)) onChange([...emails, value])
    setDraft('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-black/10 px-2 py-1.5 dark:border-white/15">
      <span className="text-xs uppercase opacity-50">{label}</span>
      {emails.map((e) => (
        <span
          key={e}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
            EMAIL_RE.test(e)
              ? 'bg-black/5 dark:bg-white/10'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
          }`}
        >
          {e}
          <button
            type="button"
            aria-label={`Remove ${e}`}
            onClick={() => onChange(emails.filter((x) => x !== e))}
            className="opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commit()
          }
        }}
        onBlur={commit}
        placeholder="Add…"
      />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/samples/approval/recipient-chips.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/samples/approval/recipient-chips.tsx src/components/samples/approval/recipient-chips.test.tsx
git commit -m "feat(approval): recipient chip input component"
```

---

## Task 9: Recipient panel component

**Files:**
- Create: `src/components/samples/approval/recipient-panel.tsx`
- Test: `src/components/samples/approval/recipient-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/samples/approval/recipient-panel.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecipientPanel } from './recipient-panel'

const panel = {
  title: 'SELLER',
  to: ['seller@x.com'],
  cc: ['qualitycontrol@wolthers.com'],
  body: 'Dear Seller,\n\nWolthers has approved the following sample.',
}

describe('RecipientPanel', () => {
  it('renders title, TO/CC chips and the body', () => {
    render(<RecipientPanel {...panel} onChange={() => {}} />)
    expect(screen.getByText('SELLER')).toBeInTheDocument()
    expect(screen.getByText('seller@x.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/Wolthers has approved/)).toBeInTheDocument()
  })

  it('emits body changes', async () => {
    const onChange = vi.fn()
    render(<RecipientPanel {...panel} onChange={onChange} />)
    const textarea = screen.getByRole('textbox', { name: /message/i })
    await userEvent.type(textarea, '!')
    expect(onChange).toHaveBeenCalled()
    const last = onChange.mock.calls.at(-1)![0]
    expect(last.body.endsWith('!')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/samples/approval/recipient-panel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/samples/approval/recipient-panel.tsx
'use client'

import { RecipientChips } from './recipient-chips'

export interface PanelState {
  title: string
  to: string[]
  cc: string[]
  body: string
}

interface Props extends PanelState {
  onChange: (next: PanelState) => void
}

export function RecipientPanel({ title, to, cc, body, onChange }: Props) {
  const state: PanelState = { title, to, cc, body }
  return (
    <div className="rounded-[16px] border border-black/10 p-4 dark:border-white/15">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">{title}</div>
      <div className="space-y-2">
        <RecipientChips label="TO" emails={to} onChange={(v) => onChange({ ...state, to: v })} />
        <RecipientChips label="CC" emails={cc} onChange={(v) => onChange({ ...state, cc: v })} />
        <textarea
          aria-label={`${title} message`}
          className="min-h-[160px] w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          value={body}
          onChange={(e) => onChange({ ...state, body: e.target.value })}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/samples/approval/recipient-panel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/samples/approval/recipient-panel.tsx src/components/samples/approval/recipient-panel.test.tsx
git commit -m "feat(approval): seller/buyer recipient panel component"
```

---

## Task 10: Certificate preview component

**Files:**
- Create: `src/components/samples/approval/certificate-preview.tsx`
- Test: `src/components/samples/approval/certificate-preview.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/samples/approval/certificate-preview.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CertificatePreview } from './certificate-preview'

describe('CertificatePreview', () => {
  it('renders an iframe to the sample certificate endpoint', () => {
    render(<CertificatePreview sampleId="abc" />)
    const frame = screen.getByTitle('Certificate preview') as HTMLIFrameElement
    expect(frame.src).toContain('/api/samples/abc/certificate')
  })

  it('shows a placeholder when no certificate is available', () => {
    render(<CertificatePreview sampleId="abc" available={false} />)
    expect(screen.getByText(/no certificate/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/samples/approval/certificate-preview.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/samples/approval/certificate-preview.tsx
'use client'

interface Props {
  sampleId: string
  available?: boolean
}

export function CertificatePreview({ sampleId, available = true }: Props) {
  if (!available) {
    return (
      <div className="flex h-full items-center justify-center rounded-[12px] border border-black/10 text-sm opacity-60 dark:border-white/15">
        No certificate available for this sample.
      </div>
    )
  }
  return (
    <iframe
      title="Certificate preview"
      src={`/api/samples/${sampleId}/certificate`}
      className="h-full min-h-[480px] w-full rounded-[12px] border border-black/10 bg-white dark:border-white/15"
    />
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/samples/approval/certificate-preview.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/samples/approval/certificate-preview.tsx src/components/samples/approval/certificate-preview.test.tsx
git commit -m "feat(approval): certificate PDF preview component"
```

---

## Task 11: Send view container

**Files:**
- Create: `src/components/samples/approval-send-view.tsx`
- Test: `src/components/samples/approval-send-view.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/samples/approval-send-view.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ApprovalSendView } from './approval-send-view'
import type { ApprovalPrefill } from '@/lib/approval-notification/types'

const prefill: ApprovalPrefill = {
  sample: {
    trackingNumber: 'BR-036991/26',
    status: 'approved',
    contractNumber: '42221/26',
    sampleCode: 'PSS',
    awb: '872243057708',
    courier: 'FedEx',
    sellerReference: null,
    buyerReference: '106197',
  },
  panels: {
    seller: { greeting: 'João', to: ['seller@x.com'], cc: ['qualitycontrol@wolthers.com'] },
    buyer: { greeting: 'Regula', to: ['regula@blaser.com'], cc: ['qualitycontrol@wolthers.com'] },
  },
  certificateAvailable: true,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/approval-recipients')) {
      return { ok: true, json: async () => prefill } as Response
    }
    if (String(url).endsWith('/notify-approval')) {
      return { ok: true, json: async () => ({ ok: true, results: [{ side: 'seller', ok: true }, { side: 'buyer', ok: true }] }) } as Response
    }
    return { ok: false, json: async () => ({ error: 'unexpected' }) } as Response
  }))
})

describe('ApprovalSendView', () => {
  it('loads prefill and shows both panels with seller first', async () => {
    render(<ApprovalSendView sampleId="abc" open onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('SELLER')).toBeInTheDocument())
    expect(screen.getByText('BUYER')).toBeInTheDocument()
    expect(screen.getByText('seller@x.com')).toBeInTheDocument()
    expect(screen.getByText('regula@blaser.com')).toBeInTheDocument()
    // seller panel appears above buyer panel in DOM order
    const seller = screen.getByText('SELLER')
    const buyer = screen.getByText('BUYER')
    expect(seller.compareDocumentPosition(buyer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('posts a two-panel payload on send and calls onSent', async () => {
    const onSent = vi.fn()
    render(<ApprovalSendView sampleId="abc" open onClose={() => {}} onSent={onSent} />)
    await waitFor(() => expect(screen.getByText('SELLER')).toBeInTheDocument())
    await screen.getByRole('button', { name: /send to both/i }).click()
    await waitFor(() => expect(onSent).toHaveBeenCalled())
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    const sendCall = calls.find((c) => String(c[0]).endsWith('/notify-approval'))!
    const payload = JSON.parse((sendCall[1] as RequestInit).body as string)
    expect(payload.panels).toHaveLength(2)
    expect(payload.panels.map((p: any) => p.side)).toEqual(['seller', 'buyer'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/samples/approval-send-view.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/samples/approval-send-view.tsx
'use client'

import { useEffect, useState } from 'react'
import { RecipientPanel, type PanelState } from './approval/recipient-panel'
import { CertificatePreview } from './approval/certificate-preview'
import {
  buildSampleApprovedSubject,
  buildSampleApprovedBody,
} from '@/lib/approval-notification/sample-approved-template'
import type { ApprovalPrefill, ApprovalSide } from '@/lib/approval-notification/types'

interface Props {
  sampleId: string
  open: boolean
  onClose: () => void
  onSent?: () => void
}

interface PanelWithSide extends PanelState {
  side: ApprovalSide
  subject: string
}

export function ApprovalSendView({ sampleId, open, onClose, onSent }: Props) {
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [certAvailable, setCertAvailable] = useState(true)
  const [includeCert, setIncludeCert] = useState(true)
  const [panels, setPanels] = useState<PanelWithSide[]>([])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    fetch(`/api/samples/${sampleId}/approval-recipients`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed to load')
        return (await r.json()) as ApprovalPrefill
      })
      .then((p) => {
        const fields = p.sample
        const make = (side: ApprovalSide, title: string): PanelWithSide => {
          const panel = side === 'seller' ? p.panels.seller : p.panels.buyer
          return {
            side,
            title,
            to: panel.to.map((c) => c.email),
            cc: panel.cc.map((c) => c.email),
            subject: buildSampleApprovedSubject({
              decision: fields.status,
              greeting: panel.greeting,
              contractNumber: fields.contractNumber,
              sellerReference: fields.sellerReference,
              buyerReference: fields.buyerReference,
              sampleType: 'pss',
              sampleCode: fields.sampleCode,
              trackingNumber: fields.trackingNumber,
              awb: fields.awb,
              courier: fields.courier,
            }),
            body: buildSampleApprovedBody({
              decision: fields.status,
              greeting: panel.greeting,
              contractNumber: fields.contractNumber,
              sellerReference: fields.sellerReference,
              buyerReference: fields.buyerReference,
              sampleType: 'pss',
              sampleCode: fields.sampleCode,
              trackingNumber: fields.trackingNumber,
              awb: fields.awb,
              courier: fields.courier,
            }),
          }
        }
        // Seller top, Buyer bottom.
        setPanels([make('seller', 'SELLER'), make('buyer', 'BUYER')])
        setCertAvailable(p.certificateAvailable)
        setIncludeCert(p.certificateAvailable)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, sampleId])

  if (!open) return null

  const updatePanel = (i: number, next: PanelState) =>
    setPanels((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...next } : p)))

  async function send() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/samples/${sampleId}/notify-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          includeCertificate: includeCert,
          panels: panels
            .filter((p) => p.to.length > 0)
            .map((p) => ({ side: p.side, to: p.to, cc: p.cc, subject: p.subject, bodyText: p.body })),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Send failed')
      onSent?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-[#2A2A2A]">
      <div className="flex h-12 items-center justify-between border-b border-black/10 px-4 dark:border-white/15">
        <h2 className="text-sm font-semibold">Approval — Send</h2>
        <button onClick={onClose} className="text-sm opacity-60 hover:opacity-100">Close</button>
      </div>
      {loading ? (
        <p className="p-6 text-sm opacity-60">Loading…</p>
      ) : (
        <div className="grid h-[calc(100vh-3rem)] grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-2">
          <div className="space-y-4">
            {panels.map((p, i) => (
              <RecipientPanel
                key={p.side}
                title={p.title}
                to={p.to}
                cc={p.cc}
                body={p.body}
                onChange={(next) => updatePanel(i, next)}
              />
            ))}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeCert} disabled={!certAvailable}
                onChange={(e) => setIncludeCert(e.target.checked)} />
              Attach certificate PDF and annex to contract
            </label>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex justify-end">
              <button
                onClick={send}
                disabled={sending || panels.every((p) => p.to.length === 0)}
                className="rounded-lg bg-[#556b2f] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send to both'}
              </button>
            </div>
          </div>
          <CertificatePreview sampleId={sampleId} available={certAvailable} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/samples/approval-send-view.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/samples/approval-send-view.tsx src/components/samples/approval-send-view.test.tsx
git commit -m "feat(approval): full-screen two-panel approval send view"
```

---

## Task 12: Wire into cupping finalize (replace ApprovalComposer)

**Files:**
- Modify: `src/components/cupping/cupping-validation-modal.tsx` (lines ~20, ~1371-1375)

- [ ] **Step 1: Swap the import**

Change line 20 from:
```ts
import { ApprovalComposer } from '@/components/samples/approval-composer'
```
to:
```ts
import { ApprovalSendView } from '@/components/samples/approval-send-view'
```

- [ ] **Step 2: Swap the mounted component**

Replace the `<ApprovalComposer ... />` block near line 1371 with:
```tsx
      <ApprovalSendView
        sampleId={sampleId}
        open={approvalComposerOpen}
        onClose={() => {
          setApprovalComposerOpen(false)
          onFinalize?.()
          onOpenChange(false)
        }}
        onSent={() => {
          /* onClose handles teardown */
        }}
      />
```
(Keep the existing `approvalComposerOpen` state and the `setApprovalComposerOpen(true)` trigger at line ~610 unchanged.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "cupping-validation-modal" || echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/components/cupping/cupping-validation-modal.tsx
git commit -m "feat(approval): open new send view after cupping finalize"
```

---

## Task 13: Open send view after manual certificate override

**Files:**
- Modify: `src/app/certificates/page.tsx` (host of `OverrideStatusDialog`)

- [ ] **Step 1: Find the override dialog usage and sample id**

In `src/app/certificates/page.tsx`, locate the `<OverrideStatusDialog ... onSuccess={...} />` usage. Note the variable holding the certificate's `sample_id` (the certificate row in scope). If `sample_id` is not already available on the row, add it to the certificates query `.select(...)` used to populate the table.

- [ ] **Step 2: Add send-view state + mount**

Near the other dialog state in the page component, add:
```tsx
const [approvalSampleId, setApprovalSampleId] = useState<string | null>(null)
```
Import at the top:
```tsx
import { ApprovalSendView } from '@/components/samples/approval-send-view'
```
In the `OverrideStatusDialog`'s `onSuccess`, after the existing refresh logic, open the view for the affected sample:
```tsx
onSuccess={() => {
  // ...existing refresh...
  if (selectedCertificate?.sample_id) setApprovalSampleId(selectedCertificate.sample_id)
}}
```
(Use whatever variable holds the certificate currently being overridden in place of `selectedCertificate`.)

Mount once at the end of the page's JSX:
```tsx
{approvalSampleId && (
  <ApprovalSendView
    sampleId={approvalSampleId}
    open={!!approvalSampleId}
    onClose={() => setApprovalSampleId(null)}
  />
)}
```

- [ ] **Step 3: Type-check + build the page**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "certificates/page" || echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/app/certificates/page.tsx
git commit -m "feat(approval): open send view after manual certificate override"
```

---

## Task 14: Persistent "Send approval email" button on the sample detail modal

**Files:**
- Modify: `src/components/samples/sample-detail-modal.tsx`

- [ ] **Step 1: Add import + state**

At the top imports add:
```tsx
import { ApprovalSendView } from '@/components/samples/approval-send-view'
```
Near the other `useState` hooks (e.g. by line 194 `showEmailDialog`) add:
```tsx
const [showApprovalSend, setShowApprovalSend] = useState(false)
```

- [ ] **Step 2: Add the button (visible for approved/rejected contract-linked samples)**

In the certificate/actions button area (near the existing "View Certificate" / "Send Email" buttons, ~line 1089-1098), add:
```tsx
{(sample?.status === 'approved' || sample?.status === 'rejected') && sample?.contract_id && (
  <Button variant="outline" size="sm" onClick={() => setShowApprovalSend(true)}>
    Send approval email
  </Button>
)}
```
(Match the exact field names used in this file for the loaded sample — confirm whether it is `sample.status` / `sample.contract_id` or a differently named local.)

- [ ] **Step 3: Mount the view**

Near the other dialogs at the end of the component JSX (by the `showEmailDialog` Dialog, ~line 1188) add:
```tsx
{sampleId && (
  <ApprovalSendView
    sampleId={sampleId}
    open={showApprovalSend}
    onClose={() => setShowApprovalSend(false)}
  />
)}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "sample-detail-modal" || echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add src/components/samples/sample-detail-modal.tsx
git commit -m "feat(approval): persistent 'Send approval email' button on sample detail"
```

---

## Task 15: Remove the old composer + final verification

**Files:**
- Delete: `src/components/samples/approval-composer.tsx`

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -rn "approval-composer\|ApprovalComposer" src || echo "NONE"`
Expected: `NONE` (Task 12 replaced the only usage).

- [ ] **Step 2: Delete the file**

```bash
git rm src/components/samples/approval-composer.tsx
```

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (existing suite + new approval tests).

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(approval): remove obsolete approval composer"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage:** Task 2 (email wording) ↔ spec §9; Task 3 (recipients) ↔ §6; Task 4/7 (write-back) ↔ §8; Task 6 (prefill) ↔ §6; Task 7 (per-panel send + two emails) ↔ §7; Tasks 11/8/9/10 (UI) ↔ §5; Tasks 12/13/14 (three triggers) ↔ §10; Task 10 + Task 7 attachment ↔ §11 (preview + attach).
- **Manual-verification (no automated test):** after Tasks 12-14, manually confirm each trigger opens the view and that the sys contract shows the sample approved after a sandbox send (set `MICROSOFT_GRAPH_TEST_RECIPIENT`).
- **Field-name caveats:** Tasks 13 and 14 depend on the exact local variable names in their host files (`selectedCertificate.sample_id`, `sample.status`/`sample.contract_id`). Confirm these against the file before writing — adjust to the actual names; the wiring shape is fixed.
- **Greeting/wording:** body defaults to "Wolthers has approved"; editable per panel. If the user later wants "{buyer} has approved", change the literal in `buildSampleApprovedBody`.
