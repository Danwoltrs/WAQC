import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { canUserManageSample, isStaffSampleManager } from '@/lib/auth/sample-access'
import { isValidEmail } from '@/lib/html'
import { certUnitKey } from '@/lib/approval-notification/quality-summary'
import { sendCertificateUnit, type CertRef } from '@/lib/approval-notification/send-unit'
import { ALL_PARTIES, type CertificateParty } from '@/lib/approval-notification/types'
import { sellerRequestsInputSchema, type Lang, type SellerRequests } from '@/lib/seller-requests/types'

const admin = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

interface Body {
  side: CertificateParty
  companyId: string
  to: string[]
  cc?: string[]
  subject: string
  /** The cover note as draft markup (`**bold**`, `{red}`…). */
  bodyText: string
  /** Preferred: one entry per certificate (= per sample). */
  certificates?: CertRef[]
  /** Legacy: sample ids only — the same thing, one certificate per sample. */
  sampleIds?: string[]
  includeSignature?: boolean
  /** Attach the certificate PDFs. Defaults to the party's policy: the client
   *  yes, every other party no. Each certificate's own `attach` overrides it. */
  includeCertificates?: boolean
  /** 'en' or 'pt'; omitted, the recipient company's own language. */
  language?: Lang
  /** Seller side: the Requests card's ticks, by sample id. */
  sellerRequests?: Record<string, unknown>
}

const isLang = (v: unknown): v is Lang => v === 'en' || v === 'pt'

/** Each entry through the input schema; an invalid one is dropped, never fatal. */
function parseSellerRequests(raw: unknown): Record<string, SellerRequests> {
  const out: Record<string, SellerRequests> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [sampleId, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = sellerRequestsInputSchema.safeParse(value)
    if (parsed.success) out[sampleId] = parsed.data
  }
  return out
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body
  if (!ALL_PARTIES.includes(body.side)) {
    return NextResponse.json({ error: 'Unknown party' }, { status: 400 })
  }
  const side = body.side
  if (body.language != null && !isLang(body.language)) {
    return NextResponse.json({ error: 'Unknown language' }, { status: 400 })
  }
  const language = body.language ?? undefined
  const to = (body.to ?? []).map((e) => e?.trim()).filter(Boolean)
  const cc = (body.cc ?? []).map((e) => e?.trim()).filter(Boolean)
  // One entry per certificate = per sample (`sampleIds` is the legacy spelling).
  const certRefs: CertRef[] = []
  const seenRefs = new Set<string>()
  const requested: CertRef[] = body.certificates ?? (body.sampleIds ?? []).map((sampleId) => ({ sampleId }))
  for (const r of requested) {
    if (!r?.sampleId) continue
    const key = certUnitKey(r.sampleId)
    if (seenRefs.has(key)) continue
    seenRefs.add(key)
    certRefs.push(typeof r.attach === 'boolean' ? { sampleId: r.sampleId, attach: r.attach } : { sampleId: r.sampleId })
  }
  if (!body.subject || !body.bodyText || to.length === 0 || certRefs.length === 0) {
    return NextResponse.json({ error: 'side, to, subject, bodyText and certificates are required' }, { status: 400 })
  }
  // Recipients come from the shared contacts table, which sys writes without
  // format validation — a paste artifact like "user@domain.nl)," makes Graph
  // reject the whole send with an opaque 400 ErrorInvalidRecipients. Name the
  // bad address so the sender can fix the contact instead of guessing.
  const invalidRecipients = [...to, ...cc].filter((e) => !isValidEmail(e))
  if (invalidRecipients.length > 0) {
    return NextResponse.json(
      { error: `Invalid recipient email address: ${invalidRecipients.join(', ')} — fix this contact and try again` },
      { status: 400 },
    )
  }

  const server = await createServerClient()
  const {
    data: { user },
  } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Service role from here on, and canUserManageSample admits a /portal client
  // for its own lots — without this a client account could mail any address
  // from the QC mailbox. The queue that feeds this composer is staff-only too.
  if (!(await isStaffSampleManager(server as any, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = admin()
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('full_name, email, email_signature_html')
    .eq('id', user.id)
    .single()
  const senderEmail = profile?.email || user.email || undefined
  const senderName = profile?.full_name || senderEmail || undefined
  const signatureHtml: string | null = profile?.email_signature_html ?? null
  const sent = await sendCertificateUnit(
    supabase,
    {
      side,
      companyId: body.companyId,
      to,
      cc,
      subject: body.subject,
      bodyText: body.bodyText,
      certRefs,
      includeSignature: body.includeSignature,
      includeCertificates: body.includeCertificates,
      language,
      sellerRequests: parseSellerRequests(body.sellerRequests),
    },
    { userId: user.id, email: senderEmail, name: senderName, signatureHtml },
    async (sampleId) => (await canUserManageSample(server as any, user.id, sampleId)).allowed,
  )
  return NextResponse.json(sent.body, { status: sent.status })
}
