/**
 * Taint and Fault Configuration System
 *
 * Provides complete flexibility for defining taints, faults, intensity scales,
 * and validation rules per quality template and client.
 *
 * Features:
 * - Custom taint and fault definitions per template
 * - Flexible intensity scales (numeric or wording) per taint/fault
 * - Complex validation rules (count limits, intensity limits, combined totals)
 * - Zero tolerance mode
 * - Predefined templates for common quality grades
 */

import { AttributeScaleType, NumericScale, WordingScale, createNumericScale } from './attribute-scales'

/**
 * Category of sensory defect
 */
export type TaintFaultCategory = 'taint' | 'fault'

/**
 * Individual taint or fault definition
 */
export interface TaintFaultDefinition {
  /** Unique identifier within the template */
  id: string
  /** Display name (e.g., "Fermented", "Earthy", "Rancid", "Moldy") */
  name: string
  /** Category: taint (mild off-flavor) or fault (severe defect) */
  category: TaintFaultCategory
  /** Intensity scale configuration (numeric or wording) */
  scale: AttributeScaleType
  /** Optional description */
  description?: string
  /** Display order */
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
  /** List of taint definitions */
  taints: TaintFaultDefinition[]
  /** List of fault definitions */
  faults: TaintFaultDefinition[]
  /** Validation rules */
  rules: TaintFaultValidationRules
  /** Notes about this configuration */
  notes?: string
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
    taints: [],
    faults: [],
    rules: {},
    notes: ''
  }
}

/**
 * Create a new taint definition with default scale
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
 * Create a new fault definition with default scale
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
 * Validate taint/fault configuration
 */
export function validateTaintFaultConfiguration(
  config: TaintFaultConfiguration
): { valid: boolean; error?: string } {
  // Check for duplicate names
  const allNames = [
    ...config.taints.map(t => t.name.toLowerCase()),
    ...config.faults.map(f => f.name.toLowerCase())
  ]
  const uniqueNames = new Set(allNames)
  if (allNames.length !== uniqueNames.size) {
    return { valid: false, error: 'Duplicate taint/fault names found' }
  }

  // Validate each taint scale
  const { validateScale } = require('./attribute-scales')
  for (const taint of config.taints) {
    const scaleValidation = validateScale(taint.scale)
    if (!scaleValidation.valid) {
      return { valid: false, error: `Taint "${taint.name}": ${scaleValidation.error}` }
    }
  }

  // Validate each fault scale
  for (const fault of config.faults) {
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
  return {
    total_definitions: config.taints.length + config.faults.length,
    taint_count: config.taints.length,
    fault_count: config.faults.length,
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

// SCA Standard - Specialty Coffee Association standard
export const SCA_STANDARD_TAINTS_FAULTS: TaintFaultTemplate = {
  id: 'sca-standard',
  name: 'SCA Standard',
  description: 'Specialty Coffee Association standard taint and fault definitions with 1-5 intensity scale',
  configuration: {
    taints: [
      { ...createTaintDefinition('Fermented', 0), scale: createNumericScale(1, 5, 0.5) },
      { ...createTaintDefinition('Earthy', 1), scale: createNumericScale(1, 5, 0.5) },
      { ...createTaintDefinition('Phenolic', 2), scale: createNumericScale(1, 5, 0.5) },
      { ...createTaintDefinition('Chemical', 3), scale: createNumericScale(1, 5, 0.5) },
      { ...createTaintDefinition('Musty', 4), scale: createNumericScale(1, 5, 0.5) },
      { ...createTaintDefinition('Woody', 5), scale: createNumericScale(1, 5, 0.5) }
    ],
    faults: [
      { ...createFaultDefinition('Rancid', 0), scale: createNumericScale(1, 5, 0.5) },
      { ...createFaultDefinition('Moldy', 1), scale: createNumericScale(1, 5, 0.5) },
      { ...createFaultDefinition('Sour', 2), scale: createNumericScale(1, 5, 0.5) },
      { ...createFaultDefinition('Stinker', 3), scale: createNumericScale(1, 5, 0.5) }
    ],
    rules: {
      max_taints: 2,
      max_faults: 1,
      max_taint_intensity: 3,
      validation_message: 'SCA standard: Max 2 taints (intensity ≤3), max 1 fault'
    },
    notes: 'Standard SCA cupping protocol for specialty grade coffee'
  }
}

// Specialty Grade - High quality requirements
export const SPECIALTY_GRADE_TAINTS_FAULTS: TaintFaultTemplate = {
  id: 'specialty-grade',
  name: 'Specialty Grade',
  description: 'Strict requirements for specialty grade coffee with minimal tolerance',
  configuration: {
    taints: [
      { ...createTaintDefinition('Fermented', 0), scale: createNumericScale(1, 3, 0.5) },
      { ...createTaintDefinition('Earthy', 1), scale: createNumericScale(1, 3, 0.5) },
      { ...createTaintDefinition('Musty', 2), scale: createNumericScale(1, 3, 0.5) }
    ],
    faults: [
      { ...createFaultDefinition('Rancid', 0), scale: createNumericScale(1, 3, 0.5) },
      { ...createFaultDefinition('Moldy', 1), scale: createNumericScale(1, 3, 0.5) }
    ],
    rules: {
      max_taints: 1,
      max_faults: 0,
      max_taint_intensity: 2,
      validation_message: 'Specialty grade: Max 1 light taint (intensity ≤2), no faults'
    },
    notes: 'High quality specialty coffee with strict taint/fault requirements'
  }
}

// Commercial Grade - More permissive
export const COMMERCIAL_GRADE_TAINTS_FAULTS: TaintFaultTemplate = {
  id: 'commercial-grade',
  name: 'Commercial Grade',
  description: 'Standard commercial coffee with moderate tolerance for defects',
  configuration: {
    taints: [
      { ...createTaintDefinition('Fermented', 0), scale: createNumericScale(1, 10, 1) },
      { ...createTaintDefinition('Earthy', 1), scale: createNumericScale(1, 10, 1) },
      { ...createTaintDefinition('Phenolic', 2), scale: createNumericScale(1, 10, 1) },
      { ...createTaintDefinition('Woody', 3), scale: createNumericScale(1, 10, 1) },
      { ...createTaintDefinition('Musty', 4), scale: createNumericScale(1, 10, 1) }
    ],
    faults: [
      { ...createFaultDefinition('Rancid', 0), scale: createNumericScale(1, 10, 1) },
      { ...createFaultDefinition('Moldy', 1), scale: createNumericScale(1, 10, 1) },
      { ...createFaultDefinition('Sour', 2), scale: createNumericScale(1, 10, 1) }
    ],
    rules: {
      max_combined: 5,
      max_taint_intensity: 7,
      max_fault_intensity: 5,
      validation_message: 'Commercial grade: Max 5 combined defects, taint intensity ≤7, fault intensity ≤5'
    },
    notes: 'Standard commercial coffee with moderate defect tolerance'
  }
}

// Zero Tolerance - Premium quality
export const ZERO_TOLERANCE_TAINTS_FAULTS: TaintFaultTemplate = {
  id: 'zero-tolerance',
  name: 'Zero Tolerance',
  description: 'Premium quality with no taints or faults acceptable',
  configuration: {
    taints: [
      { ...createTaintDefinition('Fermented', 0), scale: createNumericScale(1, 5, 0.5) },
      { ...createTaintDefinition('Earthy', 1), scale: createNumericScale(1, 5, 0.5) },
      { ...createTaintDefinition('Phenolic', 2), scale: createNumericScale(1, 5, 0.5) }
    ],
    faults: [
      { ...createFaultDefinition('Rancid', 0), scale: createNumericScale(1, 5, 0.5) },
      { ...createFaultDefinition('Moldy', 1), scale: createNumericScale(1, 5, 0.5) }
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
  name: 'Brazil Traditional',
  description: 'Traditional Brazilian classification with specific taint/fault terminology',
  configuration: {
    taints: [
      { ...createTaintDefinition('Riado', 0), scale: createNumericScale(1, 5, 0.5) },
      { ...createTaintDefinition('Rio', 1), scale: createNumericScale(1, 5, 0.5) },
      { ...createTaintDefinition('Fermented', 2), scale: createNumericScale(1, 5, 0.5) },
      { ...createTaintDefinition('Earthy', 3), scale: createNumericScale(1, 5, 0.5) }
    ],
    faults: [
      { ...createFaultDefinition('Hard Riado', 0), scale: createNumericScale(1, 5, 0.5) },
      { ...createFaultDefinition('Phenol Rio', 1), scale: createNumericScale(1, 5, 0.5) },
      { ...createFaultDefinition('Moldy', 2), scale: createNumericScale(1, 5, 0.5) }
    ],
    rules: {
      max_taints: 2,
      max_faults: 1,
      max_taint_intensity: 4,
      validation_message: 'Brazil traditional: Max 2 taints (intensity ≤4), max 1 fault'
    },
    notes: 'Traditional Brazilian coffee classification with country-specific terminology'
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
 * Clone a taint/fault definition
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
