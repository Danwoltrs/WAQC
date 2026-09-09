import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { resolveSyncIssue } from '@/lib/approval-notification/sys-sync-issues'

/** Mark one open issue resolved. RLS scopes it to active internal users. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const server = await createServerClient()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ok = await resolveSyncIssue(server as any, id, user.id)
  if (!ok) return NextResponse.json({ error: 'Not found or already resolved' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
