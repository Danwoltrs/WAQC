/**
 * The intake's quantity rules, kept apart from any layout so the wizard's
 * quantity section, its contract rows and the samples page's add-contract
 * dialog read, validate and submit one quantity the same way.
 *
 * A quantity is entered as sys.wolthers.com quotes a contract: boxes
 * (containers) × bags per box, in a 20' or 40', with a packaging and, for
 * bags, a bag weight. Bags per box defaults from those (container-quantity);
 * MT per box follows, and either can be typed over.
 *
 * Stored columns, which every report already reads:
 * - jute / PP: bag_count = boxes × bags per box (whole bags), bag_weight_kg.
 * - bulk: bags_quantity_mt = boxes × MT per box, container_count = boxes,
 *   bag_count = the 60 kg equivalent, bag_weight_kg = 21600 (the bulk rule the
 *   server re-derives from containers + MT; the DB keeps the equivalent to 2 dp).
 * - big bags: bag_count = physical big bags (20 per 20'), bag_weight_kg = the
 *   MT per box spread over them, so the MT typed is the MT stored.
 * container_count is the number of boxes for every packaging, container_size
 * the box size, bag_liner GrainPro and the like (or a bulk add-on).
 */
import { BULK_CONTAINER_KG, formatQuantityLine } from '@/lib/bag-quantity'
import {
  bagsPerBoxFromMt,
  bigBagsPerBox,
  boxesFromTotal,
  countsEquivalents,
  defaultBagsPerBox,
  maxMtPerBox,
  mtPerBoxFromBags,
  normalizeContainerSize,
  parsePackaging,
  round2,
  round3,
  unitKg,
  type ContainerSize,
  type PackingKind,
} from '@/lib/container-quantity'
import type { SubContractFormData } from './types'

/** The form strings a quantity is entered as — the mother form and a contract share them. */
export type QuantityFields = Pick<
  SubContractFormData,
  'bag_type' | 'bag_liner' | 'bag_weight_kg' | 'container_count' | 'container_size' | 'bags_per_box' | 'mt_per_box'
>

export interface ContractQuantities {
  bag_type: string | null
  bag_liner: string | null
  bag_count: number | null
  bag_weight_kg: number | null
  bags_quantity_mt: number | null
  equivalent_60kg_bags: number | null
  container_count: number | null
  container_size: ContainerSize | null
}

/** The per-box figures behind a quantity, for the inputs' placeholders and the summary line. */
export interface BoxFigures {
  size: ContainerSize
  boxes: number | null
  /** kg one counted unit weighs (the bag weight, or 60 for an equivalent); null until a weight is chosen. */
  unitKg: number | null
  defaultBagsPerBox: number | null
  bagsPerBox: number | null
  mtPerBox: number | null
  /** Whether bags per box / MT per box were typed over the default. */
  bagsPerBoxTyped: boolean
  mtPerBoxTyped: boolean
}

const positive = (s: string | null | undefined): number | null => {
  const n = parseFloat(String(s ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

const kindOf = (c: QuantityFields): PackingKind | null => (c.bag_type ? c.bag_type : null)

export function boxFigures(c: QuantityFields): BoxFigures {
  const size = normalizeContainerSize(c.container_size)
  const kind = kindOf(c)
  const boxesRaw = positive(c.container_count)
  const boxes = boxesRaw ? Math.round(boxesRaw) : null
  const kg = kind ? unitKg(kind, positive(c.bag_weight_kg)) : null
  const empty = { size, boxes, unitKg: kg, defaultBagsPerBox: null, bagsPerBox: null, mtPerBox: null, bagsPerBoxTyped: false, mtPerBoxTyped: false }
  if (!kind || !kg) return empty
  const def = defaultBagsPerBox(kind, kg, size)
  const typedMt = positive(c.mt_per_box)
  const typedBags = positive(c.bags_per_box)
  if (typedMt) {
    const mt = round3(typedMt)
    return { ...empty, defaultBagsPerBox: def, bagsPerBox: bagsPerBoxFromMt(mt, kind, kg), mtPerBox: mt, mtPerBoxTyped: true }
  }
  const bags = typedBags ? (countsEquivalents(kind) ? round2(typedBags) : Math.round(typedBags)) : def
  return { ...empty, defaultBagsPerBox: def, bagsPerBox: bags, mtPerBox: mtPerBoxFromBags(bags, kg), bagsPerBoxTyped: !!typedBags }
}

/**
 * The columns a quantity's form strings resolve to. One function feeds the
 * readouts, the step validation and the POST body, so they cannot disagree.
 */
export function contractQuantities(c: QuantityFields): ContractQuantities {
  const kind = kindOf(c)
  const f = boxFigures(c)
  const liner = c.bag_liner?.trim() || null
  const blank: ContractQuantities = {
    bag_type: kind, bag_liner: liner, bag_count: null, bag_weight_kg: null, bags_quantity_mt: null,
    equivalent_60kg_bags: null, container_count: f.boxes, container_size: kind ? f.size : null,
  }
  if (!kind || !f.boxes || !f.bagsPerBox || !f.mtPerBox || !f.unitKg) {
    return { ...blank, bag_weight_kg: kind && !countsEquivalents(kind) ? positive(c.bag_weight_kg) : null }
  }
  const mt = round3(f.boxes * f.mtPerBox)
  if (kind === 'bulk') {
    const equivalent = round2((mt * 1000) / 60)
    return { ...blank, bag_count: Math.round(equivalent), bag_weight_kg: BULK_CONTAINER_KG, bags_quantity_mt: mt, equivalent_60kg_bags: equivalent }
  }
  if (kind === 'big_bag') {
    const perBox = bigBagsPerBox(f.size)
    return {
      ...blank,
      bag_count: f.boxes * perBox,
      bag_weight_kg: round2((f.mtPerBox * 1000) / perBox),
      bags_quantity_mt: mt,
      equivalent_60kg_bags: round2((mt * 1000) / 60),
    }
  }
  const count = Math.round(f.boxes * f.bagsPerBox)
  return {
    ...blank,
    bag_count: count,
    bag_weight_kg: f.unitKg,
    bags_quantity_mt: round3((count * f.unitKg) / 1000),
    equivalent_60kg_bags: round2((count * f.unitKg) / 60),
  }
}

/** "320 × 60 kg jute bags, GrainPro (19.2 MT)" / "3 containers in bulk (64.8 MT)" for a form quantity. */
export function formatFormQuantity(c: QuantityFields): string | null {
  return formatQuantityLine(contractQuantities(c))
}

/** The packaging as one word: Jute, GrainPro, PP, Big bags, Bulk. */
export function packagingLabel(c: Pick<QuantityFields, 'bag_type' | 'bag_liner'>): string {
  if (c.bag_type === 'bulk') return 'Bulk'
  if (c.bag_type === 'big_bag') return 'Big bags'
  if (c.bag_type === 'pp_bag') return 'PP'
  if (c.bag_type === 'jute_bag') return c.bag_liner?.trim() || 'Jute'
  return ''
}

const fmt = (n: number, dp = 3) => Number(n.toFixed(dp)).toLocaleString('en-US', { maximumFractionDigits: dp })

/**
 * The sys-style summary under the inputs:
 * "3 × 20' Jute 59 kg · 325 bags/box = 975 bags · 57.525 MT".
 */
export function quantitySummary(c: QuantityFields): string | null {
  const f = boxFigures(c)
  const q = contractQuantities(c)
  if (!c.bag_type || !f.bagsPerBox || !f.mtPerBox) return null
  const equivalents = countsEquivalents(c.bag_type)
  const what = [packagingLabel(c), equivalents ? null : `${fmt(f.unitKg ?? 0)} kg`].filter(Boolean).join(' ')
  const unit = equivalents ? 'bags eq.' : 'bags'
  const perBox = `${fmt(f.bagsPerBox, 2)} ${equivalents ? 'bags eq./box' : 'bags/box'} · ${fmt(f.mtPerBox)} MT/box`
  if (!f.boxes) return `${f.size} ${what} · ${perBox} — enter boxes to see totals`
  const total = equivalents ? (q.equivalent_60kg_bags ?? 0) : (q.bag_count ?? 0)
  return `${f.boxes} × ${f.size} ${what} · ${perBox} = ${fmt(total, 2)} ${unit} · ${fmt(q.bags_quantity_mt ?? 0)} MT`
}

/** The per-box limit as the user reads it. */
export function overBoxMessage(size: ContainerSize): string {
  return `A ${size} container holds at most ${maxMtPerBox(size)} MT`
}

/**
 * What still stops this quantity from being saved, as short phrases for a
 * checklist. Empty when the quantity is complete and each box fits its container.
 */
export function quantityIssues(c: QuantityFields): string[] {
  if (!c.bag_type) return ['Packaging']
  const f = boxFigures(c)
  const issues: string[] = []
  if (!f.boxes) issues.push('Boxes')
  if (!f.unitKg) issues.push('Bag weight')
  if (f.mtPerBox && f.mtPerBox > maxMtPerBox(f.size)) issues.push(overBoxMessage(f.size))
  return issues
}

/** The weight a bag type starts with, as the form string ('' when it counts equivalents). */
export function standardBagWeight(bagType: QuantityFields['bag_type'], origin?: string | null): string {
  if (bagType === 'jute_bag' || bagType === 'pp_bag') {
    return (origin || '').toLowerCase() === 'brazil' ? '60' : '70'
  }
  return ''
}

/**
 * A packaging change. The boxes and container stay (a box is a box); typed
 * bags / MT per box are dropped because the new packaging has its own
 * default, and a bag packaging keeps its weight or takes the standard one.
 */
export function packagingChange(
  current: Pick<QuantityFields, 'bag_type' | 'bag_weight_kg'>,
  next: { bag_type: Exclude<QuantityFields['bag_type'], ''>; bag_liner: string },
  origin?: string | null,
): Partial<QuantityFields> {
  const patch: Partial<QuantityFields> = { bag_type: next.bag_type, bag_liner: next.bag_liner }
  if (next.bag_type !== current.bag_type) {
    patch.bags_per_box = ''
    patch.mt_per_box = ''
  }
  if (countsEquivalents(next.bag_type)) patch.bag_weight_kg = ''
  else if (!positive(current.bag_weight_kg) || countsEquivalents(current.bag_type || null)) {
    patch.bag_weight_kg = standardBagWeight(next.bag_type, origin)
  }
  return patch
}

/** The form fields for no quantity at all. */
export const EMPTY_QUANTITY: QuantityFields = {
  bag_type: '', bag_liner: '', bag_weight_kg: '', container_count: '', container_size: "20'", bags_per_box: '', mt_per_box: '',
}

const str = (n: number | null | undefined) => (n != null && Number.isFinite(n) ? String(n) : '')

/**
 * Form fields for a quantity stored as columns (a PSS, a contract sibling, an
 * older draft): the boxes, and bags or MT per box only where they differ
 * from the packaging's default.
 */
export function quantityFieldsFromStored(row: {
  bag_type?: string | null
  bag_liner?: string | null
  bag_count?: number | string | null
  bag_weight_kg?: number | string | null
  bags_quantity_mt?: number | string | null
  equivalent_60kg_bags?: number | string | null
  container_count?: number | string | null
  container_size?: string | null
}): QuantityFields {
  const kind = (['jute_bag', 'pp_bag', 'big_bag', 'bulk'] as const).find((k) => k === row.bag_type) ?? null
  if (!kind) return { ...EMPTY_QUANTITY }
  const size = normalizeContainerSize(row.container_size)
  const base: QuantityFields = {
    ...EMPTY_QUANTITY,
    bag_type: kind,
    bag_liner: row.bag_liner?.trim() || '',
    container_size: size,
    bag_weight_kg: countsEquivalents(kind) ? '' : str(positive(String(row.bag_weight_kg ?? ''))),
  }
  const storedBoxes = positive(String(row.container_count ?? ''))
  if (countsEquivalents(kind)) {
    const mt = positive(String(row.bags_quantity_mt ?? ''))
      ?? (positive(String(row.equivalent_60kg_bags ?? '')) ?? positive(String(row.bag_count ?? '')) ?? 0) * 0.06
    if (!(mt > 0)) return base
    const def = defaultBagsPerBox(kind, 60, size)
    if (storedBoxes) {
      const perBox = round3(mt / storedBoxes)
      return { ...base, container_count: str(Math.round(storedBoxes)), mt_per_box: perBox === mtPerBoxFromBags(def, 60) ? '' : str(perBox) }
    }
    const split = boxesFromTotal(round2((mt * 1000) / 60), def)
    return {
      ...base,
      container_count: str(split.boxes),
      mt_per_box: split.bagsPerBox === def ? '' : str(round3(mt / split.boxes)),
    }
  }
  const count = positive(String(row.bag_count ?? ''))
  const kg = positive(base.bag_weight_kg)
  if (!count) return base
  const def = kg ? defaultBagsPerBox(kind, kg, size) : 0
  const split = storedBoxes
    ? { boxes: Math.round(storedBoxes), bagsPerBox: round2(count / Math.round(storedBoxes)) }
    : boxesFromTotal(count, def)
  return {
    ...base,
    container_count: str(split.boxes),
    bags_per_box: split.bagsPerBox === def ? '' : str(split.bagsPerBox),
  }
}

/**
 * Form fields for a sys contract's quantity: its packaging string (or the
 * older bag_type text), container size, bags per box and total volume.
 */
export function quantityFieldsFromContract(
  c: {
    packaging?: string | null
    bag_type?: string | null
    bag_weight_kg?: number | string | null
    container_size?: string | null
    bags_per_box?: number | string | null
    volume_bags?: number | null
  },
  fallbackKind: QuantityFields['bag_type'],
  origin?: string | null,
): QuantityFields | null {
  const parsed = parsePackaging(c.packaging) ?? parsePackaging(c.bag_type)
  const kind = parsed?.kind ?? (fallbackKind || null)
  if (!kind) return null
  const size = normalizeContainerSize(c.container_size)
  const weight = countsEquivalents(kind)
    ? null
    : parsed?.weightKg ?? positive(String(c.bag_weight_kg ?? '')) ?? positive(standardBagWeight(kind, origin))
  const fields: QuantityFields = {
    ...EMPTY_QUANTITY,
    bag_type: kind,
    bag_liner: parsed?.liner ?? '',
    bag_weight_kg: str(weight),
    container_size: size,
  }
  const kg = unitKg(kind, weight)
  const def = kg ? defaultBagsPerBox(kind, kg, size) : 0
  const contractBpb = positive(String(c.bags_per_box ?? ''))
  const perBox = contractBpb ?? def
  const volume = c.volume_bags && c.volume_bags > 0 ? c.volume_bags : null
  const split = volume ? boxesFromTotal(volume, perBox) : { boxes: 0, bagsPerBox: perBox }
  return {
    ...fields,
    container_count: split.boxes ? str(split.boxes) : '',
    bags_per_box: split.bagsPerBox && split.bagsPerBox !== def ? str(split.bagsPerBox) : '',
  }
}
