/**
 * The QC intake wizard's steps and what each needs before the user may move
 * on, free of layout: the form component renders these, and a redesign can
 * replace every screen without touching the rules.
 *
 *  1. Contract: link a contract (or a PSS, for an SS), or continue without.
 *  2. Sample and quantity: references and parties, quality, quantity and
 *     shipment. Always visited — the sample reference and the shipper are
 *     checked here even when a linked contract filled everything.
 *  3. Review and finish: arrival date, photo, notes, the other contracts the
 *     sample covers, and submit.
 */
import type { FormData, Step } from './types'
import { quantityIssues } from './quantity-model'

export const CONTRACT_STEP = 1
export const DETAILS_STEP = 2
export const REVIEW_STEP = 3

export const QC_STEPS: Step[] = [
  { id: CONTRACT_STEP, name: 'Contract', description: 'Find and link the contract, or go on with no contract' },
  { id: DETAILS_STEP, name: 'Sample and quantity', description: 'References, parties, quality, quantity and shipment' },
  { id: REVIEW_STEP, name: 'Review and finish', description: 'Summary, photo and the other contracts this sample covers' },
]

/**
 * Where a contract (or PSS) picked on Step 1 takes the user: straight to
 * Step 2, never further. The pick is the confirmation, as a contact is in
 * the Wolthers app's New Inquiry: Step 2's header names the contract
 * (Wolthers ref, client, client ref, quality) with Change beside it
 * (Daniel, 2026-09-29). Step 2 is where the sample reference and the shipper
 * are checked, so it is never skipped (the 2026-09-17 jump went past it).
 */
export const STEP_AFTER_CONTRACT_LINK = DETAILS_STEP

const blank = (v: string | null | undefined) => (v ?? '').trim() === ''

/** Seller, and the shipper when it is not the seller. */
export function supplyChainIssues(form: FormData): string[] {
  const issues: string[] = []
  if (blank(form.seller)) issues.push('Seller')
  if (!form.same_seller_shipper && blank(form.shipper)) issues.push('Shipper')
  return issues
}

/**
 * How the wizard was opened. `specialtyQualityIds`: the specialty intake (the
 * CVA picker's Add sample), with the qualities it may take, the CVA ones. A
 * lot is specialty by its quality alone, so that intake needs one of them for
 * a sample of any type, and the client that owns it.
 */
export interface IntakeRules {
  specialtyQualityIds?: ReadonlySet<string>
}

/**
 * Sample type, lab and origin; a PSS/SS also needs its client and quality
 * specification, and a specialty intake needs both for every sample type.
 */
export function qualityIssues(form: FormData, rules: IntakeRules = {}): string[] {
  const issues: string[] = []
  if (!form.sample_type) issues.push('Sample type')
  if (blank(form.laboratory_id)) issues.push('Laboratory')
  if (blank(form.origin)) issues.push('Origin')
  const specialty = rules.specialtyQualityIds
  if (specialty || form.sample_type === 'pss' || form.sample_type === 'ss') {
    const hasClient = form.importer_is_qc_client ? !blank(form.importer) : !blank(form.importer) || !blank(form.qc_client)
    if (!hasClient) issues.push('Importer or QC client')
    if (specialty) {
      if (!specialty.has(form.quality_spec_id)) issues.push('Specialty quality')
    } else if (blank(form.quality_spec_id)) {
      issues.push('Quality specification')
    }
  }
  return issues
}

/**
 * Every contract row that has a bag type must resolve to a complete quantity
 * within the bulk cap. #N counts the sample itself as #1, as the rows do.
 */
export function contractRowIssues(form: FormData): string[] {
  return form.contracts.flatMap((c, i) =>
    c.bag_type ? quantityIssues(c).map((issue) => `Contract #${i + 2}: ${issue}`) : [],
  )
}

/** What still blocks the step, as short phrases the footer lists. Empty = complete. */
export function stepIssues(step: number, form: FormData, rules: IntakeRules = {}): string[] {
  switch (step) {
    case CONTRACT_STEP:
      return []
    case DETAILS_STEP:
      return [...supplyChainIssues(form), ...qualityIssues(form, rules), ...quantityIssues(form)]
    case REVIEW_STEP:
      return [...(blank(form.arrival_date) ? ['Arrival date'] : []), ...contractRowIssues(form)]
    default:
      return []
  }
}

/** Everything a submit needs: the details and the review. */
export function submitIssues(form: FormData, rules: IntakeRules = {}): string[] {
  return [...stepIssues(DETAILS_STEP, form, rules), ...stepIssues(REVIEW_STEP, form, rules)]
}

export const isStepComplete = (step: number, form: FormData, rules: IntakeRules = {}) =>
  stepIssues(step, form, rules).length === 0

export const nextStep = (step: number) => Math.min(step + 1, REVIEW_STEP)
export const previousStep = (step: number) => Math.max(step - 1, CONTRACT_STEP)
