import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import {
  resolveSampleContractsBatch,
  computeSendStatus,
  getInitials,
  type SendStatusRow,
} from '@/lib/approval-notification/batch-send'
import { sanitizeOrTerm, buildOrIlike } from '@/lib/search/or-filter'
import { buildCertificateSearchOr } from '@/lib/search/cert-search-filter'

// Reference/number fields a certificate is searchable by, on its own sample. A
// contract sibling is a sample row of its own (samples.lab_source_sample_id), so
// one scan of `samples` covers every contract a physical lot spans.
const SEARCH_FIELDS = [
  'tracking_number',
  'wolthers_contract_nr',
  'seller_contract_nr',
  'buyer_contract_nr',
  'supplier_contract_nr',
  'shipper_contract_nr',
  'exporter_sample_number',
  'ico_number',
  'container_nr',
]

const PRIOR_SOURCES = new Set(['sample_approval', 'batch_approval'])
const adminClient = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

/**
 * GET /api/certificates
 * Fetch all certificates with related sample and client data
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')
    const status = searchParams.get('status')
    const clientId = searchParams.get('client_id')
    const sampleId = searchParams.get('sample_id')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const sortBy = searchParams.get('sort_by') || 'created_at'
    const sortOrder = searchParams.get('sort_order') || 'desc'
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from('certificates')
      .select(`
        id,
        certificate_number,
        issued_to,
        status,
        created_at,
        pdf_url,
        sample_id,
        is_rejected,
        sample:samples(
          id,
          tracking_number,
          lab_source_sample_id,
          contract_ordinal,
          bag_type,
          bag_count,
          bag_weight_kg,
          bags_quantity_mt,
          container_count,
          origin,
          client_id,
          workflow_stage,
          sample_type,
          exporter_sample_number,
          ico_number,
          container_nr,
          wolthers_contract_nr,
          seller_contract_nr,
          buyer_contract_nr,
          contract_id,
          exporter_id,
          importer_id,
          roaster_id,
          seller_id,
          quality_spec_id,
          client:companies!samples_client_id_fkey(
            id,
            name,
            company:name,
            fantasy_name
          ),
          exporter:companies!samples_exporter_id_fkey(
            id,
            name,
            contact_email:email
          ),
          importer:companies!samples_importer_id_fkey(
            id,
            name,
            contact_email:email
          ),
          roaster:companies!samples_roaster_id_fkey(
            id,
            name,
            contact_email:email
          ),
          seller:companies!samples_seller_id_fkey(
            id,
            name,
            fantasy_name
          ),
          quality_spec:client_qualities!samples_quality_spec_id_fkey(
            id,
            custom_name,
            template:quality_templates!client_qualities_template_id_fkey(
              id,
              name
            )
          )
        )
      `)

    // Apply filters
    if (sampleId) {
      query = query.eq('sample_id', sampleId)
    }

    if (status) {
      query = query.eq('status', status as 'draft' | 'issued' | 'revoked')
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo + 'T23:59:59')
    }

    // Server-side search — resolve matches BEFORE paginating so a certificate outside
    // the first page window is still found. Matching is per certificate: a cert is
    // returned only when its OWN sample's fields matched, so a contract-number search
    // returns that contract's certs (across earlier/rejected samples too) but never a
    // contract sibling of the same physical lot carrying a different number — siblings
    // are separate sample rows. A client-name match stays broad (all the client's certs).
    if (search) {
      const safeQ = sanitizeOrTerm(search)
      if (safeQ.length >= 1) {
        const like = `%${safeQ}%`
        // Bound each resolution query. Reference-number searches (the primary use)
        // match a handful of rows; these caps only bite on very broad substrings, in
        // which case we warn rather than silently drop matches.
        const SAMPLE_SCAN_LIMIT = 2000
        const COMPANY_SCAN_LIMIT = 200
        const [sampleRes, companyRes] = await Promise.all([
          (supabase as any).from('samples').select('id').or(buildOrIlike(SEARCH_FIELDS, safeQ)).limit(SAMPLE_SCAN_LIMIT),
          (supabase as any).from('companies').select('id').or(`name.ilike.${like},fantasy_name.ilike.${like}`).limit(COMPANY_SCAN_LIMIT),
        ])
        const matchedSampleIds = [...new Set(((sampleRes.data ?? []) as Array<{ id: string }>).map((r) => r.id))]
        const companyIds = ((companyRes.data ?? []) as Array<{ id: string }>).map((r) => r.id)
        let clientSampleIds: string[] = []
        let clientScanTruncated = false
        if (companyIds.length > 0) {
          const { data: clientSamples } = await (supabase as any)
            .from('samples').select('id').in('client_id', companyIds).limit(SAMPLE_SCAN_LIMIT)
          const rows = (clientSamples ?? []) as Array<{ id: string }>
          clientSampleIds = rows.map((r) => r.id)
          clientScanTruncated = rows.length >= SAMPLE_SCAN_LIMIT
        }
        // Warn (don't silently drop) if any scan hit its cap — the result set may be
        // incomplete for this (unusually broad) search term.
        if (
          (sampleRes.data?.length ?? 0) >= SAMPLE_SCAN_LIMIT ||
          clientScanTruncated
        ) {
          console.warn(
            `[certificates] search "${safeQ}" hit a ${SAMPLE_SCAN_LIMIT}-row scan cap; results may be incomplete. Narrow the query.`,
          )
        }
        query = query.or(buildCertificateSearchOr(like, { sampleIds: matchedSampleIds, clientSampleIds }))
      }
    }

    // Sort
    const ascending = sortOrder === 'asc'
    query = query.order(sortBy, { ascending })

    // Pagination
    query = query.range(offset, offset + limit - 1)

    const { data: certificates, error } = await query

    if (error) {
      console.error('Error fetching certificates:', error)
      return NextResponse.json({ error: 'Failed to fetch certificates' }, { status: 500 })
    }

    // Search is now applied server-side (above), across all rows — not just this page.
    let filtered = certificates || []

    // Filter by client ID
    if (clientId) {
      filtered = filtered.filter((cert) => {
        const sample = cert.sample as { client_id?: string } | null
        return sample?.client_id === clientId
      })
    }

    // Get unique clients for filter dropdown
    const clientsMap = new Map<string, { id: string; name: string }>()
    // Get unique quality specs for filter dropdown (with client association)
    const qualitiesMap = new Map<string, { id: string; name: string; client_id: string }>()
    for (const cert of certificates || []) {
      const sample = cert.sample as {
        client_id?: string
        client?: { id: string; name: string; company?: string; fantasy_name?: string }
        quality_spec?: { id: string; custom_name?: string; template?: { id: string; name: string } } | null
      } | null
      if (sample?.client) {
        clientsMap.set(sample.client.id, {
          id: sample.client.id,
          name: sample.client.fantasy_name || sample.client.company || sample.client.name
        })
      }
      if (sample?.quality_spec && sample.client_id) {
        const qName = sample.quality_spec.custom_name || sample.quality_spec.template?.name || 'Unknown'
        qualitiesMap.set(sample.quality_spec.id, {
          id: sample.quality_spec.id,
          name: qName,
          client_id: sample.client_id
        })
      }
    }

    // Enrich each certificate with per-side send status (who/when) for the Sent
    // column. Computed with the service role so contract/email reads aren't
    // blocked by RLS; the certificate list itself stays user-scoped above.
    try {
      const sampleKeys = filtered
        .map((cert) => cert.sample as { id?: string; contract_id?: string | null; wolthers_contract_nr?: string | null } | null)
        .filter((s): s is { id: string; contract_id: string | null; wolthers_contract_nr: string | null } => !!s?.id)
        .map((s) => ({ id: s.id, contract_id: s.contract_id ?? null, wolthers_contract_nr: s.wolthers_contract_nr ?? null }))

      if (sampleKeys.length > 0) {
        const admin = adminClient()
        const contexts = await resolveSampleContractsBatch(admin, sampleKeys)
        const sampleIds = sampleKeys.map((s) => s.id)
        const required = new Map<string, { buyer: boolean; seller: boolean }>()
        for (const [sid, ctx] of contexts) required.set(sid, { buyer: !!ctx.buyerId, seller: !!ctx.sellerId })
        const contractIds = [...new Set([...contexts.values()].map((c) => c.contractId))]

        const statusRows: SendStatusRow[] = []
        if (contractIds.length > 0) {
          const { data: msgs } = await admin
            .from('email_messages')
            .select('sent_by, sent_at, metadata, status')
            .in('contract_id', contractIds)
            .eq('status', 'sent')
          const relevant = ((msgs ?? []) as any[]).filter((m) => {
            const meta = m.metadata ?? {}
            return PRIOR_SOURCES.has(meta.source) && sampleIds.includes(meta.sample_id) && (meta.side === 'buyer' || meta.side === 'seller')
          })
          const sentByIds = new Set<string>()
          for (const m of relevant) if (m.sent_by) sentByIds.add(m.sent_by)
          const nameById = new Map<string, string>()
          if (sentByIds.size > 0) {
            const { data: profs } = await admin.from('profiles').select('id, full_name').in('id', [...sentByIds])
            for (const p of (profs ?? []) as any[]) nameById.set(p.id, p.full_name ?? '')
          }
          for (const m of relevant) {
            statusRows.push({
              sampleId: m.metadata.sample_id,
              side: m.metadata.side,
              sentBy: m.sent_by ? nameById.get(m.sent_by) ?? null : null,
              sentAt: m.sent_at ?? null,
            })
          }
        }
        const sendStatus = computeSendStatus(statusRows, required)
        const toChip = (side: { by: string | null; at: string | null } | null) =>
          side ? { initials: getInitials(side.by), name: side.by, at: side.at } : null
        for (const cert of filtered as any[]) {
          const sid = (cert.sample as { id?: string } | null)?.id
          const st = sid ? sendStatus.get(sid) : undefined
          cert.send_status = st
            ? { buyerSent: toChip(st.buyerSent), sellerSent: toChip(st.sellerSent), full: st.full }
            : { buyerSent: null, sellerSent: null, full: false }
          // Buyer/seller company ids drive the page's "Send to buyer / seller"
          // same-counterparty gating.
          const ctx = sid ? contexts.get(sid) : undefined
          cert.buyer_id = ctx?.buyerId ?? null
          cert.seller_id = ctx?.sellerId ?? null
        }
      }
    } catch (e) {
      console.error('[certificates] send-status enrichment failed (non-fatal):', e)
    }

    return NextResponse.json({
      certificates: filtered,
      clients: Array.from(clientsMap.values()),
      qualities: Array.from(qualitiesMap.values()),
      total: filtered.length
    })
  } catch (error) {
    console.error('Error in GET /api/certificates:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
