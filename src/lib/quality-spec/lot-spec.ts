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
 * Pin the lot's whole contract group (the lab unit and every live sibling) to
 * the spec version in force, and answer with the asked row's spec. Pinning
 * only the asked row would leave a sibling on a different client quality
 * unpinned for ever (its pin is its own row's, R14). Throws on a read error:
 * for finalize routes, which must not judge blind. An existing pin is kept.
 */
export async function pinGroupSpec(sampleId: string, opts: { admin?: ResolveOptions['admin'] } = {}): Promise<ResolvedSpec | null> {
  const admin = opts.admin ?? serviceRoleClient()
  const group = await groupSampleIds(admin, sampleId)
  const ids = group.includes(sampleId) ? group : [sampleId, ...group]
  const all = await resolveSampleSpecs(ids, { pin: true, admin })
  return all.get(sampleId) ?? null
}

/**
 * Pin the lot (its whole group, see pinGroupSpec) to the spec version in
 * force, at the moment its grading or cupping starts. For SAVE routes: the pin
 * is a side effect there, so a failed read is logged and answered with null
 * instead of failing the save. The next save, or the finalize, pins it then.
 */
export async function pinLotSpec(sampleId: string): Promise<ResolvedSpec | null> {
  try {
    return await pinGroupSpec(sampleId)
  } catch (error) {
    console.error(`[quality-spec] could not pin the spec version of sample ${sampleId}:`, error)
    return null
  }
}
