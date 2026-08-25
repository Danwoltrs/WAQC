import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildCertificatePdfResponse } from '@/lib/certificate-pdf'

// Use service role to bypass RLS for public access
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/certificate/[slug]/pdf
 * Public endpoint - serves the certificate PDF directly.
 * No authentication required.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const skipCache = request.nextUrl.searchParams.get('nocache') === '1'
  const buyerSlug = request.nextUrl.searchParams.get('buyer')
  return buildCertificatePdfResponse(supabase, slug, { skipCache, buyerSlug })
}
