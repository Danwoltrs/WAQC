// DELETE /api/portal/qualities/[id]/versions/[versionId]
// A client cancels a scheduled spec change before its date. See lib/portal/spec-change-request.ts.
import { NextRequest } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { cancelSpecChange } from '@/lib/portal/spec-change-request'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const gate = await requireQcPortal(request, { view: 'qc_specs', capability: 'qc_spec_edit' })
  if (!gate.ok) return gate.response
  const { id, versionId } = await params
  return cancelSpecChange(gate.ctx, id, versionId)
}
