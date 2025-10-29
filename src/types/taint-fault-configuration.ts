/**
 * Taint and Fault Configuration System
 *
 * Provides complete flexibility for defining taints, faults, intensity scales,
 * and validation rules per quality template and client.
 *
 * Features:
 * - Intensity-based classification: defects transition from taint to fault based on intensity
 * - Flexible intensity scales (numeric or wording) per defect
 * - Configurable taint/fault threshold per defect
 * - Complex validation rules (count limits, intensity limits, combined totals)
 * - Zero tolerance mode
 * - Predefined templates for common quality grades
 */

import { AttributeScaleType, NumericScale, WordingScale, createNumericScale } from './attribute-scales'

/**
 * Category of sensory defect based on intensity
 */
export type TaintFaultCategory = 'taint' | 'fault'

/**
 * Individual defect definition with intensity-based classification
 *
 * A defect can be BOTH a taint and a fault depending on intensity:
 * - Low intensity (< taint_threshold) = Taint (mild off-flavor)
 * - High intensity (>= taint_threshold) = Fault (severe defect)
 */
export interface TaintFaultDefect {
  /** Unique identifier within the template */
  id: string
  /** Display name (e.g., "Fermented", "Earthy", "Rancid", "Moldy") */
  name: string
  /** Intensity scale configuration (numeric or wording) */
  intensity_scale: AttributeScaleType
  /**
   * Threshold for taint/fault classification
   * - If intensity < taint_threshold: classified as TAINT
   * - If intensity >= taint_threshold: classified as FAULT
   * For numeric scales, this is a number (e.g., 5 on a 0-10 scale)
   * For wording scales, this is the option index (e.g., option 3 out of 5)
   */
  taint_threshold: number
  /** Optional description */
  description?: string
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
 * Complete taint/fault configuration for a quality template
 */
export interface TaintFaultConfiguration {
  /** List of defect definitions with intensity-based taint/fault classification */
  defects: TaintFaultDefect[]
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
    rules: {},
    notes: ''
  }
}

/**
 * Create a new defect with intensity-based taint/fault classification
 */
export function createTaintFaultDefect(
  name: string,
  displayOrder: number = 0,
  intensityScale?: AttributeScaleType,
  taintThreshold?: number
): TaintFaultDefect {
  const scale = intensityScale || createNumericScale(1, 10, 0.5)

  // Default threshold: middle of the scale for numeric, halfway point for wording
  let defaultThreshold: number
  if (scale.type === 'numeric') {
    defaultThreshold = (scale.min + scale.max) / 2
  } else {
    defaultThreshold = Math.floor(scale.options.length / 2)
  }

  return {
    id: `defect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    intensity_scale: scale,
    taint_threshold: taintThreshold ?? defaultThreshold,
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
): TaintFaultCategory {
  return intensity < defect.taint_threshold ? 'taint' : 'fault'
}

/**
 * Get the taint range for a defect (values below threshold)
 */
export function getTaintRange(defect: TaintFaultDefect): { min: number; max: number } {
  if (defect.intensity_scale.type === 'numeric') {
    return {
      min: defect.intensity_scale.min,
      max: defect.taint_threshold - defect.intensity_scale.increment
    }
  } else {
    return {
      min: 0,
      max: defect.taint_threshold - 1
    }
  }
}

/**
 * Get the fault range for a defect (values at or above threshold)
 */
export function getFaultRange(defect: TaintFaultDefect): { min: number; max: number } {
  if (defect.intensity_scale.type === 'numeric') {
    return {
      min: defect.taint_threshold,
      max: defect.intensity_scale.max
    }
  } else {
    return {
      min: defect.taint_threshold,
      max: defect.intensity_scale.options.length - 1
    }
  }
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

  // Validate each defect's scale and threshold
  const { validateScale } = require('./attribute-scales')
  for (const defect of defects) {
    // Validate intensity scale
    const scaleValidation = validateScale(defect.intensity_scale)
    if (!scaleValidation.valid) {
      return { valid: false, error: `Defect "${defect.name}": ${scaleValidation.error}` }
    }

    // Validate threshold is within scale range
    if (defect.intensity_scale.type === 'numeric') {
      if (defect.taint_threshold < defect.intensity_scale.min || defect.taint_threshold > defect.intensity_scale.max) {
        return {
          valid: false,
          error: `Defect "${defect.name}": Taint threshold (${defect.taint_threshold}) must be within scale range (${defect.intensity_scale.min}-${defect.intensity_scale.max})`
        }
      }
    } else {
      if (defect.taint_threshold < 0 || defect.taint_threshold > defect.intensity_scale.options.length) {
        return {
          valid: false,
          error: `Defect "${defect.name}": Taint threshold (${defect.taint_threshold}) must be within option count (0-${defect.intensity_scale.options.length})`
        }
      }
    }
  }

  // Legacy validation for backward compatibility
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
 * Predefined Templates
 */

// SCA Standard - Specialty Coffee Association standard (NEW FORMAT)
export const SCA_STANDARD_TAINTS_FAULTS: TaintFaultTemplate = {
  id: 'sca-standard',
  name: 'SCA Standard (Intensity-Based)',
  description: 'Specialty Coffee Association standard with intensity-based taint/fault classification (1-10 scale, threshold at 4)',
  configuration: {
    defects: [
      createTaintFaultDefect('Fermented', 0, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Earthy', 1, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Phenolic', 2, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Chemical', 3, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Musty', 4, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Woody', 5, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Rancid', 6, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Moldy', 7, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Sour', 8, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Stinker', 9, createNumericScale(1, 10, 0.5), 4)
    ],
    rules: {
      max_taints: 2,
      max_faults: 1,
      max_taint_intensity: 3,
      validation_message: 'SCA standard: Max 2 taints (intensity <4), max 1 fault (intensity ≥4)'
    },
    notes: 'Standard SCA cupping protocol. Intensity <4 = taint (mild), ≥4 = fault (severe)'
  }
}

// Specialty Grade - High quality requirements
export const SPECIALTY_GRADE_TAINTS_FAULTS: TaintFaultTemplate = {
  id: 'specialty-grade',
  name: 'Specialty Grade (Intensity-Based)',
  description: 'Strict requirements for specialty grade coffee with minimal tolerance (1-8 scale, threshold at 2.5)',
  configuration: {
    defects: [
      createTaintFaultDefect('Fermented', 0, createNumericScale(1, 8, 0.5), 2.5),
      createTaintFaultDefect('Earthy', 1, createNumericScale(1, 8, 0.5), 2.5),
      createTaintFaultDefect('Musty', 2, createNumericScale(1, 8, 0.5), 2.5),
      createTaintFaultDefect('Rancid', 3, createNumericScale(1, 8, 0.5), 2.5),
      createTaintFaultDefect('Moldy', 4, createNumericScale(1, 8, 0.5), 2.5)
    ],
    rules: {
      max_taints: 1,
      max_faults: 0,
      max_taint_intensity: 2,
      validation_message: 'Specialty grade: Max 1 light taint (intensity <2.5), no faults'
    },
    notes: 'High quality specialty coffee. Intensity <2.5 = taint (mild), ≥2.5 = fault (severe)'
  }
}

// Commercial Grade - More permissive
export const COMMERCIAL_GRADE_TAINTS_FAULTS: TaintFaultTemplate = {
  id: 'commercial-grade',
  name: 'Commercial Grade (Intensity-Based)',
  description: 'Standard commercial coffee with moderate tolerance (1-10 scale, threshold at 6)',
  configuration: {
    defects: [
      createTaintFaultDefect('Fermented', 0, createNumericScale(1, 10, 1), 6),
      createTaintFaultDefect('Earthy', 1, createNumericScale(1, 10, 1), 6),
      createTaintFaultDefect('Phenolic', 2, createNumericScale(1, 10, 1), 6),
      createTaintFaultDefect('Woody', 3, createNumericScale(1, 10, 1), 6),
      createTaintFaultDefect('Musty', 4, createNumericScale(1, 10, 1), 6),
      createTaintFaultDefect('Rancid', 5, createNumericScale(1, 10, 1), 6),
      createTaintFaultDefect('Moldy', 6, createNumericScale(1, 10, 1), 6),
      createTaintFaultDefect('Sour', 7, createNumericScale(1, 10, 1), 6)
    ],
    rules: {
      max_combined: 5,
      max_taint_intensity: 5,
      max_fault_intensity: 8,
      validation_message: 'Commercial grade: Max 5 combined defects (intensity <6 = taint, ≥6 = fault)'
    },
    notes: 'Standard commercial coffee. Intensity <6 = taint, ≥6 = fault'
  }
}

// Zero Tolerance - Premium quality
export const ZERO_TOLERANCE_TAINTS_FAULTS: TaintFaultTemplate = {
  id: 'zero-tolerance',
  name: 'Zero Tolerance',
  description: 'Premium quality with no taints or faults acceptable',
  configuration: {
    defects: [
      createTaintFaultDefect('Fermented', 0, createNumericScale(1, 5, 0.5), 3),
      createTaintFaultDefect('Earthy', 1, createNumericScale(1, 5, 0.5), 3),
      createTaintFaultDefect('Phenolic', 2, createNumericScale(1, 5, 0.5), 3),
      createTaintFaultDefect('Rancid', 3, createNumericScale(1, 5, 0.5), 3),
      createTaintFaultDefect('Moldy', 4, createNumericScale(1, 5, 0.5), 3)
    ],
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
  name: 'Brazil Traditional (Intensity-Based)',
  description: 'Traditional Brazilian classification (1-10 scale, threshold at 4)',
  configuration: {
    defects: [
      createTaintFaultDefect('Harsh', 0, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Grassy/green', 1, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Woody', 2, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Past crop', 3, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Fruity', 4, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Dirty', 5, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Hard (riado)', 6, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Phenol (rio)', 7, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Fermented', 8, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Earthy', 9, createNumericScale(1, 10, 0.5), 4),
      createTaintFaultDefect('Moldy', 10, createNumericScale(1, 10, 0.5), 4)
    ],
    rules: {
      max_taints: 2,
      max_faults: 1,
      max_taint_intensity: 3.5,
      validation_message: 'Brazil traditional: Max 2 taints (intensity <4), max 1 fault (intensity ≥4)'
    },
    notes: 'Traditional Brazilian coffee classification. Intensity <4 = taint, ≥4 = fault'
  }
}

/**
 * List of all predefined templates
 */
export const PREDEFINED_TAINT_FAULT_TEMPLATES: TaintFaultTemplate[] = [
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
    name: `${defect.name} (copy)`
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
