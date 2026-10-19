import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import {
  resolveSampleContractsBatch,
  computeSendStatus,
  getInitials,
} from '@/lib/approval-notification/batch-send'
import {
  resolveCertificateParties,
  type SampleCounterparties,
} from '@/lib/approval-notification/certificate-parties'
import { fetchPriorSends } from '@/lib/approval-notification/prior-sends'
import { sanitizeOrTerm } from '@/lib/search/or-filter'
import { resolveCertificateSearch, type CertificateSearch } from '@/lib/search/cert-search-multi'
import {
  CERTIFICATE_COUNT_SELECT,
  applyCertificateListFilters,
  applyCertificateListQuery,
  parseCertificateListParams,
} from '@/lib/certificate-list-query'
import { fetchIssuedValues } from '@/lib/tolerance/fetch'
import type { IssuedValues } from '@/lib/tolerance/issued-values'
import { isStaffSampleManager } from '@/lib/auth/sample-access'

const adminClient = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

const NO_SEARCH: CertificateSearch = { or: null, truncated: false, failed: false, unmatchedTerms: [], termsCapped: false }

/**
 * GET /api/certificates
 * One page of certificates with related sample and client data. Filters, sort
 * and paging run in the query (certificate-list-query.ts), so `total` is the
 * exact size of the filtered set. `ids=` reads just those certificates (the
 * print list); `search=` takes one term or a pasted list of numbers.
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
    const p = parseCertificateListParams(searchParams)
    // The certificate editor reads one sample's certificate (use-sample-actions.ts).
    const sampleId = searchParams.get('sample_id')

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
          deleted_at,
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
          roaster_contract_nr,
          qc_client_contract_nr,
          end_client_contract_nr,
          importer_is_qc_client,
          quality_name,
          contract_id,
          exporter_id,
          importer_id,
          roaster_id,
          end_client_id,
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
      `, { count: 'exact' })

    if (sampleId) {
      query = query.eq('sample_id', sampleId)
    }

    // Server-side search — resolve matches BEFORE paginating so a certificate outside
    // the first page window is still found. Reference numbers and free text match
    // per certificate (its own sample); a company name in any counterparty role or a
    // quality name matches broadly (every certificate carrying it). A pasted list
    // searches every number at once. See resolveCertificateSearch for the rules.
    // An ids read is the list itself, not a search.
    const search = p.ids.length > 0 ? NO_SEARCH : await resolveCertificateSearch(supabase, p.search)
    // Never silently drop: a term too broad to resolve in full returns its
    // newest matches, and a lookup that failed twice returns what the
    // others found; the response flags which (the page says so).
    if (search.truncated) {
      console.warn(`[certificates] search "${sanitizeOrTerm(p.search)}" too broad for the caps; newest matches returned.`)
    }
    if (search.failed) {
      console.warn(`[certificates] search "${sanitizeOrTerm(p.search)}" resolved incompletely: a lookup failed.`)
    }

    // Deleted samples (dropped in ids mode too), client / quality / status /
    // Santos-day filters, search, sort, window.
    query = applyCertificateListQuery(query, p, search.or)

    const { data: certificates, error, count } = await query

    const searchFlags = {
      search_truncated: search.truncated,
      search_incomplete: search.failed,
      unmatched_terms: search.unmatchedTerms,
      terms_capped: search.termsCapped,
    }

    // A stale offset past the end of the set: with count=exact PostgREST answers
    // 416 / PGRST103. Return no rows and the real total (same filters, no window)
    // so the page can step back to its last page.
    if (error?.code === 'PGRST103') {
      let countQuery = supabase.from('certificates').select(CERTIFICATE_COUNT_SELECT, { count: 'exact', head: true })
      if (sampleId) countQuery = countQuery.eq('sample_id', sampleId)
      const { count: fullCount, error: countError } = await applyCertificateListFilters(countQuery, p, search.or)
      if (countError) {
        console.error('Error counting certificates:', countError)
        return NextResponse.json({ error: 'Failed to fetch certificates' }, { status: 500 })
      }
      return NextResponse.json({ certificates: [], total: fullCount ?? 0, has_more: false, ...searchFlags })
    }

    if (error) {
      console.error('Error fetching certificates:', error)
      return NextResponse.json({ error: 'Failed to fetch certificates' }, { status: 500 })
    }

    // A soft-deleted sample keeps its certificate row (the audit needs it), but the
    // query above already drops it with the sample (in ids mode too), so every
    // returned row is shown.
    const rows = certificates ?? []

    // Enrich each certificate with per-side send status (who/when) for the Sent
    // column. Computed with the service role so contract/email reads aren't
    // blocked by RLS; the certificate list itself stays user-scoped above.
    try {
      type SampleKeys = SampleCounterparties & { id: string; contract_id: string | null }
      const sampleKeys: SampleKeys[] = []
      for (const cert of rows) {
        const s = cert.sample as unknown as Partial<SampleKeys> | null
        if (!s?.id) continue
        sampleKeys.push({
          id: s.id,
          contract_id: s.contract_id ?? null,
          wolthers_contract_nr: s.wolthers_contract_nr ?? null,
          client_id: s.client_id ?? null,
          importer_id: s.importer_id ?? null,
          seller_id: s.seller_id ?? null,
          exporter_id: s.exporter_id ?? null,
          buyer_contract_nr: s.buyer_contract_nr ?? null,
          seller_contract_nr: s.seller_contract_nr ?? null,
        })
      }

      if (sampleKeys.length > 0) {
        const admin = adminClient()
        const contexts = await resolveSampleContractsBatch(admin, sampleKeys)
        // The sys contract names the parties when the sample links one; the
        // sample's own QC client and seller answer when it doesn't, so a Dunkin
        // or unlinked SS certificate can still be sent (certificate-parties.ts).
        const partiesBySample = new Map(
          sampleKeys.map((s) => [s.id, resolveCertificateParties(s, contexts.get(s.id) ?? null)]),
        )
        const required = new Map<string, { buyer: boolean; seller: boolean }>()
        for (const [sid, parties] of partiesBySample) {
          required.set(sid, { buyer: !!parties.buyerId, seller: !!parties.sellerId })
        }
        const statusRows = await fetchPriorSends(admin, sampleKeys.map((s) => s.id))
        const sendStatus = computeSendStatus(statusRows, required)
        const toChip = (side: { by: string | null; at: string | null } | null) =>
          side ? { initials: getInitials(side.by), name: side.by, at: side.at } : null
        for (const cert of rows as any[]) {
          const sid = (cert.sample as { id?: string } | null)?.id
          const st = sid ? sendStatus.get(sid) : undefined
          cert.send_status = st
            ? { buyerSent: toChip(st.buyerSent), sellerSent: toChip(st.sellerSent), full: st.full }
            : { buyerSent: null, sellerSent: null, full: false }
          // Buyer/seller company ids drive the page's "Send to buyer / seller"
          // same-counterparty gating.
          const parties = sid ? partiesBySample.get(sid) : undefined
          cert.buyer_id = parties?.buyerId ?? null
          cert.seller_id = parties?.sellerId ?? null
        }
      }
    } catch (e) {
      console.error('[certificates] send-status enrichment failed (non-fatal):', e)
    }

    // Approved-with-comments badge data, for STAFF ONLY: internal surfaces keep
    // evaluating actual values everywhere else, but the certificates list shows
    // what the buyer's certificate carries as a secondary line (see
    // ApprovedWithCommentsBadge).
    //
    // "Staff only" has to be enforced, not just intended. This endpoint
    // authenticates but checks no role, while the block below reads with the
    // SERVICE ROLE — which bypasses RLS — so without the isStaffSampleManager
    // gate a /portal (buyer) user calling GET /api/certificates directly would
    // learn their own lot had been approved out of spec, and see the issued
    // values labelled as such. That is the one fact this whole feature exists
    // to keep from them. Same predicate the two tolerance write routes use.
    //
    // fetchIssuedValues, not fetchToleranceApproval: the full-row reader also
    // pulls the seller's `comments` and the raw out-of-spec `metrics`, which
    // this route immediately discards. Reading them at all re-introduces the
    // very discipline the reader split exists to remove — the buyer-safe
    // subset should be a property of the query.
    //
    // Guarded like the send-status block above: `approved_with_comments` comes
    // from a migration that has not been applied yet, so a missing-column error
    // must leave the response unchanged rather than break the whole
    // certificates list. A separate query, not folded into the
    // sample:samples(...) embed above, for the same reason — a bad column there
    // would fail the entire certificates fetch, not just this one field.
    //
    // Collected into a side map (sample id -> badge fields) rather than
    // mutated onto the query result rows, so no `any` cast is needed to widen
    // their inferred (query-shaped) type.
    const toleranceBadgeBySample = new Map<
      string,
      { approved_with_comments: true; toleranceIssued: IssuedValues | null }
    >()
    try {
      const sampleRows = rows
        .map((cert) => cert.sample as { id?: string; lab_source_sample_id?: string | null } | null)
        .filter((s): s is { id: string; lab_source_sample_id: string | null } => !!s?.id)
      if (sampleRows.length > 0 && (await isStaffSampleManager(supabase, user.id))) {
        const admin = adminClient()
        const sampleIds = sampleRows.map((s) => s.id)
        const { data: flagRows, error: flagErr } = await admin
          .from('samples')
          .select('id, approved_with_comments')
          .in('id', sampleIds)
        if (!flagErr) {
          const flagged = ((flagRows ?? []) as Array<{ id: string; approved_with_comments: boolean | null }>)
            .filter((r) => r.approved_with_comments)
            .map((r) => r.id)
          const labIdOf = new Map(sampleRows.map((s) => [s.id, s.lab_source_sample_id ?? s.id]))
          for (const sid of flagged) {
            const issued = await fetchIssuedValues(admin, sid, labIdOf.get(sid))
            toleranceBadgeBySample.set(sid, {
              approved_with_comments: true,
              toleranceIssued: issued,
            })
          }
        }
      }
    } catch (e) {
      console.error('[certificates] approved-with-comments enrichment failed (non-fatal):', e)
    }

    const certificatesOut = rows.map((cert) => {
      const sid = (cert.sample as { id?: string } | null)?.id
      const badge = sid ? toleranceBadgeBySample.get(sid) : undefined
      return badge ? { ...cert, ...badge } : cert
    })

    // An ids read has no window: its total is what came back. Otherwise the exact
    // count of the filtered set (null only if PostgREST sent none: no more pages).
    const total = p.ids.length > 0 ? rows.length : (count ?? p.offset + rows.length)

    return NextResponse.json({
      certificates: certificatesOut,
      total,
      has_more: p.offset + rows.length < total,
      ...searchFlags,
    })
  } catch (error) {
    console.error('Error in GET /api/certificates:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
