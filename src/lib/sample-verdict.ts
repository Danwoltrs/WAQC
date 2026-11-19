/**
 * A type sample is measured against its quality like any lot, and what falls
 * outside the quality is highlighted, but it is never approved or rejected
 * (Daniel, 2026-11-19).
 *
 * The database keeps recording the measurement in the fields it already has:
 * status 'approved' means everything was in range, 'rejected' means something
 * was not. That keeps every reader working. What a PERSON sees comes from
 * here: "In range" / "Out of range" for a type sample, never a verdict, and a
 * type sample stays out of approval and rejection counts.
 */

/** False for a type sample: it has a measurement, not a verdict. */
export function carriesVerdict(sampleType: string | null | undefined): boolean {
  return String(sampleType ?? '').trim().toLowerCase() !== 'type'
}

export type OutcomeKey = 'approved' | 'rejected' | 'in_range' | 'out_of_range'

/** The outcome to show for a decided sample of this type. */
export function outcomeOf(sampleType: string | null | undefined, rejected: boolean): OutcomeKey {
  if (carriesVerdict(sampleType)) return rejected ? 'rejected' : 'approved'
  return rejected ? 'out_of_range' : 'in_range'
}

export const OUTCOME_LABEL: Record<OutcomeKey, string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  in_range: 'In range',
  out_of_range: 'Out of range',
}

/** "Approved" / "Rejected", or "In range" / "Out of range" for a type sample. */
export function outcomeLabel(sampleType: string | null | undefined, rejected: boolean): string {
  return OUTCOME_LABEL[outcomeOf(sampleType, rejected)]
}

/**
 * PostgREST `.or()` filter keeping only samples that carry a verdict: every
 * approval rate, rejection count and supplier ranking is built from these. A
 * row with no sample type stays in.
 */
export const VERDICT_SAMPLES_FILTER = 'sample_type.is.null,sample_type.neq.type'
