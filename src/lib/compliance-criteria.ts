import {
  resolveFinalScores,
  resolveTaintFaultCounts,
  resolveDefectCounts,
  screenGramsToPercent,
  type CuppingScoreRow,
} from '@/lib/quality-resolvers'

/**
 * One thing a lot was judged on.
 *
 * `violation` carries the exact sentence the approval gate has always emitted
 * for this failure. compliance.ts rebuilds its violations[] by collecting them,
 * so the strings stay byte-identical through the extraction — re-deriving them
 * from the structured fields would put a stray space or a toFixed between the
 * gate and its own history.
 *
 * A criterion is usually one sentence, but the gate has always evaluated
 * below-minimum and above-maximum as two independent `if`s (cupping
 * attributes, moisture) — a misconfigured template with min > max fails both
 * at once and has always emitted both sentences. `violations` carries the
 * full ordered list for those sites; `violation` stays the first sentence for
 * every other (single-sentence) criterion.
 */
export interface ComplianceCriterion {
  key: string
  label: string
  sublabel?: string
  actual: number | string
  operator: '>' | '<' | 'outside' | null
  limit: number | string | null
  passed: boolean
  violation?: string
  violations?: string[]
}

export interface QualityTemplateParameters {
  cupping_attributes?:
    | Array<{ attribute: string; validation_rule?: { min_value?: number; max_value?: number } }>
    | Record<string, { min?: number; max?: number }>
  defect_limits?: Record<string, { max_level?: number }>
  defect_configuration?: {
    thresholds?: { max_primary?: number; max_secondary?: number; max_total?: number }
  }
  defect_thresholds_total?: number
  screen_size_requirements?: {
    constraints?: Array<{
      screen_size: string
      constraint_type: 'minimum' | 'maximum' | 'range' | 'exact'
      min_value?: number
      max_value?: number
    }>
  }
  taint_fault_configuration?: {
    rules?: {
      max_taints?: number
      max_faults?: number
      max_combined?: number
      zero_tolerance?: boolean
    }
  }
  moisture_min?: number
  moisture_max?: number
  max_quakers?: number
}

export interface TemplateThresholds {
  defect_thresholds_primary?: number | null
  defect_thresholds_secondary?: number | null
  max_taints_allowed?: number | null
  max_faults_allowed?: number | null
  screen_size_requirements?: Record<string, { min_percent?: number; max_percent?: number }> | null
}

export interface GreenBeanData {
  defects?: unknown
  screen_sizes?: Record<string, number> | null
  moisture_percentage?: number | null
  quakers?: number | null
  quaker_count?: number | null
}

export interface ComplianceInputs {
  parameters: QualityTemplateParameters
  template: TemplateThresholds
  cuppingScores: CuppingScoreRow[]
  masterCupperId: string | null
  greenBean: GreenBeanData | null
}

/**
 * Judge a lot against its quality template.
 *
 * Returns every criterion the template configures, passing and failing alike —
 * the certificate page renders the full list, and the approval gate reads only
 * the failures. Criteria come back in the order the gate has always reported
 * violations, which is what keeps criteriaToViolations byte-identical.
 */
export function evaluateCompliance(inputs: ComplianceInputs): ComplianceCriterion[] {
  const { parameters, template, cuppingScores, masterCupperId, greenBean } = inputs
  const criteria: ComplianceCriterion[] = []

  // 1. Cupping attributes
  if (cuppingScores.length > 0 && parameters.cupping_attributes) {
    const finalScores = resolveFinalScores(cuppingScores, masterCupperId)
    const validationMap: Record<string, { min?: number; max?: number }> = {}

    if (Array.isArray(parameters.cupping_attributes)) {
      for (const config of parameters.cupping_attributes) {
        if (config.attribute && config.validation_rule) {
          validationMap[config.attribute] = {
            min: config.validation_rule.min_value,
            max: config.validation_rule.max_value,
          }
        }
      }
    } else {
      for (const [attr, limits] of Object.entries(parameters.cupping_attributes)) {
        if (limits && typeof limits === 'object') {
          validationMap[attr] = { min: limits.min, max: limits.max }
        }
      }
    }

    for (const [attr, score] of Object.entries(finalScores)) {
      let limits = validationMap[attr]
      if (!limits) {
        const lower = attr.toLowerCase()
        for (const [key, value] of Object.entries(validationMap)) {
          if (key.toLowerCase() === lower) {
            limits = value
            break
          }
        }
      }
      if (!limits) continue

      const belowMin = limits.min !== undefined && score < limits.min
      const aboveMax = limits.max !== undefined && score > limits.max
      const range =
        limits.min !== undefined && limits.max !== undefined
          ? `${limits.min}–${limits.max}`
          : limits.min !== undefined
            ? `min ${limits.min}`
            : `max ${limits.max}`

      // The gate checks below-minimum and above-maximum as two independent
      // ifs, so a template with min > max fails — and reports — both.
      const attrViolations: string[] = []
      if (belowMin) attrViolations.push(`${attr}: ${score.toFixed(2)} is below minimum (${limits.min})`)
      if (aboveMax) attrViolations.push(`${attr}: ${score.toFixed(2)} is above maximum (${limits.max})`)

      criteria.push({
        key: `cupping_${attr}`,
        label: attr,
        sublabel: range,
        actual: Math.round(score * 100) / 100,
        operator: belowMin || aboveMax ? 'outside' : null,
        limit: range,
        passed: !belowMin && !aboveMax,
        violation: attrViolations[0],
        violations: attrViolations.length > 0 ? attrViolations : undefined,
      })
    }
  }

  // 2. Defect intensity levels
  if (cuppingScores.length > 0 && parameters.defect_limits) {
    const scoresToCheck = masterCupperId
      ? cuppingScores.filter(s => s.cupper_id === masterCupperId)
      : cuppingScores

    for (const score of scoresToCheck) {
      if (!score.defects || typeof score.defects !== 'object') continue

      const check = (
        list: Array<{ name?: string; intensity?: number }> | undefined,
        kind: 'Taint' | 'Fault',
      ) => {
        if (!Array.isArray(list)) return
        for (const defect of list) {
          const name = defect.name?.toLowerCase()
          if (!name) continue
          const intensity = defect.intensity || 0
          const limit = parameters.defect_limits?.[name]
          if (limit?.max_level === undefined) continue
          const passed = intensity <= limit.max_level
          criteria.push({
            key: `intensity_${kind.toLowerCase()}_${name}`,
            label: `${kind}: ${defect.name}`,
            sublabel: `max intensity ${limit.max_level}`,
            actual: intensity,
            operator: passed ? null : '>',
            limit: limit.max_level,
            passed,
            violation: passed
              ? undefined
              : `${kind} "${defect.name}": Intensity ${intensity} exceeds maximum (${limit.max_level})`,
          })
        }
      }

      check(score.defects.taints, 'Taint')
      check(score.defects.faults, 'Fault')
    }
  }

  if (greenBean) {
    // 3, 4, 5. Defect counts
    const counts = resolveDefectCounts(greenBean.defects)
    if (counts) {
      const defectConfig = parameters.defect_configuration
      const maxPrimary = template.defect_thresholds_primary ?? defectConfig?.thresholds?.max_primary ?? null
      const maxSecondary = template.defect_thresholds_secondary ?? defectConfig?.thresholds?.max_secondary ?? null
      const maxTotal = parameters.defect_thresholds_total ?? defectConfig?.thresholds?.max_total ?? null

      if (maxPrimary !== null) {
        const passed = counts.primary <= maxPrimary
        criteria.push({
          key: 'primary_defects',
          label: 'Primary defects',
          sublabel: `max ${maxPrimary}`,
          actual: counts.primary,
          operator: passed ? null : '>',
          limit: maxPrimary,
          passed,
          violation: passed ? undefined : `Primary defects: ${counts.primary} exceeds limit (${maxPrimary})`,
        })
      }
      if (maxSecondary !== null) {
        const passed = counts.secondary <= maxSecondary
        criteria.push({
          key: 'secondary_defects',
          label: 'Secondary defects',
          sublabel: `max ${maxSecondary}`,
          actual: counts.secondary,
          operator: passed ? null : '>',
          limit: maxSecondary,
          passed,
          violation: passed ? undefined : `Secondary defects: ${counts.secondary} exceeds limit (${maxSecondary})`,
        })
      }
      if (maxTotal !== null) {
        const passed = counts.total <= maxTotal
        criteria.push({
          key: 'total_defects',
          label: 'Total defects',
          sublabel: `${counts.primary} primary + ${counts.secondary} secondary · max ${maxTotal}`,
          actual: counts.total,
          operator: passed ? null : '>',
          limit: maxTotal,
          passed,
          violation: passed ? undefined : `Total defects: ${counts.total} exceeds limit (${maxTotal})`,
        })
      }
    }

    const screenPercentages = screenGramsToPercent(greenBean.screen_sizes)

    // 6. Screens, legacy template format
    if (screenPercentages && template.screen_size_requirements) {
      for (const [size, req] of Object.entries(template.screen_size_requirements)) {
        const actual = screenPercentages[size] || 0
        if (req.min_percent !== undefined) {
          const passed = actual >= req.min_percent
          criteria.push({
            key: `screen_${size}`,
            label: `Screen ${size}`,
            sublabel: `min ${req.min_percent}%`,
            actual: Math.round(actual * 10) / 10,
            operator: passed ? null : '<',
            limit: req.min_percent,
            passed,
            violation: passed
              ? undefined
              : `Screen ${size}: ${actual.toFixed(1)}% is below minimum (${req.min_percent}%)`,
          })
        }
        if (req.max_percent !== undefined) {
          const passed = actual <= req.max_percent
          criteria.push({
            key: `screen_${size}_max`,
            label: `Screen ${size}`,
            sublabel: `max ${req.max_percent}%`,
            actual: Math.round(actual * 10) / 10,
            operator: passed ? null : '>',
            limit: req.max_percent,
            passed,
            violation: passed
              ? undefined
              : `Screen ${size}: ${actual.toFixed(1)}% exceeds maximum (${req.max_percent}%)`,
          })
        }
      }
    }

    // 6b. Screens, constraint format
    if (screenPercentages && parameters.screen_size_requirements?.constraints) {
      for (const constraint of parameters.screen_size_requirements.constraints) {
        const actual = screenPercentages[constraint.screen_size] || 0
        const size = constraint.screen_size
        const rounded = Math.round(actual * 10) / 10

        const pushMin = (min: number) => {
          const passed = actual >= min
          criteria.push({
            key: `screen_${size}_min`,
            label: `Screen ${size}`,
            sublabel: `min ${min}%`,
            actual: rounded,
            operator: passed ? null : '<',
            limit: min,
            passed,
            violation: passed
              ? undefined
              : `Screen ${size}: ${actual.toFixed(1)}% is below minimum (${min}%)`,
          })
        }
        const pushMax = (max: number) => {
          const passed = actual <= max
          criteria.push({
            key: `screen_${size}_max`,
            label: `Screen ${size}`,
            sublabel: `max ${max}%`,
            actual: rounded,
            operator: passed ? null : '>',
            limit: max,
            passed,
            violation: passed
              ? undefined
              : `Screen ${size}: ${actual.toFixed(1)}% exceeds maximum (${max}%)`,
          })
        }

        switch (constraint.constraint_type) {
          case 'minimum':
            if (constraint.min_value !== undefined) pushMin(constraint.min_value)
            break
          case 'maximum':
            if (constraint.max_value !== undefined) pushMax(constraint.max_value)
            break
          case 'range':
            if (constraint.min_value !== undefined) pushMin(constraint.min_value)
            if (constraint.max_value !== undefined) pushMax(constraint.max_value)
            break
          case 'exact':
            if (constraint.min_value !== undefined) {
              const passed = actual === constraint.min_value
              criteria.push({
                key: `screen_${size}_exact`,
                label: `Screen ${size}`,
                sublabel: `exactly ${constraint.min_value}%`,
                actual: rounded,
                operator: passed ? null : 'outside',
                limit: constraint.min_value,
                passed,
                violation: passed
                  ? undefined
                  : `Screen ${size}: ${actual.toFixed(1)}% does not match expected (${constraint.min_value}%)`,
              })
            }
            break
        }
      }
    }

    // 7. Moisture
    if (greenBean.moisture_percentage !== undefined && greenBean.moisture_percentage !== null) {
      const moisture = greenBean.moisture_percentage
      const { moisture_min: min, moisture_max: max } = parameters
      if (min !== undefined || max !== undefined) {
        const belowMin = min !== undefined && moisture < min
        const aboveMax = max !== undefined && moisture > max
        const band =
          min !== undefined && max !== undefined
            ? `${min}–${max}%`
            : min !== undefined
              ? `min ${min}%`
              : `max ${max}%`

        // Same independent-ifs shape as cupping attributes: min > max fails,
        // and reports, both bounds.
        const moistureViolations: string[] = []
        if (belowMin) moistureViolations.push(`Moisture: ${moisture}% is below minimum (${min}%)`)
        if (aboveMax) moistureViolations.push(`Moisture: ${moisture}% exceeds maximum (${max}%)`)

        criteria.push({
          key: 'moisture',
          label: 'Moisture',
          sublabel: band,
          actual: `${moisture}%`,
          operator: belowMin || aboveMax ? 'outside' : null,
          limit: band,
          passed: !belowMin && !aboveMax,
          violation: moistureViolations[0],
          violations: moistureViolations.length > 0 ? moistureViolations : undefined,
        })
      }
    }

    // 8. Quakers
    if (parameters.max_quakers !== undefined) {
      const quakers = greenBean.quakers ?? greenBean.quaker_count ?? 0
      const passed = quakers <= parameters.max_quakers
      criteria.push({
        key: 'quakers',
        label: 'Quakers',
        sublabel: `max ${parameters.max_quakers}`,
        actual: quakers,
        operator: passed ? null : '>',
        limit: parameters.max_quakers,
        passed,
        violation: passed
          ? undefined
          : `Quakers: ${quakers} exceeds maximum (${parameters.max_quakers})`,
      })
    }
  }

  // 9. Taint and fault counts
  if (cuppingScores.length > 0) {
    const { taints, faults } = resolveTaintFaultCounts(cuppingScores, masterCupperId)
    const rules = parameters.taint_fault_configuration?.rules

    const hasConfiguredRules = Boolean(
      rules &&
        (rules.zero_tolerance === true ||
          typeof rules.max_taints === 'number' ||
          typeof rules.max_faults === 'number' ||
          typeof rules.max_combined === 'number'),
    )

    if (hasConfiguredRules && rules!.zero_tolerance) {
      const passed = taints === 0 && faults === 0
      criteria.push({
        key: 'zero_tolerance',
        label: 'Cup integrity',
        sublabel: 'no taints or faults permitted',
        actual: `${taints} taints, ${faults} faults`,
        operator: passed ? null : '>',
        limit: 0,
        passed,
        violation: passed
          ? undefined
          : `Zero tolerance: ${taints} taint(s) and ${faults} fault(s) detected`,
      })
    } else if (hasConfiguredRules) {
      if (typeof rules!.max_taints === 'number') {
        const passed = taints <= rules!.max_taints
        criteria.push({
          key: 'cupping_taints',
          label: 'Cupping taints',
          sublabel: `max ${rules!.max_taints}`,
          actual: taints,
          operator: passed ? null : '>',
          limit: rules!.max_taints,
          passed,
          violation: passed ? undefined : `Cupping taints: ${taints} exceeds limit (${rules!.max_taints})`,
        })
      }
      if (typeof rules!.max_faults === 'number') {
        const passed = faults <= rules!.max_faults
        criteria.push({
          key: 'cupping_faults',
          label: 'Cupping faults',
          sublabel: `max ${rules!.max_faults}`,
          actual: faults,
          operator: passed ? null : '>',
          limit: rules!.max_faults,
          passed,
          violation: passed ? undefined : `Cupping faults: ${faults} exceeds limit (${rules!.max_faults})`,
        })
      }
      if (typeof rules!.max_combined === 'number') {
        const passed = taints + faults <= rules!.max_combined
        criteria.push({
          key: 'cupping_combined',
          label: 'Cupping defects combined',
          sublabel: `max ${rules!.max_combined}`,
          actual: taints + faults,
          operator: passed ? null : '>',
          limit: rules!.max_combined,
          passed,
          violation: passed
            ? undefined
            : `Cupping defects combined: ${taints + faults} exceeds limit (${rules!.max_combined})`,
        })
      }
    } else {
      const maxTaints = typeof template.max_taints_allowed === 'number' ? template.max_taints_allowed : null
      const maxFaults = typeof template.max_faults_allowed === 'number' ? template.max_faults_allowed : null

      if (maxTaints !== null) {
        const passed = taints <= maxTaints
        criteria.push({
          key: 'cupping_taints',
          label: 'Cupping taints',
          sublabel: `max ${maxTaints}`,
          actual: taints,
          operator: passed ? null : '>',
          limit: maxTaints,
          passed,
          violation: passed ? undefined : `Cupping taints: ${taints} exceeds limit (${maxTaints})`,
        })
      }
      if (maxFaults !== null) {
        const passed = faults <= maxFaults
        criteria.push({
          key: 'cupping_faults',
          label: 'Cupping faults',
          sublabel: `max ${maxFaults}`,
          actual: faults,
          operator: passed ? null : '>',
          limit: maxFaults,
          passed,
          violation: passed ? undefined : `Cupping faults: ${faults} exceeds limit (${maxFaults})`,
        })
      }
      // No tolerance configured anywhere: any taint rejects. The limit is null
      // so the page renders the count without inventing a threshold.
      if (maxTaints === null) {
        const passed = taints === 0
        criteria.push({
          key: 'cupping_taints',
          label: 'Cupping taints',
          sublabel: 'no tolerance configured',
          actual: taints,
          operator: passed ? null : '>',
          limit: null,
          passed,
          violation: passed
            ? undefined
            : `Cupping taints detected: ${taints} (no tolerance configured, rejecting by default)`,
        })
      }
    }
  }

  return criteria
}

/**
 * The approval gate's failure sentences, in their historical order.
 *
 * Most criteria carry exactly one sentence, but a criterion with both bounds
 * misconfigured (min > max) carries two in `violations` — both are emitted,
 * below-minimum before above-maximum, matching the gate's independent ifs.
 */
export function criteriaToViolations(criteria: ComplianceCriterion[]): string[] {
  const result: string[] = []
  for (const c of criteria) {
    if (c.passed) continue
    if (c.violations && c.violations.length > 0) {
      result.push(...c.violations)
    } else if (c.violation) {
      result.push(c.violation)
    }
  }
  return result
}
