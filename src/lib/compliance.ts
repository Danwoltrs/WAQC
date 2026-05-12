import { SupabaseClient } from '@supabase/supabase-js'

export interface QualityComplianceResult {
  approved: boolean
  violations: string[]
}

interface QualityTemplateParameters {
  cupping_attributes?: Record<string, { min?: number; max?: number }>
  defect_limits?: Record<string, { max_level?: number }>
  defect_configuration?: {
    thresholds?: {
      max_primary?: number
      max_secondary?: number
      max_total?: number
    }
  }
  screen_sizes?: Record<string, { min_percent?: number; max_percent?: number }>
  taint_fault_configuration?: {
    rules?: {
      max_taints?: number
      max_faults?: number
      max_combined?: number
      zero_tolerance?: boolean
    }
  }
  cup_status_rules?: {
    clean_cup: { max_taints: number; max_faults: number }
    uniform_cup: { max_taints: number; max_faults: number }
  }
  screen_size_requirements?: {
    constraints?: Array<{
      screen_size: string
      constraint_type: 'minimum' | 'maximum' | 'range' | 'exact'
      min_value?: number
      max_value?: number
    }>
  }
  moisture_min?: number
  moisture_max?: number
  max_quakers?: number
}

// Type for cupping attribute config (array format from templates)
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
  }
}

/**
 * Evaluate quality compliance against quality specifications.
 * A sample is REJECTED if ANY of these fail:
 * 1. Cupping attributes - Any attribute below min or above max
 * 2. Defect intensity levels - Any taint/fault exceeds max level
 * 3. Primary defect count - Exceeds threshold
 * 4. Secondary defect count - Exceeds threshold
 * 5. Total defect count - Exceeds threshold (if defined)
 * 6. Screen size distribution - Doesn't meet requirements
 * 7. Moisture limits
 * 8. Quaker count
 * 9. Taint/fault counts
 */
export async function evaluateQualityCompliance(
  supabase: SupabaseClient,
  sampleId: string,
  qualitySpecId: string | null,
  assignedCupperIds?: string[]
): Promise<QualityComplianceResult> {
  const violations: string[] = []

  // If no quality spec, auto-approve (no thresholds to check)
  if (!qualitySpecId) {
    console.log('No quality spec assigned, auto-approving')
    return { approved: true, violations: [] }
  }

  // Fetch quality spec with template
  const { data: qualitySpec, error: specError } = await supabase
    .from('client_qualities')
    .select(`
      id,
      custom_name,
      template:quality_templates(
        id,
        name,
        parameters,
        defect_thresholds_primary,
        defect_thresholds_secondary,
        max_taints_allowed,
        max_faults_allowed,
        screen_size_requirements
      )
    `)
    .eq('id', qualitySpecId)
    .single()

  if (specError || !qualitySpec?.template) {
    console.log('Quality spec or template not found, auto-approving')
    return { approved: true, violations: [] }
  }

  const template = qualitySpec.template as any
  const parameters = template.parameters as QualityTemplateParameters || {}

  // Fetch cupping scores for this sample, filtered to currently assigned cuppers only
  let scoreQuery = supabase
    .from('cupping_scores')
    .select('scores, defects, cupper_id, session_id')
    .eq('sample_id', sampleId)

  if (assignedCupperIds && assignedCupperIds.length > 0) {
    scoreQuery = scoreQuery.in('cupper_id', assignedCupperIds)
  }

  const { data: cuppingScores } = await scoreQuery

  // Fetch grading data (green bean analysis)
  const { data: qualityAssessment } = await supabase
    .from('quality_assessments')
    .select('green_bean_data')
    .eq('sample_id', sampleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Find the master cupper for this sample's session (used across multiple checks)
  let sessionMasterCupperId: string | null = null
  if (cuppingScores && cuppingScores.length > 0) {
    const { data: sampleSession } = await supabase
      .from('cupping_sessions')
      .select('master_cupper_id')
      .contains('sample_ids', [sampleId])
      .in('status', ['setup', 'active', 'review', 'completed', 'finalized'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    sessionMasterCupperId = sampleSession?.master_cupper_id || null
  }

  // 1. Check cupping attributes against thresholds
  if (cuppingScores && cuppingScores.length > 0 && parameters.cupping_attributes) {
    // Get final scores: use master cupper's scores if designated, otherwise mean
    const finalScores: Record<string, number> = {}

    if (sessionMasterCupperId) {
      const masterScore = cuppingScores.find(s => s.cupper_id === sessionMasterCupperId)
      if (masterScore?.scores && typeof masterScore.scores === 'object') {
        for (const [attr, value] of Object.entries(masterScore.scores as Record<string, number>)) {
          if (typeof value === 'number') {
            finalScores[attr] = value
          }
        }
      }
    }

    // Fill in any missing attributes with mean across cuppers
    for (const score of cuppingScores) {
      if (score.scores && typeof score.scores === 'object') {
        for (const [attr, value] of Object.entries(score.scores as Record<string, number>)) {
          if (typeof value === 'number' && finalScores[attr] === undefined) {
            let sum = 0
            let count = 0
            for (const s of cuppingScores) {
              const sv = (s.scores as Record<string, number>)?.[attr]
              if (typeof sv === 'number') { sum += sv; count++ }
            }
            finalScores[attr] = count > 0 ? sum / count : value
          }
        }
      }
    }

    // Build validation map - handle both array and object format
    const validationMap: Record<string, { min?: number; max?: number }> = {}

    if (Array.isArray(parameters.cupping_attributes)) {
      for (const attrConfig of parameters.cupping_attributes as CuppingAttributeConfig[]) {
        if (attrConfig.attribute && attrConfig.validation_rule) {
          validationMap[attrConfig.attribute] = {
            min: attrConfig.validation_rule.min_value,
            max: attrConfig.validation_rule.max_value,
          }
        }
      }
    } else {
      for (const [attr, limits] of Object.entries(parameters.cupping_attributes)) {
        if (limits && typeof limits === 'object') {
          const l = limits as { min?: number; max?: number }
          validationMap[attr] = { min: l.min, max: l.max }
        }
      }
    }

    // Check final scores against thresholds
    for (const [attr, score] of Object.entries(finalScores)) {
      let limits = validationMap[attr]
      if (!limits) {
        const lowerAttr = attr.toLowerCase()
        for (const [key, val] of Object.entries(validationMap)) {
          if (key.toLowerCase() === lowerAttr) {
            limits = val
            break
          }
        }
      }

      if (limits) {
        if (limits.min !== undefined && score < limits.min) {
          violations.push(`${attr}: ${score.toFixed(2)} is below minimum (${limits.min})`)
        }
        if (limits.max !== undefined && score > limits.max) {
          violations.push(`${attr}: ${score.toFixed(2)} is above maximum (${limits.max})`)
        }
      }
    }
  }

  // 2. Check defect intensity levels
  // When master cupper is designated, only check their defects (authoritative override)
  if (cuppingScores && parameters.defect_limits) {
    // Determine which scores to check for defect intensities
    const scoresToCheck = sessionMasterCupperId
      ? cuppingScores.filter(s => s.cupper_id === sessionMasterCupperId)
      : cuppingScores

    for (const score of scoresToCheck) {
      if (score.defects && typeof score.defects === 'object') {
        const defects = score.defects as { taints?: Array<{ name?: string; intensity?: number }>; faults?: Array<{ name?: string; intensity?: number }> }

        if (Array.isArray(defects.taints)) {
          for (const taint of defects.taints) {
            const defectName = taint.name?.toLowerCase()
            if (!defectName) continue
            const defectIntensity = taint.intensity || 0
            const limit = parameters.defect_limits[defectName]
            if (limit?.max_level !== undefined && defectIntensity > limit.max_level) {
              violations.push(`Taint "${taint.name}": Intensity ${defectIntensity} exceeds maximum (${limit.max_level})`)
            }
          }
        }

        if (Array.isArray(defects.faults)) {
          for (const fault of defects.faults) {
            const defectName = fault.name?.toLowerCase()
            if (!defectName) continue
            const defectIntensity = fault.intensity || 0
            const limit = parameters.defect_limits[defectName]
            if (limit?.max_level !== undefined && defectIntensity > limit.max_level) {
              violations.push(`Fault "${fault.name}": Intensity ${defectIntensity} exceeds maximum (${limit.max_level})`)
            }
          }
        }
      }
    }
  }

  // 3, 4, 5. Check defect counts from grading data
  if (qualityAssessment?.green_bean_data) {
    const greenBean = qualityAssessment.green_bean_data as any
    const defects = greenBean.defects

    if (defects) {
      const primaryCount = defects.primary || 0
      const secondaryCount = defects.secondary || 0

      const defectConfig = parameters.defect_configuration as { thresholds?: { max_primary?: number; max_secondary?: number; max_total?: number } } | undefined
      const maxPrimary = template.defect_thresholds_primary ?? defectConfig?.thresholds?.max_primary ?? null
      const maxSecondary = template.defect_thresholds_secondary ?? defectConfig?.thresholds?.max_secondary ?? null
      const maxTotal = (parameters as any).defect_thresholds_total ?? defectConfig?.thresholds?.max_total ?? null

      if (maxPrimary !== null && primaryCount > maxPrimary) {
        violations.push(`Primary defects: ${primaryCount} exceeds limit (${maxPrimary})`)
      }
      if (maxSecondary !== null && secondaryCount > maxSecondary) {
        violations.push(`Secondary defects: ${secondaryCount} exceeds limit (${maxSecondary})`)
      }
      const totalCount = primaryCount + secondaryCount
      if (maxTotal !== null && totalCount > maxTotal) {
        violations.push(`Total defects: ${totalCount} exceeds limit (${maxTotal})`)
      }
    }

    // Convert screen size grams to percentages
    let screenPercentages: Record<string, number> | null = null
    if (greenBean.screen_sizes && typeof greenBean.screen_sizes === 'object') {
      const rawSizes = greenBean.screen_sizes as Record<string, number>
      const totalGrams = Object.values(rawSizes).reduce((sum, g) => sum + (g || 0), 0)
      if (totalGrams > 0) {
        screenPercentages = {}
        for (const [size, grams] of Object.entries(rawSizes)) {
          screenPercentages[size] = (grams / totalGrams) * 100
        }
      }
    }

    // 6. Check screen size distribution (legacy format)
    if (screenPercentages && template.screen_size_requirements) {
      const requirements = template.screen_size_requirements as Record<string, { min_percent?: number; max_percent?: number }>
      for (const [size, req] of Object.entries(requirements)) {
        const actualPercent = screenPercentages[size] || 0
        if (req.min_percent !== undefined && actualPercent < req.min_percent) {
          violations.push(`Screen ${size}: ${actualPercent.toFixed(1)}% is below minimum (${req.min_percent}%)`)
        }
        if (req.max_percent !== undefined && actualPercent > req.max_percent) {
          violations.push(`Screen ${size}: ${actualPercent.toFixed(1)}% exceeds maximum (${req.max_percent}%)`)
        }
      }
    }

    // 6b. Check screen size distribution (constraint-based format)
    if (screenPercentages && parameters.screen_size_requirements?.constraints) {
      for (const constraint of parameters.screen_size_requirements.constraints) {
        const actualPercent = screenPercentages[constraint.screen_size] || 0
        switch (constraint.constraint_type) {
          case 'minimum':
            if (constraint.min_value !== undefined && actualPercent < constraint.min_value) {
              violations.push(`Screen ${constraint.screen_size}: ${actualPercent.toFixed(1)}% is below minimum (${constraint.min_value}%)`)
            }
            break
          case 'maximum':
            if (constraint.max_value !== undefined && actualPercent > constraint.max_value) {
              violations.push(`Screen ${constraint.screen_size}: ${actualPercent.toFixed(1)}% exceeds maximum (${constraint.max_value}%)`)
            }
            break
          case 'range':
            if (constraint.min_value !== undefined && actualPercent < constraint.min_value) {
              violations.push(`Screen ${constraint.screen_size}: ${actualPercent.toFixed(1)}% is below minimum (${constraint.min_value}%)`)
            }
            if (constraint.max_value !== undefined && actualPercent > constraint.max_value) {
              violations.push(`Screen ${constraint.screen_size}: ${actualPercent.toFixed(1)}% exceeds maximum (${constraint.max_value}%)`)
            }
            break
          case 'exact':
            if (constraint.min_value !== undefined && actualPercent !== constraint.min_value) {
              violations.push(`Screen ${constraint.screen_size}: ${actualPercent.toFixed(1)}% does not match expected (${constraint.min_value}%)`)
            }
            break
        }
      }
    }

    // 7. Check moisture limits
    if (greenBean.moisture_percentage !== undefined && greenBean.moisture_percentage !== null) {
      if (parameters.moisture_min !== undefined && greenBean.moisture_percentage < parameters.moisture_min) {
        violations.push(`Moisture: ${greenBean.moisture_percentage}% is below minimum (${parameters.moisture_min}%)`)
      }
      if (parameters.moisture_max !== undefined && greenBean.moisture_percentage > parameters.moisture_max) {
        violations.push(`Moisture: ${greenBean.moisture_percentage}% exceeds maximum (${parameters.moisture_max}%)`)
      }
    }

    // 8. Check quaker count
    if (parameters.max_quakers !== undefined) {
      const quakerCount = greenBean.quakers ?? greenBean.quaker_count ?? 0
      if (quakerCount > parameters.max_quakers) {
        violations.push(`Quakers: ${quakerCount} exceeds maximum (${parameters.max_quakers})`)
      }
    }
  }

  // 9. Check cupping taint/fault counts
  // When master cupper is designated, use only their defects (authoritative override)
  if (cuppingScores && cuppingScores.length > 0) {
    const tfConfig = parameters.taint_fault_configuration
    const tfRules = tfConfig?.rules

    let maxTaints = 0
    let maxFaults = 0

    if (sessionMasterCupperId) {
      // Master cupper override: use only their defects
      const masterScore = cuppingScores.find(s => s.cupper_id === sessionMasterCupperId)
      if (masterScore?.defects && typeof masterScore.defects === 'object') {
        const defects = masterScore.defects as { taints?: unknown[]; faults?: unknown[] }
        maxTaints = Array.isArray(defects.taints) ? defects.taints.length : 0
        maxFaults = Array.isArray(defects.faults) ? defects.faults.length : 0
      }
    } else {
      // No master cupper: MAX consolidation across all cuppers
      for (const score of cuppingScores) {
        if (score.defects && typeof score.defects === 'object') {
          const defects = score.defects as { taints?: unknown[]; faults?: unknown[] }
          if (Array.isArray(defects.taints)) {
            maxTaints = Math.max(maxTaints, defects.taints.length)
          }
          if (Array.isArray(defects.faults)) {
            maxFaults = Math.max(maxFaults, defects.faults.length)
          }
        }
      }
    }

    const avgTaints = maxTaints
    const avgFaults = maxFaults

    const hasConfiguredRules = tfRules && (
      tfRules.zero_tolerance === true ||
      (typeof tfRules.max_taints === 'number') ||
      (typeof tfRules.max_faults === 'number') ||
      (typeof tfRules.max_combined === 'number')
    )

    if (hasConfiguredRules) {
      if (tfRules!.zero_tolerance && (avgTaints > 0 || avgFaults > 0)) {
        violations.push(`Zero tolerance: ${avgTaints} taint(s) and ${avgFaults} fault(s) detected`)
      } else {
        if (typeof tfRules!.max_taints === 'number' && avgTaints > tfRules!.max_taints) {
          violations.push(`Cupping taints: ${avgTaints} exceeds limit (${tfRules!.max_taints})`)
        }
        if (typeof tfRules!.max_faults === 'number' && avgFaults > tfRules!.max_faults) {
          violations.push(`Cupping faults: ${avgFaults} exceeds limit (${tfRules!.max_faults})`)
        }
        if (typeof tfRules!.max_combined === 'number' && (avgTaints + avgFaults) > tfRules!.max_combined) {
          violations.push(`Cupping defects combined: ${avgTaints + avgFaults} exceeds limit (${tfRules!.max_combined})`)
        }
      }
    } else {
      const maxTaintsAllowed = typeof template.max_taints_allowed === 'number' ? template.max_taints_allowed : null
      const maxFaultsAllowed = typeof template.max_faults_allowed === 'number' ? template.max_faults_allowed : null

      if (maxTaintsAllowed !== null && avgTaints > maxTaintsAllowed) {
        violations.push(`Cupping taints: ${avgTaints} exceeds limit (${maxTaintsAllowed})`)
      }
      if (maxFaultsAllowed !== null && avgFaults > maxFaultsAllowed) {
        violations.push(`Cupping faults: ${avgFaults} exceeds limit (${maxFaultsAllowed})`)
      }

      if (maxTaintsAllowed === null && avgTaints > 0) {
        violations.push(`Cupping taints detected: ${avgTaints} (no tolerance configured, rejecting by default)`)
      }
    }
  }

  return {
    approved: violations.length === 0,
    violations
  }
}

/**
 * Check if a quality spec has validation rules (a template with parameters).
 * Used to determine if manual decision should be allowed.
 */
export async function checkHasValidationRules(
  supabase: SupabaseClient,
  qualitySpecId: string | null
): Promise<boolean> {
  if (!qualitySpecId) {
    return false
  }

  const { data: qualitySpec, error } = await supabase
    .from('client_qualities')
    .select(`
      id,
      template:quality_templates(
        id,
        parameters
      )
    `)
    .eq('id', qualitySpecId)
    .single()

  if (error || !qualitySpec?.template) {
    return false
  }

  const template = qualitySpec.template as any
  const parameters = template.parameters

  if (!parameters || typeof parameters !== 'object') {
    return false
  }

  return Boolean(
    parameters.cupping_attributes ||
    parameters.defect_limits ||
    parameters.screen_sizes ||
    parameters.screen_size_requirements?.constraints?.length ||
    parameters.taint_fault_configuration?.rules ||
    parameters.moisture_min !== undefined ||
    parameters.moisture_max !== undefined ||
    parameters.max_quakers !== undefined
  )
}
