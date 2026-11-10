import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyIdFromSlug } from '@/lib/qc-client-mapper'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import { fetchPriorSends } from '@/lib/approval-notification/prior-sends'
import { summarizeSamples, type SummarySampleRow, type ClientSummaryResponse } from '@/lib/clients/client-summary'
import { sampleLabelText } from '@/lib/sample-reference'
import { companyDisplayName } from '@/lib/contract-intake-mapping'

const adminClient = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

const PAGE = 1000
const NOT_SENT_WINDOW_DAYS = 90

/**
 * GET /api/clients/[id]/summary
 * Every figure the client page shows: totals over ALL live samples (the old
 * client GET counted only the newest 50), the open pipeline, samples per month,
 * origins, per-spec counts and the latest 7 samples with their send state.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: rawId } = await params
    let id = rawId
    if (!/^[0-9a-f-]{36}$/i.test(rawId)) {
      const resolved = await resolveCompanyIdFromSlug(supabase as any, rawId)
      if (!resolved) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
      id = resolved
    }

    // Every live sample, paged past PostgREST's 1000-row cap.
    const rows: SummarySampleRow[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await (supabase as any)
        .from('samples')
        .select('id, status, approved_with_comments, created_at, origin, quality_spec_id')
        .is('deleted_at', null)
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1)
      if (error) throw error
      rows.push(...((data ?? []) as SummarySampleRow[]))
      if (!data || data.length < PAGE) break
    }
    const aggregates = summarizeSamples(rows)

    const { count: certificates } = await (supabase as any)
      .from('certificates')
      .select('id, sample:samples!certificates_sample_id_fkey!inner(client_id, deleted_at)', { count: 'exact', head: true })
      .eq('sample.client_id', id)
      .is('sample.deleted_at', null)
      .neq('status', 'revoked')

    const { data: latestRaw, error: latestError } = await (supabase as any)
      .from('samples')
      .select(
        'id, created_at, status, approved_with_comments, origin, quality_name, ' +
          'qc_client_contract_nr, buyer_contract_nr, wolthers_contract_nr, ' +
          'container_nr, ico_number, exporter_sample_number, ' +
          'seller:companies!samples_seller_id_fkey(name, fantasy_name), ' +
          'certificates:certificates!certificates_sample_id_fkey(id, certificate_number, status, created_at)',
      )
      .is('deleted_at', null)
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(7)
    if (latestError) throw latestError

    // Send state needs email_messages, which only staff read (service role).
    const staff = await isStaffSampleManager(supabase as any, user.id)
    let sentIds: Set<string> | null = null
    let notSent: number | null = null
    if (staff) {
      const since = Date.now() - NOT_SENT_WINDOW_DAYS * 86_400_000
      const decidedRecent = rows
        .filter((r) => (r.status === 'approved' || r.status === 'rejected') && Date.parse(r.created_at) >= since)
        .map((r) => r.id)
      const latestIds = ((latestRaw ?? []) as any[]).map((s) => s.id)
      const sends = await fetchPriorSends(adminClient(), [...new Set([...decidedRecent, ...latestIds])])
      sentIds = new Set(sends.map((s) => s.sampleId))
      notSent = decidedRecent.filter((sid) => !sentIds!.has(sid)).length
    }

    const latest = ((latestRaw ?? []) as any[]).map((s) => {
      const certs = [...(s.certificates ?? [])].sort((a: any, b: any) =>
        String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
      )
      const cert = certs.find((c: any) => c.status !== 'revoked') ?? certs[0]
      const decided = s.status === 'approved' || s.status === 'rejected'
      return {
        sampleId: s.id as string,
        // The certificate number, else the lot's own identifier; never the SAN.
        label: sampleLabelText({
          certificate_id: cert?.id ?? null,
          certificate_number: cert?.certificate_number ?? null,
          container_nr: s.container_nr,
          ico_number: s.ico_number,
          exporter_sample_number: s.exporter_sample_number,
        }, '—'),
        contract: s.qc_client_contract_nr || s.buyer_contract_nr || s.wolthers_contract_nr || null,
        seller: companyDisplayName(s.seller) || null,
        quality: s.quality_name || null,
        origin: s.origin || null,
        status: s.status as string | null,
        approvedWithComments: s.approved_with_comments === true,
        sent: sentIds && decided ? sentIds.has(s.id) : null,
        createdAt: s.created_at as string,
      }
    })

    const body: ClientSummaryResponse = {
      ...aggregates,
      counts: { ...aggregates.counts, certificates: certificates ?? 0 },
      notSent,
      notSentWindowDays: NOT_SENT_WINDOW_DAYS,
      latest,
    }
    return NextResponse.json(body)
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/summary:', error)
    return NextResponse.json({ error: 'Failed to load the client summary' }, { status: 500 })
  }
}
