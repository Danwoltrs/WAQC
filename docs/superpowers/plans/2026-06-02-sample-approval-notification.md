# Sample Approval Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a WAQC lab user approves/rejects a contract-linked sample, open an Outlook-style composer pre-filled with buyer/seller/logistics recipients and the quality certificate; on send, email via WAQC's Graph, annex the cert to the sys contract Docs tab, and log the message.

**Architecture:** Self-contained in WAQC (Approach A). Two pure libs (template, recipients), one GET prefill route, one POST send route, one composer component, and a trigger wired into the existing cupping validation modal. Integration with sys.wolthers.com happens only through shared DB tables (`contracts`, `contacts`, `documents`, `email_messages`) and the `logistics-documents` storage bucket.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (service-role admin client), `@react-pdf/renderer` (existing cert PDF), `src/lib/graph/send.ts` (existing Graph sender). No test runner exists in this repo — verification is `npm run build` (typecheck), `npm run lint`, and manual sandbox testing via `MICROSOFT_GRAPH_TEST_RECIPIENT`.

**Conventions confirmed:**
- Admin client: `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })`
- User: `supabase.auth.getUser()` then `profiles` table (`full_name, email`).
- Cert PDF bytes: `getCachedCertificatePdf` / `renderToBuffer` pattern from `src/app/api/certificates/send-email/route.ts`.
- Cert # = sample `tracking_number`. Certificate row: `certificates` where `sample_id = … AND sample_contract_id IS NULL`.
- Buckets: cert source `certificates`; annex target `logistics-documents` (both exist).
- Finalize client caller: `src/components/cupping/cupping-validation-modal.tsx` (~lines 533-601); response `data` has `decision` ('approved'|'rejected'|'pending').

---

### Task 1: Add "Quality Certificate" contract document type

**Files:**
- Create: `database/migrations/20260602000000_quality_certificate_document_type.sql`

This is the document_type the annexed cert rows reference. The route looks it up by name at runtime (no hardcoded UUID).

- [ ] **Step 1: Write the migration SQL**

```sql
-- Adds a contract-scoped document type for WAQC quality certificates annexed
-- onto sys.wolthers.com contracts. Idempotent.
INSERT INTO document_types (name, scope, sort_order, is_active)
SELECT 'Quality Certificate', 'contract', 415, true
WHERE NOT EXISTS (
  SELECT 1 FROM document_types WHERE name = 'Quality Certificate' AND scope = 'contract'
);
```

- [ ] **Step 2: User applies the migration**

Per project convention the user applies migrations / pastes SQL. Paste the SQL above into the Supabase SQL editor and run it. Verify:

```sql
SELECT id, name, scope FROM document_types WHERE name = 'Quality Certificate';
```
Expected: one row, scope `contract`.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/20260602000000_quality_certificate_document_type.sql
git commit -m "feat(quality): add Quality Certificate contract document type"
```

---

### Task 2: Email subject/body templating lib

**Files:**
- Create: `src/lib/approval-notification/template.ts`

Pure functions — no I/O. Build the default subject and body from already-loaded data.

- [ ] **Step 1: Implement the templating module**

```typescript
// src/lib/approval-notification/template.ts

export type ApprovalDecision = 'approved' | 'rejected'

export interface ApprovalTemplateInput {
  decision: ApprovalDecision
  trackingNumber: string
  contractNumber: string | null
  qualityName: string | null
  origin: string | null
  cuppingScore: number | null
  violations: string[] // populated on rejection
}

/** e.g. "Quality Approval — BR-000123/26 — IRO007561 SAX 17/18 GC" */
export function buildApprovalSubject(input: ApprovalTemplateInput): string {
  const word = input.decision === 'approved' ? 'Approval' : 'Rejection'
  const tail = [input.contractNumber, input.qualityName].filter(Boolean).join(' ')
  const base = `Quality ${word} — ${input.trackingNumber}`
  return tail ? `${base} — ${tail}` : base
}

/** Plain-text body. The route wraps this to HTML for Graph. */
export function buildApprovalBody(input: ApprovalTemplateInput): string {
  const lines: string[] = []
  const verb = input.decision === 'approved' ? 'APPROVED' : 'REJECTED'
  lines.push(`Dear team,`)
  lines.push('')
  lines.push(
    `The quality sample ${input.trackingNumber} has been ${verb} by Wolthers Quality Control.`,
  )
  lines.push('')
  if (input.contractNumber) lines.push(`Contract: ${input.contractNumber}`)
  if (input.qualityName) lines.push(`Quality: ${input.qualityName}`)
  if (input.origin) lines.push(`Origin: ${input.origin}`)
  if (input.cuppingScore != null) lines.push(`Cupping score: ${input.cuppingScore}`)
  lines.push(`Certificate no.: ${input.trackingNumber}`)
  if (input.decision === 'rejected' && input.violations.length > 0) {
    lines.push('')
    lines.push('Reason(s):')
    for (const v of input.violations) lines.push(`- ${v}`)
  }
  lines.push('')
  lines.push(
    input.decision === 'approved'
      ? 'The quality certificate is attached.'
      : 'The rejection certificate is attached.',
  )
  lines.push('')
  lines.push('Best regards,')
  lines.push('Wolthers Quality Control')
  return lines.join('\n')
}

/** Minimal text→HTML for the Graph HTML body. Escapes entities, paragraphs on blank lines. */
export function approvalBodyToHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text
    .split('\n\n')
    .map(
      (p) =>
        `<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:0 0 10px">${esc(
          p,
        ).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('')
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: compiles (no errors referencing this file).

- [ ] **Step 3: Commit**

```bash
git add src/lib/approval-notification/template.ts
git commit -m "feat(quality): approval email subject/body templating"
```

---

### Task 3: Recipient resolution lib

**Files:**
- Create: `src/lib/approval-notification/recipients.ts`

Reads buyer/seller contacts from the shared `contacts` table and sorts them (primary → role-tagged → others), buyer-side first, mirroring the sys fixation sort. `logistics` Cc resolved by role match.

- [ ] **Step 1: Implement the module**

```typescript
// src/lib/approval-notification/recipients.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ContactLite {
  name: string | null
  email: string
}

interface RawContact {
  name: string | null
  email: string | null
  role: string | null
  is_primary: boolean | null
  company_id: string
}

const QC_MAILBOX = 'qualitycontrol@wolthers.com'

function rank(c: RawContact): number {
  if (c.is_primary) return 0
  const role = (c.role ?? '').toLowerCase()
  if (/quality|approval|qc/.test(role)) return 1
  return 2
}

function sortSide(rows: RawContact[]): RawContact[] {
  return [...rows].sort((a, b) => {
    const r = rank(a) - rank(b)
    if (r !== 0) return r
    return (a.name ?? '').localeCompare(b.name ?? '')
  })
}

export interface ResolvedRecipients {
  to: ContactLite[]
  cc: ContactLite[]
}

/**
 * Resolve default To (primary buyer + primary seller contact) and Cc
 * (QC mailbox + any logistics-role contacts on either side).
 */
export async function resolveApprovalRecipients(
  supabase: SupabaseClient,
  buyerId: string | null,
  sellerId: string | null,
): Promise<ResolvedRecipients> {
  const companyIds = [buyerId, sellerId].filter(Boolean) as string[]
  if (companyIds.length === 0) {
    return { to: [], cc: [{ name: 'Quality Control', email: QC_MAILBOX }] }
  }

  const { data } = await supabase
    .from('contacts')
    .select('name, email, role, is_primary, company_id')
    .in('company_id', companyIds)
    .eq('is_active', true)
    .not('email', 'is', null)

  const rows = (data ?? []) as RawContact[]
  const buyer = sortSide(rows.filter((r) => r.company_id === buyerId))
  const seller = sortSide(rows.filter((r) => r.company_id === sellerId))

  const to: ContactLite[] = []
  if (buyer[0]) to.push({ name: buyer[0].name, email: buyer[0].email! })
  if (seller[0]) to.push({ name: seller[0].name, email: seller[0].email! })

  const logistics = rows.filter((r) => /logistic|docs|shipping/i.test(r.role ?? ''))
  const cc: ContactLite[] = [{ name: 'Quality Control', email: QC_MAILBOX }]
  for (const l of logistics) {
    if (!cc.some((c) => c.email === l.email)) cc.push({ name: l.name, email: l.email! })
  }

  return { to, cc }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add src/lib/approval-notification/recipients.ts
git commit -m "feat(quality): approval recipient resolution from shared contacts"
```

---

### Task 4: Prefill GET route

**Files:**
- Create: `src/app/api/samples/[id]/approval-recipients/route.ts`

Returns the data the composer needs to prefill: sample summary, default To/Cc, certificate availability.

- [ ] **Step 1: Implement the route**

```typescript
// src/app/api/samples/[id]/approval-recipients/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { resolveApprovalRecipients } from '@/lib/approval-notification/recipients'

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
  const supabase = admin()

  const { data: sample, error } = await supabase
    .from('samples')
    .select(
      'id, tracking_number, status, contract_id, origin, quality_name, ' +
        'quality_assessment:quality_assessments(green_bean_data)',
    )
    .eq('id', id)
    .single()

  if (error || !sample) {
    return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
  }
  if (!(sample as any).contract_id) {
    return NextResponse.json({ error: 'Sample is not contract-linked' }, { status: 400 })
  }

  const { data: contract } = await supabase
    .from('contracts')
    .select('contract_number, buyer_id, seller_id')
    .eq('id', (sample as any).contract_id)
    .single()

  const { to, cc } = await resolveApprovalRecipients(
    supabase,
    (contract as any)?.buyer_id ?? null,
    (contract as any)?.seller_id ?? null,
  )

  const { data: cert } = await supabase
    .from('certificates')
    .select('id')
    .eq('sample_id', id)
    .is('sample_contract_id', null)
    .limit(1)
    .maybeSingle()

  const qa = Array.isArray((sample as any).quality_assessment)
    ? (sample as any).quality_assessment[0]
    : (sample as any).quality_assessment
  const cuppingScore = qa?.green_bean_data?.cupping_score ?? null

  return NextResponse.json({
    sample: {
      tracking_number: (sample as any).tracking_number,
      status: (sample as any).status,
      origin: (sample as any).origin,
      quality_name: (sample as any).quality_name,
      cupping_score: cuppingScore,
      contract_number: (contract as any)?.contract_number ?? null,
    },
    defaultTo: to,
    defaultCc: cc,
    certificateAvailable: !!cert,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/samples/[id]/approval-recipients/route.ts
git commit -m "feat(quality): approval composer prefill route"
```

---

### Task 5: Send route (`notify-approval`)

**Files:**
- Create: `src/app/api/samples/[id]/notify-approval/route.ts`

Sends the email via WAQC Graph, annexes the cert to the sys contract, logs to `email_messages`. Reuses the cert-PDF loading approach from `certificates/send-email`.

- [ ] **Step 1: Implement the route**

```typescript
// src/app/api/samples/[id]/notify-approval/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { sendMail, type GraphSendAttachment } from '@/lib/graph/send'
import { getCachedCertificatePdf, uploadCertificatePdf } from '@/lib/certificate-storage'
import { getCertificateData } from '@/lib/certificate-data'
import { renderCertificatePdfBuffer } from '@/lib/certificate-render'
import {
  buildApprovalSubject,
  buildApprovalBody,
  approvalBodyToHtml,
  type ApprovalDecision,
} from '@/lib/approval-notification/template'

const QC_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX || 'qualitycontrol@wolthers.com'

const admin = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

interface Body {
  to: string[]
  cc?: string[]
  subject: string
  bodyText: string
  includeCertificate?: boolean
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = (await req.json()) as Body
  if (!body?.to?.length || !body.subject || !body.bodyText) {
    return NextResponse.json({ error: 'to, subject, bodyText required' }, { status: 400 })
  }

  // Logged-in user → sender identity
  const server = await createServerClient()
  const {
    data: { user },
  } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = admin()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()
  const senderEmail = (profile as any)?.email || user.email || undefined
  const senderName = (profile as any)?.full_name || senderEmail || undefined

  // Sample + guards
  const { data: sample } = await supabase
    .from('samples')
    .select('id, tracking_number, status, contract_id')
    .eq('id', id)
    .single()
  if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
  const status = (sample as any).status as string
  if (status !== 'approved' && status !== 'rejected') {
    return NextResponse.json({ error: 'Sample is not approved/rejected' }, { status: 400 })
  }
  const contractId = (sample as any).contract_id as string | null
  if (!contractId) {
    return NextResponse.json({ error: 'Sample is not contract-linked' }, { status: 400 })
  }
  const decision = status as ApprovalDecision
  const tracking = (sample as any).tracking_number as string

  const { data: contract } = await supabase
    .from('contracts')
    .select('buyer_id, seller_id')
    .eq('id', contractId)
    .single()

  // Certificate PDF bytes (cached → render fallback)
  const attachments: GraphSendAttachment[] = []
  let certId: string | null = null
  if (body.includeCertificate !== false) {
    const { data: cert } = await supabase
      .from('certificates')
      .select('id, pdf_url')
      .eq('sample_id', id)
      .is('sample_contract_id', null)
      .limit(1)
      .maybeSingle()
    if (!cert) {
      return NextResponse.json({ error: 'No certificate for this sample' }, { status: 400 })
    }
    certId = (cert as any).id
    let pdf: Buffer | null = null
    if ((cert as any).pdf_url) {
      pdf = await getCachedCertificatePdf(supabase, (cert as any).pdf_url)
    }
    if (!pdf) {
      const certData = await getCertificateData(id)
      pdf = Buffer.from(await renderCertificatePdfBuffer(certData))
      uploadCertificatePdf(supabase, id, certId!, pdf).catch(() => {})
    }
    attachments.push({
      name: `${tracking}.pdf`,
      contentType: 'application/pdf',
      bytes: new Uint8Array(pdf),
    })
  }

  // Sandbox interception
  const testTo = process.env.MICROSOFT_GRAPH_TEST_RECIPIENT
  const to = testTo ? [testTo] : body.to
  const cc = testTo ? undefined : body.cc
  const subject = testTo ? `[TEST] ${body.subject}` : body.subject

  // Send
  try {
    await sendMail({
      mailbox: QC_MAILBOX,
      to,
      cc,
      subject,
      bodyText: body.bodyText,
      bodyHtml: approvalBodyToHtml(body.bodyText),
      attachments,
      saveToSentItems: true,
      senderEmail,
      senderName,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'send failed'
    return NextResponse.json({ error: `Email send failed: ${msg}` }, { status: 502 })
  }

  // Post-send: annex cert to sys contract Docs + log message. Non-fatal.
  if (attachments[0]) {
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
        .upload(storagePath, Buffer.from(attachments[0].bytes), {
          contentType: 'application/pdf',
          upsert: true,
        })
      await supabase.from('documents').insert({
        contract_id: contractId,
        document_type_id: (dt as any)?.id ?? null,
        file_name: `${tracking}.pdf`,
        storage_path: storagePath,
        mime_type: 'application/pdf',
        file_size: attachments[0].bytes.byteLength,
        source: 'manual',
        status: 'confirmed',
        created_by: user.id,
      })
    } catch (e) {
      console.error('[notify-approval] annex failed (non-fatal):', e)
    }
  }

  try {
    await supabase.from('email_messages').insert({
      direction: 'outbound',
      status: 'sent',
      mailbox: QC_MAILBOX,
      from_email: QC_MAILBOX,
      sender_email: senderEmail ?? null,
      to_recipients: body.to.map((e) => ({ email: e })),
      cc_recipients: (body.cc ?? []).map((e) => ({ email: e })),
      subject: body.subject,
      body_text: body.bodyText,
      body_html: approvalBodyToHtml(body.bodyText),
      contract_id: contractId,
      buyer_id: (contract as any)?.buyer_id ?? null,
      seller_id: (contract as any)?.seller_id ?? null,
      sent_at: new Date().toISOString(),
      sent_by: user.id,
      metadata: { source: 'sample_approval', sample_id: id, decision },
    })
  } catch (e) {
    console.error('[notify-approval] email_messages log failed (non-fatal):', e)
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Reconcile cert helper imports**

The route imports `getCertificateData` and a `renderCertificatePdfBuffer`. These may be inline in `certificates/send-email/route.ts` rather than shared modules. Open `src/app/api/certificates/send-email/route.ts`, find how `getCertificateData(sampleId)` and the `renderToBuffer(...)` element are built (logos, flag, QR), and EITHER:
- (a) extract them into `src/lib/certificate-data.ts` (`getCertificateData`) and `src/lib/certificate-render.ts` (`renderCertificatePdfBuffer(data): Promise<Uint8Array>`), updating `send-email` to import them (DRY), OR
- (b) if already importable, fix the import paths above.
Match whichever the codebase already exposes; do not duplicate the render logic.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run build && npm run lint`
Expected: compiles; no new lint errors in the new files.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/samples/[id]/notify-approval/route.ts src/lib/certificate-data.ts src/lib/certificate-render.ts src/app/api/certificates/send-email/route.ts
git commit -m "feat(quality): notify-approval send + cert annex + email log"
```

---

### Task 6: Approval composer component

**Files:**
- Create: `src/components/samples/approval-composer.tsx`

Outlook-style centered modal. Fetches prefill on open, lets the lab user edit To/Cc/subject/body, toggles the cert attachment, and POSTs to `notify-approval`. Follow existing WAQC modal/styling conventions (Inter font, rounded cards, dark/light per CLAUDE.md). Recipients are simple comma-separated chip inputs (no need to port the full sys picker for v1).

- [ ] **Step 1: Implement the component**

```tsx
// src/components/samples/approval-composer.tsx
'use client'

import { useEffect, useState } from 'react'

interface Props {
  sampleId: string
  open: boolean
  onClose: () => void
  onSent?: () => void
}

interface Prefill {
  sample: {
    tracking_number: string
    status: 'approved' | 'rejected' | string
    origin: string | null
    quality_name: string | null
    cupping_score: number | null
    contract_number: string | null
  }
  defaultTo: { name: string | null; email: string }[]
  defaultCc: { name: string | null; email: string }[]
  certificateAvailable: boolean
}

export function ApprovalComposer({ sampleId, open, onClose, onSent }: Props) {
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [includeCert, setIncludeCert] = useState(true)
  const testMode = false // server intercepts via MICROSOFT_GRAPH_TEST_RECIPIENT

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    fetch(`/api/samples/${sampleId}/approval-recipients`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed to load')
        return r.json()
      })
      .then((p: Prefill) => {
        const decision = p.sample.status === 'approved' ? 'approved' : 'rejected'
        setTo(p.defaultTo.map((c) => c.email).join(', '))
        setCc(p.defaultCc.map((c) => c.email).join(', '))
        // Build defaults client-side to avoid a second round-trip.
        const word = decision === 'approved' ? 'Approval' : 'Rejection'
        const tail = [p.sample.contract_number, p.sample.quality_name]
          .filter(Boolean)
          .join(' ')
        setSubject(
          `Quality ${word} — ${p.sample.tracking_number}${tail ? ` — ${tail}` : ''}`,
        )
        const verb = decision === 'approved' ? 'APPROVED' : 'REJECTED'
        const lines = [
          'Dear team,',
          '',
          `The quality sample ${p.sample.tracking_number} has been ${verb} by Wolthers Quality Control.`,
          '',
          p.sample.contract_number ? `Contract: ${p.sample.contract_number}` : '',
          p.sample.quality_name ? `Quality: ${p.sample.quality_name}` : '',
          p.sample.origin ? `Origin: ${p.sample.origin}` : '',
          p.sample.cupping_score != null ? `Cupping score: ${p.sample.cupping_score}` : '',
          `Certificate no.: ${p.sample.tracking_number}`,
          '',
          decision === 'approved'
            ? 'The quality certificate is attached.'
            : 'The rejection certificate is attached.',
          '',
          'Best regards,',
          'Wolthers Quality Control',
        ].filter((l, i, a) => !(l === '' && a[i - 1] === ''))
        setBodyText(lines.join('\n'))
        setIncludeCert(p.certificateAvailable)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, sampleId])

  if (!open) return null

  async function send() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/samples/${sampleId}/notify-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.split(',').map((s) => s.trim()).filter(Boolean),
          cc: cc.split(',').map((s) => s.trim()).filter(Boolean),
          subject,
          bodyText,
          includeCertificate: includeCert,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Send failed')
      onSent?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const input =
    'w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-[20px] bg-white p-6 shadow-xl dark:bg-[#2A2A2A]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Notify counterparties</h2>
          <button onClick={onClose} className="text-sm opacity-60 hover:opacity-100">
            Close
          </button>
        </div>

        {loading ? (
          <p className="text-sm opacity-60">Loading…</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs opacity-60">To</label>
              <input className={input} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <label className="text-xs opacity-60">Cc</label>
              <input className={input} value={cc} onChange={(e) => setCc(e.target.value)} />
            </div>
            <div>
              <label className="text-xs opacity-60">Subject</label>
              <input
                className={input}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs opacity-60">Message</label>
              <textarea
                className={`${input} min-h-[180px]`}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeCert}
                onChange={(e) => setIncludeCert(e.target.checked)}
              />
              Attach certificate PDF and annex to contract
            </label>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm opacity-70 hover:opacity-100"
              >
                Cancel
              </button>
              <button
                onClick={send}
                disabled={sending || !to.trim()}
                className="rounded-lg bg-[#556b2f] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run build && npm run lint`
Expected: compiles; no new lint errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/samples/approval-composer.tsx
git commit -m "feat(quality): approval composer modal"
```

---

### Task 7: Trigger the composer after finalize

**Files:**
- Modify: `src/components/cupping/cupping-validation-modal.tsx`

After a successful finalize, if the sample is approved/rejected AND contract-linked, open the composer.

- [ ] **Step 1: Add state + import**

At the top of the component module, add:
```tsx
import { ApprovalComposer } from '@/components/samples/approval-composer'
```
Inside the component, near other `useState`:
```tsx
const [approvalComposerOpen, setApprovalComposerOpen] = useState(false)
```

- [ ] **Step 2: Open after finalize**

In the finalize handler, after `const data = await response.json()` and the `!response.ok` check (~line 545), add a contract-linked check. The finalize response does not currently include `contract_id`; gate on it with a lightweight fetch so we only open for contract-linked samples:
```tsx
if (data.decision === 'approved' || data.decision === 'rejected') {
  try {
    const r = await fetch(`/api/samples/${sampleId}/approval-recipients`)
    if (r.ok) setApprovalComposerOpen(true)
  } catch {
    /* not contract-linked or unavailable — skip silently */
  }
}
```
(The prefill route returns 400 for non-contract-linked samples, so `r.ok` is the gate.)

- [ ] **Step 3: Render the composer**

In the component's returned JSX (near the root, alongside the existing dialog), add:
```tsx
<ApprovalComposer
  sampleId={sampleId}
  open={approvalComposerOpen}
  onClose={() => setApprovalComposerOpen(false)}
/>
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run build && npm run lint`
Expected: compiles; no new lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/cupping/cupping-validation-modal.tsx
git commit -m "feat(quality): open approval composer after contract-linked finalize"
```

---

### Task 8: Manual sandbox verification

**Files:** none (manual).

- [ ] **Step 1: Set sandbox env**

In `.env.local` set `MICROSOFT_GRAPH_TEST_RECIPIENT=<your test inbox>` and restart `npm run dev`.

- [ ] **Step 2: Approve a contract-linked sample**

Intake a sample via Contract Search (so `contract_id` is set), run a cupping session, and finalize to `approved`. Confirm:
- The composer opens automatically with To/Cc/subject/body prefilled and the cert attachment toggle on.
- Click Send. Expect a `[TEST]` email in your test inbox with the cert PDF attached.

- [ ] **Step 3: Verify side effects**

```sql
-- the annexed certificate appears on the contract Docs tab
SELECT d.file_name, dt.name, d.storage_path
FROM documents d JOIN document_types dt ON dt.id = d.document_type_id
WHERE d.contract_id = '<contract_id>' ORDER BY d.created_at DESC LIMIT 3;

-- the outbound message is logged
SELECT direction, status, subject, metadata
FROM email_messages
WHERE contract_id = '<contract_id>' ORDER BY created_at DESC LIMIT 3;
```
Expected: a `Quality Certificate` document row and an outbound `email_messages` row with `metadata.source = 'sample_approval'`. Open the sys.wolthers.com contract → Docs tab → the certificate is listed; logistics sidebar badge increments.

- [ ] **Step 4: Rejection path**

Repeat with a sample that fails spec → finalize `rejected`. Confirm the composer says "REJECTED", lists the reason(s), attaches the rejection certificate, and annexes it.

- [ ] **Step 5: Non-contract sample**

Finalize a sample with no `contract_id`. Confirm the composer does NOT open (no regression to the normal flow).

---

## Self-Review notes

- **Spec coverage:** trigger/gating (Task 7), recipients (Task 3/4), composer (Task 6), send+annex+log (Task 5), rejection variant (Tasks 5/6 body), status-sync (no-op, documented), document type (Task 1), edge cases (route guards + non-fatal annex/log), testing (Task 8). All covered.
- **No test runner:** verification is build/lint/manual by design — matches the repo.
- **Cert render helpers (Task 5 Step 2):** the only known unknown is whether `getCertificateData`/render are already importable or must be extracted from `certificates/send-email/route.ts`. The task instructs to reconcile against the actual code and prefer extraction (DRY) over duplication.
- **Type consistency:** `ApprovalDecision`, `ContactLite`, `GraphSendAttachment`, prefill shape are consistent across tasks.
