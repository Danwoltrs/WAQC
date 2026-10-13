import { NextResponse } from 'next/server'

/** Turn a save_lab_floor_plan() error into what the editor shows. */
export function saveErrorResponse(error: { code?: string; message?: string; details?: string | null }): NextResponse {
  if (error.code === '42501') {
    return NextResponse.json({ error: "You cannot edit this laboratory's storage" }, { status: 403 })
  }
  if (error.message === 'storage_conflict') {
    let conflicts: string[] = []
    try {
      const parsed = JSON.parse(error.details ?? '[]')
      if (Array.isArray(parsed)) conflicts = parsed.map(String)
    } catch {
      conflicts = []
    }
    return NextResponse.json({ error: 'Some changes would remove space that still holds samples', conflicts }, { status: 409 })
  }
  if (error.message === 'unknown_shelf') {
    return NextResponse.json({ error: 'The plan was changed elsewhere. Reload and try again.', conflicts: [] }, { status: 409 })
  }
  if (error.code === '22023') {
    return NextResponse.json({ error: 'The floor plan is not valid' }, { status: 400 })
  }
  console.error('[storage save]', error)
  return NextResponse.json({ error: 'Failed to save the floor plan' }, { status: 500 })
}

/** Turn a save_storage_zones() error into what the editor shows. */
export function zoneErrorResponse(error: { code?: string; message?: string }): NextResponse {
  if (error.code === '42501') {
    return NextResponse.json({ error: "You cannot change this laboratory's zones" }, { status: 403 })
  }
  if (error.message === 'unknown_cubby') {
    return NextResponse.json({ error: 'A cubby in these changes no longer exists. Reload and try again.' }, { status: 400 })
  }
  if (error.message === 'unknown_company') {
    return NextResponse.json({ error: 'A client in these changes no longer exists' }, { status: 400 })
  }
  if (error.code === '22023' || error.code === '22P02') {
    return NextResponse.json({ error: 'The zone changes are not valid' }, { status: 400 })
  }
  console.error('[storage zones]', error)
  return NextResponse.json({ error: 'Failed to save the zones' }, { status: 500 })
}
