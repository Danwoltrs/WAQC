/**
 * Certificate data fetcher for PDF generation
 * Aggregates all data needed for a quality certificate
 */

import { createClient } from '@/lib/supabase-server'
import { getCountryName } from '@/lib/country-flags'

// Type definitions for certificate data
export interface SupplyChainEntity {
  name: string | null
  country: string | null
  contract: string | null
}

export interface GreenBeanAnalysis {
  moisture_percentage: number | null
  density: number | null
  humidity: number | null
  green_aspect: string | null
  screen_sizes: Record<string, number> | null
  defects: {
    primary: Array<{ name: string; count: number }>
    secondary: Array<{ name: string; count: number }>
    total_primary: number
    total_secondary: number
  } | null
}

export interface RoastAnalysis {
  agtron_score: number | null
  quaker_count: number | null
  roast_date: string | null
  roast_level: string | null
}

export interface CuppingAttribute {
  name: string
  score: number
  allowedMin: number | null
  allowedMax: number | null
}

export interface CuppingData {
  attributes: CuppingAttribute[]
  overallScore: number | null
  comments: string | null
  isSpecialty: boolean
}

export interface CertificateData {
  sample: {
    id: string
    tracking_number: string
    origin: string
    origin_display: string
    sample_type: string | null
    processing_method: string | null
    bags: number | null
    bag_weight_kg: number | null
    ico_number: string | null
    container_nr: string | null
    created_at: string | null
    status: 'approved' | 'rejected' | string | null
  }
  supplyChain: {
    exporter: SupplyChainEntity
    importer: SupplyChainEntity
    roaster: SupplyChainEntity
    wolthersContract: string | null
  }
  client: {
    id: string
    name: string
    company: string | null
    fantasy_name: string | null
    logo_url: string | null
  } | null
  laboratory: {
    id: string
    name: string
    location: string | null
    address: string | null
    city: string | null
    state: string | null
    country: string | null
    vat_number: string | null
  } | null
  greenBeanAnalysis: GreenBeanAnalysis | null
  roastAnalysis: RoastAnalysis | null
  cuppingData: CuppingData | null
  certificate: {
    id: string
    certificate_number: string
    issued_date: string
    valid_until: string | null
    status: string | null
  } | null
  qualitySpec: {
    name: string | null
    template_name: string | null
    is_specialty: boolean
    has_validation: boolean
  } | null
}

/**
 * Fetch all data needed for certificate generation
 */
export async function getCertificateData(sampleId: string): Promise<CertificateData | null> {
  const supabase = await createClient()

  // Fetch sample with related data
  const { data: sample, error: sampleError } = await supabase
    .from('samples')
    .select(`
      id,
      tracking_number,
      origin,
      sample_type,
      processing_method,
      bags,
      bag_weight_kg,
      ico_number,
      container_nr,
      created_at,
      status,
      contract_number,
      exporter_contract_nr,
      roaster_contract_nr,
      buyer_contract_nr,
      client_id,
      laboratory_id,
      quality_spec_id,
      exporter_id,
      importer_id,
      roaster_id
    `)
    .eq('id', sampleId)
    .single()

  if (sampleError || !sample) {
    console.error('Error fetching sample:', sampleError)
    return null
  }

  // Fetch client
  let client = null
  if (sample.client_id) {
    const { data } = await supabase
      .from('clients')
      .select('id, name, company, fantasy_name, logo_url')
      .eq('id', sample.client_id)
      .single()
    client = data
  }

  // Fetch laboratory
  let laboratory = null
  if (sample.laboratory_id) {
    const { data } = await supabase
      .from('laboratories')
      .select('id, name, location, address, city, state, country, vat_number')
      .eq('id', sample.laboratory_id)
      .single()
    laboratory = data
  }

  // Fetch supply chain entities in parallel
  const [exporterResult, importerResult, roasterResult] = await Promise.all([
    sample.exporter_id
      ? supabase.from('exporters').select('name, country').eq('id', sample.exporter_id).single()
      : Promise.resolve({ data: null }),
    sample.importer_id
      ? supabase.from('importers').select('name, country').eq('id', sample.importer_id).single()
      : Promise.resolve({ data: null }),
    sample.roaster_id
      ? supabase.from('roasters').select('name, country').eq('id', sample.roaster_id).single()
      : Promise.resolve({ data: null }),
  ])

  // Fetch quality assessment (green bean and roast data)
  const { data: qualityAssessment } = await supabase
    .from('quality_assessments')
    .select('green_bean_data, roast_data')
    .eq('sample_id', sampleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Fetch roast profile
  const { data: roastProfile } = await supabase
    .from('roast_profiles')
    .select('agtron_score, quaker_count, roast_date, actual_roast_level')
    .eq('sample_id', sampleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Fetch cupping scores - average across all cuppers
  // First try to get scores from completed/finalized sessions, then fall back to any scores
  let cuppingScores = null

  // Try completed sessions first
  const { data: completedScores } = await supabase
    .from('cupping_scores')
    .select(`
      scores,
      notes,
      session:cupping_sessions!inner(
        status,
        session_type
      )
    `)
    .eq('sample_id', sampleId)
    .eq('cupping_sessions.status', 'completed')
    .order('created_at', { ascending: false })

  if (completedScores && completedScores.length > 0) {
    cuppingScores = completedScores
  } else {
    // Fall back to any cupping scores for this sample (for certified samples with orphaned sessions)
    const { data: allScores } = await supabase
      .from('cupping_scores')
      .select(`
        scores,
        notes
      `)
      .eq('sample_id', sampleId)
      .order('created_at', { ascending: false })

    cuppingScores = allScores
  }

  // Fetch certificate
  const { data: certificate } = await supabase
    .from('certificates')
    .select('id, certificate_number, created_at, status')
    .eq('sample_id', sampleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Fetch quality spec and template
  let qualitySpec = null
  let isSpecialty = false
  if (sample.quality_spec_id) {
    const { data: spec } = await supabase
      .from('client_qualities')
      .select(`
        custom_name,
        template:quality_templates(
          name,
          parameters
        )
      `)
      .eq('id', sample.quality_spec_id)
      .single()

    if (spec) {
      const templateParams = (spec.template as { name?: string; parameters?: unknown })?.parameters
      const hasValidation = Boolean(templateParams)
      qualitySpec = {
        name: spec.custom_name,
        template_name: (spec.template as { name?: string })?.name || null,
        is_specialty: isSpecialtyTemplate((spec.template as { name?: string })?.name),
        has_validation: hasValidation,
      }
      isSpecialty = qualitySpec.is_specialty
    }
  }

  // Process green bean data
  let greenBeanAnalysis: GreenBeanAnalysis | null = null
  if (qualityAssessment?.green_bean_data) {
    const gbd = qualityAssessment.green_bean_data as Record<string, unknown>
    greenBeanAnalysis = {
      moisture_percentage: (gbd.moisture_percentage as number) || null,
      density: (gbd.density as number) || null,
      humidity: (gbd.humidity as number) || null,
      green_aspect: (gbd.green_aspect as string) || (gbd.aspect as string) || null,
      screen_sizes: (gbd.screen_sizes as Record<string, number>) || null,
      defects: parseDefects(gbd.defects),
    }
  }

  // Process roast data
  let roastAnalysis: RoastAnalysis | null = null
  if (roastProfile) {
    roastAnalysis = {
      agtron_score: roastProfile.agtron_score,
      quaker_count: roastProfile.quaker_count,
      roast_date: roastProfile.roast_date,
      roast_level: roastProfile.actual_roast_level,
    }
  } else if (qualityAssessment?.roast_data) {
    const rd = qualityAssessment.roast_data as Record<string, unknown>
    roastAnalysis = {
      agtron_score: (rd.agtron_score as number) || null,
      quaker_count: (rd.quaker_count as number) || null,
      roast_date: (rd.roast_date as string) || null,
      roast_level: (rd.roast_level as string) || null,
    }
  }

  // Process cupping scores
  let cuppingData: CuppingData | null = null
  if (cuppingScores && cuppingScores.length > 0) {
    cuppingData = processCuppingScores(cuppingScores, isSpecialty)
  }

  // Calculate valid_until (6 months from issue date)
  let validUntil: string | null = null
  if (certificate?.created_at) {
    const issueDate = new Date(certificate.created_at)
    const validDate = new Date(issueDate)
    validDate.setMonth(validDate.getMonth() + 6)
    validUntil = validDate.toISOString().split('T')[0]
  }

  return {
    sample: {
      id: sample.id,
      tracking_number: sample.tracking_number,
      origin: sample.origin,
      origin_display: getCountryName(sample.origin),
      sample_type: sample.sample_type,
      processing_method: sample.processing_method,
      bags: sample.bags,
      bag_weight_kg: sample.bag_weight_kg,
      ico_number: sample.ico_number,
      container_nr: sample.container_nr,
      created_at: sample.created_at,
      status: sample.status,
    },
    supplyChain: {
      exporter: {
        name: exporterResult.data?.name || null,
        country: exporterResult.data?.country || null,
        contract: sample.exporter_contract_nr || null,
      },
      importer: {
        name: importerResult.data?.name || null,
        country: importerResult.data?.country || null,
        contract: sample.buyer_contract_nr || null,
      },
      roaster: {
        name: roasterResult.data?.name || null,
        country: roasterResult.data?.country || null,
        contract: sample.roaster_contract_nr || null,
      },
      wolthersContract: sample.contract_number || null,
    },
    client,
    laboratory,
    greenBeanAnalysis,
    roastAnalysis,
    cuppingData,
    certificate: certificate
      ? {
          id: certificate.id,
          certificate_number: certificate.certificate_number,
          issued_date: certificate.created_at || new Date().toISOString(),
          valid_until: validUntil,
          status: certificate.status,
        }
      : null,
    qualitySpec,
  }
}

/**
 * Check if a quality template is for specialty coffee
 */
function isSpecialtyTemplate(templateName: string | null | undefined): boolean {
  if (!templateName) return false
  const name = templateName.toLowerCase()
  return (
    name.includes('specialty') ||
    name.includes('sca') ||
    name.includes('coe') ||
    name.includes('cup of excellence') ||
    name.includes('q grading')
  )
}

// Primary defects (SCA classification)
const PRIMARY_DEFECTS = [
  'Full Black', 'Full Sour', 'Pod/Cherry', 'Large Husk',
  'Stone/Stick', 'Foreign Material', 'Severe Broca',
  'Dried Cherry', 'Fungus Damage', 'Severe Insect Damage', 'Foreign Matter'
]

// Standard defect weights (SCA/Brazil standard - matches grading page)
// All primary defects have weight 1.0
// Secondary defects have variable weights
const DEFECT_WEIGHTS: Record<string, number> = {
  // Primary (1.0)
  'Full Black': 1.0,
  'Full Sour': 1.0,
  'Pod/Cherry': 1.0,
  'Dried Cherry/Pod': 1.0,
  'Dried Cherry': 1.0,
  'Large Husk': 1.0,
  'Stone/Stick': 1.0,
  'Foreign Material': 1.0,
  'Foreign Matter': 1.0,
  'Fungus Damage': 1.0,
  'Fungus Damaged': 1.0,
  'Severe Insect Damage': 1.0,
  // Secondary (variable)
  'Severe Broca': 0.2,
  'Minor Broca': 0.1,
  'Minor Insect Damage': 0.2,
  'Broken': 0.2,
  'Broken/Chipped': 0.2,
  'Unripe/Immature': 0.2,
  'Immature': 0.2,
  'Immature/Unripe': 0.25,
  'Bad Formed': 0.2,
  'Shells': 0.34,
  'Shell': 0.2,
  'Partial Husk': 0.5,
  'Parchment': 0.2,
  'Hull/Husk': 0.2,
  'Partial Sour': 0.5,
  'Partial Black': 0.5,
  'Floater': 0.2,
  'Withered': 0.2,
}

/**
 * Get weight for a defect name using standard SCA weights
 */
function getDefectWeight(name: string): number {
  // First try exact match
  if (DEFECT_WEIGHTS[name] !== undefined) {
    return DEFECT_WEIGHTS[name]
  }
  // Try case-insensitive match
  const lowerName = name.toLowerCase()
  for (const [key, weight] of Object.entries(DEFECT_WEIGHTS)) {
    if (key.toLowerCase() === lowerName) {
      return weight
    }
  }
  // Default: primary defects get 1.0, secondary get 0.2
  const isPrimary = PRIMARY_DEFECTS.some(pd =>
    name.toLowerCase().includes(pd.toLowerCase())
  )
  return isPrimary ? 1.0 : 0.2
}

/**
 * Parse defects from green bean data
 * Handles multiple formats:
 * 1. counts format: {counts: {defectName: count}, primary: 0, secondary: 19.04}
 * 2. array format: [{name, count, category}]
 * 3. object format: {primary: [...], secondary: [...]}
 *
 * Returns weighted counts (count * weight) for display
 * Uses pre-calculated totals from data when available
 */
function parseDefects(defectsData: unknown): GreenBeanAnalysis['defects'] {
  if (!defectsData || typeof defectsData !== 'object') return null

  const defects = defectsData as Record<string, unknown>
  const primary: Array<{ name: string; count: number }> = []
  const secondary: Array<{ name: string; count: number }> = []
  let totalPrimary = 0
  let totalSecondary = 0

  // Check for pre-calculated totals (from grading page - these are already weighted)
  const hasPreCalcTotals = typeof defects.primary === 'number' && typeof defects.secondary === 'number'

  // Handle counts format: {counts: {defectName: count}, primary: 0, secondary: 19.04}
  if (defects.counts && typeof defects.counts === 'object') {
    const counts = defects.counts as Record<string, number>
    for (const [name, rawCount] of Object.entries(counts)) {
      if (typeof rawCount === 'number' && rawCount > 0) {
        const weight = getDefectWeight(name)
        const weightedCount = rawCount * weight
        const isPrimary = PRIMARY_DEFECTS.some(pd =>
          name.toLowerCase().includes(pd.toLowerCase())
        )
        if (isPrimary) {
          primary.push({ name, count: weightedCount })
          if (!hasPreCalcTotals) totalPrimary += weightedCount
        } else {
          secondary.push({ name, count: weightedCount })
          if (!hasPreCalcTotals) totalSecondary += weightedCount
        }
      }
    }
    // Use pre-calculated totals if available (more accurate)
    if (hasPreCalcTotals) {
      totalPrimary = defects.primary as number
      totalSecondary = defects.secondary as number
    }
  }
  // Handle array format
  else if (Array.isArray(defects)) {
    for (const defect of defects) {
      if (defect && typeof defect === 'object') {
        const d = defect as { name?: string; count?: number; category?: string }
        if (d.name && d.count && d.count > 0) {
          const weight = getDefectWeight(d.name)
          const weightedCount = d.count * weight
          if (d.category === 'primary') {
            primary.push({ name: d.name, count: weightedCount })
            totalPrimary += weightedCount
          } else {
            secondary.push({ name: d.name, count: weightedCount })
            totalSecondary += weightedCount
          }
        }
      }
    }
  }
  // Handle object format with primary/secondary arrays
  else {
    if (defects.primary && Array.isArray(defects.primary)) {
      for (const d of defects.primary as Array<{ name?: string; count?: number }>) {
        if (d.name && d.count && d.count > 0) {
          const weight = getDefectWeight(d.name)
          const weightedCount = d.count * weight
          primary.push({ name: d.name, count: weightedCount })
          totalPrimary += weightedCount
        }
      }
    }
    if (defects.secondary && Array.isArray(defects.secondary)) {
      for (const d of defects.secondary as Array<{ name?: string; count?: number }>) {
        if (d.name && d.count && d.count > 0) {
          const weight = getDefectWeight(d.name)
          const weightedCount = d.count * weight
          secondary.push({ name: d.name, count: weightedCount })
          totalSecondary += weightedCount
        }
      }
    }
  }

  if (primary.length === 0 && secondary.length === 0) return null

  // Sort by weighted count descending (highest defects first)
  primary.sort((a, b) => b.count - a.count)
  secondary.sort((a, b) => b.count - a.count)

  return {
    primary,
    secondary,
    total_primary: totalPrimary,
    total_secondary: totalSecondary,
  }
}

/**
 * Process cupping scores from multiple cuppers into averaged data
 */
function processCuppingScores(
  cuppingScores: Array<{ scores: unknown; notes: string | null }>,
  isSpecialty: boolean
): CuppingData {
  // Collect all scores by attribute
  const attributeScores: Record<string, number[]> = {}
  const allNotes: string[] = []

  for (const score of cuppingScores) {
    if (score.notes) {
      allNotes.push(score.notes)
    }

    if (score.scores && typeof score.scores === 'object') {
      const scores = score.scores as Record<string, number>
      for (const [attr, value] of Object.entries(scores)) {
        if (typeof value === 'number') {
          if (!attributeScores[attr]) {
            attributeScores[attr] = []
          }
          attributeScores[attr].push(value)
        }
      }
    }
  }

  // Calculate averages
  const attributes: CuppingAttribute[] = []
  let totalScore = 0
  let scoreCount = 0

  // Standard SCA cupping attributes in order
  const standardOrder = [
    'Fragrance/Aroma',
    'Fragrance',
    'Aroma',
    'Flavor',
    'Aftertaste',
    'Acidity',
    'Body',
    'Balance',
    'Uniformity',
    'Clean Cup',
    'Sweetness',
    'Overall',
  ]

  // Sort attributes by standard order
  const sortedAttrs = Object.keys(attributeScores).sort((a, b) => {
    const aIndex = standardOrder.findIndex((s) => a.toLowerCase().includes(s.toLowerCase()))
    const bIndex = standardOrder.findIndex((s) => b.toLowerCase().includes(s.toLowerCase()))
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

  for (const attr of sortedAttrs) {
    const scores = attributeScores[attr]
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length

    attributes.push({
      name: attr,
      score: Math.round(avg * 100) / 100,
      allowedMin: 6.0, // Default SCA range
      allowedMax: 10.0,
    })

    totalScore += avg
    scoreCount++
  }

  // For SCA scoring, total is sum of all attributes (usually max ~100)
  // For other methods, it might be an average
  const overallScore = scoreCount > 0 ? Math.round(totalScore * 100) / 100 : null

  return {
    attributes,
    overallScore,
    comments: allNotes.length > 0 ? allNotes.join(' | ') : null,
    isSpecialty,
  }
}
