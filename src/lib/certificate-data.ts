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
  address: string | null  // Company address (if available)
}

export interface DefectItem {
  name: string
  rawCount: number
  weight: number
  weightedCount: number
}

export interface GreenBeanAnalysis {
  moisture_percentage: number | null
  density: number | null
  humidity: number | null
  green_aspect: string | null
  screen_sizes: Record<string, number> | null
  defects: {
    primary: DefectItem[]
    secondary: DefectItem[]
    total_primary: number
    total_secondary: number
  } | null
}

export interface RoastAnalysis {
  agtron_score: number | null
  quaker_count: number | null
  roast_date: string | null
  roast_level: string | null
  roast_aspect: string | null  // Visual description of roasted beans
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
  taints: number | null
  faults: number | null
  cleanCup: boolean | null     // Yes/No for clean cup
  uniformCup: boolean | null   // Yes/No for uniform cup
}

export interface CertificateData {
  sample: {
    id: string
    tracking_number: string
    origin: string
    origin_display: string
    micro_origin: string | null
    sample_type: string | null
    processing_method: string | null
    bags: number | null
    bag_type: string | null
    bag_weight_kg: number | null
    bags_quantity_mt: number | null
    equivalent_60kg_bags: number | null
    shipment_month: string | null
    ico_number: string | null
    container_nr: string | null
    created_at: string | null
    status: 'approved' | 'rejected' | string | null
    certifications: string[] | null  // RA, FT, Organic, EUDR, FLO
  }
  supplyChain: {
    supplier: SupplyChainEntity    // Farm/coop (optional)
    exporter: SupplyChainEntity
    shipper: SupplyChainEntity     // Shipping company (if different from exporter)
    importer: SupplyChainEntity
    roaster: SupplyChainEntity
    qcClient: SupplyChainEntity
    wolthersContract: string | null
  }
  client: {
    id: string
    name: string
    company: string | null
    fantasy_name: string | null
    logo_url: string | null
    certificate_validity_enabled: boolean | null
    certificate_validity_months: number | null
    client_types: string[] | null
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
    description: string | null
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
      micro_origin,
      sample_type,
      processing_method,
      bags,
      bag_type,
      bag_weight_kg,
      bags_quantity_mt,
      equivalent_60kg_bags,
      shipment_month,
      ico_number,
      container_nr,
      created_at,
      status,
      contract_number,
      exporter_contract_nr,
      roaster_contract_nr,
      buyer_contract_nr,
      seller_contract_nr,
      shipper_contract_nr,
      qc_client_contract_nr,
      client_id,
      laboratory_id,
      quality_spec_id,
      exporter_id,
      importer_id,
      roaster_id,
      seller_id,
      supplier_type,
      same_seller_shipper
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
      .select('id, name, company, fantasy_name, logo_url, certificate_validity_enabled, certificate_validity_months, client_types')
      .eq('id', sample.client_id)
      .single()
    client = data
  }

  // Check if client is an end_client (like Dunkin') - they shouldn't appear in supply chain
  const isEndClient = client?.client_types?.includes('end_client') ?? false

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
  // Seller (supplier/farm/coop) uses seller_id which references exporters table
  const [exporterResult, importerResult, roasterResult, sellerResult] = await Promise.all([
    sample.exporter_id
      ? supabase.from('exporters').select('name, country').eq('id', sample.exporter_id).single()
      : Promise.resolve({ data: null }),
    sample.importer_id
      ? supabase.from('importers').select('name, country').eq('id', sample.importer_id).single()
      : Promise.resolve({ data: null }),
    sample.roaster_id
      ? supabase.from('roasters').select('name, country').eq('id', sample.roaster_id).single()
      : Promise.resolve({ data: null }),
    sample.seller_id
      ? supabase.from('exporters').select('name, country').eq('id', sample.seller_id).single()
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
  // Try multiple approaches: completed sessions, finalized sessions, then any scores
  let cuppingScores = null

  // First try: completed or finalized sessions with inner join
  const { data: finishedScores } = await supabase
    .from('cupping_scores')
    .select(`
      scores,
      notes,
      session:cupping_sessions(
        status,
        session_type
      )
    `)
    .eq('sample_id', sampleId)
    .in('session.status', ['completed', 'finalized'])
    .order('created_at', { ascending: false })

  if (finishedScores && finishedScores.length > 0) {
    cuppingScores = finishedScores
  } else {
    // Second try: any cupping scores for this sample (no session filter)
    const { data: allScores } = await supabase
      .from('cupping_scores')
      .select(`
        scores,
        notes
      `)
      .eq('sample_id', sampleId)
      .order('created_at', { ascending: false })

    if (allScores && allScores.length > 0) {
      cuppingScores = allScores
    }
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
  let cuppingAttributeValidations: Record<string, { min?: number; max?: number }> | undefined
  if (sample.quality_spec_id) {
    const { data: spec } = await supabase
      .from('client_qualities')
      .select(`
        custom_name,
        template:quality_templates(
          name,
          description,
          parameters
        )
      `)
      .eq('id', sample.quality_spec_id)
      .single()

    if (spec) {
      // Template parameters structure from DB:
      // cupping_attributes is an ARRAY of attribute configs
      // Each attribute may have a validation_rule with min_value/max_value
      interface CuppingAttributeConfig {
        attribute: string
        validation_rule?: {
          type?: string
          min_value?: number
          max_value?: number
        }
      }
      const templateParams = (spec.template as { name?: string; parameters?: unknown })?.parameters as {
        cupping_attributes?: CuppingAttributeConfig[]
      } | undefined

      // Convert array-based cupping_attributes with validation_rule to our Record format
      if (templateParams?.cupping_attributes && Array.isArray(templateParams.cupping_attributes)) {
        cuppingAttributeValidations = {}
        let hasAnyValidation = false
        for (const attr of templateParams.cupping_attributes) {
          if (attr.validation_rule) {
            const min = attr.validation_rule.min_value
            const max = attr.validation_rule.max_value
            if (min !== undefined || max !== undefined) {
              cuppingAttributeValidations[attr.attribute] = { min, max }
              hasAnyValidation = true
            }
          }
        }
        // If no attributes have validation rules, clear the object
        if (!hasAnyValidation) {
          cuppingAttributeValidations = undefined
        }
      }

      // Only set has_validation to true if there are actual cupping attribute validations
      const hasCuppingValidation = cuppingAttributeValidations &&
        Object.keys(cuppingAttributeValidations).length > 0

      qualitySpec = {
        name: spec.custom_name,
        template_name: (spec.template as { name?: string })?.name || null,
        description: (spec.template as { description?: string })?.description || null,
        is_specialty: isSpecialtyTemplate((spec.template as { name?: string })?.name),
        has_validation: Boolean(hasCuppingValidation),
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
  // roast_aspect is stored in quality_assessments.roast_data JSONB
  // quakers can be in roast_profiles, roast_data JSONB, or green_bean_data JSONB
  let roastAnalysis: RoastAnalysis | null = null
  const roastDataJson = qualityAssessment?.roast_data as Record<string, unknown> | null
  const greenBeanJson = qualityAssessment?.green_bean_data as Record<string, unknown> | null

  // Get quaker count from multiple possible sources
  const quakerCount = roastProfile?.quaker_count ??
    (roastDataJson?.quaker_count as number | undefined) ??
    (roastDataJson?.quakers as number | undefined) ??
    (greenBeanJson?.quakers as number | undefined) ??
    (greenBeanJson?.quaker_count as number | undefined) ??
    null

  if (roastProfile) {
    roastAnalysis = {
      agtron_score: roastProfile.agtron_score,
      quaker_count: quakerCount,
      roast_date: roastProfile.roast_date,
      roast_level: roastProfile.actual_roast_level,
      roast_aspect: (roastDataJson?.roast_aspect as string) || null,
    }
  } else if (roastDataJson || quakerCount !== null) {
    roastAnalysis = {
      agtron_score: (roastDataJson?.agtron_score as number) || null,
      quaker_count: quakerCount,
      roast_date: (roastDataJson?.roast_date as string) || null,
      roast_level: (roastDataJson?.roast_level as string) || null,
      roast_aspect: (roastDataJson?.roast_aspect as string) || null,
    }
  }

  // Process cupping scores
  let cuppingData: CuppingData | null = null
  if (cuppingScores && cuppingScores.length > 0) {
    cuppingData = processCuppingScores(cuppingScores, isSpecialty, cuppingAttributeValidations)
  }

  // Calculate valid_until only if client has certificate validity enabled
  // Validity starts from the first day of the month following the issue date
  let validUntil: string | null = null
  if (certificate?.created_at && client?.certificate_validity_enabled) {
    const issueDate = new Date(certificate.created_at)
    // Start from first day of next month
    const startDate = new Date(issueDate.getFullYear(), issueDate.getMonth() + 1, 1)
    // Add the configured months (default 6)
    const validityMonths = client.certificate_validity_months || 6
    const validDate = new Date(startDate)
    validDate.setMonth(validDate.getMonth() + validityMonths)
    // Set to last day of that month (subtract 1 day from first of next month)
    validDate.setDate(validDate.getDate() - 1)
    validUntil = validDate.toISOString().split('T')[0]
  }

  // Build supplier entity (farm/coop from seller_id)
  // supplier_type indicates "farm" or "coop"
  const supplierEntity: SupplyChainEntity = {
    name: sellerResult.data?.name ?? null,
    country: sellerResult.data?.country ?? null,
    contract: sample.seller_contract_nr ?? null,
    address: null, // Address not yet in exporters table
  }

  // Build shipper entity
  // If same_seller_shipper is true, shipper is the same as exporter
  // Otherwise, shipper is a separate contract (uses exporter entity with shipper contract)
  const shipperEntity: SupplyChainEntity = sample.same_seller_shipper
    ? {
        name: exporterResult.data?.name ?? null,
        country: exporterResult.data?.country ?? null,
        contract: sample.shipper_contract_nr || null,
        address: null,
      }
    : {
        // When shipper is different, we still use exporter entity but with shipper contract
        // This could be enhanced later with a separate shippers table
        name: sample.shipper_contract_nr ? (exporterResult.data?.name ?? null) : null,
        country: sample.shipper_contract_nr ? (exporterResult.data?.country ?? null) : null,
        contract: sample.shipper_contract_nr || null,
        address: null,
      }

  return {
    sample: {
      id: sample.id,
      tracking_number: sample.tracking_number,
      origin: sample.origin,
      origin_display: getCountryName(sample.origin),
      micro_origin: sample.micro_origin,
      sample_type: sample.sample_type,
      processing_method: sample.processing_method,
      bags: sample.bags,
      bag_type: sample.bag_type,
      bag_weight_kg: sample.bag_weight_kg,
      bags_quantity_mt: sample.bags_quantity_mt,
      equivalent_60kg_bags: sample.equivalent_60kg_bags,
      shipment_month: sample.shipment_month,
      ico_number: sample.ico_number,
      container_nr: sample.container_nr,
      created_at: sample.created_at,
      status: sample.status,
      certifications: null, // Certifications not yet stored on samples
    },
    supplyChain: {
      supplier: supplierEntity,
      exporter: {
        name: exporterResult.data?.name ?? null,
        country: exporterResult.data?.country ?? null,
        contract: sample.exporter_contract_nr ?? null,
        address: null, // Address not yet in exporters table
      },
      shipper: shipperEntity,
      importer: {
        name: importerResult.data?.name ?? null,
        country: importerResult.data?.country ?? null,
        contract: sample.buyer_contract_nr ?? null,
        address: null, // Address not yet in importers table
      },
      roaster: {
        name: roasterResult.data?.name ?? null,
        country: roasterResult.data?.country ?? null,
        contract: sample.roaster_contract_nr ?? null,
        address: null, // Address not yet in roasters table
      },
      qcClient: {
        // Don't show end_client type in supply chain (they don't import/roast coffee)
        name: isEndClient ? null : (client?.fantasy_name ?? client?.company ?? null),
        country: null, // Client table doesn't have country
        contract: isEndClient ? null : (sample.qc_client_contract_nr ?? null),
        address: null, // Address not yet in clients table
      },
      wolthersContract: sample.contract_number ?? null,
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
// Note: Severe Broca is SECONDARY (weight 0.2), not primary
const PRIMARY_DEFECTS = [
  'Full Black', 'Full Sour', 'Pod/Cherry', 'Large Husk',
  'Stone/Stick', 'Foreign Material',
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
 * Returns defects with rawCount, weight, and weightedCount for display
 * Uses pre-calculated totals from data when available
 */
function parseDefects(defectsData: unknown): GreenBeanAnalysis['defects'] {
  if (!defectsData || typeof defectsData !== 'object') return null

  const defects = defectsData as Record<string, unknown>
  const primary: DefectItem[] = []
  const secondary: DefectItem[] = []
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
          primary.push({ name, rawCount, weight, weightedCount })
          if (!hasPreCalcTotals) totalPrimary += weightedCount
        } else {
          secondary.push({ name, rawCount, weight, weightedCount })
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
            primary.push({ name: d.name, rawCount: d.count, weight, weightedCount })
            totalPrimary += weightedCount
          } else {
            secondary.push({ name: d.name, rawCount: d.count, weight, weightedCount })
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
          primary.push({ name: d.name, rawCount: d.count, weight, weightedCount })
          totalPrimary += weightedCount
        }
      }
    }
    if (defects.secondary && Array.isArray(defects.secondary)) {
      for (const d of defects.secondary as Array<{ name?: string; count?: number }>) {
        if (d.name && d.count && d.count > 0) {
          const weight = getDefectWeight(d.name)
          const weightedCount = d.count * weight
          secondary.push({ name: d.name, rawCount: d.count, weight, weightedCount })
          totalSecondary += weightedCount
        }
      }
    }
  }

  if (primary.length === 0 && secondary.length === 0) return null

  // Sort by weighted count descending (highest defects first)
  primary.sort((a, b) => b.weightedCount - a.weightedCount)
  secondary.sort((a, b) => b.weightedCount - a.weightedCount)

  return {
    primary,
    secondary,
    total_primary: totalPrimary,
    total_secondary: totalSecondary,
  }
}

// Type for cupping attribute validation ranges from quality template
type CuppingAttributeValidations = Record<string, { min?: number; max?: number }>

/**
 * Process cupping scores from multiple cuppers into averaged data
 */
function processCuppingScores(
  cuppingScores: Array<{ scores: unknown; notes: string | null }>,
  isSpecialty: boolean,
  attributeValidations?: CuppingAttributeValidations
): CuppingData {
  // Collect all scores by attribute
  const attributeScores: Record<string, number[]> = {}
  const allNotes: string[] = []
  const taintsCounts: number[] = []
  const faultsCounts: number[] = []
  const cleanCupScores: number[] = []
  const uniformCupScores: number[] = []

  for (const score of cuppingScores) {
    if (score.notes) {
      allNotes.push(score.notes)
    }

    if (score.scores && typeof score.scores === 'object') {
      const scores = score.scores as Record<string, unknown>
      for (const [attr, value] of Object.entries(scores)) {
        if (typeof value === 'number') {
          const attrLower = attr.toLowerCase()
          // Check if this is taints or faults count
          if (attrLower === 'taints' || attrLower === 'taint') {
            taintsCounts.push(value)
          } else if (attrLower === 'faults' || attrLower === 'fault') {
            faultsCounts.push(value)
          } else if (attrLower === 'clean cup' || attrLower === 'cleancup' || attrLower === 'clean_cup') {
            // Track Clean Cup separately for boolean conversion
            cleanCupScores.push(value)
            // Also add to attributes for chart display
            if (!attributeScores[attr]) {
              attributeScores[attr] = []
            }
            attributeScores[attr].push(value)
          } else if (attrLower === 'uniformity' || attrLower === 'uniform cup' || attrLower === 'uniformcup' || attrLower === 'uniform_cup') {
            // Track Uniform Cup separately for boolean conversion
            uniformCupScores.push(value)
            // Also add to attributes for chart display
            if (!attributeScores[attr]) {
              attributeScores[attr] = []
            }
            attributeScores[attr].push(value)
          } else {
            if (!attributeScores[attr]) {
              attributeScores[attr] = []
            }
            attributeScores[attr].push(value)
          }
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

    // Look up validation for this attribute (case-insensitive match)
    let allowedMin: number | null = null
    let allowedMax: number | null = null

    if (attributeValidations) {
      // Try exact match first, then case-insensitive match
      const validation = attributeValidations[attr] ||
        Object.entries(attributeValidations).find(
          ([key]) => key.toLowerCase() === attr.toLowerCase()
        )?.[1]

      if (validation) {
        allowedMin = validation.min ?? null
        allowedMax = validation.max ?? null
      }
    }

    attributes.push({
      name: attr,
      score: Math.round(avg * 100) / 100,
      allowedMin,
      allowedMax,
    })

    totalScore += avg
    scoreCount++
  }

  // For SCA scoring, total is sum of all attributes (usually max ~100)
  // For other methods, it might be an average
  const overallScore = scoreCount > 0 ? Math.round(totalScore * 100) / 100 : null

  // Calculate average taints and faults (sum up if multiple cuppers)
  const taints = taintsCounts.length > 0
    ? Math.round(taintsCounts.reduce((a, b) => a + b, 0) / taintsCounts.length * 10) / 10
    : null
  const faults = faultsCounts.length > 0
    ? Math.round(faultsCounts.reduce((a, b) => a + b, 0) / faultsCounts.length * 10) / 10
    : null

  // Convert Clean Cup and Uniform Cup to boolean values
  // In SCA cupping, score of 10 = all cups clean/uniform (true)
  // Score < 10 = at least one cup had issues (false)
  let cleanCup: boolean | null = null
  if (cleanCupScores.length > 0) {
    const avgCleanCup = cleanCupScores.reduce((a, b) => a + b, 0) / cleanCupScores.length
    cleanCup = avgCleanCup >= 10
  }

  let uniformCup: boolean | null = null
  if (uniformCupScores.length > 0) {
    const avgUniformCup = uniformCupScores.reduce((a, b) => a + b, 0) / uniformCupScores.length
    uniformCup = avgUniformCup >= 10
  }

  return {
    attributes,
    overallScore,
    comments: allNotes.length > 0 ? allNotes.join(' | ') : null,
    isSpecialty,
    taints,
    faults,
    cleanCup,
    uniformCup,
  }
}
