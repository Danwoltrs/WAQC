/**
 * Simplified Taint and Fault Configuration System
 *
 * Features:
 * - Simple intensity-based classification with numeric ranges
 * - Defects can be taints (mild) at low intensity, faults (severe) at high intensity
 * - Some defects are "always faults" (no taint range)
 * - Deduction formula with configurable multipliers
 */

import { AttributeScaleType, createNumericScale } from './attribute-scales'

/**
 * Category of sensory defect based on intensity
 */
export type TaintFaultCategory = 'taint' | 'fault'

/**
 * Simplified defect definition with intensity ranges
 *
 * A defect can be:
 * - A taint (mild) when intensity is within taint_range
 * - A fault (severe) when intensity is within fault_range
 * - Always a fault if taint_range is null
 */
export interface TaintFaultDefect {
  /** Unique identifier within the template */
  id: string
  /** Display name (e.g., "Fermented", "Earthy", "Quaker") */
  name: string
  /**
   * Taint intensity range (null if this defect is always a fault)
   * Example: { min: 0, max: 2 } means intensity 0-2 = taint
   */
  taint_range: { min: number; max: number } | null
  /**
   * Fault intensity range
   * Example: { min: 3, max: 5 } means intensity 3-5 = fault
   */
  fault_range: { min: number; max: number }
  /** Maximum intensity value (typically 5 or 10) */
  max_intensity: number
  /** Scoring increment step (e.g., 0.25, 0.5, 1). Defaults to 0.5 */
  increment: number
  /** Whether this defect is actively used in QC */
  active: boolean
  /** Display order */
  display_order: number
}

/**
 * Legacy definition for backward compatibility
 * @deprecated Use TaintFaultDefect instead
 */
export interface TaintFaultDefinition {
  id: string
  name: string
  category: TaintFaultCategory
  scale: AttributeScaleType
  description?: string
  display_order: number
}

/**
 * Deduction formula configuration
 * Points deducted = (Cups affected / Total cups) × Intensity × Multiplier
 */
export interface DeductionFormula {
  /** Multiplier for taints (typically 0.5) */
  taint_multiplier: number
  /** Multiplier for faults (typically 2.0) */
  fault_multiplier: number
}

/**
 * Validation rules for taint/fault acceptance criteria
 */
export interface TaintFaultValidationRules {
  /** Maximum number of taints allowed (undefined = no limit) */
  max_taints?: number
  /** Maximum number of faults allowed (undefined = no limit) */
  max_faults?: number
  /** Maximum combined total of taints + faults (undefined = no limit) */
  max_combined?: number
  /** Maximum intensity allowed for any single taint (undefined = no limit) */
  max_taint_intensity?: number
  /** Maximum intensity allowed for any single fault (undefined = no limit) */
  max_fault_intensity?: number
  /** Zero tolerance mode: no taints or faults acceptable */
  zero_tolerance?: boolean
  /** Custom validation message */
  validation_message?: string
}

/**
 * Per-defect spec evaluation result.
 */
export interface DefectSpecEvaluation {
  /** True when the defect's category is categorically disallowed by the spec */
  outOfSpec: boolean
  /** Human-readable reason ('' when in spec) */
  reason: string
}

/**
 * Decide whether a single defect occurrence is out of spec, based purely on its
 * taint/fault classification and the spec's acceptance rules.
 *
 * Acceptance is classification-based, NOT cup-count-based: cup count records
 * spread and feeds the deduction formula, it does not gate pass/fail here.
 * Aggregate count limits (more than `max_taints` distinct taints, etc.) are
 * enforced separately over the full defect list.
 *
 * A defect is out of spec only when its category is categorically disallowed:
 *   - zero_tolerance      → any defect is rejected
 *   - fault & max_faults===0 → faults not allowed
 *   - taint & max_taints===0 → taints not allowed
 */
export function evaluateDefectAgainstRules(
  rules: TaintFaultValidationRules | undefined,
  isTaint: boolean
): DefectSpecEvaluation {
  if (!rules) return { outOfSpec: false, reason: '' }

  if (rules.zero_tolerance === true) {
    return { outOfSpec: true, reason: 'not allowed (zero tolerance)' }
  }

  if (!isTaint && rules.max_faults === 0) {
    return { outOfSpec: true, reason: 'fault-level intensity, no faults allowed' }
  }

  if (isTaint && rules.max_taints === 0) {
    return { outOfSpec: true, reason: 'taints not allowed' }
  }

  return { outOfSpec: false, reason: '' }
}

/**
 * Complete taint/fault configuration for a quality template
 */
export interface TaintFaultConfiguration {
  /** List of defect definitions */
  defects: TaintFaultDefect[]
  /** Deduction formula for score calculation */
  deduction_formula: DeductionFormula
  /** Validation rules */
  rules: TaintFaultValidationRules
  /** Notes about this configuration */
  notes?: string

  // Legacy fields for backward compatibility
  /** @deprecated Use defects array instead */
  taints?: TaintFaultDefinition[]
  /** @deprecated Use defects array instead */
  faults?: TaintFaultDefinition[]
}

/**
 * Predefined template configuration
 */
export interface TaintFaultTemplate {
  id: string
  name: string
  description: string
  configuration: TaintFaultConfiguration
}

/**
 * Create an empty taint/fault configuration
 */
export function createEmptyTaintFaultConfiguration(): TaintFaultConfiguration {
  return {
    defects: [],
    deduction_formula: {
      taint_multiplier: 0.5,
      fault_multiplier: 2.0
    },
    rules: {},
    notes: ''
  }
}

/**
 * Create a new defect with default ranges
 * Default: max_intensity=5, taint range 0-2, fault range 3-5
 */
export function createTaintFaultDefect(
  name: string,
  displayOrder: number = 0,
  options?: {
    maxIntensity?: number
    taintRange?: { min: number; max: number } | null
    faultRange?: { min: number; max: number }
    increment?: number
  }
): TaintFaultDefect {
  const maxIntensity = options?.maxIntensity ?? 5
  const increment = options?.increment ?? 0.5
  const taintRange = options?.taintRange !== undefined
    ? options.taintRange
    : { min: 0, max: 2 }
  const faultRange = options?.faultRange ?? {
    min: taintRange ? Math.round((taintRange.max + increment) * 1000) / 1000 : increment,
    max: maxIntensity
  }

  return {
    id: `defect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    taint_range: taintRange,
    fault_range: faultRange,
    max_intensity: maxIntensity,
    increment,
    active: true,
    display_order: displayOrder
  }
}

/**
 * Legacy: Create a new taint definition with default scale
 * @deprecated Use createTaintFaultDefect instead
 */
export function createTaintDefinition(
  name: string,
  displayOrder: number = 0,
  scale?: AttributeScaleType
): TaintFaultDefinition {
  return {
    id: `taint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    category: 'taint',
    scale: scale || createNumericScale(1, 5, 0.5),
    display_order: displayOrder
  }
}

/**
 * Legacy: Create a new fault definition with default scale
 * @deprecated Use createTaintFaultDefect instead
 */
export function createFaultDefinition(
  name: string,
  displayOrder: number = 0,
  scale?: AttributeScaleType
): TaintFaultDefinition {
  return {
    id: `fault_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    category: 'fault',
    scale: scale || createNumericScale(1, 5, 0.5),
    display_order: displayOrder
  }
}

/**
 * Classify a defect's intensity as taint or fault
 */
export function classifyDefectIntensity(
  defect: TaintFaultDefect,
  intensity: number
): TaintFaultCategory | null {
  // If defect has no taint range, it's always a fault
  if (!defect.taint_range) {
    if (intensity >= defect.fault_range.min && intensity <= defect.fault_range.max) {
      return 'fault'
    }
    return null // Intensity outside valid range
  }

  // Check if intensity falls in taint range
  if (intensity >= defect.taint_range.min && intensity <= defect.taint_range.max) {
    return 'taint'
  }

  // Check if intensity falls in fault range
  if (intensity >= defect.fault_range.min && intensity <= defect.fault_range.max) {
    return 'fault'
  }

  return null // Intensity 0 or outside defined ranges
}

/**
 * Check if a defect is "always a fault" (has no taint range)
 */
export function isAlwaysFault(defect: TaintFaultDefect): boolean {
  return defect.taint_range === null
}

/**
 * Validate taint/fault configuration
 */
export function validateTaintFaultConfiguration(
  config: TaintFaultConfiguration
): { valid: boolean; error?: string } {
  // Use defects array if available, otherwise fall back to legacy taints/faults
  const defects = config.defects || []
  const legacyTaints = config.taints || []
  const legacyFaults = config.faults || []

  // Check for duplicate names in new defects array
  const defectNames = defects.map(d => d.name.toLowerCase())
  const uniqueDefectNames = new Set(defectNames)
  if (defectNames.length !== uniqueDefectNames.size) {
    return { valid: false, error: 'Duplicate defect names found' }
  }

  // Validate each defect's ranges
  for (const defect of defects) {
    // Validate max intensity
    if (defect.max_intensity <= 0) {
      return { valid: false, error: `Defect "${defect.name}": Max intensity must be positive` }
    }

    // Validate taint range (if present)
    if (defect.taint_range) {
      if (defect.taint_range.min < 0 || defect.taint_range.max > defect.max_intensity) {
        return {
          valid: false,
          error: `Defect "${defect.name}": Taint range must be within 0-${defect.max_intensity}`
        }
      }
      if (defect.taint_range.min > defect.taint_range.max) {
        return { valid: false, error: `Defect "${defect.name}": Taint range min cannot exceed max` }
      }
    }

    // Validate fault range
    if (defect.fault_range.min < 0 || defect.fault_range.max > defect.max_intensity) {
      return {
        valid: false,
        error: `Defect "${defect.name}": Fault range must be within 0-${defect.max_intensity}`
      }
    }
    if (defect.fault_range.min > defect.fault_range.max) {
      return { valid: false, error: `Defect "${defect.name}": Fault range min cannot exceed max` }
    }

    // Validate that ranges don't overlap
    if (defect.taint_range) {
      if (defect.taint_range.max >= defect.fault_range.min) {
        return {
          valid: false,
          error: `Defect "${defect.name}": Taint and fault ranges cannot overlap`
        }
      }
    }
  }

  // Legacy validation for backward compatibility
  if (legacyTaints.length > 0 || legacyFaults.length > 0) {
    const { validateScale } = require('./attribute-scales')
    const allLegacyNames = [
      ...legacyTaints.map(t => t.name.toLowerCase()),
      ...legacyFaults.map(f => f.name.toLowerCase())
    ]
    const uniqueLegacyNames = new Set(allLegacyNames)
    if (allLegacyNames.length !== uniqueLegacyNames.size) {
      return { valid: false, error: 'Duplicate taint/fault names found' }
    }

    for (const taint of legacyTaints) {
      const scaleValidation = validateScale(taint.scale)
      if (!scaleValidation.valid) {
        return { valid: false, error: `Taint "${taint.name}": ${scaleValidation.error}` }
      }
    }

    for (const fault of legacyFaults) {
      const scaleValidation = validateScale(fault.scale)
      if (!scaleValidation.valid) {
        return { valid: false, error: `Fault "${fault.name}": ${scaleValidation.error}` }
      }
    }
  }

  // Validate deduction formula
  if (config.deduction_formula) {
    if (config.deduction_formula.taint_multiplier < 0) {
      return { valid: false, error: 'Taint multiplier must be non-negative' }
    }
    if (config.deduction_formula.fault_multiplier < 0) {
      return { valid: false, error: 'Fault multiplier must be non-negative' }
    }
  }

  // Validate rules
  const { rules } = config
  if (rules.max_taints !== undefined && rules.max_taints < 0) {
    return { valid: false, error: 'Max taints must be non-negative' }
  }
  if (rules.max_faults !== undefined && rules.max_faults < 0) {
    return { valid: false, error: 'Max faults must be non-negative' }
  }
  if (rules.max_combined !== undefined && rules.max_combined < 0) {
    return { valid: false, error: 'Max combined must be non-negative' }
  }
  if (rules.max_taint_intensity !== undefined && rules.max_taint_intensity <= 0) {
    return { valid: false, error: 'Max taint intensity must be positive' }
  }
  if (rules.max_fault_intensity !== undefined && rules.max_fault_intensity <= 0) {
    return { valid: false, error: 'Max fault intensity must be positive' }
  }

  // Zero tolerance conflicts with other limits
  if (rules.zero_tolerance && (rules.max_taints || rules.max_faults || rules.max_combined)) {
    return {
      valid: false,
      error: 'Zero tolerance mode conflicts with count limits (set zero tolerance OR count limits, not both)'
    }
  }

  return { valid: true }
}

/**
 * Calculate statistics for a taint/fault configuration
 */
export function calculateTaintFaultStats(config: TaintFaultConfiguration) {
  // Use defects array if available, otherwise use legacy arrays
  const defectCount = config.defects?.length || 0
  const legacyTaintCount = config.taints?.length || 0
  const legacyFaultCount = config.faults?.length || 0

  return {
    total_definitions: defectCount || (legacyTaintCount + legacyFaultCount),
    defect_count: defectCount,
    taint_count: legacyTaintCount, // Legacy
    fault_count: legacyFaultCount, // Legacy
    has_validation_rules: !!(
      config.rules.max_taints ||
      config.rules.max_faults ||
      config.rules.max_combined ||
      config.rules.max_taint_intensity ||
      config.rules.max_fault_intensity ||
      config.rules.zero_tolerance
    ),
    zero_tolerance: config.rules.zero_tolerance || false
  }
}

/**
 * Rules for auto-calculating Clean Cup and Uniform Cup status from defects
 */
export interface CupStatusRules {
  clean_cup: {
    max_taints: number       // e.g. 0 = zero tolerance, 2 = up to 2 taints OK
    max_faults: number       // e.g. 0 = zero tolerance
    max_combined?: number    // optional combined limit
  }
  uniform_cup: {
    max_taints: number
    max_faults: number
    max_combined?: number
  }
}

/**
 * Predefined Cup Status Rules presets
 */
export const CUP_STATUS_RULES_PRESETS: Record<string, { label: string; rules: CupStatusRules }> = {
  'sca-standard': {
    label: 'SCA Standard',
    rules: {
      clean_cup: { max_taints: 0, max_faults: 0 },
      uniform_cup: { max_taints: 0, max_faults: 0 },
    },
  },
  'commercial': {
    label: 'Commercial',
    rules: {
      clean_cup: { max_taints: 2, max_faults: 0 },
      uniform_cup: { max_taints: 1, max_faults: 0 },
    },
  },
  'rio-minas': {
    label: 'Rio Minas',
    rules: {
      clean_cup: { max_taints: 5, max_faults: 2 },
      uniform_cup: { max_taints: 5, max_faults: 2 },
    },
  },
}

/**
 * Predefined Templates
 */

// Client A Custom - Matches the screenshot example
export const CLIENT_A_CUSTOM: TaintFaultTemplate = {
  id: 'client-a-custom',
  name: 'Client A Custom',
  description: 'Custom template with mixed taint/fault ranges and always-fault defects',
  configuration: {
    defects: [
      createTaintFaultDefect('Fermented', 0, { maxIntensity: 5, taintRange: { min: 0, max: 2 }, faultRange: { min: 3, max: 5 } }),
      createTaintFaultDefect('Sour/Acetic', 1, { maxIntensity: 5, taintRange: { min: 0, max: 2 }, faultRange: { min: 3, max: 5 } }),
      createTaintFaultDefect('Green', 2, { maxIntensity: 5, taintRange: { min: 0, max: 2 }, faultRange: { min: 3, max: 5 } }),
      createTaintFaultDefect('Earthy', 3, { maxIntensity: 5, taintRange: { min: 0, max: 3 }, faultRange: { min: 4, max: 5 } }),
      createTaintFaultDefect('Quaker', 4, { maxIntensity: 5, taintRange: null, faultRange: { min: 1, max: 5 } }),
      createTaintFaultDefect('Phenolic', 5, { maxIntensity: 5, taintRange: null, faultRange: { min: 1, max: 5 } }),
      createTaintFaultDefect('Stinker', 6, { maxIntensity: 5, taintRange: null, faultRange: { min: 3, max: 5 } }),
      createTaintFaultDefect('Chemical', 7, { maxIntensity: 5, taintRange: { min: 0, max: 1 }, faultRange: { min: 2, max: 5 } }),
      createTaintFaultDefect('Musty/Moldy', 8, { maxIntensity: 5, taintRange: { min: 0, max: 2 }, faultRange: { min: 3, max: 5 } }),
      createTaintFaultDefect('Woody', 9, { maxIntensity: 5, taintRange: { min: 0, max: 2 }, faultRange: { min: 3, max: 5 } })
    ],
    deduction_formula: {
      taint_multiplier: 0.5,
      fault_multiplier: 2.0
    },
    rules: {},
    notes: 'Example: "Green" defect at intensity 2 = Taint (acceptable), intensity 3 = Fault (reject sample)'
  }
}

// SCA Standard - Specialty Coffee Association standard
export const SCA_STANDARD_TAINTS_FAULTS: TaintFaultTemplate = {
  id: 'sca-standard',
  name: 'SCA Standard',
  description: 'Specialty Coffee Association standard (0-5 scale)',
  configuration: {
    defects: [
      createTaintFaultDefect('Fermented', 0, { maxIntensity: 5, taintRange: { min: 0, max: 2 }, faultRange: { min: 3, max: 5 } }),
      createTaintFaultDefect('Earthy', 1, { maxIntensity: 5, taintRange: { min: 0, max: 2 }, faultRange: { min: 3, max: 5 } }),
      createTaintFaultDefect('Phenolic', 2, { maxIntensity: 5, taintRange: { min: 0, max: 2 }, faultRange: { min: 3, max: 5 } }),
      createTaintFaultDefect('Chemical', 3, { maxIntensity: 5, taintRange: { min: 0, max: 2 }, faultRange: { min: 3, max: 5 } }),
      createTaintFaultDefect('Musty', 4, { maxIntensity: 5, taintRange: { min: 0, max: 2 }, faultRange: { min: 3, max: 5 } }),
      createTaintFaultDefect('Woody', 5, { maxIntensity: 5, taintRange: { min: 0, max: 2 }, faultRange: { min: 3, max: 5 } }),
      createTaintFaultDefect('Rancid', 6, { maxIntensity: 5, taintRange: { min: 0, max: 2 }, faultRange: { min: 3, max: 5 } }),
      createTaintFaultDefect('Moldy', 7, { maxIntensity: 5, taintRange: { min: 0, max: 2 }, faultRange: { min: 3, max: 5 } }),
      createTaintFaultDefect('Sour', 8, { maxIntensity: 5, taintRange: { min: 0, max: 2 }, faultRange: { min: 3, max: 5 } }),
      createTaintFaultDefect('Stinker', 9, { maxIntensity: 5, taintRange: null, faultRange: { min: 1, max: 5 } })
    ],
    deduction_formula: {
      taint_multiplier: 0.5,
      fault_multiplier: 2.0
    },
    rules: {
      max_taints: 2,
      max_faults: 1,
      validation_message: 'SCA standard: Max 2 taints, max 1 fault'
    },
    notes: 'Standard SCA cupping protocol'
  }
}

// Specialty Grade - High quality requirements
export const SPECIALTY_GRADE_TAINTS_FAULTS: TaintFaultTemplate = {
  id: 'specialty-grade',
  name: 'Specialty Grade',
  description: 'Strict requirements for specialty grade coffee with minimal tolerance',
  configuration: {
    defects: [
      createTaintFaultDefect('Fermented', 0, { maxIntensity: 5, taintRange: { min: 0, max: 1 }, faultRange: { min: 2, max: 5 } }),
      createTaintFaultDefect('Earthy', 1, { maxIntensity: 5, taintRange: { min: 0, max: 1 }, faultRange: { min: 2, max: 5 } }),
      createTaintFaultDefect('Musty', 2, { maxIntensity: 5, taintRange: { min: 0, max: 1 }, faultRange: { min: 2, max: 5 } }),
      createTaintFaultDefect('Rancid', 3, { maxIntensity: 5, taintRange: { min: 0, max: 1 }, faultRange: { min: 2, max: 5 } }),
      createTaintFaultDefect('Moldy', 4, { maxIntensity: 5, taintRange: null, faultRange: { min: 1, max: 5 } })
    ],
    deduction_formula: {
      taint_multiplier: 0.5,
      fault_multiplier: 3.0
    },
    rules: {
      max_taints: 1,
      max_faults: 0,
      validation_message: 'Specialty grade: Max 1 light taint, no faults'
    },
    notes: 'High quality specialty coffee with minimal tolerance'
  }
}

// Commercial Grade - More permissive
export const COMMERCIAL_GRADE_TAINTS_FAULTS: TaintFaultTemplate = {
  id: 'commercial-grade',
  name: 'Commercial Grade',
  description: 'Standard commercial coffee with moderate tolerance (0-10 scale)',
  configuration: {
    defects: [
      createTaintFaultDefect('Fermented', 0, { maxIntensity: 10, taintRange: { min: 0, max: 5 }, faultRange: { min: 6, max: 10 } }),
      createTaintFaultDefect('Earthy', 1, { maxIntensity: 10, taintRange: { min: 0, max: 5 }, faultRange: { min: 6, max: 10 } }),
      createTaintFaultDefect('Phenolic', 2, { maxIntensity: 10, taintRange: { min: 0, max: 5 }, faultRange: { min: 6, max: 10 } }),
      createTaintFaultDefect('Woody', 3, { maxIntensity: 10, taintRange: { min: 0, max: 5 }, faultRange: { min: 6, max: 10 } }),
      createTaintFaultDefect('Musty', 4, { maxIntensity: 10, taintRange: { min: 0, max: 5 }, faultRange: { min: 6, max: 10 } }),
      createTaintFaultDefect('Rancid', 5, { maxIntensity: 10, taintRange: { min: 0, max: 5 }, faultRange: { min: 6, max: 10 } }),
      createTaintFaultDefect('Moldy', 6, { maxIntensity: 10, taintRange: { min: 0, max: 5 }, faultRange: { min: 6, max: 10 } }),
      createTaintFaultDefect('Sour', 7, { maxIntensity: 10, taintRange: { min: 0, max: 5 }, faultRange: { min: 6, max: 10 } })
    ],
    deduction_formula: {
      taint_multiplier: 0.3,
      fault_multiplier: 1.5
    },
    rules: {
      max_combined: 5,
      validation_message: 'Commercial grade: Max 5 combined defects'
    },
    notes: 'Standard commercial coffee with moderate tolerance'
  }
}

// Zero Tolerance - Premium quality
export const ZERO_TOLERANCE_TAINTS_FAULTS: TaintFaultTemplate = {
  id: 'zero-tolerance',
  name: 'Zero Tolerance',
  description: 'Premium quality with no taints or faults acceptable',
  configuration: {
    defects: [
      createTaintFaultDefect('Fermented', 0, { maxIntensity: 5, taintRange: null, faultRange: { min: 1, max: 5 } }),
      createTaintFaultDefect('Earthy', 1, { maxIntensity: 5, taintRange: null, faultRange: { min: 1, max: 5 } }),
      createTaintFaultDefect('Phenolic', 2, { maxIntensity: 5, taintRange: null, faultRange: { min: 1, max: 5 } }),
      createTaintFaultDefect('Rancid', 3, { maxIntensity: 5, taintRange: null, faultRange: { min: 1, max: 5 } }),
      createTaintFaultDefect('Moldy', 4, { maxIntensity: 5, taintRange: null, faultRange: { min: 1, max: 5 } })
    ],
    deduction_formula: {
      taint_multiplier: 0.0,
      fault_multiplier: 10.0
    },
    rules: {
      zero_tolerance: true,
      validation_message: 'Zero tolerance: No taints or faults acceptable'
    },
    notes: 'Premium quality coffee with zero tolerance for any sensory defects'
  }
}

// Brazil Traditional - Country-specific
export const BRAZIL_TRADITIONAL_TAINTS_FAULTS: TaintFaultTemplate = {
  id: 'brazil-traditional',
  name: 'Brazil Traditional',
  description: 'Traditional Brazilian classification (0-10 scale)',
  configuration: {
    defects: [
      createTaintFaultDefect('Harsh', 0, { maxIntensity: 10, taintRange: { min: 0, max: 3 }, faultRange: { min: 4, max: 10 } }),
      createTaintFaultDefect('Grassy/green', 1, { maxIntensity: 10, taintRange: { min: 0, max: 3 }, faultRange: { min: 4, max: 10 } }),
      createTaintFaultDefect('Woody', 2, { maxIntensity: 10, taintRange: { min: 0, max: 3 }, faultRange: { min: 4, max: 10 } }),
      createTaintFaultDefect('Past crop', 3, { maxIntensity: 10, taintRange: { min: 0, max: 3 }, faultRange: { min: 4, max: 10 } }),
      createTaintFaultDefect('Fruity', 4, { maxIntensity: 10, taintRange: { min: 0, max: 3 }, faultRange: { min: 4, max: 10 } }),
      createTaintFaultDefect('Dirty', 5, { maxIntensity: 10, taintRange: { min: 0, max: 3 }, faultRange: { min: 4, max: 10 } }),
      createTaintFaultDefect('Hard (riado)', 6, { maxIntensity: 10, taintRange: { min: 0, max: 3 }, faultRange: { min: 4, max: 10 } }),
      createTaintFaultDefect('Phenol (rio)', 7, { maxIntensity: 10, taintRange: null, faultRange: { min: 1, max: 10 } }),
      createTaintFaultDefect('Fermented', 8, { maxIntensity: 10, taintRange: { min: 0, max: 3 }, faultRange: { min: 4, max: 10 } }),
      createTaintFaultDefect('Earthy', 9, { maxIntensity: 10, taintRange: { min: 0, max: 3 }, faultRange: { min: 4, max: 10 } }),
      createTaintFaultDefect('Moldy', 10, { maxIntensity: 10, taintRange: { min: 0, max: 3 }, faultRange: { min: 4, max: 10 } })
    ],
    deduction_formula: {
      taint_multiplier: 0.5,
      fault_multiplier: 2.0
    },
    rules: {
      max_taints: 2,
      max_faults: 1,
      validation_message: 'Brazil traditional: Max 2 taints, max 1 fault'
    },
    notes: 'Traditional Brazilian coffee classification'
  }
}

/**
 * List of all predefined templates
 */
export const PREDEFINED_TAINT_FAULT_TEMPLATES: TaintFaultTemplate[] = [
  CLIENT_A_CUSTOM,
  SCA_STANDARD_TAINTS_FAULTS,
  SPECIALTY_GRADE_TAINTS_FAULTS,
  COMMERCIAL_GRADE_TAINTS_FAULTS,
  ZERO_TOLERANCE_TAINTS_FAULTS,
  BRAZIL_TRADITIONAL_TAINTS_FAULTS
]

/**
 * Get template by ID
 */
export function getTaintFaultTemplate(id: string): TaintFaultTemplate | undefined {
  return PREDEFINED_TAINT_FAULT_TEMPLATES.find(t => t.id === id)
}

/**
 * Clone a defect definition
 */
export function cloneTaintFaultDefect(
  defect: TaintFaultDefect
): TaintFaultDefect {
  return {
    ...defect,
    id: `defect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: `${defect.name} (copy)`,
    taint_range: defect.taint_range ? { ...defect.taint_range } : null,
    fault_range: { ...defect.fault_range },
    increment: defect.increment ?? 0.5
  }
}

/**
 * Legacy: Clone a taint/fault definition
 * @deprecated Use cloneTaintFaultDefect instead
 */
export function cloneTaintFaultDefinition(
  definition: TaintFaultDefinition
): TaintFaultDefinition {
  return {
    ...definition,
    id: `${definition.category}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: `${definition.name} (copy)`
  }
}
