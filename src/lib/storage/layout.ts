/**
 * Everything the storage screen draws for one lab: the blueprint, shelves with
 * their cubbies and live occupancy, and the companies that own zones.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { EMPTY_FLOOR_PLAN, parseFloorPlan, type FloorPlan, type ShelfInput } from './floor-plan'

export interface Cubby {
  id: string
  row: number
  column: number
  code: string
  capacity: number
  occupied: number
  company_id: string | null
}

export interface StorageShelf extends ShelfInput {
  id: string
  company_id: string | null
  cubbies: Cubby[]
}

export interface StorageCompany { id: string; name: string }

export interface StorageLayout {
  laboratory: { id: string; name: string; floor_plan: FloorPlan; storage_capacity: number }
  shelves: StorageShelf[]
  companies: StorageCompany[]
  can_edit: boolean
  can_assign: boolean
}

export type LayoutWithoutAccess = Omit<StorageLayout, 'can_edit' | 'can_assign'>

/** A lab_shelves row; lock and group may be missing on rows read before 2026-10-13. */
type ShelfRow = Omit<StorageShelf, 'cubbies' | 'locked' | 'group_id'> & { locked?: boolean | null; group_id?: string | null }
interface PositionRow {
  id: string
  shelf_id: string
  row_number: number
  column_number: number
  position_code: string
  capacity_per_position: number
  company_id: string | null
}

export interface LayoutRows {
  lab: { id: string; name: string; floor_plan: unknown }
  shelves: ShelfRow[]
  positions: PositionRow[]
  occupancy: Array<{ position_id: string; occupied: number }>
  companies: Array<{ id: string; name: string | null; fantasy_name: string | null }>
}

export function assembleLayout(rows: LayoutRows): LayoutWithoutAccess {
  const plan = parseFloorPlan(rows.lab.floor_plan)
  if (!plan.ok) console.error('[storage] stored floor plan is invalid, showing an empty room:', plan.error)

  const occupied = new Map(rows.occupancy.map((o) => [o.position_id, o.occupied]))
  const byShelf = new Map<string, Cubby[]>()
  for (const p of rows.positions) {
    const list = byShelf.get(p.shelf_id) ?? []
    list.push({
      id: p.id, row: p.row_number, column: p.column_number, code: p.position_code,
      capacity: p.capacity_per_position, occupied: occupied.get(p.id) ?? 0, company_id: p.company_id,
    })
    byShelf.set(p.shelf_id, list)
  }

  const floorPlan = plan.ok ? plan.value : EMPTY_FLOOR_PLAN
  const groupIds = new Set(floorPlan.groups.map((g) => g.id))
  const shelves: StorageShelf[] = rows.shelves.map((s) => ({
    ...s,
    locked: s.locked === true,
    group_id: s.group_id && groupIds.has(s.group_id) ? s.group_id : null,
    cubbies: (byShelf.get(s.id) ?? []).sort((a, b) => a.row - b.row || a.column - b.column),
  }))

  const companies = rows.companies
    .map((c) => ({ id: c.id, name: companyDisplayName(c) || 'Unnamed company' }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const storage_capacity = shelves.reduce((sum, s) => sum + s.cubbies.reduce((n, c) => n + c.capacity, 0), 0)

  return {
    laboratory: { id: rows.lab.id, name: rows.lab.name, floor_plan: floorPlan, storage_capacity },
    shelves,
    companies,
  }
}

const SHELF_COLUMNS =
  'id, shelf_letter, rows, columns, samples_per_position, x_cm, y_cm, width_cm, depth_cm, rot, access_side, company_id, locked, group_id'
const POSITION_COLUMNS = 'id, shelf_id, row_number, column_number, position_code, capacity_per_position, company_id'

export async function loadStorageLayout(supabase: SupabaseClient, labId: string): Promise<LayoutWithoutAccess | null> {
  const db = supabase as any
  const { data: lab, error: labError } = await db
    .from('laboratories').select('id, name, floor_plan').eq('id', labId).maybeSingle()
  if (labError) throw new Error(`laboratory: ${labError.message}`)
  if (!lab) return null

  const [shelvesRes, positionsRes, occupancyRes] = await Promise.all([
    db.from('lab_shelves').select(SHELF_COLUMNS).eq('laboratory_id', labId).order('shelf_letter'),
    db.from('storage_positions').select(POSITION_COLUMNS).eq('laboratory_id', labId),
    db.rpc('storage_lab_occupancy', { p_lab: labId }),
  ])
  if (shelvesRes.error) throw new Error(`lab_shelves: ${shelvesRes.error.message}`)
  if (positionsRes.error) throw new Error(`storage_positions: ${positionsRes.error.message}`)
  if (occupancyRes.error) throw new Error(`storage_lab_occupancy: ${occupancyRes.error.message}`)

  const shelves = (shelvesRes.data ?? []) as ShelfRow[]
  const positions = (positionsRes.data ?? []) as PositionRow[]
  const companyIds = [...new Set([...shelves, ...positions].map((r) => r.company_id).filter((id): id is string => !!id))]
  let companies: LayoutRows['companies'] = []
  if (companyIds.length > 0) {
    const { data, error } = await db.from('companies').select('id, name, fantasy_name').in('id', companyIds)
    if (error) throw new Error(`companies: ${error.message}`)
    companies = data ?? []
  }

  return assembleLayout({ lab, shelves, positions, occupancy: occupancyRes.data ?? [], companies })
}
