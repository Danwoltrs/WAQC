/**
 * A sample's quality specification is one of its own laboratory's: a sample
 * is graded, judged and numbered from the spec it carries, so a spec of
 * another laboratory would grade it by rules that laboratory never set.
 *
 * The sample routes call this before writing a spec or a laboratory, with the
 * same client they write with. Under the caller's RLS a confined user cannot
 * read another laboratory's spec at all, which reads as "not found" and is
 * refused the same way.
 */

export const SPEC_OTHER_LAB_ERROR = 'The quality specification belongs to another laboratory'
export const SPEC_NOT_FOUND_ERROR = 'The quality specification was not found'

export type SpecLabCheck = { ok: true } | { ok: false; status: 400 | 500; error: string }

export async function checkSpecLab(db: any, specId: string, sampleLabId: string | null): Promise<SpecLabCheck> {
  const { data, error } = await db
    .from('client_qualities')
    .select('laboratory_id')
    .eq('id', specId)
    .maybeSingle()
  if (error) return { ok: false, status: 500, error: 'Could not check the quality specification' }
  if (!data) return { ok: false, status: 400, error: SPEC_NOT_FOUND_ERROR }
  if ((data.laboratory_id ?? null) !== (sampleLabId ?? null)) {
    return { ok: false, status: 400, error: SPEC_OTHER_LAB_ERROR }
  }
  return { ok: true }
}
