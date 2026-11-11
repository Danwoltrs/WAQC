import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluateSampleCompliance } from '@/lib/compliance'
import type { ComplianceCriterion } from '@/lib/compliance-criteria'
import { resolveSampleSpec } from '@/lib/quality-spec/resolve'
import type { ResolvedSpec } from '@/lib/quality-spec/types'

/**
 * The spec the public QR page shows for a sample row, and its checklist.
 *
 * `spec` is the row's own client quality at the version the lot was graded
 * under (or the one its contract date picks), never the live template, so a
 * tin scanned after the client changed its spec still shows the old limits.
 * The checklist judges the lab unit (where the lab data lives) by the row's
 * quality, on the certificate's issued numbers.
 *
 * Both reads throw on a database error. This page is a buyer's first look at
 * a certificate, so a failure renders it without the checklist and the
 * attribute limits (what a failed spec read showed before versioning) and is
 * logged, rather than turning the scan into an error page.
 */
export async function loadPublicSpec(
  supabase: SupabaseClient,
  sample: { id: string; quality_spec_id: string | null },
  labSampleId: string,
): Promise<{ spec: ResolvedSpec | null; criteria: ComplianceCriterion[] }> {
  if (!sample.quality_spec_id) return { spec: null, criteria: [] }
  try {
    const spec = await resolveSampleSpec(sample.id)
    const criteria = await evaluateSampleCompliance(
      supabase, labSampleId, sample.quality_spec_id, undefined, { values: 'issued' },
    )
    return { spec, criteria }
  } catch (error) {
    console.error(
      `[certificate] could not read the spec of sample ${sample.id}; rendering without the checklist:`,
      error,
    )
    return { spec: null, criteria: [] }
  }
}
