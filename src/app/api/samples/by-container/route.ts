// GET /api/samples/by-container?container_nr=<text>&exclude=<sample id>&limit=10
//
// Every sample that already carries this container number, newest first.
//
// A container number is an ATTRIBUTE, never an identifier (mig 20260910000000):
// the same container carries a resubmitted sample after a rejection, and comes
// back on a different shipment years later. This endpoint exists so intake can
// SHOW that history — "3 earlier samples used this container, one rejected" —
// without ever refusing the new one. It is a hint, not a validation.
//
// Matching is case-insensitive (ILIKE with no wildcards) on a value the caller
// has trimmed; a container number stored with stray inner whitespace will not
// match, which is the right failure for a hint. Soft-deleted samples are
// filtered out explicitly: the live permissive SELECT policy on samples
// ("Lab personnel can read samples", USING auth.uid() IS NOT NULL) has no
// deleted_at predicate of its own.
//
// Read through the USER-scoped client on purpose. A portal client sees only
// their own company's samples (the RESTRICTIVE policy in mig 20260622000003),
// which is correct — the hint is then partial by design, so it never claims to
// be a complete history.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface EmbeddedCertificate {
  certificate_number: string | null
  status: string | null
  created_at: string | null
}

/** The sample's current certificate number: newest non-revoked, else newest. */
function currentCertificateNumber(certs: EmbeddedCertificate[] | null | undefined): string | null {
  const rows = certs ?? []
  if (rows.length === 0) return null
  const byNewest = [...rows].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
  const live = byNewest.find((c) => c.status !== 'revoked')
  return (live ?? byNewest[0]).certificate_number ?? null
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const raw = (searchParams.get('container_nr') || '').trim()
    const exclude = (searchParams.get('exclude') || '').trim()
    const rawLimit = parseInt(searchParams.get('limit') || '10', 10)
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 10, 1), 25)

    // Container numbers are ISO 6346 (4 letters + 7 digits). Anything shorter is
    // still being typed — answering it would flash a hint on every keystroke.
    if (raw.length < 4) {
      return NextResponse.json({ samples: [], total: 0 })
    }

    // A container number is 4 letters + 7 digits (ISO 6346). Anything outside
    // [A-Za-z0-9] cannot be part of one, so the needle is reduced to exactly
    // that — which also closes every wildcard route into the ILIKE pattern.
    //
    // Stripping just '%' and '_' would NOT be enough: PostgREST rewrites '*'
    // to '%' inside a like/ilike value with no way to escape it, so '****'
    // would reach Postgres as '%%%%', match every row, and hand any signed-in
    // user a page of other clients' tracking numbers and contract numbers off
    // the back of a full table scan.
    const needle = raw.replace(/[^A-Za-z0-9]/g, '')
    if (needle.length < 4) {
      return NextResponse.json({ samples: [], total: 0 })
    }

    let query = (supabase as any)
      .from('samples')
      .select(
        `
        id,
        tracking_number,
        container_nr,
        sample_type,
        status,
        workflow_stage,
        created_at,
        exporter_sample_number,
        wolthers_contract_nr,
        client:companies!samples_client_id_fkey(id, fantasy_name, name),
        certificates(certificate_number, status, created_at)
      `,
        { count: 'exact' },
      )
      .ilike('container_nr', needle)
      .is('deleted_at', null)

    // Exclude the sample being edited IN THE QUERY, not afterwards, so `count`
    // is already correct. Filtering it out in JS left it inside `count`
    // whenever it fell outside the returned page — the hint then claimed one
    // more earlier sample than exists, silently counting the very sample the
    // user is looking at.
    //
    // Only when it really is a uuid: `.neq('id', 'nonsense')` is a uuid
    // comparison, and Postgres answers 22P02, turning a hint into a 500.
    if (UUID.test(exclude)) query = query.neq('id', exclude)

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[samples/by-container] query error:', error)
      return NextResponse.json({ error: 'Failed to look up container' }, { status: 500 })
    }

    const rows = data || []

    return NextResponse.json({
      samples: rows.map((s: any) => ({
        id: s.id,
        tracking_number: s.tracking_number,
        container_nr: s.container_nr,
        sample_type: s.sample_type,
        status: s.status,
        workflow_stage: s.workflow_stage,
        created_at: s.created_at,
        exporter_sample_number: s.exporter_sample_number,
        wolthers_contract_nr: s.wolthers_contract_nr,
        client_name: s.client?.fantasy_name || s.client?.name || null,
        certificate_number: currentCertificateNumber(s.certificates),
      })),
      total: count ?? rows.length,
    })
  } catch (err) {
    console.error('[samples/by-container] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
