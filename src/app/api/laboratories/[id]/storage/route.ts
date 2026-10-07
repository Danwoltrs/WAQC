import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { canEditLabStorage, canViewLabStorage, loadStorageProfile } from '@/lib/storage/storage-access'
import { loadStorageLayout } from '@/lib/storage/layout'
import { parseFloorPlan, parseShelfInputs } from '@/lib/storage/floor-plan'
import { saveErrorResponse } from '@/lib/storage/save-errors'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/laboratories/[id]/storage: blueprint, shelves, cubbies with occupancy, zone companies. */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const profile = await loadStorageProfile(supabase, user.id)
  if (!canViewLabStorage(profile, id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  try {
    const layout = await loadStorageLayout(supabase, id)
    if (!layout) return NextResponse.json({ error: 'Laboratory not found' }, { status: 404 })
    return NextResponse.json({ ...layout, can_edit: canEditLabStorage(profile, id) })
  } catch (error) {
    console.error('[storage GET]', error)
    return NextResponse.json({ error: 'Failed to load storage' }, { status: 500 })
  }
}

/** PUT /api/laboratories/[id]/storage: the whole plan, applied in one transaction. */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const profile = await loadStorageProfile(supabase, user.id)
  if (!canEditLabStorage(profile, id)) {
    return NextResponse.json({ error: "You cannot edit this laboratory's storage" }, { status: 403 })
  }

  let body: { floor_plan?: unknown; shelves?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const plan = parseFloorPlan(body?.floor_plan)
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 })
  const shelves = parseShelfInputs(body?.shelves)
  if (!shelves.ok) return NextResponse.json({ error: shelves.error }, { status: 400 })

  const { error } = await (supabase as any).rpc('save_lab_floor_plan', {
    p_lab: id,
    p_plan: plan.value,
    p_shelves: shelves.value,
  })
  if (error) return saveErrorResponse(error)

  try {
    const layout = await loadStorageLayout(supabase, id)
    return NextResponse.json({ ...layout, can_edit: true })
  } catch (loadError) {
    console.error('[storage PUT reload]', loadError)
    return NextResponse.json({ error: 'Saved, but the plan could not be reloaded' }, { status: 500 })
  }
}
