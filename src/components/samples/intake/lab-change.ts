/**
 * A quality specification belongs to one laboratory. When the intake moves to
 * another laboratory, the spec picked in the old one (by hand, or matched
 * from the linked contract) goes with it, and so do the quality name and the
 * contract's spec match. The form then matches the linked contract's quality
 * again among the new laboratory's specs (withContractQuality).
 *
 * The server refuses a sample whose spec is another laboratory's
 * (src/lib/qc-settings/sample-spec-lab.ts); this keeps the form from getting
 * there.
 */
import { mergePrefill } from '@/lib/intake-prefill'
import type { QualityMatch } from '@/lib/quality-matching'
import type { FormData } from './types'

export function withLaboratory(prev: FormData, labId: string): FormData {
  if (labId === prev.laboratory_id) return prev
  return {
    ...prev,
    laboratory_id: labId,
    quality_spec_id: '',
    quality_name: '',
    contract_resolution: prev.contract_resolution ? { ...prev.contract_resolution, quality_match: null } : null,
  }
}

const QUALITY_KEYS = ['quality_name', 'quality_spec_id'] as const

/**
 * The linked contract's quality, matched again in the laboratory the form is
 * now in. `patch` is mapContractToFormData's patch for the contract as read
 * with `?laboratory_id=labId`; only its quality is taken, the rest of the
 * contract's prefill stands. An answer for a laboratory or a contract the form
 * has since left changes nothing.
 */
export function withContractQuality(
  prev: FormData,
  initial: FormData,
  args: { labId: string; contractId: string; patch: Partial<FormData>; qualityMatch: QualityMatch | null },
): FormData {
  if (prev.laboratory_id !== args.labId || prev.selected_contract?.id !== args.contractId) return prev
  const patch: Partial<FormData> = {}
  const prefilled: (keyof FormData)[] = []
  for (const key of QUALITY_KEYS) {
    if (args.patch[key] !== undefined) {
      ;(patch as Record<string, unknown>)[key] = args.patch[key]
      prefilled.push(key)
    }
  }
  const next = mergePrefill(prev, patch, prefilled, initial, { keepOthers: true })
  return {
    ...next,
    contract_resolution: next.contract_resolution
      ? { ...next.contract_resolution, quality_match: args.qualityMatch }
      : null,
  }
}
