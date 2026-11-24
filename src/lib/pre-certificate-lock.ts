import type { SupabaseClient } from '@supabase/supabase-js'
import { PRE_CERTIFICATE_LOCK_MESSAGE } from './pre-certificate'
import type { ContentLockState } from './sample-edit-permissions'

const isMissingColumn = (error: { code?: string } | null | undefined) =>
  error?.code === '42703' || error?.code === 'PGRST204'

/**
 * Every sample of the contract groups these ids belong to: the lab unit and
 * each contract sibling (`lab_source_sample_id` = the lab unit). Grading and
 * cupping results live on the lab unit while certificates are minted per
 * contract row, so a pre-certificate on any member locks the whole lot.
 * Throws on a failed read; the caller decides.
 */
async function groupMemberIds(db: SupabaseClient<any>, ids: string[]): Promise<string[]> {
  const own = await (db as any).from('samples').select('id, lab_source_sample_id').in('id', ids)
  if (own.error) throw own.error
  const labIds = [
    ...new Set([
      ...ids,
      ...((own.data ?? []) as Array<{ id: string; lab_source_sample_id: string | null }>).map(
        (r) => r.lab_source_sample_id ?? r.id,
      ),
    ]),
  ]
  const members = await (db as any).from('samples').select('id').in('lab_source_sample_id', labIds)
  if (members.error) throw members.error
  return [...new Set([...labIds, ...((members.data ?? []) as Array<{ id: string }>).map((r) => r.id)])]
}

/**
 * Was a pre-certificate issued for any sample of these lots (each id's lab
 * unit and every contract sibling)? Only a database without the setting yet
 * (missing column) answers no; any other failed read answers yes, so a
 * transient error can never reopen results that a pre-certificate locked.
 */
export async function hasPreCertificate(db: SupabaseClient<any>, sampleIds: Array<string | null | undefined>): Promise<boolean> {
  const ids = [...new Set(sampleIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
  if (ids.length === 0) return false
  try {
    const group = await groupMemberIds(db, ids)
    const { data, error } = await (db as any)
      .from('certificates')
      .select('id')
      .in('sample_id', group)
      .not('standby_at', 'is', null)
      .is('voided_at', null)
      .limit(1)
    if (error) {
      if (isMissingColumn(error)) return false
      console.error('[pre-certificate-lock] could not read the certificates; treating the lot as locked:', error)
      return true
    }
    return Array.isArray(data) && data.length > 0
  } catch (error) {
    console.error('[pre-certificate-lock] could not read the lot; treating it as locked:', error)
    return true
  }
}

/**
 * The content lock, with the pre-certificate rule on top: once a
 * pre-certificate exists on any contract of the lot, grading and cupping
 * results are locked, whether it still waits for its container or has been
 * made final. A lot already locked keeps its own reason.
 */
export async function withPreCertificateLock(
  db: SupabaseClient<any>,
  sampleIds: Array<string | null | undefined>,
  lock: ContentLockState,
): Promise<ContentLockState> {
  if (lock.contentLocked) return lock
  if (!(await hasPreCertificate(db, sampleIds))) return lock
  return {
    contentLocked: true,
    reason: 'locked_pre_certificate',
    lockExpiresAt: null,
    message: PRE_CERTIFICATE_LOCK_MESSAGE,
  }
}
