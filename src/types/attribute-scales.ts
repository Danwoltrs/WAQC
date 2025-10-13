/**
 * Flexible Attribute Scale System
 * Supports both numeric and wording-based scales for cupping attributes
 */

// ========================================
// SCALE TYPES
// ========================================

/**
 * Numeric scale configuration
 * Simple min-max range with increment steps
 */
export interface NumericScale {
  type: 'numeric'
  min: number
  max: number
  increment: number // Step size (e.g., 0.25, 0.5, 1.0)
}

/**
 * Wording scale option
 * Text label with assigned numeric value
 */
export interface WordingScaleOption {
  label: string // Human-readable label (e.g., "Outstanding", "Good", "Poor")
  value: number // Numeric value for validation (e.g., 10, 7, 3)
  display_order: number // Order in which to display (0-indexed)
}

/**
 * Wording scale configuration
 * Custom text-based scale with assigned numeric values
 */
export interface WordingScale {
  type: 'wording'
  options: WordingScaleOption[]
}

/**
 * Attribute scale - union type supporting both numeric and wording scales
 */
export type AttributeScaleType = NumericScale | WordingScale

// ========================================
// ATTRIBUTE CONFIGURATION
// ========================================

/**
 * Cupping attribute with flexible scale configuration
 */
export interface CuppingAttribute {
  attribute: string // Attribute name (e.g., "Fragrance/Aroma", "Flavor")
  scale: AttributeScaleType // Either numeric or wording scale
  min_score?: number // Optional minimum score requirement for this attribute
  weight?: number // Optional weight for weighted scoring
  is_required?: boolean // Whether this attribute must be scored
}

// ========================================
// SCALE TEMPLATES
// ========================================

/**
 * Reusable scale template
 * Can be applied to multiple attributes
 */
export interface ScaleTemplate {
  id: string
  name: string
  description: string
  scale: AttributeScaleType
  category: 'standard' | 'regional' | 'custom'
  is_system?: boolean // Whether this is a system-provided template
}

// ========================================
// PREDEFINED SCALE TEMPLATES
// ========================================

/**
 * SCA Standard 10-point numeric scale
 */
export const SCA_NUMERIC_SCALE: ScaleTemplate = {
  id: 'sca-numeric-10',
  name: 'SCA Numeric (1-10)',
  description: 'Standard SCA 10-point numeric scale with 0.25 increments',
  scale: {
    type: 'numeric',
    min: 1,
    max: 10,
    increment: 0.25
  },
  category: 'standard',
  is_system: true
}

/**
 * SCA 7-level wording scale for Fragrance/Aroma, Acidity, Body, Sweetness
 */
export const SCA_WORDING_7_LEVEL: ScaleTemplate = {
  id: 'sca-wording-7',
  name: 'SCA 7-Level Wording',
  description: '7-level wording scale used for Fragrance/Aroma, Acidity, Body, Sweetness',
  scale: {
    type: 'wording',
    options: [
      { label: 'Outstanding', value: 10, display_order: 0 },
      { label: 'Special', value: 9, display_order: 1 },
      { label: 'Good', value: 7, display_order: 2 },
      { label: 'Notable', value: 6, display_order: 3 },
      { label: 'Medium', value: 5, display_order: 4 },
      { label: 'Not Notable', value: 3, display_order: 5 },
      { label: 'Poor/Flat', value: 1, display_order: 6 }
    ]
  },
  category: 'standard',
  is_system: true
}

/**
 * Brazil Traditional 10-level Flavor wording scale
 */
export const BRAZIL_FLAVOR_10_LEVEL: ScaleTemplate = {
  id: 'brazil-flavor-10',
  name: 'Brazil Flavor (10-Level)',
  description: 'Traditional Brazilian 10-level flavor classification',
  scale: {
    type: 'wording',
    options: [
      { label: 'Special', value: 10, display_order: 0 },
      { label: 'S.Soft', value: 9, display_order: 1 },
      { label: 'Soft', value: 8, display_order: 2 },
      { label: 'Softish', value: 7, display_order: 3 },
      { label: 'Hard', value: 6, display_order: 4 },
      { label: 'Hardish', value: 5, display_order: 5 },
      { label: 'Rioy', value: 4, display_order: 6 },
      { label: 'Rioy/Rio', value: 3, display_order: 7 },
      { label: 'Rio', value: 2, display_order: 8 },
      { label: 'Strong Rio', value: 1, display_order: 9 }
    ]
  },
  category: 'regional',
  is_system: true
}

/**
 * COE 5-point numeric scale
 */
export const COE_NUMERIC_SCALE: ScaleTemplate = {
  id: 'coe-numeric-5',
  name: 'COE Numeric (1-5)',
  description: 'Cup of Excellence 5-point numeric scale',
  scale: {
    type: 'numeric',
    min: 1,
    max: 5,
    increment: 0.25
  },
  category: 'standard',
  is_system: true
}

/**
 * Simple 7-point numeric scale
 */
export const NUMERIC_7_SCALE: ScaleTemplate = {
  id: 'numeric-7',
  name: 'Numeric (1-7)',
  description: '7-point numeric scale with 0.25 increments',
  scale: {
    type: 'numeric',
    min: 1,
    max: 7,
    increment: 0.25
  },
  category: 'standard',
  is_system: true
}

/**
 * Simple 5-point numeric scale
 */
export const NUMERIC_5_SCALE: ScaleTemplate = {
  id: 'numeric-5',
  name: 'Numeric (1-5)',
  description: '5-point numeric scale with 0.25 increments',
  scale: {
    type: 'numeric',
    min: 1,
    max: 5,
    increment: 0.25
  },
  category: 'standard',
  is_system: true
}

/**
 * All predefined scale templates
 */
export const PREDEFINED_SCALE_TEMPLATES: ScaleTemplate[] = [
  SCA_NUMERIC_SCALE,
  SCA_WORDING_7_LEVEL,
  BRAZIL_FLAVOR_10_LEVEL,
  COE_NUMERIC_SCALE,
  NUMERIC_7_SCALE,
  NUMERIC_5_SCALE
]

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Get minimum value for an attribute scale
 */
export function getScaleMinValue(scale: AttributeScaleType): number {
  if (scale.type === 'numeric') {
    return scale.min
  }
  // For wording scales, return the minimum value from options
  return Math.min(...scale.options.map(o => o.value))
}

/**
 * Get maximum value for an attribute scale
 */
export function getScaleMaxValue(scale: AttributeScaleType): number {
  if (scale.type === 'numeric') {
    return scale.max
  }
  // For wording scales, return the maximum value from options
  return Math.max(...scale.options.map(o => o.value))
}

/**
 * Get all valid values for an attribute scale
 */
export function getScaleValidValues(scale: AttributeScaleType): number[] {
  if (scale.type === 'numeric') {
    const values: number[] = []
    for (let v = scale.min; v <= scale.max; v += scale.increment) {
      // Round to avoid floating point issues
      values.push(Math.round(v * 100) / 100)
    }
    return values
  }
  // For wording scales, return all option values
  return scale.options.map(o => o.value).sort((a, b) => b - a)
}

/**
 * Validate a score against an attribute scale
 */
export function isValidScore(score: number, scale: AttributeScaleType): boolean {
  const validValues = getScaleValidValues(scale)
  // Allow for small floating point errors
  return validValues.some(v => Math.abs(v - score) < 0.01)
}

/**
 * Get the label for a score in a wording scale
 */
export function getScoreLabel(score: number, scale: AttributeScaleType): string | null {
  if (scale.type === 'numeric') {
    return score.toString()
  }
  const option = scale.options.find(o => Math.abs(o.value - score) < 0.01)
  return option ? option.label : null
}

/**
 * Get the numeric value for a label in a wording scale
 */
export function getLabelValue(label: string, scale: WordingScale): number | null {
  const option = scale.options.find(o => o.label === label)
  return option ? option.value : null
}

/**
 * Validate scale configuration
 */
export function validateScale(scale: AttributeScaleType): { valid: boolean; error?: string } {
  if (scale.type === 'numeric') {
    if (scale.min >= scale.max) {
      return { valid: false, error: 'Minimum must be less than maximum' }
    }
    if (scale.increment <= 0) {
      return { valid: false, error: 'Increment must be greater than 0' }
    }
    if (scale.increment >= (scale.max - scale.min)) {
      return { valid: false, error: 'Increment must be less than the scale range' }
    }
    return { valid: true }
  }

  // Wording scale validation
  if (scale.options.length === 0) {
    return { valid: false, error: 'At least one option is required' }
  }

  // Check for duplicate labels
  const labels = scale.options.map(o => o.label.toLowerCase())
  if (new Set(labels).size !== labels.length) {
    return { valid: false, error: 'Duplicate labels are not allowed' }
  }

  // Check for duplicate values
  const values = scale.options.map(o => o.value)
  if (new Set(values).size !== values.length) {
    return { valid: false, error: 'Duplicate values are not allowed' }
  }

  // Check for duplicate display orders
  const orders = scale.options.map(o => o.display_order)
  if (new Set(orders).size !== orders.length) {
    return { valid: false, error: 'Duplicate display orders are not allowed' }
  }

  return { valid: true }
}

/**
 * Create a custom numeric scale
 */
export function createNumericScale(min: number, max: number, increment: number): NumericScale {
  return {
    type: 'numeric',
    min,
    max,
    increment
  }
}

/**
 * Create a custom wording scale
 */
export function createWordingScale(options: Omit<WordingScaleOption, 'display_order'>[]): WordingScale {
  return {
    type: 'wording',
    options: options.map((option, index) => ({
      ...option,
      display_order: index
    }))
  }
}

/**
 * Clone a scale template with a new name
 */
export function cloneScaleTemplate(
  template: ScaleTemplate,
  newName: string,
  newDescription?: string
): ScaleTemplate {
  return {
    ...template,
    id: `custom-${Date.now()}`,
    name: newName,
    description: newDescription || template.description,
    category: 'custom',
    is_system: false
  }
}
