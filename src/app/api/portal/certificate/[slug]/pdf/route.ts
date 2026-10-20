import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { requirePortalCompany } from '@/lib/portal/portal-auth'
import { slugToTrackingNumber } from '@/lib/utils'
import { buildCertificatePdfResponse } from '@/lib/certificate-pdf'

const supabaseService = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/portal/certificate/[slug]/pdf
 * Portal-scoped endpoint — serves the certificate PDF only to the owning company.
 * Requires portal authentication and company membership.
 *
 * The slug is the sample id (what portal links carry). A legacy lab-number
 * slug from a bookmark made before that switch still resolves; it is never
 * put into a new link.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const supabase = await createClient()
  const gate = await requirePortalCompany(supabase)
  if ('error' in gate) return gate.error
  const { company, userId } = gate

  const { slug } = await params

  // Verify the sample belongs to THIS company before serving the document.
  const lookup = (supabaseService as any)
    .from('samples')
    .select('id, client_id, end_client_id, deleted_at')
  const { data: sample } = await (UUID_RE.test(slug)
    ? lookup.eq('id', slug)
    : lookup.eq('tracking_number', slugToTrackingNumber(slug)))
    .is('deleted_at', null)
    .maybeSingle()
  if (!sample || (sample.client_id !== company.clientId && sample.end_client_id !== company.clientId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const skipCache = request.nextUrl.searchParams.get('nocache') === '1'
  return buildCertificatePdfResponse(supabaseService, slug, { skipCache, sampleId: sample.id, audit: { channel: 'portal', actorUserId: userId } })
}
