import type { VersionRow } from './types'

/** Today's calendar date (YYYY-MM-DD) in America/Sao_Paulo. */
export function specToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Latest non-cancelled version with effective_from <= onDate. Date only; applied_at is ignored. */
export function versionInForce(versions: VersionRow[], onDate: string): VersionRow | null {
  let best: VersionRow | null = null
  for (const v of versions) {
    if (v.cancelled_at || v.effective_from > onDate) continue
    if (
      !best ||
      v.effective_from > best.effective_from ||
      (v.effective_from === best.effective_from && v.version_no > best.version_no)
    ) {
      best = v
    }
  }
  return best
}

/** Earliest non-cancelled version already started by `today` (lowest effective_from, then version_no). */
function earliestStarted(versions: VersionRow[], today: string): VersionRow | null {
  let best: VersionRow | null = null
  for (const v of versions) {
    if (v.cancelled_at || v.effective_from > today) continue
    if (
      !best ||
      v.effective_from < best.effective_from ||
      (v.effective_from === best.effective_from && v.version_no < best.version_no)
    ) {
      best = v
    }
  }
  return best
}

/**
 * The pinned version when it exists, else the version in force on the
 * contract date. The date is capped at today (YYYY-MM-DD compares as text): a
 * future-typed contract date must never reach a scheduled version, which a
 * Wolthers change may still cancel.
 *
 * A contract dated before every version (a quality created after the
 * migration, whose v1 started later) takes the earliest version already
 * started, so the lot still pins and never reads the live spec.
 */
export function pickVersion(
  versions: VersionRow[],
  at: { pinnedId: string | null; contractDate: string | null; today: string },
): VersionRow | null {
  if (at.pinnedId) {
    const pinned = versions.find((v) => v.id === at.pinnedId)
    if (pinned) return pinned
  }
  const date = at.contractDate ?? at.today
  return versionInForce(versions, date < at.today ? date : at.today) ?? earliestStarted(versions, at.today)
}

/** The version not yet applied and not cancelled, whatever its date (highest version_no if several). */
export function pendingVersion(versions: VersionRow[], _today: string): VersionRow | null {
  let best: VersionRow | null = null
  for (const v of versions) {
    if (v.applied_at || v.cancelled_at) continue
    if (!best || v.version_no > best.version_no) best = v
  }
  return best
}
