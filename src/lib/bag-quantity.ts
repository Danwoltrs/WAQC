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
