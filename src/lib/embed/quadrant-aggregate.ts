/**
 * Service-role quadrant aggregate helper
 *
 * Provides two exports:
 *   aggregateQuadrant  — assembles the three data slices (sample, qualityAssessment, cupping)
 *                        that the cert-editor loads via three separate HTTP fetches.
 *   loadSampleOwnership — returns {client_id, end_client_id} for an ACL check; null if
 *                         the sample is missing or soft-deleted.
 *
 * The caller (embed API route) supplies a service-role Supabase client; this module
 * never constructs its own client and never makes HTTP self-calls.
 *
 * Data shapes mirror what the three routes return to the browser:
 *   GET /api/samples/[id]                    → { sample: transformedSample }
 *   GET /api/samples/[id]/quality-assessment → { assessment }
 *   GET /api/cupping/scores/aggregate        → { aggregated: AggregatedScores }
 *
 * The cupping aggregation replicates the essential computation from the aggregate route
 * (src/app/api/cupping/scores/aggregate/route.ts) because that route exports no pure
 * helpers. Only the pieces consumed by use-cert-editor.ts are computed:
 *   attributes[attr].finalScore, cva_score, flavor_descriptor, defects, defect_levels.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuadrantSample {
  id: string
  tracking_number: string | null
  deleted_at: string | null
  client_id: string | null
  end_client_id: string | null
  [key: string]: unknown
}

export interface QuadrantQualityAssessment {
  sample_id: string
  green_bean_data: Record<string, unknown> | null
  roast_data: Record<string, unknown> | null
  [key: string]: unknown
}

interface AttributeStats {
  mean: number
  median: number
  stdDev: number
  min: number
  max: number
  values: number[]
  hasDiscrepancy: boolean
  outliers: string[]
  finalScore: number
  range: number
  increment: number
}

export interface QuadrantCupping {
  sample_id: string
  sample_tracking_number: string
  total_cuppers: number
  attributes: Record<string, AttributeStats>
  overall_score: { mean: number; median: number; stdDev: number }
  cva_score: number | null
  defects: { taints: string[]; faults: string[] }
  defect_levels: Array<{
    defectName: string
    type: 'taint' | 'fault'
    levels: Record<string, number>
    hasDiscrepancy: boolean
    range: number
    outliers: string[]
  }>
  hasDiscrepancies: boolean
  discrepancy_flags: string[]
  flavor_descriptor: string | null
}

export interface QuadrantPayload {
  sample: QuadrantSample
  qualityAssessment: QuadrantQualityAssessment | null
  cupping: QuadrantCupping | null
}

// ---------------------------------------------------------------------------
// Thin Supabase client interface (only what we call)
// ---------------------------------------------------------------------------

interface QueryBuilder {
  select(cols?: string): QueryBuilder
  eq(col: string, val: unknown): QueryBuilder
  is(col: string, val: unknown): QueryBuilder
  maybeSingle(): Promise<{ data: unknown; error: unknown }>
  then<T>(res: (result: { data: unknown; error: unknown }) => T): Promise<T>
}

interface ServiceClient {
  from(table: string): QueryBuilder
}

// ---------------------------------------------------------------------------
// Statistical helpers (replicated from aggregate route — no exports available)
// ---------------------------------------------------------------------------

function calcStats(values: number[]): { mean: number; median: number; stdDev: number; min: number; max: number } {
  if (values.length === 0) return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 }
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const sorted = [...values].sort((a, b) => a - b)
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)]
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length
  return { mean, median, stdDev: Math.sqrt(variance), min: Math.min(...values), max: Math.max(...values) }
}

function roundToIncrement(value: number, increment: number): number {
  return Math.round(value / increment) * increment
}

const BOOLEAN_ATTRIBUTES = new Set([
  'clean cup', 'cleancup', 'clean_cup',
  'uniform cup', 'uniformcup', 'uniform_cup',
  'uniformity',
])

const MAX_DISCREPANCY = 0.5
const DEFAULT_INCREMENT = 0.25

// ---------------------------------------------------------------------------
// Core aggregation logic (mirrors route, scoped to what use-cert-editor reads)
// ---------------------------------------------------------------------------

function aggregateCuppingScores(
  scores: Array<{
    id: string
    cupper_id: string | null
    scores: Record<string, number>
    defects: Record<string, unknown>
    created_at: string
    cva_score?: number | null
    cupper?: { id: string; full_name?: string } | null
    sample?: { id: string; tracking_number: string } | null
  }>,
  sampleId: string,
  masterCupperId: string | null,
): QuadrantCupping {
  // ---- Attributes ----
  const allAttributes = new Set<string>()
  for (const score of scores) {
    for (const attr of Object.keys(score.scores || {})) {
      if (!BOOLEAN_ATTRIBUTES.has(attr.toLowerCase())) allAttributes.add(attr)
    }
  }

  const attributeStats: Record<string, AttributeStats> = {}
  const discrepancyFlags: string[] = []

  for (const attribute of allAttributes) {
    const values: number[] = []
    const cupperValues = new Map<string, number>()
    for (const score of scores) {
      const v = (score.scores || {})[attribute]
      if (v !== undefined && v !== null) {
        values.push(v)
        cupperValues.set(score.cupper?.full_name || score.cupper_id || 'Unknown', v)
      }
    }
    if (values.length === 0) continue

    const stats = calcStats(values)
    const range = stats.max - stats.min
    const outliers = range > MAX_DISCREPANCY ? Array.from(cupperValues.keys()) : []

    const masterScore = masterCupperId
      ? scores.find(s => s.cupper_id === masterCupperId)
      : undefined
    const masterVal = masterScore?.scores?.[attribute]
    const finalScore = roundToIncrement(
      (masterVal !== undefined && masterVal !== null) ? masterVal : stats.mean,
      DEFAULT_INCREMENT,
    )

    attributeStats[attribute] = {
      ...stats,
      values,
      hasDiscrepancy: outliers.length > 0,
      outliers,
      finalScore,
      range,
      increment: DEFAULT_INCREMENT,
    }

    if (outliers.length > 0) {
      discrepancyFlags.push(
        `${attribute}: Discrepancy of ${range.toFixed(2)} points (Range: ${stats.min.toFixed(2)} - ${stats.max.toFixed(2)})`
      )
    }
  }

  // ---- Overall score ----
  const overallValues = masterCupperId
    ? Object.values(attributeStats).map(a => a.finalScore)
    : Object.values(attributeStats).map(a => a.mean)
  const overallStats = calcStats(overallValues)

  // ---- Defects ----
  const allTaints = new Set<string>()
  const allFaults = new Set<string>()
  const taintLevels = new Map<string, Map<string, number>>()
  const faultLevels = new Map<string, Map<string, number>>()

  function extractName(item: unknown): string | null {
    if (typeof item === 'string') return item
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      const n = obj.name || obj.defect_name
      if (typeof n === 'string' && n !== '[object Object]' && n !== 'undefined') return n
    }
    return null
  }

  for (const score of scores) {
    const cupperName = score.cupper?.full_name || score.cupper_id || 'Unknown'
    const defects = (score.defects || {}) as Record<string, unknown>

    function processItems(
      items: unknown[],
      targetSet: Set<string>,
      levelsMap: Map<string, Map<string, number>>,
    ) {
      for (const item of items) {
        const name = extractName(item)
        if (!name) continue
        targetSet.add(name)
        const intensity = (item && typeof item === 'object') ? Number((item as Record<string, unknown>).intensity || (item as Record<string, unknown>).level || 0) : 0
        if (intensity > 0) {
          if (!levelsMap.has(name)) levelsMap.set(name, new Map())
          levelsMap.get(name)!.set(cupperName, intensity)
        }
      }
    }

    if (Array.isArray(defects.taints)) processItems(defects.taints as unknown[], allTaints, taintLevels)
    if (Array.isArray(defects.faults)) processItems(defects.faults as unknown[], allFaults, faultLevels)

    // Legacy taints_with_levels / faults_with_levels
    if (Array.isArray(defects.taints_with_levels)) {
      for (const t of defects.taints_with_levels as Array<{ name: string; level?: number }>) {
        if (!t.name) continue
        allTaints.add(t.name)
        if (t.level && t.level > 0) {
          if (!taintLevels.has(t.name)) taintLevels.set(t.name, new Map())
          taintLevels.get(t.name)!.set(cupperName, t.level)
        }
      }
    }
    if (Array.isArray(defects.faults_with_levels)) {
      for (const f of defects.faults_with_levels as Array<{ name: string; level?: number }>) {
        if (!f.name) continue
        allFaults.add(f.name)
        if (f.level && f.level > 0) {
          if (!faultLevels.has(f.name)) faultLevels.set(f.name, new Map())
          faultLevels.get(f.name)!.set(cupperName, f.level)
        }
      }
    }
  }

  // ---- Defect level stats (serialized) ----
  const defectLevelStats: QuadrantCupping['defect_levels'] = []
  function buildDefectLevelStats(
    levelsMap: Map<string, Map<string, number>>,
    type: 'taint' | 'fault',
  ) {
    levelsMap.forEach((cupperLevels, defectName) => {
      if (cupperLevels.size <= 1) return
      const levels = Array.from(cupperLevels.values())
      const range = Math.max(...levels) - Math.min(...levels)
      const hasDiscrepancy = range > MAX_DISCREPANCY
      defectLevelStats.push({
        defectName,
        type,
        levels: Object.fromEntries(cupperLevels),
        hasDiscrepancy,
        range,
        outliers: hasDiscrepancy ? Array.from(cupperLevels.keys()) : [],
      })
    })
  }
  buildDefectLevelStats(taintLevels, 'taint')
  buildDefectLevelStats(faultLevels, 'fault')

  // ---- CVA score ----
  const cvaScoreValue: number | null = (() => {
    const fromMaster = masterCupperId
      ? (scores.find(s => s.cupper_id === masterCupperId) as any)?.cva_score
      : undefined
    if (typeof fromMaster === 'number') return fromMaster
    const vals = scores.map(s => s.cva_score).filter((v): v is number => typeof v === 'number')
    return vals.length ? Math.max(...vals) : null
  })()

  // ---- Flavor descriptor ----
  const flavorDescriptor: string | null = (() => {
    const fromMaster = masterCupperId
      ? (scores.find(s => s.cupper_id === masterCupperId)?.scores as Record<string, unknown> | undefined)?.['Flavor_descriptor']
      : undefined
    if (typeof fromMaster === 'string' && fromMaster.trim()) return fromMaster
    const counts = new Map<string, number>()
    for (const s of scores) {
      const d = (s.scores as Record<string, unknown> | undefined)?.['Flavor_descriptor']
      if (typeof d === 'string' && d.trim()) counts.set(d, (counts.get(d) || 0) + 1)
    }
    let best: string | null = null, bestN = 0
    for (const [d, n] of counts) if (n > bestN) { best = d; bestN = n }
    return best
  })()

  return {
    sample_id: sampleId,
    sample_tracking_number: scores[0]?.sample?.tracking_number || 'Unknown',
    total_cuppers: scores.length,
    attributes: attributeStats,
    overall_score: overallStats,
    cva_score: cvaScoreValue,
    defects: { taints: Array.from(allTaints), faults: Array.from(allFaults) },
    defect_levels: defectLevelStats,
    hasDiscrepancies: discrepancyFlags.length > 0,
    discrepancy_flags: discrepancyFlags,
    flavor_descriptor: flavorDescriptor,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the ownership fields for an ACL check.
 * Returns null if the sample is missing or soft-deleted.
 */
export async function loadSampleOwnership(
  serviceClient: ServiceClient,
  sampleId: string,
): Promise<{ client_id: string | null; end_client_id: string | null } | null> {
  const { data, error } = await serviceClient
    .from('samples')
    .select('id, client_id, end_client_id, deleted_at')
    .eq('id', sampleId)
    .maybeSingle()

  if (error || !data) return null

  const row = data as { client_id: string | null; end_client_id: string | null; deleted_at: string | null }
  if (row.deleted_at) return null

  return { client_id: row.client_id, end_client_id: row.end_client_id }
}

/**
 * Aggregate the three data slices for the embed quadrant panel.
 *
 * Mirrors what use-cert-editor.ts does via its three parallel fetches:
 *   1. /api/samples/[id]                    → sample row (with joins)
 *   2. /api/samples/[id]/quality-assessment → quality_assessments row
 *   3. /api/cupping/scores/aggregate        → computed AggregatedScores
 *
 * Returns null when the sample is missing or soft-deleted.
 * The qualityAssessment field is null when no row exists.
 * The cupping field is null when no cupping_scores rows exist for this sample.
 */
export async function aggregateQuadrant(
  serviceClient: ServiceClient,
  sampleId: string,
): Promise<QuadrantPayload | null> {
  // --- 1. Sample (mirrors GET /api/samples/[id]) ---
  // Uses maybeSingle + manual deleted_at check, identical to how the route
  // treats a not-found or soft-deleted sample (returns 404).
  const { data: sampleData } = await serviceClient
    .from('samples')
    .select(`
      *,
      quality_spec:client_qualities(custom_name, quality_code),
      seller:companies!samples_seller_id_fkey(id, name, fantasy_name, country),
      exporter:companies!samples_exporter_id_fkey(id, name, fantasy_name, country),
      importer:companies!samples_importer_id_fkey(id, name, fantasy_name, country),
      roaster:companies!samples_roaster_id_fkey(id, name, fantasy_name, country),
      client:companies!samples_client_id_fkey(id, name, fantasy_name, country, client_types:company_types),
      end_client:companies!samples_end_client_id_fkey(id, name, fantasy_name, country),
      certificate:certificates(id, certificate_number, status, created_at, sample_contract_id),
      sample_recipients(id, client_id, contact_emails, status, comments, sent_at, responded_at, responded_by, created_at, updated_at, client:companies!sample_recipients_client_id_fkey(id, name, fantasy_name, country, email))
    `)
    .eq('id', sampleId)
    .maybeSingle()

  if (!sampleData) return null

  const sample = sampleData as QuadrantSample
  if (sample.deleted_at) return null

  // --- 2. Quality assessment (mirrors GET /api/samples/[id]/quality-assessment) ---
  // Returns null (not an error) when no row exists — mirrors route's 200 with assessment: null.
  const { data: qaData } = await serviceClient
    .from('quality_assessments')
    .select('*')
    .eq('sample_id', sampleId)
    .maybeSingle()

  const qualityAssessment = qaData as QuadrantQualityAssessment | null

  // --- 3. Cupping aggregate (mirrors GET /api/cupping/scores/aggregate) ---
  // The aggregate route filters by the active session's cupper_ids; here we skip
  // that session-scoping because the embed is read-only and has no session concept.
  // We use maybeSingle for a single-row stub but the real table returns multiple
  // rows (one per cupper). The then() form lets the stub work too.
  const { data: cuppingData } = await (serviceClient
    .from('cupping_scores')
    .select(`
      id,
      cupper_id,
      scores,
      defects,
      created_at,
      cva_score,
      protocol,
      sample:samples!cupping_scores_sample_id_fkey(id, tracking_number),
      cupper:profiles!cupping_scores_cupper_id_fkey(id, full_name)
    `)
    .eq('sample_id', sampleId) as any)

  // cuppingData may be null (no scores), a single row (test stub), or an array
  const rawScores: unknown[] = !cuppingData
    ? []
    : Array.isArray(cuppingData)
      ? cuppingData
      : [cuppingData]

  const cupping: QuadrantCupping | null = rawScores.length === 0
    ? null
    : aggregateCuppingScores(
        rawScores as Parameters<typeof aggregateCuppingScores>[0],
        sampleId,
        null, // No master cupper resolution in embed — returns mean-based finalScore
      )

  return { sample, qualityAssessment, cupping }
}
