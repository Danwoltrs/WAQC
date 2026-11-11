import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceRoleClient } from '@/lib/supabase-service'
import { selectInChunks } from '@/lib/supabase-in-chunks'
import { SPEC_TEMPLATE_COLUMNS } from './spec-columns'
import { pickVersion, specToday } from './pick-version'
import type { ResolvedSpec, VersionRow } from './types'

/**
 * One way to read a lot's quality spec: the client quality's version the lot
 * is pinned to, or else the version in force on its contract date.
 *
 * Rules:
 * - The lab unit (`lab_source_sample_id ?? id`) decides for its whole group:
 *   its pin and its contract date pick the version for every contract
 *   sibling. A sibling's own contract_date plays no part.
 * - Contract date: the lab-typed `samples.contract_date`, else the linked
 *   `contracts.contract_date`, else today in America/Sao_Paulo.
 * - `pin: true` writes `spec_version_id` where it is still null, on the lab
 *   unit and every row pointing at it. An existing pin is never overwritten.
 * - Names stay live (`custom_name`, `quality_code`, template id/name/name_en/
 *   description); every other field comes from the version snapshot.
 * - A quality without version rows falls back to the live join with
 *   `version: null` and a console.warn. It never throws for that.
 *
 * All reads use the service role: `contracts` is a sys table with RESTRICTIVE
 * deny policies.
 */

export interface ResolveOptions {
  pin?: boolean
  admin?: SupabaseClient<any>
}

interface SampleRow {
  id: string
  lab_source_sample_id: string | null
  quality_spec_id: string | null
  spec_version_id: string | null
  contract_date: string | null
  contract_id: string | null
}

interface QualityRow {
  id: string
  custom_name: string | null
  quality_code: string | null
  template_id: string | null
  cups_per_sample: number | null
  discrepancy_threshold: number | null
  custom_parameters: Record<string, any> | null
  template: ({ id: string; name: string | null; name_en: string | null; description: string | null } & Record<string, any>) | null
}

const SAMPLE_COLUMNS = 'id, lab_source_sample_id, quality_spec_id, spec_version_id, contract_date, contract_id'
const QUALITY_COLUMNS =
  'id, custom_name, quality_code, template_id, cups_per_sample, discrepancy_threshold, custom_parameters, ' +
  `template:quality_templates!client_qualities_template_id_fkey(id, name, name_en, description, ${SPEC_TEMPLATE_COLUMNS.join(', ')})`
const VERSION_COLUMNS =
  'id, client_quality_id, version_no, effective_from, spec, source, note, created_by, created_at, ' +
  'applied_at, notified_at, cancelled_at, cancelled_by, cancel_note'

function unique(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))]
}

function fail(what: string, error: any): never {
  throw new Error(`resolveSampleSpecs: could not ${what}: ${error?.message ?? String(error)}`)
}

interface Loaded {
  samples: Map<string, SampleRow>
  contractDates: Map<string, string | null>
  qualities: Map<string, QualityRow>
  versions: Map<string, VersionRow[]>
}

async function load(admin: SupabaseClient<any>, sampleIds: string[]): Promise<Loaded> {
  const samples = new Map<string, SampleRow>()
  const read = (ids: string[]) =>
    selectInChunks<SampleRow>(ids, (chunk) => admin.from('samples').select(SAMPLE_COLUMNS).in('id', chunk) as any)

  const first = await read(sampleIds)
  if (first.error) fail('read samples', first.error)
  for (const s of first.data ?? []) samples.set(s.id, s)

  const missingUnits = unique([...samples.values()].map((s) => s.lab_source_sample_id)).filter((id) => !samples.has(id))
  if (missingUnits.length) {
    const units = await read(missingUnits)
    if (units.error) fail('read lab units', units.error)
    for (const s of units.data ?? []) samples.set(s.id, s)
  }

  const contractIds = unique([...samples.values()].filter((s) => !s.contract_date).map((s) => s.contract_id))
  const contractDates = new Map<string, string | null>()
  if (contractIds.length) {
    const res = await selectInChunks<{ id: string; contract_date: string | null }>(contractIds, (chunk) =>
      admin.from('contracts').select('id, contract_date').in('id', chunk) as any,
    )
    if (res.error) fail('read contracts', res.error)
    for (const c of res.data ?? []) contractDates.set(c.id, c.contract_date)
  }

  const qualityIds = unique(sampleIds.map((id) => samples.get(id)?.quality_spec_id))
  const qualities = new Map<string, QualityRow>()
  const versions = new Map<string, VersionRow[]>()
  if (qualityIds.length) {
    const q = await selectInChunks<QualityRow>(qualityIds, (chunk) =>
      admin.from('client_qualities').select(QUALITY_COLUMNS).in('id', chunk) as any,
    )
    if (q.error) fail('read client qualities', q.error)
    for (const row of q.data ?? []) qualities.set(row.id, row)

    const v = await selectInChunks<VersionRow>(qualityIds, (chunk) =>
      admin.from('client_quality_versions').select(VERSION_COLUMNS).in('client_quality_id', chunk) as any,
    )
    if (v.error) fail('read client quality versions', v.error)
    for (const row of v.data ?? []) {
      const list = versions.get(row.client_quality_id) ?? []
      list.push(row)
      versions.set(row.client_quality_id, list)
    }
  }

  return { samples, contractDates, qualities, versions }
}

function labUnitOf(loaded: Loaded, sample: SampleRow): SampleRow {
  return (sample.lab_source_sample_id && loaded.samples.get(sample.lab_source_sample_id)) || sample
}

/** The lab unit's contract date (YYYY-MM-DD), or null. */
function contractDateOf(loaded: Loaded, unit: SampleRow): string | null {
  const raw = unit.contract_date ?? (unit.contract_id ? loaded.contractDates.get(unit.contract_id) ?? null : null)
  return raw ? String(raw).slice(0, 10) : null
}

function fromLive(q: QualityRow): ResolvedSpec {
  return {
    id: q.id,
    custom_name: q.custom_name,
    quality_code: q.quality_code,
    template_id: q.template_id,
    cups_per_sample: q.cups_per_sample,
    discrepancy_threshold: q.discrepancy_threshold,
    custom_parameters: q.custom_parameters ?? {},
    template: (q.template as ResolvedSpec['template']) ?? null,
    version: null,
  }
}

function fromVersion(q: QualityRow, v: VersionRow, pinned: boolean): ResolvedSpec {
  const spec = v.spec
  return {
    id: q.id,
    custom_name: q.custom_name,
    quality_code: q.quality_code,
    template_id: q.template_id,
    cups_per_sample: spec.cups_per_sample ?? null,
    discrepancy_threshold: spec.discrepancy_threshold ?? null,
    custom_parameters: spec.custom_parameters ?? {},
    template: {
      ...spec.template,
      id: q.template?.id ?? q.template_id ?? '',
      name: q.template?.name ?? null,
      name_en: q.template?.name_en ?? null,
      description: q.template?.description ?? null,
    },
    version: { id: v.id, versionNo: v.version_no, effectiveFrom: v.effective_from, pinned },
  }
}

interface Pick {
  version: VersionRow | null
  dangling: boolean
}

function pickFor(loaded: Loaded, unit: SampleRow, qualityId: string, today: string, ignorePin = false): Pick {
  const list = loaded.versions.get(qualityId) ?? []
  const pinnedId = ignorePin ? null : unit.spec_version_id
  const version = pickVersion(list, { pinnedId, contractDate: contractDateOf(loaded, unit), today })
  return { version, dangling: !!pinnedId && version?.id !== pinnedId }
}

/** Write the version on the lab units and their siblings where no pin exists yet. */
async function pinGroups(
  admin: SupabaseClient<any>,
  loaded: Loaded,
  byVersion: Map<string, { qualityId: string; unitIds: Set<string> }>,
): Promise<void> {
  for (const [versionId, { qualityId, unitIds }] of byVersion) {
    const ids = [...unitIds]
    for (const col of ['id', 'lab_source_sample_id'] as const) {
      const res = await selectInChunks<{ id: string }>(ids, (chunk) =>
        admin
          .from('samples')
          .update({ spec_version_id: versionId })
          .in(col, chunk)
          .is('spec_version_id', null)
          .eq('quality_spec_id', qualityId)
          .select('id') as any,
      )
      if (res.error) fail('pin the spec version', res.error)
      for (const row of res.data ?? []) {
        const s = loaded.samples.get(row.id)
        if (s) s.spec_version_id = versionId
      }
    }
  }
}

export async function resolveSampleSpecs(sampleIds: string[], opts: ResolveOptions = {}): Promise<Map<string, ResolvedSpec>> {
  const out = new Map<string, ResolvedSpec>()
  const ids = unique(sampleIds)
  if (!ids.length) return out
  const admin = opts.admin ?? serviceRoleClient()
  const loaded = await load(admin, ids)
  const today = specToday()

  const picks = new Map<string, { quality: QualityRow; unit: SampleRow; version: VersionRow | null }>()
  const warnedQualities = new Set<string>()
  const toPin = new Map<string, { qualityId: string; unitIds: Set<string> }>()

  for (const id of ids) {
    const sample = loaded.samples.get(id)
    const quality = sample?.quality_spec_id ? loaded.qualities.get(sample.quality_spec_id) : undefined
    if (!sample || !quality) continue
    const unit = labUnitOf(loaded, sample)
    const { version, dangling } = pickFor(loaded, unit, quality.id, today)

    if (!version) {
      if (!warnedQualities.has(quality.id)) {
        warnedQualities.add(quality.id)
        console.warn(`[quality-spec] client quality ${quality.id} has no version in force; using the live spec`)
      }
    } else if (dangling) {
      console.warn(
        `[quality-spec] sample ${id} is pinned to spec version ${unit.spec_version_id}, which does not exist for client quality ${quality.id}; using the version by date`,
      )
    } else if (opts.pin) {
      const entry = toPin.get(version.id) ?? { qualityId: quality.id, unitIds: new Set<string>() }
      entry.unitIds.add(unit.id)
      toPin.set(version.id, entry)
    }
    picks.set(id, { quality, unit, version })
  }

  if (toPin.size) await pinGroups(admin, loaded, toPin)

  for (const [id, { quality, unit, version }] of picks) {
    out.set(id, version ? fromVersion(quality, version, unit.spec_version_id === version.id) : fromLive(quality))
  }
  return out
}

export async function resolveSampleSpec(sampleId: string, opts: ResolveOptions = {}): Promise<ResolvedSpec | null> {
  const map = await resolveSampleSpecs([sampleId], opts)
  return map.get(sampleId) ?? null
}

/**
 * The lot's pinned version (its lab unit's pin) next to the version its
 * contract date implies today. `mismatch` is true when both exist and differ.
 */
export async function specVersionStatus(
  sampleId: string,
  admin: SupabaseClient<any> = serviceRoleClient(),
): Promise<{ pinned: VersionRow | null; implied: VersionRow | null; mismatch: boolean }> {
  const loaded = await load(admin, [sampleId])
  const sample = loaded.samples.get(sampleId)
  if (!sample?.quality_spec_id) return { pinned: null, implied: null, mismatch: false }
  const unit = labUnitOf(loaded, sample)
  const list = loaded.versions.get(sample.quality_spec_id) ?? []
  const pinned = unit.spec_version_id ? list.find((v) => v.id === unit.spec_version_id) ?? null : null
  const implied = pickFor(loaded, unit, sample.quality_spec_id, specToday(), true).version
  return { pinned, implied, mismatch: !!pinned && !!implied && pinned.id !== implied.id }
}
