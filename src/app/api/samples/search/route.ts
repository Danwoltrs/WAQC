// GET /api/samples/search?q=<text>&limit=20
// Lightweight server-side sample lookup for the Ctrl+K command palette.
// Matches a tracking number or a Wolthers contract number on the sample itself.
// A physical sample covering several contracts is several `samples` rows (one
// lab unit plus its contract siblings), each carrying its own contract number,
// so e.g. "42068" finds the sibling row that owns that contract directly — no
// second table to fold in. Certificate numbers are matched by the palette's
// certificates search; they are projected here only so a sibling row (internal
// number SAN-…) can be told apart from its lab unit in the list.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { sanitizeOrTerm, buildOrIlike } from '@/lib/search/or-filter'

const SEARCH_FIELDS = ['tracking_number', 'wolthers_contract_nr']

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
    const q = (searchParams.get('q') || '').trim()
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10)
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), 50)

    const safeQ = sanitizeOrTerm(q)
    if (safeQ.length < 2) {
      return NextResponse.json({ samples: [] })
    }

    // The FK hint is explicit: certificates has one path to samples, but a bare
    // embed name is what breaks first when another one is added.
    const { data: samples, error } = await (supabase as any)
      .from('samples')
      .select(
        'id, tracking_number, wolthers_contract_nr, buyer_contract_nr, contract_ordinal, lab_source_sample_id, origin, status, ' +
          'certificates:certificates!certificates_sample_id_fkey(certificate_number, status, created_at)',
      )
      .or(buildOrIlike(SEARCH_FIELDS, safeQ))
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (error) {
      console.error('[samples/search] query error:', error)
      return NextResponse.json({ error: 'Failed to search samples' }, { status: 500 })
    }

    const hits = ((samples ?? []) as Array<Record<string, unknown> & { certificates?: EmbeddedCertificate[] | null }>).map(
      ({ certificates, ...sample }) => ({
        ...sample,
        certificate_number: currentCertificateNumber(certificates),
      }),
    )

    return NextResponse.json({ samples: hits })
  } catch (err: any) {
    console.error('[samples/search] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
