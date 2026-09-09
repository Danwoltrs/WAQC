import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { canUserManageSample } from '@/lib/auth/sample-access'
import { listOpenSyncIssues } from '@/lib/approval-notification/sys-sync-issues'

/** Open QC→sys mirror issues for one sample (drives the "Sys sync" pill). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const server = await createServerClient()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await canUserManageSample(server as any, user.id, id)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const issues = await listOpenSyncIssues(server as any, { sampleId: id })
  return NextResponse.json({ issues })
}
