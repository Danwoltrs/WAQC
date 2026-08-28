/**
 * Certificate data fetcher for PDF generation
 * Aggregates all data needed for a quality certificate
 */

import { createClient } from '@/lib/supabase-server'
import { excludeCvaScores, excludeCvaSessions } from '@/lib/cupping-protocol-scope'
import { getCountryName } from '@/lib/country-flags'
import { labSourceId } from '@/lib/sample-group'
import { fetchSysContractRefs, isRefPinned, resolveRefForDisplay } from '@/lib/contract-ref-sync'
import { loadCvaCertificateInputs } from '@/lib/cupping/load-cva-certificate-inputs'
import {
  buildCvaCuppingData,
  hasPersistedCvaVerdict,
  type CvaVerdictDisplay,
} from '@/lib/cupping/cva-cupping-data'
import type { CvaDescriptorGroups } from '@/lib/cupping/cva-descriptors'

// Type definitions for certificate data
export interface SupplyChainEntity {
  id?: string | null      // Company id — used to dedup importer/roaster reliably
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
  scaleMin?: number  // Min of the rating scale (e.g., 1 for 1-7 scale)
  scaleMax?: number  // Max of the rating scale (e.g., 7 for 1-7 scale)
}

export interface CuppingDefect {
  name: string
  intensity: number | null
  cups_affected?: number | null
}

export interface CuppingData {
  attributes: CuppingAttribute[]
  overallScore: number | null
  comments: string | null
  isSpecialty: boolean
  taints: number | null
  faults: number | null
  taintDetails: CuppingDefect[]  // Detailed taint info for certificate display
  faultDetails: CuppingDefect[]  // Detailed fault info for certificate display
  cleanCup: boolean | null     // Yes/No for clean cup
  uniformCup: boolean | null   // Yes/No for uniform cup
  flavorDescriptor: string | null  // Flavor descriptor (e.g., "Hard", "Soft")
  /**
   * The persisted CVA pass mark + tri-state verdict. Non-null only when this
   * data came from the CVA branch (see getCertificateData) — commodity data,
   * including the old name-heuristic "specialty" certs, always sets this to
   * null. Doubles as the signal certificate-cupping.tsx uses to know it is
   * rendering a CVA lot (e.g. to skip the taint/fault counts CVA has no
   * equivalent for).
   */
  cvaVerdict: CvaVerdictDisplay | null
  /**
   * What the cupper highlighted on the SCA flavour wheel. Non-null only for a
   * CVA lot that actually had something selected; the commodity path has no
   * wheel and always sets this to null.
   */
  cvaDescriptors: CvaDescriptorGroups | null
}

export interface ScreenSizeLimit {
  screen_size: string
  constraint_type: 'minimum' | 'maximum' | 'range' | 'exact'
  min_value?: number
  max_value?: number
}

export interface QualitySpecLimits {
  moisture_min?: number
  moisture_max?: number
  max_quakers?: number
  defect_thresholds_primary?: number
  defect_thresholds_secondary?: number
  defect_thresholds_total?: number
  max_taints?: number
  max_faults?: number
  max_combined_defects?: number
  zero_tolerance_defects?: boolean
  screen_size_constraints?: ScreenSizeLimit[]
}

export interface CertificateData {
  sample: {
    id: string
    /** Set when this row is a contract sibling: the lab unit its grading and cupping live on. */
    lab_source_sample_id: string | null
    tracking_number: string
    origin: string
    origin_display: string
    micro_origin: string | null
    sample_type: string | null
    processing_method: string | null
    quality_name: string | null
    bags: number | null
    bag_type: string | null
    bag_weight_kg: number | null
    bags_quantity_mt: number | null
    equivalent_60kg_bags: number | null
    /** Bulk lots: containers as entered; null on a legacy bulk row (estimate from MT). */
    container_count: number | null
    shipment_month: string | null
    ico_number: string | null
    container_nr: string | null
    exporter_sample_number: string | null
    created_at: string | null
    status: 'approved' | 'rejected' | string | null
    certifications: string[] | null  // RA, FT, Organic, EUDR, FLO
    crop_year: string | null
  }
  supplyChain: {
    supplier: SupplyChainEntity    // Farm/coop (optional)
    exporter: SupplyChainEntity
    shipper: SupplyChainEntity     // Shipping company (if different from exporter)
    importer: SupplyChainEntity
    roaster: SupplyChainEntity
    endClient: SupplyChainEntity
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
  cuppingComments: string | null
  gradingComments: string | null
  certificate: {
    id: string
    certificate_number: string
    issued_date: string
    valid_until: string | null
    status: string | null
    override_comment: string | null
    is_rejected?: boolean | null
  } | null
  qualitySpec: {
    name: string | null
    template_name: string | null
    description: string | null
    is_specialty: boolean
    has_validation: boolean
  } | null
  specLimits: QualitySpecLimits | null
}

/**
 * Resolve the definitive sample status using the certificate's is_rejected flag.
 * The certificate record is authoritative because the override route updates it
 * but the sample update may fail silently due to RLS restrictions.
 */
function resolveStatus(
  sampleStatus: string | null,
  certificate: { is_rejected?: boolean | null } | null,
): 'approved' | 'rejected' | string | null {
  if (certificate?.is_rejected === true) return 'rejected'
  if (certificate?.is_rejected === false) return 'approved'
  return sampleStatus
}

/**
 * Fetch all data needed for certificate generation.
 *
 * A certificate renders from the sample row it points at — one sample, one
 * contract, one certificate. When that row is a contract sibling
 * (`lab_source_sample_id` set) its commercial fields are its own but its
 * grading and cupping live on the lab unit, so every lab-data query below is
 * keyed on `labSourceId(sample)`, never on the row's own id.
 *
 * `_legacyContractId` is the pre-migration `sample_contracts` id and is
 * IGNORED: sub-contracts became sibling rows, so the sample id alone
 * identifies the certificate. The parameter only survives so callers compile
 * until they are cleaned up (plan Task 22).
 *
 * `supabaseClient` lets callers inject their own Supabase client. The PUBLIC
 * PDF route must pass its service-role client: the default cookie-based server
 * client has no session on an unauthenticated request, so RLS returns zero
 * rows and the certificate 500s with "Certificate data not available".
 */
export async function getCertificateData(
  sampleId: string,
  /** @deprecated ignored — see above. */
  _legacyContractId?: string,
  supabaseClient?: import('@supabase/supabase-js').SupabaseClient,
): Promise<CertificateData | null> {
  const supabase = (supabaseClient ?? (await createClient())) as Awaited<
    ReturnType<typeof createClient>
  >

  // Fetch sample with related data.
  // Cast to `any` until generated DB types pick up the certifications column
  // (added in 20260518000000_add_certifications_to_samples.sql).
  const { data: sample, error: sampleError } = await (supabase as any)
    .from('samples')
    .select(`
      id,
      tracking_number,
      origin,
      micro_origin,
      sample_type,
      processing_method,
      quality_name,
      bags,
      bag_count,
      bag_type,
      bag_weight_kg,
      bags_quantity_mt,
      equivalent_60kg_bags,
      shipment_month,
      ico_number,
      container_nr,
      exporter_sample_number,
      created_at,
      status,
      wolthers_contract_nr,
      contract_id,
      exporter_contract_nr,
      roaster_contract_nr,
      buyer_contract_nr,
      seller_contract_nr,
      shipper_contract_nr,
      manual_ref_fields,
      qc_client_contract_nr,
      client_id,
      laboratory_id,
      quality_spec_id,
      exporter_id,
      importer_id,
      roaster_id,
      seller_id,
      end_client_id,
      supplier_type,
      same_seller_shipper,
      importer_is_qc_client,
      end_client_contract_nr,
      supplier_contract_nr,
      supplier,
      crop_year,
      certifications,
      split_numbering,
      lab_source_sample_id,
      contract_ordinal,
      container_count
    `)
    .eq('id', sampleId)
    .single()

  if (sampleError || !sample) {
    console.error('Error fetching sample:', sampleError)
    return null
  }

  // The row whose quality_assessments / cupping_scores / roast_profiles this
  // certificate prints: the sample itself, or the lab unit a sibling points at.
  const labId = labSourceId(sample)

  // Fetch client (now from companies + qc_client_settings)
  let client: any = null
  if (sample.client_id) {
    const { data } = await (supabase as any)
      .from('companies')
      .select(`
        id, name, fantasy_name, logo_url, country,
        company_types, trading_roles,
        qc_settings:qc_client_settings(certificate_config, certificate_validity_months)
      `)
      .eq('id', sample.client_id)
      .single()
    if (data) {
      const settings = Array.isArray(data.qc_settings) ? data.qc_settings[0] : data.qc_settings
      // There is no certificate_validity_enabled column; the flag lives in the
      // certificate_config JSON ({ enabled: boolean }).
      const validityEnabled = settings?.certificate_config?.enabled ?? null
      client = {
        ...data,
        company: data.fantasy_name || data.name,
        client_types: data.company_types ?? [],  // legacy alias
        certificate_validity_enabled: validityEnabled,
        certificate_validity_months: settings?.certificate_validity_months ?? null,
      }
    }
  }

  // Role detection — post-consolidation uses companies.company_types[] and trading_roles[].
  // Legacy names (end_client → final_buyer; importer_buyer → buyer trading_role) are mapped per migration #2.
  const companyTypes: string[] = client?.company_types ?? []
  const tradingRoles: string[] = client?.trading_roles ?? []
  const isEndClient = companyTypes.includes('final_buyer')
  const isImporterClient = tradingRoles.includes('buyer')
  const isRoasterClient = companyTypes.includes('roaster')

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

  // Fetch supply chain entities in parallel — all from companies post-consolidation.
  // Each role-specific FK on samples (exporter_id, importer_id, etc.) points at companies(id).
  // Prefer fantasy_name on the certificate so parties read "Ahold" instead of
  // "Ahold Delhaize Coffee Company B.V." (which crowds/wraps the parties bar).
  // Also pull id so importer/roaster pointing at the same company dedup cleanly.
  const [exporterResult, importerResult, roasterResult, sellerResult, endClientResult] = await Promise.all([
    sample.exporter_id
      ? (supabase as any).from('companies').select('id, name, fantasy_name, country').eq('id', sample.exporter_id).single()
      : Promise.resolve({ data: null }),
    sample.importer_id
      ? (supabase as any).from('companies').select('id, name, fantasy_name, country').eq('id', sample.importer_id).single()
      : Promise.resolve({ data: null }),
    sample.roaster_id
      ? (supabase as any).from('companies').select('id, name, fantasy_name, country').eq('id', sample.roaster_id).single()
      : Promise.resolve({ data: null }),
    sample.seller_id
      ? (supabase as any).from('companies').select('id, name, fantasy_name, country').eq('id', sample.seller_id).single()
      : Promise.resolve({ data: null }),
    sample.end_client_id
      ? (supabase as any)
          .from('companies')
          .select('fantasy_name, name, country')
          .eq('id', sample.end_client_id)
          .single()
          .then(({ data }: any) => ({ data: data ? { ...data, company: data.fantasy_name || data.name } : null }))
      : Promise.resolve({ data: null }),
  ])

  // Fetch quality assessment (green bean, roast data, cup status, resolved defects).
  // Cast to `any` until the generated DB types pick up the new resolved_defects column.
  // Capture error explicitly — if the resolved_defects column is missing (migration
  // not yet applied), the whole SELECT fails silently and the cert falls back to
  // the legacy master-cupper inference chain. Loud-fail so we notice in logs.
  const { data: qualityAssessment, error: qaError } = await (supabase as any)
    .from('quality_assessments')
    .select('green_bean_data, roast_data, clean_cup, uniform_cup, cupping_comments, grading_comments, resolved_defects')
    .eq('sample_id', labId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (qaError && qaError.code !== 'PGRST116') {
    console.error('[cert-data] quality_assessments SELECT failed for', labId, qaError)
  }

  // Fetch roast profile
  const { data: roastProfile } = await supabase
    .from('roast_profiles')
    .select('agtron_score, quaker_count, roast_date, actual_roast_level')
    .eq('sample_id', labId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Fetch cupping session to check for master cupper
  const { data: cuppingSession } = await excludeCvaSessions((supabase as any)
    .from('cupping_sessions')
    .select('id, cupper_ids, master_cupper_id')
    .contains('sample_ids', [labId])
    .in('status', ['setup', 'active', 'review', 'completed']))
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  let masterCupperId: string | null = cuppingSession?.master_cupper_id || null
  const sessionCupperIds: string[] | null = (cuppingSession?.cupper_ids as string[]) || null

  // If no master cupper designated on session, check if any assigned cupper has the profile flag
  if (!masterCupperId && sessionCupperIds && sessionCupperIds.length > 0) {
    const { data: cupperProfiles } = await supabase
      .from('profiles')
      .select('id, is_master_cupper')
      .in('id', sessionCupperIds)
      .eq('is_master_cupper', true)
      .limit(1)
    if (cupperProfiles && cupperProfiles.length > 0) {
      masterCupperId = cupperProfiles[0].id
    }
  }

  // Fetch cupping scores with cupper_id for master cupper filtering
  let cuppingScores = null

  // Commodity rows only. A CVA row's `scores` is a whole CvaAssessment, and
  // its keys would print on the certificate as cupping attributes named
  // `version`, `score`, `u` and `d`.
  let scoreQuery = excludeCvaScores(supabase
    .from('cupping_scores')
    .select(`
      scores,
      notes,
      defects,
      cupper_id
    `)
    .eq('sample_id', labId))
    .order('created_at', { ascending: false })

  // Filter to only assigned cuppers if session exists
  if (sessionCupperIds && sessionCupperIds.length > 0) {
    scoreQuery = scoreQuery.in('cupper_id', sessionCupperIds)
  }

  const { data: allCuppingScores } = await scoreQuery

  if (allCuppingScores && allCuppingScores.length > 0) {
    cuppingScores = allCuppingScores
  }

  // The sample's own certificate. Each contract is its own samples row now,
  // so there is at most one certificate per sample_id; `sample_contract_id`
  // is NULL on every row and is never filtered on.
  const { data: certificate } = await supabase
    .from('certificates')
    .select('id, certificate_number, created_at, status, override_comment, is_rejected')
    .eq('sample_id', sampleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Fetch quality spec and template
  let qualitySpec = null
  let isSpecialty = false
  // The sample's grading PROTOCOL (SCA CVA vs. commodity), from the quality
  // template's own `methodology` column — NOT the `isSpecialty` heuristic
  // below, which only pattern-matches the template's NAME (includes('sca'),
  // includes('coe'), ...) and has nothing to do with which protocol actually
  // graded this lot. Drives the cupping-data branch further down.
  let isCvaMethodology = false
  let cuppingAttributeValidations: Record<string, { min?: number; max?: number }> | undefined
  // Store scale info for each attribute (from template)
  let cuppingAttributeScales: Record<string, { min: number; max: number }> | undefined
  // Store increment per attribute for proper rounding (avoids non-increment scores)
  let cuppingAttributeIncrements: Record<string, number> | undefined
  // Authoritative attribute order, taken from the quality spec template so the certificate
  // matches the cupping page (avoids hardcoded "Sweetness before Finish" reordering bugs).
  let cuppingAttributeOrder: string[] | undefined
  if (sample.quality_spec_id) {
    const { data: spec } = await supabase
      .from('client_qualities')
      .select(`
        custom_name,
        template:quality_templates(
          name,
          description,
          parameters,
          cupping_scale_min,
          cupping_scale_max,
          defect_thresholds_primary,
          defect_thresholds_secondary,
          max_taints_allowed,
          max_faults_allowed,
          screen_size_requirements,
          methodology
        )
      `)
      .eq('id', sample.quality_spec_id)
      .single()

    if (spec) {
      // Template parameters structure from DB:
      // cupping_attributes is an ARRAY of attribute configs
      // Each attribute may have a validation_rule with min_value/max_value
      // and a scale with min/max
      interface CuppingAttributeConfig {
        attribute: string
        validation_rule?: {
          type?: string
          min_value?: number
          max_value?: number
        }
        scale?: {
          min?: number
          max?: number
          type?: string
          increment?: number
        }
      }
      const templateData = spec.template as {
        name?: string
        parameters?: unknown
        cupping_scale_min?: number
        cupping_scale_max?: number
        defect_thresholds_primary?: number | null
        defect_thresholds_secondary?: number | null
        max_taints_allowed?: number | null
        max_faults_allowed?: number | null
        screen_size_requirements?: Record<string, { min_percent?: number; max_percent?: number }> | null
        methodology?: string | null
      }
      interface CertTemplateParameters {
        cupping_attributes?: CuppingAttributeConfig[]
        moisture_min?: number
        moisture_max?: number
        max_quakers?: number
        defect_thresholds_total?: number
        taint_fault_configuration?: {
          rules?: {
            max_taints?: number
            max_faults?: number
            max_combined?: number
            zero_tolerance?: boolean
          }
        }
        screen_size_requirements?: {
          constraints?: Array<{
            screen_size: string
            constraint_type: 'minimum' | 'maximum' | 'range' | 'exact'
            min_value?: number
            max_value?: number
          }>
        }
      }
      const templateParams = templateData?.parameters as CertTemplateParameters | undefined

      // Get default scale from template level (fallback)
      const defaultScaleMin = templateData?.cupping_scale_min ?? 0
      const defaultScaleMax = templateData?.cupping_scale_max ?? 10

      // Convert array-based cupping_attributes with validation_rule to our Record format
      // Also extract scale info for each attribute
      if (templateParams?.cupping_attributes && Array.isArray(templateParams.cupping_attributes)) {
        cuppingAttributeValidations = {}
        cuppingAttributeScales = {}
        cuppingAttributeIncrements = {}
        cuppingAttributeOrder = templateParams.cupping_attributes
          .map(a => a.attribute)
          .filter((a): a is string => typeof a === 'string' && a.length > 0)
        let hasAnyValidation = false
        for (const attr of templateParams.cupping_attributes) {
          // Extract validation rules
          if (attr.validation_rule) {
            const min = attr.validation_rule.min_value
            const max = attr.validation_rule.max_value
            if (min !== undefined || max !== undefined) {
              cuppingAttributeValidations[attr.attribute] = { min, max }
              hasAnyValidation = true
            }
          }
          // Extract scale info (use attribute-level scale if available, otherwise template default)
          // Only for numeric scales (not boolean)
          if (attr.scale?.type !== 'boolean') {
            cuppingAttributeScales[attr.attribute] = {
              min: attr.scale?.min ?? defaultScaleMin,
              max: attr.scale?.max ?? defaultScaleMax,
            }
            // Extract increment for rounding averaged scores
            if (attr.scale?.increment) {
              cuppingAttributeIncrements[attr.attribute] = attr.scale.increment
            }
          }
        }
        // If no attributes have validation rules, clear the object
        if (!hasAnyValidation) {
          cuppingAttributeValidations = undefined
        }
        // If no scale info was found, clear it
        if (Object.keys(cuppingAttributeScales).length === 0) {
          cuppingAttributeScales = undefined
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
      isCvaMethodology = templateData?.methodology === 'cva'
    }
  }

  // Build specLimits from template data
  let specLimits: QualitySpecLimits | null = null
  if (sample.quality_spec_id) {
    // Re-use the template data already fetched above via qualitySpec query
    // We need to re-fetch if spec wasn't found above, but normally it was
    const { data: specForLimits } = await supabase
      .from('client_qualities')
      .select(`
        template:quality_templates(
          parameters,
          defect_thresholds_primary,
          defect_thresholds_secondary,
          max_taints_allowed,
          max_faults_allowed,
          screen_size_requirements
        )
      `)
      .eq('id', sample.quality_spec_id)
      .single()

    if (specForLimits?.template) {
      const tmpl = specForLimits.template as {
        parameters?: Record<string, unknown>
        defect_thresholds_primary?: number | null
        defect_thresholds_secondary?: number | null
        max_taints_allowed?: number | null
        max_faults_allowed?: number | null
        screen_size_requirements?: Record<string, unknown> | null
      }
      const params = tmpl.parameters || {}

      // Build screen size constraints from both legacy and new format
      let screenConstraints: ScreenSizeLimit[] | undefined
      // New format: parameters.screen_size_requirements.constraints
      const paramScreenReqs = params.screen_size_requirements as { constraints?: ScreenSizeLimit[] } | undefined
      if (paramScreenReqs?.constraints && Array.isArray(paramScreenReqs.constraints)) {
        screenConstraints = paramScreenReqs.constraints
      }
      // Legacy format: template.screen_size_requirements as {size: {min_percent, max_percent}}
      if (!screenConstraints && tmpl.screen_size_requirements && typeof tmpl.screen_size_requirements === 'object') {
        const legacy = tmpl.screen_size_requirements as Record<string, { min_percent?: number; max_percent?: number }>
        screenConstraints = Object.entries(legacy).map(([size, req]) => ({
          screen_size: size,
          constraint_type: (req.min_percent !== undefined && req.max_percent !== undefined ? 'range' : req.min_percent !== undefined ? 'minimum' : 'maximum') as ScreenSizeLimit['constraint_type'],
          min_value: req.min_percent,
          max_value: req.max_percent,
        }))
      }

      // Get defect thresholds from parameters.defect_configuration.thresholds (template builder format)
      const defectConfig = params.defect_configuration as { thresholds?: { max_primary?: number; max_secondary?: number; max_total?: number } } | undefined
      const defectThresholds = defectConfig?.thresholds

      // Get taint/fault limits from both template columns and parameters
      const tfRules = (params.taint_fault_configuration as { rules?: { max_taints?: number; max_faults?: number; max_combined?: number; zero_tolerance?: boolean } })?.rules

      specLimits = {
        moisture_min: params.moisture_min as number | undefined,
        moisture_max: params.moisture_max as number | undefined,
        max_quakers: params.max_quakers as number | undefined,
        defect_thresholds_primary: tmpl.defect_thresholds_primary ?? defectThresholds?.max_primary ?? undefined,
        defect_thresholds_secondary: tmpl.defect_thresholds_secondary ?? defectThresholds?.max_secondary ?? undefined,
        defect_thresholds_total: (params.defect_thresholds_total as number | undefined) ?? defectThresholds?.max_total ?? undefined,
        max_taints: tfRules?.max_taints ?? (tmpl.max_taints_allowed ?? undefined),
        max_faults: tfRules?.max_faults ?? (tmpl.max_faults_allowed ?? undefined),
        max_combined_defects: tfRules?.max_combined,
        zero_tolerance_defects: tfRules?.zero_tolerance,
        screen_size_constraints: screenConstraints,
      }

      // If all fields are undefined, set to null (no limits configured)
      const hasAnyLimit = Object.values(specLimits).some(v => v !== undefined)
      if (!hasAnyLimit) {
        specLimits = null
      }
    }
  }

  // Process green bean data
  let greenBeanAnalysis: GreenBeanAnalysis | null = null
  if (qualityAssessment?.green_bean_data) {
    const gbd = qualityAssessment.green_bean_data as Record<string, unknown>
    greenBeanAnalysis = {
      moisture_percentage: typeof gbd.moisture_percentage === 'number' ? gbd.moisture_percentage : null,
      density: typeof gbd.density === 'number' ? gbd.density : null,
      humidity: typeof gbd.humidity === 'number' ? gbd.humidity : null,
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
      agtron_score: typeof roastDataJson?.agtron_score === 'number' ? roastDataJson.agtron_score : null,
      quaker_count: quakerCount,
      roast_date: (roastDataJson?.roast_date as string) || null,
      roast_level: (roastDataJson?.roast_level as string) || null,
      roast_aspect: (roastDataJson?.roast_aspect as string) || null,
    }
  }

  // Process cupping scores
  // When a master cupper exists, use their scores as final (no averaging)
  let cuppingData: CuppingData | null = null
  // Set only when the CVA branch below actually found something to certify
  // with. isCvaMethodology alone is NOT enough to commit to this branch: it
  // reflects the quality template's CURRENT `methodology`, which is an
  // editable column (api/quality-templates/[id]/route.ts), not a one-way
  // migration, and this join takes the template as it reads TODAY with no
  // version pinning. Flipping an existing quality to 'cva' must not blank
  // every commodity certificate already issued under it the next time one is
  // reprinted or re-sent — so a CVA methodology with no PERSISTED CVA VERDICT
  // for THIS sample falls through to the commodity block below instead, which
  // will find that old sample's real, already-cupped commodity rows.
  let cvaCertDataFound = false
  if (isCvaMethodology) {
    // A specialty (SCA CVA) lot has none of the commodity attribute rows the
    // block below reads — excludeCvaScores keeps CVA rows out of that query on
    // purpose (see cupping-protocol-scope.ts). The read itself — which row is
    // authoritative, and the persisted verdict — lives in
    // load-cva-certificate-inputs.ts, characterized against a fake Supabase
    // client; see that file for the session-scoping rule it has to match
    // exactly (Task 9's finalize route), which is the reason it isn't just
    // inlined here.
    const { assessment, verdict } = await loadCvaCertificateInputs(supabase, labId)
    // A PERSISTED VERDICT is the only evidence that the CVA finalize route
    // certified this lot — see hasPersistedCvaVerdict. The assessment blob is
    // not: the journey autosaves one for any lot anyone opened on the
    // specialty table, so committing on it moves a lot that was actually
    // certified on the commodity table (the spec's documented re-cup
    // workaround) onto the CVA rail, where its headline score is null.
    if (hasPersistedCvaVerdict(verdict)) {
      cvaCertDataFound = true
      cuppingData = buildCvaCuppingData({
        assessment,
        cvaScore: verdict.score,
        cleanCup: qualityAssessment?.clean_cup ?? null,
        uniformCup: qualityAssessment?.uniform_cup ?? null,
        cvaMinScore: verdict.minScore,
        cvaPassed: verdict.passed,
      })
    }
  }
  if (!cvaCertDataFound && cuppingScores && cuppingScores.length > 0) {
    const resolvedDefectsForCert = (qualityAssessment as any)?.resolved_defects ?? null
    // Diagnostic: lets us see in server logs which path the cert is taking and
    // catch silent-fallback bugs (e.g. migration not applied → cert defaults to
    // legacy master-cupper inference even though we thought it was fixed).
    if (!resolvedDefectsForCert) {
      console.log(
        '[cert-data] sample', labId,
        '- no resolved_defects (using legacy path). masterCupperId=', masterCupperId,
        'cupperCount=', cuppingScores.length
      )
    }
    cuppingData = processCuppingScores(
      cuppingScores as any,
      isSpecialty,
      cuppingAttributeValidations,
      cuppingAttributeScales,
      qualityAssessment?.clean_cup ?? null,
      qualityAssessment?.uniform_cup ?? null,
      masterCupperId,
      cuppingAttributeIncrements,
      cuppingAttributeOrder,
      resolvedDefectsForCert,
      (qualityAssessment?.green_bean_data as any)?.cup_profile ?? null
    )
    // A master-cupper score override (edited in the cert editor) wins over the
    // session-derived numbers so the typed scores actually print.
    const scoreOverride = (qualityAssessment?.green_bean_data as any)?.cupping_scores
    if (scoreOverride && typeof scoreOverride === 'object' && Object.keys(scoreOverride).length > 0) {
      cuppingData = applyCuppingScoreOverride(cuppingData, scoreOverride)
    }
  }

  // Generate current date for issued_date (used when no certificate record exists yet or as fallback)
  const currentDate = new Date().toISOString()

  // Calculate valid_until only if client has certificate validity enabled
  // Validity starts from the first day of the month following the issue date
  // Use certificate.created_at if available, otherwise use current date
  let validUntil: string | null = null
  if (client?.certificate_validity_enabled) {
    const issueDateStr = certificate?.created_at || currentDate
    const issueDate = new Date(issueDateStr)
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

  // Prefer fantasy_name (short trade name) for every supply-chain party.
  const displayName = (d: { fantasy_name?: string | null; name?: string | null } | null | undefined): string | null =>
    d?.fantasy_name ?? d?.name ?? null

  // Read-through: sys.wolthers is the source of truth for a contract's seller (Ecom)
  // and buyer references. Resolve this sample's linked contract so the cert always
  // shows the CURRENT value even if the stored copy drifted after intake — a pure
  // read, no DB writes, so every viewer (not just editors) sees the right number.
  // A sibling row carries its own contract_id / wolthers_contract_nr, so this is
  // the right contract for every certificate.
  const sysMotherRefs = await fetchSysContractRefs(supabase, {
    contractId: (sample as any).contract_id ?? null,
    contractNumber: sample.wolthers_contract_nr ?? null,
  })
  // ...unless staff corrected a reference by hand here in QC. A pinned field beats the
  // sys value, so the number the editor shows is the number the certificate prints.
  const motherPins = (sample as any).manual_ref_fields as string[] | null

  // Build supplier entity (farm/coop from seller_id)
  // supplier_type indicates "farm" or "coop"
  const supplierEntity: SupplyChainEntity = {
    id: sellerResult.data?.id ?? null,
    name: displayName(sellerResult.data),
    country: sellerResult.data?.country ?? null,
    contract: resolveRefForDisplay(
      sample.seller_contract_nr,
      sysMotherRefs?.seller_reference,
      isRefPinned(motherPins, 'seller_contract_nr'),
    ),
    address: null, // Address not yet in exporters table
  }

  // Build shipper entity
  // If same_seller_shipper is true, shipper is the same as exporter
  // Otherwise, shipper is a separate contract (uses exporter entity with shipper contract)
  const shipperEntity: SupplyChainEntity = sample.same_seller_shipper
    ? {
        id: exporterResult.data?.id ?? null,
        name: displayName(exporterResult.data),
        country: exporterResult.data?.country ?? null,
        contract: sample.shipper_contract_nr || null,
        address: null,
      }
    : {
        // When shipper is different, show exporter entity as shipper
        id: exporterResult.data?.id ?? null,
        name: displayName(exporterResult.data),
        country: exporterResult.data?.country ?? null,
        contract: sample.shipper_contract_nr || null,
        address: null,
      }

  return {
    sample: {
      id: sample.id,
      lab_source_sample_id: sample.lab_source_sample_id ?? null,
      tracking_number: sample.tracking_number,
      origin: sample.origin,
      origin_display: getCountryName(sample.origin),
      micro_origin: sample.micro_origin,
      sample_type: sample.sample_type,
      processing_method: sample.processing_method,
      quality_name: sample.quality_name,
      // bag_count preferred, falling back to legacy `bags`.
      bags: sample.bag_count || sample.bags,
      bag_type: sample.bag_type,
      bag_weight_kg: sample.bag_weight_kg,
      bags_quantity_mt: sample.bags_quantity_mt,
      equivalent_60kg_bags: sample.equivalent_60kg_bags,
      container_count: sample.container_count ?? null,
      shipment_month: sample.shipment_month,
      ico_number: sample.ico_number,
      container_nr: sample.container_nr,
      exporter_sample_number: sample.exporter_sample_number ?? null,
      created_at: sample.created_at,
      // Use certificate's is_rejected flag as authoritative source for status
      // (override route updates certificate but sample update may fail due to RLS)
      status: resolveStatus(sample.status, certificate),
      // Persisted at intake via the quality-step multi-select; null when none.
      // The cert PDF's CertificateQualityDescription handles the null case.
      certifications: sample.certifications ?? null,
      crop_year: sample.crop_year ?? null,
    },
    supplyChain: {
      supplier: supplierEntity,
      exporter: {
        id: exporterResult.data?.id ?? null,
        name: displayName(exporterResult.data),
        country: exporterResult.data?.country ?? null,
        contract: sample.exporter_contract_nr ?? null,
        address: null, // Address not yet in exporters table
      },
      shipper: shipperEntity,
      importer: {
        id: importerResult.data?.id ?? null,
        // Use importer from DB, or fall back to client if they're an importer type or importer_is_qc_client flag is set
        name: displayName(importerResult.data) ?? ((isImporterClient || sample.importer_is_qc_client) ? (client?.fantasy_name ?? client?.company ?? null) : null),
        country: importerResult.data?.country ?? client?.country ?? null,
        contract: resolveRefForDisplay(
          sample.buyer_contract_nr,
          sysMotherRefs?.buyer_reference,
          isRefPinned(motherPins, 'buyer_contract_nr'),
        ),
        address: null, // Address not yet in importers table
      },
      roaster: {
        id: roasterResult.data?.id ?? null,
        // Use roaster from DB, or fall back to client if they're a roaster type
        name: displayName(roasterResult.data) ?? (isRoasterClient ? (client?.fantasy_name ?? client?.company ?? null) : null),
        country: roasterResult.data?.country ?? null,
        contract: sample.roaster_contract_nr ?? null,
        address: null, // Address not yet in roasters table
      },
      endClient: {
        name: endClientResult.data?.fantasy_name ?? endClientResult.data?.company
          ?? (isEndClient ? (client?.fantasy_name ?? client?.company ?? null) : null),
        country: endClientResult.data?.country
          ?? (isEndClient ? (client?.country ?? null) : null),
        contract: sample.end_client_contract_nr ?? null,
        address: null,
      },
      qcClient: {
        // Don't show in supply chain if:
        // - end_client type (they don't import/roast coffee)
        // - importer type with no explicit importer_id (already shown as importer)
        // - roaster type with no explicit roaster_id (already shown as roaster)
        name: (isEndClient || (isImporterClient && !importerResult.data?.name) || (isRoasterClient && !roasterResult.data?.name)) ? null : (client?.fantasy_name ?? client?.company ?? null),
        country: null, // Client table doesn't have country
        contract: (isEndClient || (isImporterClient && !importerResult.data?.name) || (isRoasterClient && !roasterResult.data?.name)) ? null : (sample.qc_client_contract_nr ?? null),
        address: null, // Address not yet in clients table
      },
      wolthersContract: sample.wolthers_contract_nr ?? null,
    },
    client,
    laboratory,
    greenBeanAnalysis,
    roastAnalysis,
    cuppingData,
    cuppingComments: qualityAssessment?.cupping_comments || null,
    gradingComments: qualityAssessment?.grading_comments || null,
    certificate: certificate
      ? {
          id: certificate.id,
          certificate_number: certificate.certificate_number,
          issued_date: certificate.created_at || currentDate,
          valid_until: validUntil,
          status: certificate.status,
          override_comment: certificate.override_comment ?? null,
          is_rejected: certificate.is_rejected ?? null,
        }
      : {
          // Placeholder when no certificate record exists yet (first generation)
          id: '',
          certificate_number: (sample as any).split_numbering ? 'PENDING' : sample.tracking_number,
          issued_date: currentDate,
          valid_until: validUntil,
          status: null,
          override_comment: null,
          is_rejected: null,
        },
    qualitySpec,
    specLimits,
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
 * 4. defect_list format: {defect_list: [{name, count}], primary, secondary, total}
 *    (cert/quality editors — bare primary/secondary are raw, recomputed as weighted here)
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
  // Handle defect_list format: {defect_list: [{name, count}], primary, secondary, total}
  // (written by the certificate / quality editors). The bare primary/secondary here are
  // RAW summed counts, NOT weighted totals — so we recompute weighted totals from the list
  // by name (like the counts format) rather than trusting them.
  else if (Array.isArray(defects.defect_list)) {
    for (const d of defects.defect_list as Array<{ name?: string; count?: number }>) {
      if (d.name && typeof d.count === 'number' && d.count > 0) {
        const name = d.name
        const weight = getDefectWeight(name)
        const weightedCount = d.count * weight
        const isPrimary = PRIMARY_DEFECTS.some(pd => name.toLowerCase().includes(pd.toLowerCase()))
        if (isPrimary) {
          primary.push({ name, rawCount: d.count, weight, weightedCount })
          totalPrimary += weightedCount
        } else {
          secondary.push({ name, rawCount: d.count, weight, weightedCount })
          totalSecondary += weightedCount
        }
      }
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
// Type for cupping attribute scale ranges from quality template
type CuppingAttributeScales = Record<string, { min: number; max: number }>

/**
 * Deduplicate cupping defects (taints/faults) across multiple cuppers.
 * Groups by defect name (case-insensitive). If multiple cuppers scored the same
 * defect at different intensities:
 * - If intensity difference ≤1: use the higher value
 * - If intensity difference >1: use the higher value (master cupper should have resolved)
 * Cups affected are summed across cuppers.
 */
function deduplicateDefects(defects: CuppingDefect[]): CuppingDefect[] {
  if (defects.length === 0) return []

  const grouped = new Map<string, CuppingDefect[]>()
  for (const defect of defects) {
    const key = defect.name.toLowerCase().trim()
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(defect)
  }

  const result: CuppingDefect[] = []
  for (const [, group] of grouped) {
    // Use the display name from the first entry
    const name = group[0].name
    // Collect all non-null intensities
    const intensities = group
      .map(d => d.intensity)
      .filter((i): i is number => i !== null)
    // Use the highest intensity
    const intensity = intensities.length > 0 ? Math.max(...intensities) : null
    // Use max cups affected (cuppers evaluate the same set of cups)
    const cups = group
      .map(d => d.cups_affected)
      .filter((c): c is number => c !== null)
    const cupsAffected = cups.length > 0 ? Math.max(...cups) : null

    result.push({ name, intensity, cups_affected: cupsAffected })
  }

  return result
}

/**
 * Resolve the cup-profile flavor descriptor for a certificate.
 *
 * The override is a master-cupper edit stored in `green_bean_data.cup_profile`:
 *  - a non-empty string wins over the aggregate;
 *  - an *explicit* empty string means the descriptor was intentionally cleared,
 *    so it suppresses the aggregate rather than falling back to it (this is what
 *    lets the cert editor leave the field blank and have it stay blank);
 *  - `null`/`undefined` means "no override" — fall back to the most common
 *    descriptor across cuppers, or `null` when none exist.
 */
export function resolveFlavorDescriptor(
  override: string | null | undefined,
  aggregatedDescriptors: string[],
): string | null {
  if (typeof override === 'string') return override.trim() || null
  if (aggregatedDescriptors.length === 0) return null
  const counts = new Map<string, number>()
  for (const d of aggregatedDescriptors) counts.set(d, (counts.get(d) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

/**
 * Overlay a master-cupper score override (green_bean_data.cupping_scores) onto
 * the cupping data computed from the sessions. Each override value replaces the
 * matching attribute's score verbatim (the number the editor typed is what
 * prints — no re-averaging); an `Overall` key also sets the headline score.
 * Attributes without an override entry are left untouched. Returns a new object.
 */
export function applyCuppingScoreOverride(
  data: CuppingData,
  override: Record<string, unknown> | null | undefined,
): CuppingData {
  if (!override || typeof override !== 'object') return data
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  const attributes = data.attributes.map((a) => {
    const o = num(override[a.name])
    return o == null ? a : { ...a, score: o }
  })
  const overallOverride =
    num(override['Overall']) ?? num(override['Overall Score']) ?? num(override['overall'])
  return {
    ...data,
    attributes,
    overallScore: overallOverride ?? data.overallScore,
  }
}

/**
 * Process cupping scores from multiple cuppers into final certificate data
 * When a master cupper exists, their scores are used as-is (no averaging)
 * Defect cup counts use MAX consolidation (not sum/average)
 */
function processCuppingScores(
  cuppingScores: Array<{ scores: unknown; notes: string | null; defects?: unknown; cupper_id?: string }>,
  isSpecialty: boolean,
  attributeValidations?: CuppingAttributeValidations,
  attributeScales?: CuppingAttributeScales,
  persistedCleanCup?: boolean | null,
  persistedUniformCup?: boolean | null,
  masterCupperId?: string | null,
  attributeIncrements?: Record<string, number>,
  attributeOrder?: string[],
  resolvedDefects?: { taints?: unknown[]; faults?: unknown[] } | null,
  cupProfileOverride?: string | null
): CuppingData {
  // Cast to allow cupper_id access
  const scoresWithCupper = cuppingScores as Array<{ scores: unknown; notes: string | null; defects?: unknown; cupper_id?: string | null }>
  // Collect all scores by attribute
  const attributeScores: Record<string, number[]> = {}
  const allNotes: string[] = []
  const taintsCounts: number[] = []
  const faultsCounts: number[] = []
  const cleanCupScores: number[] = []
  const uniformCupScores: number[] = []
  const flavorDescriptors: string[] = []
  // Collect all taints and faults with details
  const allTaints: CuppingDefect[] = []
  const allFaults: CuppingDefect[] = []

  for (const score of cuppingScores) {
    if (score.notes) {
      allNotes.push(score.notes)
    }

    // Extract taints and faults from defects JSONB
    // Format: { taints: [{name, intensity, cups_affected}], faults: [...] }
    if (score.defects && typeof score.defects === 'object') {
      const defects = score.defects as { taints?: unknown[]; faults?: unknown[] }
      if (Array.isArray(defects.taints)) {
        taintsCounts.push(defects.taints.length)
        // Extract detailed taint info
        for (const t of defects.taints) {
          if (t && typeof t === 'object') {
            const taint = t as { name?: string; intensity?: number; cups_affected?: number }
            if (taint.name) {
              allTaints.push({
                name: taint.name,
                intensity: taint.intensity ?? null,
                cups_affected: taint.cups_affected ?? null,
              })
            }
          }
        }
      }
      if (Array.isArray(defects.faults)) {
        faultsCounts.push(defects.faults.length)
        // Extract detailed fault info
        for (const f of defects.faults) {
          if (f && typeof f === 'object') {
            const fault = f as { name?: string; intensity?: number; cups_affected?: number }
            if (fault.name) {
              allFaults.push({
                name: fault.name,
                intensity: fault.intensity ?? null,
                cups_affected: fault.cups_affected ?? null,
              })
            }
          }
        }
      }
    }

    if (score.scores && typeof score.scores === 'object') {
      const scores = score.scores as Record<string, unknown>
      // Extract flavor descriptor (stored as string)
      if (typeof scores['Flavor_descriptor'] === 'string') {
        flavorDescriptors.push(scores['Flavor_descriptor'])
      }
      for (const [attr, value] of Object.entries(scores)) {
        if (attr === 'Flavor_descriptor') continue
        if (typeof value === 'number') {
          const attrLower = attr.toLowerCase()
          // Skip taints/faults as numeric attributes - we get them from defects JSONB
          if (attrLower === 'taints' || attrLower === 'taint' || attrLower === 'faults' || attrLower === 'fault') {
            continue
          } else if (attrLower === 'clean cup' || attrLower === 'cleancup' || attrLower === 'clean_cup') {
            // Track Clean Cup separately for backward-compat boolean conversion
            // (only used if quality_assessments.clean_cup is null)
            cleanCupScores.push(value)
            // Do NOT add to attributeScores - no longer displayed in chart
          } else if (attrLower === 'uniformity' || attrLower === 'uniform cup' || attrLower === 'uniformcup' || attrLower === 'uniform_cup') {
            // Track Uniform Cup separately for backward-compat boolean conversion
            // (only used if quality_assessments.uniform_cup is null)
            uniformCupScores.push(value)
            // Do NOT add to attributeScores - no longer displayed in chart
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

  // Fallback order for legacy samples that have no quality spec / template attribute list.
  // (Uniformity and Clean Cup removed - now derived from defects, not scored)
  const fallbackOrder = [
    'Fragrance/Aroma',
    'Fragrance',
    'Aroma',
    'Flavor',
    'Aftertaste',
    'Acidity',
    'Body',
    'Balance',
    'Sweetness',
    'Finish',
    'Overall',
  ]

  // Prefer the template-defined order (matches cupping page); fall back to the legacy SCA list.
  const orderSource = attributeOrder && attributeOrder.length > 0 ? attributeOrder : fallbackOrder
  const indexFor = (name: string): number => {
    const lower = name.toLowerCase()
    const exact = orderSource.findIndex(s => s.toLowerCase() === lower)
    if (exact !== -1) return exact
    return orderSource.findIndex(s => lower.includes(s.toLowerCase()) || s.toLowerCase().includes(lower))
  }

  const sortedAttrs = Object.keys(attributeScores).sort((a, b) => {
    const aIndex = indexFor(a)
    const bIndex = indexFor(b)
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

  // If master cupper exists, extract their scores separately
  let masterScoreMap: Record<string, number> | null = null
  if (masterCupperId) {
    const masterEntry = scoresWithCupper.find(s => s.cupper_id === masterCupperId)
    if (masterEntry?.scores && typeof masterEntry.scores === 'object') {
      masterScoreMap = masterEntry.scores as Record<string, number>
    }
  }

  // Helper to round to nearest increment
  const roundToIncrement = (value: number, increment: number): number => {
    return Math.round(value / increment) * increment
  }

  for (const attr of sortedAttrs) {
    const scores = attributeScores[attr]
    let finalValue: number

    // Look up increment for this attribute (case-insensitive)
    let increment: number | undefined
    if (attributeIncrements) {
      increment = attributeIncrements[attr] ??
        Object.entries(attributeIncrements).find(
          ([key]) => key.toLowerCase() === attr.toLowerCase()
        )?.[1]
    }

    if (masterScoreMap) {
      // Master cupper exists: use their score directly (no averaging)
      const masterVal = masterScoreMap[attr]
      if (masterVal !== undefined && masterVal !== null && typeof masterVal === 'number') {
        finalValue = masterVal
      } else {
        // Master cupper didn't score this attribute; fall back to mean, rounded to increment
        finalValue = scores.reduce((a, b) => a + b, 0) / scores.length
        if (increment) {
          finalValue = roundToIncrement(finalValue, increment)
        }
      }
    } else {
      // No master cupper: use mean, rounded to nearest valid increment
      finalValue = scores.reduce((a, b) => a + b, 0) / scores.length
      if (increment) {
        finalValue = roundToIncrement(finalValue, increment)
      }
    }

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

    // Look up scale for this attribute (case-insensitive match)
    let scaleMin: number | undefined
    let scaleMax: number | undefined

    if (attributeScales) {
      const scale = attributeScales[attr] ||
        Object.entries(attributeScales).find(
          ([key]) => key.toLowerCase() === attr.toLowerCase()
        )?.[1]

      if (scale) {
        scaleMin = scale.min
        scaleMax = scale.max
      }
    }

    attributes.push({
      name: attr,
      score: Math.round(finalValue * 100) / 100,
      allowedMin,
      allowedMax,
      scaleMin,
      scaleMax,
    })

    totalScore += finalValue
    scoreCount++
  }

  // For SCA scoring, total is sum of all attributes (usually max ~100)
  // For other methods, it might be an average
  const overallScore = scoreCount > 0 ? Math.round(totalScore * 100) / 100 : null

  // Defect counts are computed after master cupper filtering below

  // Clean Cup and Uniform Cup: prefer persisted values from quality_assessments
  // Fall back to legacy numeric score conversion for backward compat
  let cleanCup: boolean | null = persistedCleanCup ?? null
  if (cleanCup === null && cleanCupScores.length > 0) {
    // Backward compat: old numeric scores (10 = clean, <10 = not clean)
    const avgCleanCup = cleanCupScores.reduce((a, b) => a + b, 0) / cleanCupScores.length
    cleanCup = avgCleanCup >= 10
  }

  let uniformCup: boolean | null = persistedUniformCup ?? null
  if (uniformCup === null && uniformCupScores.length > 0) {
    // Backward compat: old numeric scores
    const avgUniformCup = uniformCupScores.reduce((a, b) => a + b, 0) / uniformCupScores.length
    uniformCup = avgUniformCup >= 10
  }

  // === DEFECT SOURCE OF TRUTH ===
  // If resolvedDefects is present (written by /api/cupping/finalize), it is the
  // authoritative defect list — bypass all the master-cupper inference. This is
  // the fix for the cert-shows-removed-defects bug: the validator's explicit
  // resolution can't be silently undone by session-status filters, master-cupper
  // detection, or cupping_scores row-visibility issues.
  let filteredTaints: CuppingDefect[]
  let filteredFaults: CuppingDefect[]
  let finalTaints: number | null
  let finalFaults: number | null

  if (resolvedDefects && (Array.isArray(resolvedDefects.taints) || Array.isArray(resolvedDefects.faults))) {
    const extract = (arr: unknown[] | undefined): CuppingDefect[] => {
      if (!Array.isArray(arr)) return []
      const out: CuppingDefect[] = []
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue
        const obj = item as { name?: string; intensity?: number; cups_affected?: number }
        if (typeof obj.name === 'string' && obj.name.length > 0) {
          out.push({
            name: obj.name,
            intensity: typeof obj.intensity === 'number' ? obj.intensity : null,
            cups_affected: typeof obj.cups_affected === 'number' ? obj.cups_affected : null,
          })
        }
      }
      return out
    }
    filteredTaints = extract(resolvedDefects.taints)
    filteredFaults = extract(resolvedDefects.faults)
    const uniqTaintNames = new Set(filteredTaints.map(t => t.name))
    const uniqFaultNames = new Set(filteredFaults.map(f => f.name))
    finalTaints = uniqTaintNames.size > 0 ? uniqTaintNames.size : null
    finalFaults = uniqFaultNames.size > 0 ? uniqFaultNames.size : null
  } else {
    // Legacy path (samples finalized before resolved_defects existed): fall back
    // to filtering all cuppers' defects through the master cupper's defect names.
    filteredTaints = allTaints
    filteredFaults = allFaults
    if (masterCupperId) {
      const masterEntry = scoresWithCupper.find(s => s.cupper_id === masterCupperId)
      if (masterEntry) {
        const masterTaintNames = new Set<string>()
        const masterFaultNames = new Set<string>()
        if (masterEntry.defects && typeof masterEntry.defects === 'object') {
          const defects = masterEntry.defects as { taints?: unknown[]; faults?: unknown[] }
          if (Array.isArray(defects.taints)) {
            for (const t of defects.taints) {
              const name = (t && typeof t === 'object') ? (t as any).name : (typeof t === 'string' ? t : null)
              if (name) masterTaintNames.add(name)
            }
          }
          if (Array.isArray(defects.faults)) {
            for (const f of defects.faults) {
              const name = (f && typeof f === 'object') ? (f as any).name : (typeof f === 'string' ? f : null)
              if (name) masterFaultNames.add(name)
            }
          }
        }
        filteredTaints = allTaints.filter(t => masterTaintNames.has(t.name))
        filteredFaults = allFaults.filter(f => masterFaultNames.has(f.name))
      }
    }
    const hasMasterOverride = masterCupperId && scoresWithCupper.find(s => s.cupper_id === masterCupperId)
    const uniqueFilteredTaintNames = new Set(filteredTaints.map(t => t.name))
    const uniqueFilteredFaultNames = new Set(filteredFaults.map(f => f.name))
    finalTaints = hasMasterOverride
      ? (uniqueFilteredTaintNames.size > 0 ? uniqueFilteredTaintNames.size : null)
      : (taintsCounts.length > 0 ? Math.max(...taintsCounts) : null)
    finalFaults = hasMasterOverride
      ? (uniqueFilteredFaultNames.size > 0 ? uniqueFilteredFaultNames.size : null)
      : (faultsCounts.length > 0 ? Math.max(...faultsCounts) : null)
  }

  // Deduplicate taints/faults: group by name, consolidate intensity across entries.
  // For resolved_defects path this is a no-op (already unique by name) but keeps
  // the legacy path working.
  const deduplicatedTaints = deduplicateDefects(filteredTaints)
  const deduplicatedFaults = deduplicateDefects(filteredFaults)

  // Flavor descriptor (cup profile): a master-cupper override wins; otherwise
  // use the most common descriptor across cuppers.
  const flavorDescriptor = resolveFlavorDescriptor(cupProfileOverride, flavorDescriptors)

  return {
    attributes,
    overallScore,
    comments: allNotes.length > 0 ? allNotes.join(' | ') : null,
    isSpecialty,
    taints: finalTaints,
    faults: finalFaults,
    taintDetails: deduplicatedTaints,
    faultDetails: deduplicatedFaults,
    cleanCup,
    uniformCup,
    flavorDescriptor,
    // Never set on the commodity path — see the CuppingData doc comment.
    // A commodity lot is not cupped on the flavour wheel, so it has no
    // descriptors either.
    cvaVerdict: null,
    cvaDescriptors: null,
  }
}
