import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { aggregateQuadrant, loadSampleOwnership } from '@/lib/embed/quadrant-aggregate'
import { canUserManageSample } from '@/lib/auth/sample-access'

export const dynamic = 'force-dynamic'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * GET /api/embed/quadrant/[id]
 *
 * Returns the three-slice quadrant payload for the read-only cert-editor embed.
 *
 * Authorization is delegated to `canUserManageSample` (src/lib/auth/sample-access.ts),
 * which is the project's single source of truth for sample access and encodes all
 * four grant conditions derived from the existing samples RLS:
 *   1. profiles.is_global_admin = true
 *   2. profiles.qc_role IN STAFF_SAMPLE_MANAGER_ROLES  (staff / lab personnel)
 *   3. profiles.client_id matches samples.client_id or end_client_id  (client owner)
 *   4. profiles.laboratory_id matches samples.laboratory_id  (lab-linked viewer)
 * Reusing the helper keeps this route from drifting out of sync with the access model.
 *
 * Returns 401 when no valid Bearer token is supplied.
 * Returns 404 when the sample is missing/soft-deleted or the caller is not authorized
 *   (existence is not revealed to unauthorized callers).
 * Returns 200 { sample, qualityAssessment, cupping } on success.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const svc = service()
  const { data: userData, error: userErr } = await svc.auth.getUser(token)
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const userId = userData.user.id

  const { id: sampleId } = await params

  // Soft-delete-aware existence check: loadSampleOwnership returns null for a
  // missing OR soft-deleted sample (canUserManageSample's own lookup does not
  // check deleted_at), so this guards both cases before any authorization work.
  const ownership = await loadSampleOwnership(svc as any, sampleId)
  if (!ownership) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Single source of truth for sample access (staff roles + client + lab binding).
  const access = await canUserManageSample(svc, userId, sampleId)
  if (!access.allowed) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const payload = await aggregateQuadrant(svc as any, sampleId)
  if (!payload) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json(payload)
}
