// POST /api/portal/qualities/[id]/versions
// A client changes a quality's spec now or from a date. See lib/portal/spec-change-request.ts.
import { NextRequest } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { createSpecChange } from '@/lib/portal/spec-change-request'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireQcPortal(request, { view: 'qc_specs', capability: 'qc_spec_edit' })
  if (!gate.ok) return gate.response
  const { id } = await params
  return createSpecChange(gate.ctx, id, request)
}
