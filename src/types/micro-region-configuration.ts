/**
 * Micro-Region Configuration Types
 *
 * Defines types for micro-region requirements in quality templates.
 * Allows templates to specify regional requirements per origin with optional
 * percentage constraints and mixing rules.
 */

/**
 * Micro-region from database
 */
export interface MicroRegion {
  id: string
  origin: string // Country (e.g., 'Brazil', 'Colombia')
  region_name_en: string
  region_name_pt?: string
  region_name_es?: string
  parent_region?: string | null
  altitude_min?: number | null
  altitude_max?: number | null
  description_en?: string | null
  description_pt?: string | null
  description_es?: string | null
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

/**
 * Percentage constraint for a specific micro-region
 */
export interface MicroRegionPercentageConstraint {
  min?: number // Minimum percentage (0-100)
  max?: number // Maximum percentage (0-100)
}

/**
 * Micro-region requirement for a specific origin
 */
export interface MicroRegionRequirement {
  origin: string // Country (e.g., 'Brazil', 'Colombia', 'Ethiopia')
  required_micro_regions: string[] // List of required micro-region names
  percentage_per_region?: { [regionName: string]: MicroRegionPercentageConstraint } // Optional percentage constraints
  allow_mix: boolean // Whether mixing multiple micro-regions is allowed
  notes?: string // Additional notes or requirements
}

/**
 * Complete micro-region configuration for a quality template
 */
export interface MicroRegionConfiguration {
  requirements: MicroRegionRequirement[]
}

/**
 * Helper to create empty micro-region configuration
 */
export function createEmptyMicroRegionConfiguration(): MicroRegionConfiguration {
  return {
    requirements: []
  }
}

/**
 * Helper to create a single origin requirement
 */
export function createOriginRequirement(
  origin: string,
  allow_mix: boolean = true
): MicroRegionRequirement {
  return {
    origin,
    required_micro_regions: [],
    percentage_per_region: {},
    allow_mix,
    notes: ''
  }
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate micro-region configuration
 */
export function validateMicroRegionConfiguration(
  config: MicroRegionConfiguration
): ValidationResult {
  if (!config || !config.requirements) {
    return { valid: false, error: 'Configuration is missing requirements array' }
  }

  for (const req of config.requirements) {
    // Validate origin
    if (!req.origin || req.origin.trim() === '') {
      return { valid: false, error: 'Origin is required for each requirement' }
    }

    // Validate required_micro_regions array
    if (!Array.isArray(req.required_micro_regions)) {
      return { valid: false, error: `required_micro_regions must be an array for origin "${req.origin}"` }
    }

    // Validate percentage constraints
    if (req.percentage_per_region) {
      for (const [regionName, constraint] of Object.entries(req.percentage_per_region)) {
        if (constraint.min !== undefined) {
          if (constraint.min < 0 || constraint.min > 100) {
            return { valid: false, error: `Minimum percentage for "${regionName}" must be between 0 and 100` }
          }
        }
        if (constraint.max !== undefined) {
          if (constraint.max < 0 || constraint.max > 100) {
            return { valid: false, error: `Maximum percentage for "${regionName}" must be between 0 and 100` }
          }
        }
        if (constraint.min !== undefined && constraint.max !== undefined) {
          if (constraint.min > constraint.max) {
            return { valid: false, error: `Minimum percentage cannot exceed maximum for "${regionName}"` }
          }
        }
      }
    }

    // Validate allow_mix
    if (typeof req.allow_mix !== 'boolean') {
      return { valid: false, error: `allow_mix must be a boolean for origin "${req.origin}"` }
    }
  }

  return { valid: true }
}

/**
 * Get display text for a micro-region requirement
 */
export function getMicroRegionRequirementDisplayText(req: MicroRegionRequirement): string {
  if (req.required_micro_regions.length === 0) {
    return 'Any micro-region'
  }

  const regions = req.required_micro_regions.join(', ')
  const mixText = req.allow_mix ? ' (mix allowed)' : ' (single region only)'

  return `${regions}${mixText}`
}

/**
 * Get total percentage constraints for an origin
 */
export function getTotalPercentageConstraints(req: MicroRegionRequirement): { min: number, max: number } {
  if (!req.percentage_per_region) {
    return { min: 0, max: 100 }
  }

  let totalMin = 0
  let totalMax = 0

  for (const constraint of Object.values(req.percentage_per_region)) {
    if (constraint.min !== undefined) {
      totalMin += constraint.min
    }
    if (constraint.max !== undefined) {
      totalMax += constraint.max
    }
  }

  return { min: totalMin, max: totalMax }
}

/**
 * Popular coffee origins (for dropdown)
 * These origins have pre-configured micro-regions in the database
 */
export const POPULAR_COFFEE_ORIGINS = [
  'Brazil',
  'Peru',
  'Colombia',
  'Guatemala',
  'Mexico',
  'El Salvador',
  'Nicaragua',
  'Honduras'
] as const

export type PopularCoffeeOrigin = typeof POPULAR_COFFEE_ORIGINS[number]
