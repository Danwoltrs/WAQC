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

/**
 * GET /api/portal/certificate/[slug]/pdf
 * Portal-scoped endpoint — serves the certificate PDF only to the owning company.
 * Requires portal authentication and company membership.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const supabase = await createClient()
  const gate = await requirePortalCompany(supabase)
  if ('error' in gate) return gate.error
  const { company } = gate

  const { slug } = await params
  const trackingNumber = slugToTrackingNumber(slug)

  // Verify the sample belongs to THIS company before serving the document.
  const { data: sample } = await (supabaseService as any)
    .from('samples')
    .select('client_id, end_client_id, deleted_at')
    .eq('tracking_number', trackingNumber)
    .is('deleted_at', null)
    .maybeSingle()
  if (!sample || (sample.client_id !== company.clientId && sample.end_client_id !== company.clientId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const skipCache = request.nextUrl.searchParams.get('nocache') === '1'
  return buildCertificatePdfResponse(supabaseService, slug, { skipCache })
}
