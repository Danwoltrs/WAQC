/**
 * One sample per contract.
 *
 * A physical sample that covers several commercial contracts is N `samples`
 * rows: one LAB UNIT (cupped and graded, `lab_source_sample_id IS NULL`) and
 * N-1 SIBLINGS that point at it. Lab data lives only on the lab unit; every
 * commercial field lives on the row that owns it. This module is the single
 * home of the copy rule and of group resolution — the migration
 * (database/migrations/20260828000001_one_sample_per_contract.sql) and the
 * intake / siblings endpoints all follow it. Spec: docs/superpowers/specs/
 * 2026-08-26-sample-per-contract-design.md + the 2026-08-28 addendum.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
// certificate-mint imports fetchGroup from here and createSiblingSamples calls
// back into it: a cycle, but both sides only touch the other inside function
// bodies, never at module evaluation, so the live bindings are resolved by the
// time either runs.
import { mintGroupCertificates, resolveValidityWindow } from '@/lib/cupping/certificate-mint'
import { bulkQuantitiesFromContainers } from '@/lib/bag-quantity'

export interface LabSourceRef { id: string; lab_source_sample_id?: string | null }
export interface GroupOrderable extends LabSourceRef { contract_ordinal?: number | null; created_at?: string | null }

/** The row whose quality_assessments / cupping_scores this sample renders. */
export function labSourceId(s: LabSourceRef): string {
  return s.lab_source_sample_id ?? s.id
}
export function isLabUnit(s: LabSourceRef): boolean {
  return !s.lab_source_sample_id
}

/** Lab unit first, then contract order, then creation time. */
export function sortGroup<T extends GroupOrderable>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const au = isLabUnit(a) ? 0 : 1
    const bu = isLabUnit(b) ? 0 : 1
    if (au !== bu) return au - bu
    const ao = a.contract_ordinal ?? Number.MAX_SAFE_INTEGER
    const bo = b.contract_ordinal ?? Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  })
}

/** Columns a sibling always inherits from its lab unit (shared lot / lab state). */
export const MOTHER_SHARED_FIELDS = [
  'assigned_to', 'awb_number', 'cards_printed_at', 'certificate_generated_at', 'certifications',
  'container', 'contract_number', 'courier_name', 'crop_year', 'deleted_at', 'deleted_by', 'destination',
  'exporter_contract_nr', 'exporter_id', 'exporter_legacy', 'hide_exporter_on_label', 'ico_marks',
  'importer_legacy', 'is_quick_look', 'laboratory_id', 'locked', 'micro_origin', 'origin',
  'processing_method', 'quality_name', 'quality_spec_id', 'roaster_legacy', 'same_seller_shipper',
  'sample_category', 'sample_type', 'scanned_at', 'seller_comment', 'seller_id', 'status', 'supplier',
  'supplier_type', 'tin_label_printed_at', 'workflow_stage',
] as const

/** Columns where the contract's own value wins and a blank falls back to the lab unit. */
export const SIBLING_COALESCE_FIELDS = [
  'client_id', 'supplier_contract_nr', 'shipper_contract_nr', 'exporter_sample_number', 'ico_number',
  'container_nr', 'shipment_month', 'bag_count', 'bag_weight_kg', 'bag_type', 'bags_quantity_mt',
  'equivalent_60kg_bags', 'container_count',
] as const

/** Columns that are the contract's own, with NO fallback (a blank is a blank). */
export const SIBLING_OWN_FIELDS = [
  'importer_id', 'roaster_id', 'end_client_id', 'importer_is_qc_client', 'wolthers_contract_nr',
  'buyer_contract_nr', 'roaster_contract_nr', 'qc_client_contract_nr', 'end_client_contract_nr',
  'contract_id', 'manual_ref_fields',
] as const

export type ContractInput = Partial<{
  importer_id: string | null; roaster_id: string | null; end_client_id: string | null; client_id: string | null
  importer_is_qc_client: boolean | null
  wolthers_contract_nr: string | null; buyer_contract_nr: string | null; roaster_contract_nr: string | null
  qc_client_contract_nr: string | null; end_client_contract_nr: string | null
  supplier_contract_nr: string | null; seller_contract_nr: string | null; shipper_contract_nr: string | null
  exporter_sample_number: string | null; ico_number: string | null; container_nr: string | null
  shipment_month: string | null
  bag_count: number | null; bag_weight_kg: number | null; bag_type: string | null
  bags_quantity_mt: number | null; equivalent_60kg_bags: number | null; container_count: number | null
  contract_id: string | null; manual_ref_fields: string[] | null; created_at: string | null
}>

const blank = (v: unknown) => v === null || v === undefined || v === ''
const pick = (...vals: unknown[]) => vals.find((v) => !blank(v)) ?? null

/**
 * The copy rule. Mirrors what certificate-data.ts printed for a sub-contract
 * certificate before the split, so a migrated certificate renders unchanged:
 * buy side and buy-side refs are the contract's own; supply-side identifiers
 * and quantity fall back to the lab unit; the seller reference is the
 * contract's supplier ref → its seller ref → the lab unit's seller ref.
 * Returns an insert payload (no id, no updated_at, no fee columns).
 */
export function buildSiblingRow(
  mother: Record<string, unknown>,
  input: ContractInput,
  opts: { trackingNumber: string; ordinal: number },
): Record<string, unknown> {
  const inp = input as Record<string, unknown>
  const row: Record<string, unknown> = {}
  for (const f of MOTHER_SHARED_FIELDS) row[f] = mother[f] ?? null
  for (const f of SIBLING_COALESCE_FIELDS) row[f] = pick(inp[f], mother[f])
  for (const f of SIBLING_OWN_FIELDS) row[f] = inp[f] ?? null
  row.importer_is_qc_client = input.importer_is_qc_client ?? true
  row.manual_ref_fields = input.manual_ref_fields ?? []
  row.seller_contract_nr = pick(input.supplier_contract_nr, input.seller_contract_nr, mother.seller_contract_nr)
  row.bags = pick(row.bag_count, mother.bags)
  row.storage_position = null
  row.linked_pss_sample_id = null
  row.linked_pss_sample_contract_id = null
  row.tracking_number = opts.trackingNumber
  row.split_numbering = !!mother.laboratory_id
  row.lab_source_sample_id = mother.id
  row.contract_ordinal = opts.ordinal
  if (!blank(input.created_at)) row.created_at = input.created_at
  return row
}

export type GroupMember = Record<string, any> & {
  id: string
  lab_source_sample_id: string | null
  contract_ordinal: number | null
  created_at: string | null
}

export async function resolveLabSourceId(db: SupabaseClient<any>, sampleId: string): Promise<string> {
  const { data } = await db.from('samples').select('id, lab_source_sample_id').eq('id', sampleId).maybeSingle()
  return data ? labSourceId(data as LabSourceRef) : sampleId
}

/** Batch form: id → lab unit id (an unknown id maps to itself). */
export async function resolveLabSourceIds(db: SupabaseClient<any>, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = [...new Set(ids)]
  for (let i = 0; i < uniq.length; i += 200) {
    const chunk = uniq.slice(i, i + 200)
    const { data } = await db.from('samples').select('id, lab_source_sample_id').in('id', chunk)
    for (const r of (data ?? []) as LabSourceRef[]) out.set(r.id, labSourceId(r))
  }
  for (const id of uniq) if (!out.has(id)) out.set(id, id)
  return out
}

/** Every member of the group `sampleId` belongs to (any member resolves the whole group), lab unit first. */
export async function fetchGroup(db: SupabaseClient<any>, sampleId: string): Promise<GroupMember[]> {
  const labId = await resolveLabSourceId(db, sampleId)
  const { data, error } = await db
    .from('samples')
    .select('*')
    .or(`id.eq.${labId},lab_source_sample_id.eq.${labId}`)
  if (error) throw error
  return sortGroup((data ?? []) as GroupMember[])
}

/** Ids of every member of the group, lab unit first. */
export async function groupSampleIds(db: SupabaseClient<any>, sampleId: string): Promise<string[]> {
  const labId = await resolveLabSourceId(db, sampleId)
  const { data, error } = await db
    .from('samples')
    .select('id, lab_source_sample_id, contract_ordinal, created_at')
    .or(`id.eq.${labId},lab_source_sample_id.eq.${labId}`)
  if (error) throw error
  return sortGroup((data ?? []) as GroupMember[]).map((m) => m.id)
}

/** Insert attempts per sibling before its unique violation is reported as a failure. */
const SIBLING_INSERT_ATTEMPTS = 3

/**
 * Internal lab number for a new sibling. Each sibling draws its own from the
 * lab's per-year sequence (unique per client, so the mother's cannot be
 * reused), exactly as the duplicate route creates SS copies. A lab unit
 * without a laboratory cannot mint; it gets `<lab number>-<ordinal>`, the
 * fallback the migration used for the same case.
 */
async function mintSiblingTrackingNumber(
  db: SupabaseClient<any>,
  labUnit: GroupMember,
  ordinal: number,
): Promise<{ trackingNumber: string; error: string | null }> {
  if (!labUnit.laboratory_id) {
    return { trackingNumber: `${labUnit.tracking_number}-${ordinal}`, error: null }
  }
  const { data, error } = await db.rpc('generate_sample_number', { p_laboratory_id: labUnit.laboratory_id })
  if (error || !data) {
    return { trackingNumber: '', error: error?.message || 'generate_sample_number returned nothing' }
  }
  return { trackingNumber: String(data), error: null }
}

/**
 * Adds contracts to an existing sample as sibling rows of its lab unit — the
 * server side of "this sample covers N contracts", shared by intake and the
 * siblings endpoint. Per input, in order:
 *
 *  - ordinal = max(contract_ordinal already in the group, 1) + 1, stepping
 *    only when a sibling is actually created. Soft-deleted siblings keep
 *    their ordinal, so a number is never handed out twice.
 *  - a bulk input is normalised through bulkQuantitiesFromContainers first
 *    (containers + MT in, the bag columns derived), then buildSiblingRow
 *    applies the copy rule.
 *  - the insert is retried with a fresh number on a 23505 unique violation,
 *    as the duplicate route does; any other error fails that input alone.
 *
 * Once the lab unit has siblings it is contract 1 (contract_ordinal set when
 * NULL). On a lab unit that is already certified, the new siblings get their
 * certificates minted right away — only theirs, and the lab unit's is left
 * exactly as it is — so a contract added to a decided lot can be printed and
 * sent without re-finalizing. A sibling that was created but could not be
 * certified stays in `created` AND is listed in `failed`: the row is real, but
 * the caller must know the certificate is missing (the old sub-contract loop
 * swallowed exactly this). The sys write-back is the caller's, because it
 * needs the service-role client.
 */
export async function createSiblingSamples(
  db: SupabaseClient<any>,
  labUnit: GroupMember,
  inputs: ContractInput[],
  userId: string,
): Promise<{ created: GroupMember[]; failed: Array<{ index: number; error: string }> }> {
  const created: GroupMember[] = []
  const failed: Array<{ index: number; error: string }> = []
  // Sibling id → the input it came from, for wording a certificate failure
  // (the created list is shorter than the inputs once one has failed).
  const inputIndexBySibling = new Map<string, number>()
  if (inputs.length === 0) return { created, failed }
  if (!isLabUnit(labUnit)) {
    throw new Error(`createSiblingSamples: ${labUnit.id} is a sibling, not a lab unit`)
  }

  const { data: existing, error: existingError } = await db
    .from('samples')
    .select('contract_ordinal')
    .eq('lab_source_sample_id', labUnit.id)
  if (existingError) throw existingError
  let ordinal = Math.max(
    1,
    labUnit.contract_ordinal ?? 1,
    ...((existing ?? []) as Array<{ contract_ordinal: number | null }>).map((r) => r.contract_ordinal ?? 1),
  ) + 1

  for (let index = 0; index < inputs.length; index++) {
    let input = inputs[index]
    if (input.bag_type === 'bulk') {
      input = { ...input, ...bulkQuantitiesFromContainers(input.container_count, input.bags_quantity_mt) }
    }

    let outcome: { row: GroupMember } | { error: string } | null = null
    for (let attempt = 1; attempt <= SIBLING_INSERT_ATTEMPTS && !outcome; attempt++) {
      const minted = await mintSiblingTrackingNumber(db, labUnit, ordinal)
      if (minted.error) { outcome = { error: minted.error }; break }

      const { data: inserted, error: insertError } = await db
        .from('samples')
        .insert(buildSiblingRow(labUnit, input, { trackingNumber: minted.trackingNumber, ordinal }))
        .select('*')
        .single()

      if (insertError) {
        // Postgres 23505 = unique_violation, most often the number itself
        // (samples are unique per client + tracking number); the next attempt
        // draws a fresh one. Retrying cannot cure any other 23505, so after
        // the last attempt the database's own message is what the user sees.
        if (insertError.code === '23505' && attempt < SIBLING_INSERT_ATTEMPTS) continue
        outcome = { error: insertError.message || 'Failed to create the contract' }
      } else if (!inserted) {
        outcome = { error: 'insert returned no row' }
      } else {
        outcome = { row: inserted as GroupMember }
      }
    }

    if (!outcome || 'error' in outcome) {
      const message = outcome?.error ?? 'Failed to create the contract'
      console.error(`[sample-group] sibling ${index + 1} of ${labUnit.id} failed:`, message)
      failed.push({ index, error: message })
      continue
    }
    created.push(outcome.row)
    inputIndexBySibling.set(outcome.row.id, index)
    ordinal += 1
  }

  if (created.length === 0) return { created, failed }

  if (labUnit.contract_ordinal == null) {
    const { error } = await db.from('samples').update({ contract_ordinal: 1 }).eq('id', labUnit.id)
    if (error) console.error(`[sample-group] could not number lab unit ${labUnit.id} as contract 1:`, error.message)
  }

  // Newest first in case a legacy duplicate certificate ever exists.
  const { data: labCert } = await db
    .from('certificates')
    .select('id, is_rejected, created_at')
    .eq('sample_id', labUnit.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (labCert) {
    const newIds = created.map((c) => c.id)
    const { validFrom, validUntil } = await resolveValidityWindow(db, labUnit.client_id ?? null)
    const mint = await mintGroupCertificates(db, labUnit.id, {
      issuedBy: userId,
      isRejected: Boolean((labCert as { is_rejected?: boolean | null }).is_rejected),
      validFrom,
      validUntil,
      onlySampleIds: newIds,
      reviseExisting: false,
    })
    for (const f of mint.failed) {
      failed.push({
        index: inputIndexBySibling.get(f.sampleId) ?? -1,
        error: `Contract created, but its certificate failed: ${f.error}`,
      })
    }
  }

  return { created, failed }
}
