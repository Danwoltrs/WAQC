import type { SupabaseClient } from '@supabase/supabase-js'
import { PRE_CERTIFICATE_LOCK_MESSAGE } from './pre-certificate'
import type { ContentLockState } from './sample-edit-permissions'

/**
 * Was a pre-certificate issued for any of these samples (a lot and its lab
 * unit)? A failed read answers no: the setting may not be on this database
 * yet, and the ordinary 7-day lock still applies.
 */
export async function hasPreCertificate(db: SupabaseClient<any>, sampleIds: Array<string | null | undefined>): Promise<boolean> {
  const ids = [...new Set(sampleIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
  if (ids.length === 0) return false
  try {
    const { data, error } = await (db as any)
      .from('certificates')
      .select('id')
      .in('sample_id', ids)
      .not('standby_at', 'is', null)
      .is('voided_at', null)
      .limit(1)
    if (error) return false
    return Array.isArray(data) && data.length > 0
  } catch (error) {
    console.error('[pre-certificate-lock] could not read the certificates:', error)
    return false
  }
}

/**
 * The content lock, with the pre-certificate rule on top: once a
 * pre-certificate exists, grading and cupping results are locked, whether it
 * still waits for its container or has been made final. A lot already locked
 * keeps its own reason.
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
