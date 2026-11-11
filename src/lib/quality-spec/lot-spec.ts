import { groupSampleIds } from '@/lib/sample-group'
import { serviceRoleClient } from '@/lib/supabase-service'
import { resolveSampleSpec, resolveSampleSpecs, type ResolveOptions } from './resolve'
import type { ResolvedSpec } from './types'

/**
 * The spec a reader that holds a (sample id, quality id) pair should judge by.
 *
 * The resolver answers for a ROW: that row's own quality, at the version its
 * lab unit picks. Several readers hold the lab unit's id next to a SIBLING's
 * quality id (a group's contracts may carry different client qualities, and
 * lab data lives on the lab unit). For them this finds the group row that
 * carries the asked quality and resolves that one, so the lot is judged by the
 * quality the caller meant, never by the lab unit's own.
 *
 * Null only when `qualitySpecId` is null. Throws when no row of the group
 * carries the quality: judging by another quality would be wrong, and an
 * approval gate must not read "no spec" as "approve".
 */
export async function resolveSpecForQuality(
  sampleId: string,
  qualitySpecId: string | null,
  opts: ResolveOptions = {},
): Promise<ResolvedSpec | null> {
  if (!qualitySpecId) return null
  const own = await resolveSampleSpec(sampleId, opts)
  if (own?.id === qualitySpecId) return own

  const admin = opts.admin ?? serviceRoleClient()
  const ids = await groupSampleIds(admin, sampleId, { includeDeleted: true })
  const all = await resolveSampleSpecs(ids, { ...opts, admin })
  for (const id of ids) {
    const spec = all.get(id)
    if (spec?.id === qualitySpecId) return spec
  }
  throw new Error(`resolveSpecForQuality: no row of the group of sample ${sampleId} carries client quality ${qualitySpecId}`)
}

/**
 * Pin the lot to the spec version in force, at the moment its grading or
 * cupping starts. For SAVE routes: the pin is a side effect there, so a failed
 * read is logged and answered with null instead of failing the save. The next
 * save, or the finalize, pins it then.
 */
export async function pinLotSpec(sampleId: string): Promise<ResolvedSpec | null> {
  try {
    return await resolveSampleSpec(sampleId, { pin: true })
  } catch (error) {
    console.error(`[quality-spec] could not pin the spec version of sample ${sampleId}:`, error)
    return null
  }
}
