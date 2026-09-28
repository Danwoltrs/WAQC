/**
 * The intake's quantity rules, kept apart from any layout so the wizard's
 * quantity section, its contract rows and the samples page's add-contract
 * dialog read, validate and submit one quantity the same way.
 *
 * Bags: a count and a per-bag weight; the MT and the 60 kg equivalent derive.
 *
 * Bulk: one sample is one container, entered as 60 kg bag EQUIVALENTS (340
 * means 340 × 60 kg = 20.4 MT) and never more than a container holds, 21.6 MT
 * (360 equivalents). Stored under the invariant every report relies on
 * (bag_count = equivalent_60kg_bags, bag_weight_kg = 21600, one container), so
 * the server's containers + MT normalisation reproduces the same row.
 */
import { BULK_CONTAINER_KG, computeBagQuantities, formatQuantityLine } from '@/lib/bag-quantity'
import type { SubContractFormData } from './types'

/** What one bulk container holds: no bulk sample may exceed it. */
export const BULK_MAX_MT = 21.6
/** The same limit in 60 kg bag equivalents (21.6 MT / 60 kg). */
export const BULK_MAX_EQUIVALENT_BAGS = Math.round((BULK_MAX_MT * 1000) / 60)

/** The form strings a quantity is entered as — the mother form and a contract share them. */
export type QuantityFields = Pick<
  SubContractFormData,
  'bag_type' | 'bag_count' | 'bag_weight_kg' | 'bags_quantity_mt' | 'container_count'
>

export interface ContractQuantities {
  bag_type: string | null
  bag_count: number | null
  bag_weight_kg: number | null
  bags_quantity_mt: number | null
  equivalent_60kg_bags: number | null
  container_count: number | null
}

const positiveInt = (s: string): number | null => {
  const n = parseInt(s)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * The numbers a quantity's form strings resolve to. One function feeds the
 * readouts, the step validation and the POST body, so they cannot disagree.
 * Only typed values count: bulk reads its equivalents from `bag_count`, bags
 * read count × weight; the MT and equivalent columns are always derived here.
 */
export function contractQuantities(c: QuantityFields): ContractQuantities {
  if (c.bag_type === 'bulk') {
    const equivalents = positiveInt(c.bag_count)
    const q = computeBagQuantities(equivalents, BULK_CONTAINER_KG, 'bulk')
    return {
      bag_type: 'bulk',
      bag_count: equivalents,
      bag_weight_kg: BULK_CONTAINER_KG,
      bags_quantity_mt: q.bags_quantity_mt,
      equivalent_60kg_bags: q.equivalent_60kg_bags,
      container_count: equivalents ? 1 : null,
    }
  }
  const count = positiveInt(c.bag_count)
  const weight = parseFloat(c.bag_weight_kg) > 0 ? parseFloat(c.bag_weight_kg) : null
  const q = computeBagQuantities(count, weight, c.bag_type)
  return {
    bag_type: c.bag_type || null,
    bag_count: count,
    bag_weight_kg: weight,
    bags_quantity_mt: q.bags_quantity_mt,
    equivalent_60kg_bags: q.equivalent_60kg_bags,
    container_count: null,
  }
}

/** "320 × 60 kg jute bags (19.2 MT)" / "1 container in bulk (20.4 MT)" for a form quantity. */
export function formatFormQuantity(c: QuantityFields): string | null {
  return formatQuantityLine(contractQuantities(c))
}

/** The bulk cap as the user reads it. */
export const BULK_OVER_CAP_MESSAGE =
  `Bulk is at most ${BULK_MAX_EQUIVALENT_BAGS} × 60 kg bag equivalents (${BULK_MAX_MT} MT) per sample`

/**
 * What still stops this quantity from being saved, as short phrases for a
 * checklist. Empty when the quantity is complete and within the bulk cap.
 */
export function quantityIssues(c: QuantityFields): string[] {
  if (!c.bag_type) return ['Bag type']
  const q = contractQuantities(c)
  if (c.bag_type === 'bulk') {
    if (!q.bag_count) return ['Quantity (60 kg bag equivalents)']
    return q.bag_count > BULK_MAX_EQUIVALENT_BAGS ? [BULK_OVER_CAP_MESSAGE] : []
  }
  const issues: string[] = []
  if (!q.bag_count) issues.push('Quantity of bags')
  if (!q.bag_weight_kg) issues.push('Bag weight')
  return issues
}

/**
 * A bag-type change: the new type's standard weight (jute and PP by origin,
 * big bags 1 000 kg, bulk the 21 600 kg container) and, when the change
 * crosses between bags and bulk, a blank quantity — 300 bags and 300 bulk
 * equivalents are different amounts of coffee.
 */
export function bagTypeChange(
  current: Pick<QuantityFields, 'bag_type' | 'bag_count'>,
  nextType: QuantityFields['bag_type'],
  origin?: string | null,
): Partial<QuantityFields> {
  const crossesBulk = (current.bag_type === 'bulk') !== (nextType === 'bulk')
  return {
    bag_type: nextType,
    bag_weight_kg: standardBagWeight(nextType, origin),
    ...(crossesBulk ? { bag_count: '', bags_quantity_mt: '', container_count: '' } : {}),
  }
}

/** The weight a bag type starts with, as the form string ('' when the type has none). */
export function standardBagWeight(bagType: QuantityFields['bag_type'], origin?: string | null): string {
  if (bagType === 'bulk') return String(BULK_CONTAINER_KG)
  if (bagType === 'big_bag') return '1000'
  if (bagType === 'jute_bag' || bagType === 'pp_bag') {
    return (origin || '').toLowerCase() === 'brazil' ? '60' : '70'
  }
  return ''
}
