import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { canAssignLabZones, canEditLabStorage, loadStorageProfile } from '@/lib/storage/storage-access'
import { loadStorageLayout } from '@/lib/storage/layout'
import { parseZoneChanges } from '@/lib/storage/zone-changes'
import { zoneErrorResponse } from '@/lib/storage/save-errors'

type Ctx = { params: Promise<{ id: string }> }

/** PUT /api/laboratories/[id]/storage/zones: which client each listed cubby is for. Anyone in the lab. */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const profile = await loadStorageProfile(supabase, user.id)
  if (!canAssignLabZones(profile, id)) {
    return NextResponse.json({ error: "You cannot change this laboratory's zones" }, { status: 403 })
  }

  let body: { changes?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const changes = parseZoneChanges(body?.changes)
  if (!changes.ok) return NextResponse.json({ error: changes.error }, { status: 400 })

  const { error } = await (supabase as any).rpc('save_storage_zones', { p_lab: id, p_changes: changes.value })
  if (error) return zoneErrorResponse(error)

  try {
    const layout = await loadStorageLayout(supabase, id)
    return NextResponse.json({ ...layout, can_edit: canEditLabStorage(profile, id), can_assign: true })
  } catch (loadError) {
    console.error('[storage zones reload]', loadError)
    return NextResponse.json({ error: 'Saved, but the plan could not be reloaded' }, { status: 500 })
  }
}
