/**
 * Bag quantity calculations shared by the sub-contract intake dialog and the
 * sub-contract edit form, so both produce identical MT / 60kg-equivalent values.
 * Mirrors the auto-calc in add-sub-contract-dialog.tsx.
 */

export type BagType = 'jute_bag' | 'pp_bag' | 'big_bag' | 'bulk' | '' | string

/** Default bag weight (kg) for a bag type. jute/pp depend on origin (Brazil = 60kg, else 70kg). */
export function bagWeightForType(bagType: BagType, origin?: string | null): number | null {
  if (bagType === 'big_bag') return 1000
  if (bagType === 'bulk') return 21600
  if (bagType === 'jute_bag' || bagType === 'pp_bag') {
    return (origin || '').toLowerCase() === 'brazil' ? 60 : 70
  }
  return null
}

export interface BagQuantities {
  bags_quantity_mt: number | null
  equivalent_60kg_bags: number | null
}

/** Approx weight of one bulk container, used only to estimate container count. */
export const BULK_CONTAINER_MT = 21.6

/**
 * Bulk is weight-driven: the net MT is the source of truth (container density
 * varies — grinder coffee is lighter), and the 60kg-bag equivalent derives from
 * it. Returns nulls when MT is missing/zero.
 */
export function bulkQuantitiesFromMt(mt: number | null | undefined): BagQuantities {
  const m = Number(mt) || 0
  if (m <= 0) return { bags_quantity_mt: null, equivalent_60kg_bags: null }
  return {
    bags_quantity_mt: Number(m.toFixed(3)),
    equivalent_60kg_bags: Math.round((m * 1000) / 60),
  }
}

/** Approximate number of bulk containers for a net weight (≈ MT / 21.6). */
export function approxBulkContainers(mt: number | null | undefined): number {
  const m = Number(mt) || 0
  return m > 0 ? Math.round(m / BULK_CONTAINER_MT) : 0
}

/**
 * Compute total MT and 60kg-bag equivalent from bag count, weight, and type.
 * Returns nulls when inputs are insufficient (matches the dialog's blank-out behavior).
 */
export function computeBagQuantities(
  bagCount: number | null | undefined,
  bagWeightKg: number | null | undefined,
  bagType: BagType,
): BagQuantities {
  const count = Number(bagCount) || 0
  const weight = Number(bagWeightKg) || 0
  const isBulk = bagType === 'bulk'

  if (count <= 0 || (!isBulk && weight <= 0)) {
    return { bags_quantity_mt: null, equivalent_60kg_bags: null }
  }

  let totalMT: number
  let equivalent: number
  if (isBulk) {
    totalMT = (count * 60) / 1000
    equivalent = count
  } else {
    totalMT = (count * weight) / 1000
    equivalent = (count * weight) / 60
  }

  return {
    bags_quantity_mt: Number(totalMT.toFixed(3)),
    equivalent_60kg_bags: Math.round(equivalent),
  }
}

export const BAG_TYPE_LABELS: Record<string, string> = {
  jute_bag: 'jute bags', pp_bag: 'PP bags', big_bag: 'big bags', bulk: 'bulk',
}

/** Bulk container's conventional whole net weight in kg (legacy bag_weight_kg for bulk rows). */
export const BULK_CONTAINER_KG = 21600 as const

export interface BulkQuantities {
  container_count: number | null
  bags_quantity_mt: number | null
  equivalent_60kg_bags: number | null
  /** Invariant every report relies on: bag_count IS the 60kg equivalent for bulk. */
  bag_count: number | null
  bag_weight_kg: typeof BULK_CONTAINER_KG
}

/**
 * Bulk is entered as containers + total MT (the MT defaults to containers × 21.6
 * but a lighter coffee is legitimately below it). Everything else derives.
 */
export function bulkQuantitiesFromContainers(
  containers: number | null | undefined,
  mt: number | null | undefined,
): BulkQuantities {
  const c = Number(containers) || 0
  let m = Number(mt) || 0
  if (m <= 0 && c > 0) m = c * BULK_CONTAINER_MT
  const derived = bulkQuantitiesFromMt(m > 0 ? m : null)
  return {
    container_count: c > 0 ? Math.round(c) : null,
    bags_quantity_mt: derived.bags_quantity_mt,
    equivalent_60kg_bags: derived.equivalent_60kg_bags,
    bag_count: derived.equivalent_60kg_bags,
    bag_weight_kg: BULK_CONTAINER_KG,
  }
}

/** Stored container count, else an estimate from the net weight (never below 1). */
export function bulkContainerCount(row: { container_count?: number | null; bags_quantity_mt?: number | null }): number {
  if (row.container_count && row.container_count > 0) return Math.round(row.container_count)
  return Math.max(1, approxBulkContainers(row.bags_quantity_mt))
}

/** "2 containers in bulk (43.2 MT)" — the agreed wording on every surface. */
export function formatBulkQuantity(row: {
  container_count?: number | null
  bags_quantity_mt?: number | null
  bag_count?: number | null
}): string | null {
  let mt = Number(row.bags_quantity_mt) || 0
  if (mt <= 0 && row.bag_count && row.bag_count > 0) mt = (row.bag_count * 60) / 1000
  if (mt <= 0) return null
  const n = bulkContainerCount({ container_count: row.container_count, bags_quantity_mt: mt })
  return `${n} container${n === 1 ? '' : 's'} in bulk (${mt.toFixed(1)} MT)`
}

/** One-line quantity for lists, summaries and labels. */
export function formatQuantityLine(row: {
  bag_type?: string | null
  bag_count?: number | null
  bag_weight_kg?: number | null
  bags_quantity_mt?: number | null
  container_count?: number | null
  equivalent_60kg_bags?: number | null
}): string | null {
  if (row.bag_type === 'bulk') return formatBulkQuantity(row)
  const mt = Number(row.bags_quantity_mt) || 0
  const mtText = mt > 0 ? `${mt.toFixed(1)} MT` : null
  if (row.bag_count && row.bag_count > 0 && row.bag_weight_kg) {
    const label = row.bag_type ? BAG_TYPE_LABELS[row.bag_type] ?? row.bag_type.replace(/_/g, ' ') : 'bags'
    return `${row.bag_count} × ${row.bag_weight_kg} kg ${label}${mtText ? ` (${mtText})` : ''}`
  }
  return mtText
}
