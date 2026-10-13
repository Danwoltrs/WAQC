import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { canViewLabStorage, loadStorageProfile } from '@/lib/storage/storage-access'
import type { ZoneEvent } from '@/lib/storage/zone-changes'

type Ctx = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** GET /api/laboratories/[id]/storage/zone-history?shelf=&limit=: zone changes, newest first. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const profile = await loadStorageProfile(supabase, user.id)
  if (!canViewLabStorage(profile, id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const shelf = request.nextUrl.searchParams.get('shelf')
  if (shelf !== null && !UUID.test(shelf)) return NextResponse.json({ error: 'shelf must be a shelf id' }, { status: 400 })
  const asked = Number(request.nextUrl.searchParams.get('limit') ?? 20)
  const limit = Number.isInteger(asked) ? Math.min(Math.max(asked, 1), 100) : 20

  const { data, error } = await (supabase as any).rpc('storage_zone_history_events', { p_lab: id, p_shelf: shelf, p_limit: limit })
  if (error) {
    console.error('[storage zone history]', error)
    return NextResponse.json({ error: 'Failed to load the zone history' }, { status: 500 })
  }
  const events: ZoneEvent[] = ((data ?? []) as ZoneEvent[]).map((e) => ({
    changed_at: e.changed_at,
    changed_by_name: e.changed_by_name,
    from_name: e.from_name ?? null,
    to_name: e.to_name ?? null,
    codes: e.codes ?? [],
  }))
  return NextResponse.json({ events })
}
