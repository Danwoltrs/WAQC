/**
 * Flexible Defect Configuration System
 * Supports customizable defect lists, weights, and validation thresholds
 */

// ========================================
// DEFECT TYPES
// ========================================

/**
 * Individual defect configuration
 */
export interface DefectConfig {
  name: string // Defect name (e.g., "Full Black", "Severe Broca")
  weight: number // Point value/multiplier (e.g., 1.00, 0.2, 0.5)
  category: 'primary' | 'secondary' // Defect severity category
  display_order: number // Order in which to display (0-indexed)
  description?: string // Optional description for clarification
}

/**
 * Defect validation thresholds
 */
export interface DefectThresholds {
  max_primary?: number // Maximum allowed primary defects (full defect equivalents)
  max_secondary?: number // Maximum allowed secondary defects (full defect equivalents)
  max_total?: number // Maximum total defects (primary + secondary combined)
}

/**
 * Complete defect configuration for a quality template
 */
export interface DefectConfiguration {
  defects: DefectConfig[]
  thresholds: DefectThresholds
  notes?: string // Optional notes about this configuration
}

// ========================================
// DEFECT TEMPLATES
// ========================================

/**
 * Reusable defect template
 * Can be applied to quality templates
 */
export interface DefectTemplate {
  id: string
  name: string
  description: string
  origin?: string // Origin this template is designed for (e.g., "Brazil", "Colombia")
  category: 'origin' | 'client' | 'custom'
  configuration: DefectConfiguration
  is_system?: boolean // Whether this is a system-provided template
}

// ========================================
// PREDEFINED DEFECT TEMPLATES
// ========================================

/**
 * Brazil SCA Standard Defects
 */
export const BRAZIL_SCA_DEFECTS: DefectTemplate = {
  id: 'brazil-sca-standard',
  name: 'Brazil SCA Standard',
  description: 'Standard Brazilian coffee defect classification per SCA guidelines',
  origin: 'Brazil',
  category: 'origin',
  configuration: {
    defects: [
      // Primary Defects (weight 1.00 each)
      { name: 'Full Black', weight: 1.0, category: 'primary', display_order: 0, description: 'Completely black bean' },
      { name: 'Full Sour', weight: 1.0, category: 'primary', display_order: 1, description: 'Completely sour bean' },
      { name: 'Pod/Cherry', weight: 1.0, category: 'primary', display_order: 2, description: 'Dried cherry or pod' },
      { name: 'Stone/Stick', weight: 1.0, category: 'primary', display_order: 3, description: 'Foreign material (stone, stick)' },
      { name: 'Foreign Material', weight: 1.0, category: 'primary', display_order: 4, description: 'Other foreign matter' },
      { name: 'Large Husk', weight: 1.0, category: 'primary', display_order: 5, description: 'Large pieces of parchment/husk' },

      // Secondary Defects (variable weights)
      { name: 'Severe Broca', weight: 0.2, category: 'secondary', display_order: 0, description: 'Severely insect-damaged' },
      { name: 'Minor Broca', weight: 0.1, category: 'secondary', display_order: 1, description: 'Minor insect damage' },
      { name: 'Broken', weight: 0.2, category: 'secondary', display_order: 2, description: 'Broken or chipped beans' },
      { name: 'Unripe/Immature', weight: 0.2, category: 'secondary', display_order: 3, description: 'Underdeveloped beans' },
      { name: 'Bad Formed', weight: 0.2, category: 'secondary', display_order: 4, description: 'Malformed beans' },
      { name: 'Shells', weight: 0.34, category: 'secondary', display_order: 5, description: 'Shell beans' },
      { name: 'Partial Husk', weight: 0.5, category: 'secondary', display_order: 6, description: 'Partial parchment' },
      { name: 'Partial Sour', weight: 0.5, category: 'secondary', display_order: 7, description: 'Partially sour bean' },
      { name: 'Partial Black', weight: 0.5, category: 'secondary', display_order: 8, description: 'Partially black bean' }
    ],
    thresholds: {
      max_primary: 5,
      max_secondary: 86,
      max_total: 91
    },
    notes: 'Standard Brazilian defect classification for 300g sample. Adjust proportionally for different sample sizes.'
  },
  is_system: true
}

/**
 * Colombia Standard Defects
 */
export const COLOMBIA_STANDARD_DEFECTS: DefectTemplate = {
  id: 'colombia-standard',
  name: 'Colombia Standard',
  description: 'Colombian coffee defect classification',
  origin: 'Colombia',
  category: 'origin',
  configuration: {
    defects: [
      // Primary Defects
      { name: 'Full Black', weight: 1.0, category: 'primary', display_order: 0 },
      { name: 'Full Sour', weight: 1.0, category: 'primary', display_order: 1 },
      { name: 'Dried Cherry', weight: 1.0, category: 'primary', display_order: 2 },
      { name: 'Foreign Matter', weight: 1.0, category: 'primary', display_order: 3 },
      { name: 'Severe Insect Damage', weight: 1.0, category: 'primary', display_order: 4 },

      // Secondary Defects
      { name: 'Partial Black', weight: 0.33, category: 'secondary', display_order: 0 },
      { name: 'Partial Sour', weight: 0.33, category: 'secondary', display_order: 1 },
      { name: 'Parchment', weight: 0.2, category: 'secondary', display_order: 2 },
      { name: 'Floater', weight: 0.2, category: 'secondary', display_order: 3 },
      { name: 'Immature', weight: 0.2, category: 'secondary', display_order: 4 },
      { name: 'Withered', weight: 0.2, category: 'secondary', display_order: 5 },
      { name: 'Shell', weight: 0.2, category: 'secondary', display_order: 6 },
      { name: 'Broken/Chipped', weight: 0.2, category: 'secondary', display_order: 7 },
      { name: 'Hull/Husk', weight: 0.2, category: 'secondary', display_order: 8 }
    ],
    thresholds: {
      max_primary: 8,
      max_secondary: 46,
      max_total: 54
    },
    notes: 'Colombian defect standards for 300g sample'
  },
  is_system: true
}

/**
 * Guatemala Standard Defects
 */
export const GUATEMALA_STANDARD_DEFECTS: DefectTemplate = {
  id: 'guatemala-standard',
  name: 'Guatemala Standard',
  description: 'Guatemalan coffee defect classification',
  origin: 'Guatemala',
  category: 'origin',
  configuration: {
    defects: [
      // Primary Defects
      { name: 'Full Black', weight: 1.0, category: 'primary', display_order: 0 },
      { name: 'Full Sour', weight: 1.0, category: 'primary', display_order: 1 },
      { name: 'Dried Cherry', weight: 1.0, category: 'primary', display_order: 2 },
      { name: 'Fungus Damage', weight: 1.0, category: 'primary', display_order: 3 },
      { name: 'Foreign Matter', weight: 1.0, category: 'primary', display_order: 4 },
      { name: 'Severe Insect Damage', weight: 1.0, category: 'primary', display_order: 5 },

      // Secondary Defects
      { name: 'Partial Black', weight: 0.5, category: 'secondary', display_order: 0 },
      { name: 'Partial Sour', weight: 0.5, category: 'secondary', display_order: 1 },
      { name: 'Parchment', weight: 0.25, category: 'secondary', display_order: 2 },
      { name: 'Floater', weight: 0.25, category: 'secondary', display_order: 3 },
      { name: 'Immature/Unripe', weight: 0.25, category: 'secondary', display_order: 4 },
      { name: 'Withered', weight: 0.25, category: 'secondary', display_order: 5 },
      { name: 'Shell', weight: 0.25, category: 'secondary', display_order: 6 },
      { name: 'Broken/Chipped', weight: 0.25, category: 'secondary', display_order: 7 },
      { name: 'Hull/Husk', weight: 0.25, category: 'secondary', display_order: 8 },
      { name: 'Minor Insect Damage', weight: 0.2, category: 'secondary', display_order: 9 }
    ],
    thresholds: {
      max_primary: 8,
      max_secondary: 50,
      max_total: 58
    },
    notes: 'Guatemalan defect standards for 300g sample'
  },
  is_system: true
}

/**
 * SCA Standard Defects (Generic)
 */
export const SCA_STANDARD_DEFECTS: DefectTemplate = {
  id: 'sca-standard',
  name: 'SCA Standard',
  description: 'Generic SCA (Specialty Coffee Association) defect classification',
  category: 'origin',
  configuration: {
    defects: [
      // Category 1 Defects (Primary)
      { name: 'Full Black', weight: 1.0, category: 'primary', display_order: 0 },
      { name: 'Full Sour', weight: 1.0, category: 'primary', display_order: 1 },
      { name: 'Dried Cherry/Pod', weight: 1.0, category: 'primary', display_order: 2 },
      { name: 'Fungus Damaged', weight: 1.0, category: 'primary', display_order: 3 },
      { name: 'Foreign Matter', weight: 1.0, category: 'primary', display_order: 4 },
      { name: 'Severe Insect Damage', weight: 1.0, category: 'primary', display_order: 5 },

      // Category 2 Defects (Secondary)
      { name: 'Partial Black', weight: 0.33, category: 'secondary', display_order: 0 },
      { name: 'Partial Sour', weight: 0.33, category: 'secondary', display_order: 1 },
      { name: 'Parchment', weight: 0.2, category: 'secondary', display_order: 2 },
      { name: 'Floater', weight: 0.2, category: 'secondary', display_order: 3 },
      { name: 'Immature/Unripe', weight: 0.2, category: 'secondary', display_order: 4 },
      { name: 'Withered', weight: 0.2, category: 'secondary', display_order: 5 },
      { name: 'Shell', weight: 0.2, category: 'secondary', display_order: 6 },
      { name: 'Broken/Chipped/Cut', weight: 0.2, category: 'secondary', display_order: 7 },
      { name: 'Hull/Husk', weight: 0.2, category: 'secondary', display_order: 8 },
      { name: 'Minor Insect Damage', weight: 0.2, category: 'secondary', display_order: 9 }
    ],
    thresholds: {
      max_primary: 5,
      max_secondary: 45,
      max_total: 50
    },
    notes: 'Generic SCA defect classification for 300g sample'
  },
  is_system: true
}

/**
 * All predefined defect templates
 */
export const PREDEFINED_DEFECT_TEMPLATES: DefectTemplate[] = [
  BRAZIL_SCA_DEFECTS,
  COLOMBIA_STANDARD_DEFECTS,
  GUATEMALA_STANDARD_DEFECTS,
  SCA_STANDARD_DEFECTS
]

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Calculate full defect equivalents for a defect count
 */
export function calculateDefectEquivalents(count: number, weight: number): number {
  return Math.round((count * weight) * 100) / 100
}

/**
 * Calculate total primary defects from counts
 */
export function calculatePrimaryDefects(
  defects: DefectConfig[],
  counts: { [defectName: string]: number }
): number {
  const primaryDefects = defects.filter(d => d.category === 'primary')
  let total = 0

  primaryDefects.forEach(defect => {
    const count = counts[defect.name] || 0
    total += calculateDefectEquivalents(count, defect.weight)
  })

  return Math.round(total * 100) / 100
}

/**
 * Calculate total secondary defects from counts
 */
export function calculateSecondaryDefects(
  defects: DefectConfig[],
  counts: { [defectName: string]: number }
): number {
  const secondaryDefects = defects.filter(d => d.category === 'secondary')
  let total = 0

  secondaryDefects.forEach(defect => {
    const count = counts[defect.name] || 0
    total += calculateDefectEquivalents(count, defect.weight)
  })

  return Math.round(total * 100) / 100
}

/**
 * Calculate total defects (primary + secondary)
 */
export function calculateTotalDefects(
  defects: DefectConfig[],
  counts: { [defectName: string]: number }
): number {
  const primary = calculatePrimaryDefects(defects, counts)
  const secondary = calculateSecondaryDefects(defects, counts)
  return Math.round((primary + secondary) * 100) / 100
}

/**
 * Validate defect counts against thresholds
 */
export function validateDefectCounts(
  defects: DefectConfig[],
  counts: { [defectName: string]: number },
  thresholds: DefectThresholds
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Calculate totals
  const primaryTotal = calculatePrimaryDefects(defects, counts)
  const secondaryTotal = calculateSecondaryDefects(defects, counts)
  const overallTotal = calculateTotalDefects(defects, counts)

  // Check primary threshold
  if (thresholds.max_primary !== undefined && primaryTotal > thresholds.max_primary) {
    errors.push(`Primary defects (${primaryTotal}) exceed maximum allowed (${thresholds.max_primary})`)
  }

  // Check secondary threshold
  if (thresholds.max_secondary !== undefined && secondaryTotal > thresholds.max_secondary) {
    errors.push(`Secondary defects (${secondaryTotal}) exceed maximum allowed (${thresholds.max_secondary})`)
  }

  // Check total threshold
  if (thresholds.max_total !== undefined && overallTotal > thresholds.max_total) {
    errors.push(`Total defects (${overallTotal}) exceed maximum allowed (${thresholds.max_total})`)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Get defects by category
 */
export function getDefectsByCategory(
  defects: DefectConfig[],
  category: 'primary' | 'secondary'
): DefectConfig[] {
  return defects
    .filter(d => d.category === category)
    .sort((a, b) => a.display_order - b.display_order)
}

/**
 * Validate defect configuration
 */
export function validateDefectConfiguration(
  config: DefectConfiguration
): { valid: boolean; error?: string } {
  if (config.defects.length === 0) {
    return { valid: false, error: 'At least one defect is required' }
  }

  // Check for duplicate names
  const names = config.defects.map(d => d.name.toLowerCase())
  if (new Set(names).size !== names.length) {
    return { valid: false, error: 'Duplicate defect names are not allowed' }
  }

  // Validate weights
  for (const defect of config.defects) {
    if (defect.weight <= 0) {
      return { valid: false, error: `Defect "${defect.name}" must have a weight greater than 0` }
    }
    if (defect.weight > 10) {
      return { valid: false, error: `Defect "${defect.name}" weight seems unusually high (>10)` }
    }
  }

  // Validate thresholds
  if (config.thresholds.max_primary !== undefined && config.thresholds.max_primary < 0) {
    return { valid: false, error: 'Max primary defects cannot be negative' }
  }
  if (config.thresholds.max_secondary !== undefined && config.thresholds.max_secondary < 0) {
    return { valid: false, error: 'Max secondary defects cannot be negative' }
  }
  if (config.thresholds.max_total !== undefined && config.thresholds.max_total < 0) {
    return { valid: false, error: 'Max total defects cannot be negative' }
  }

  return { valid: true }
}

/**
 * Create an empty defect configuration
 */
export function createEmptyDefectConfiguration(): DefectConfiguration {
  return {
    defects: [],
    thresholds: {}
  }
}

/**
 * Clone a defect template with a new name
 */
export function cloneDefectTemplate(
  template: DefectTemplate,
  newName: string,
  newDescription?: string
): DefectTemplate {
  return {
    ...template,
    id: `custom-${Date.now()}`,
    name: newName,
    description: newDescription || template.description,
    category: 'custom',
    is_system: false,
    configuration: {
      ...template.configuration,
      defects: template.configuration.defects.map(d => ({ ...d }))
    }
  }
}

/**
 * Scale defect thresholds for different sample sizes
 */
export function scaleDefectThresholds(
  thresholds: DefectThresholds,
  fromSampleSize: number,
  toSampleSize: number
): DefectThresholds {
  const ratio = toSampleSize / fromSampleSize

  return {
    max_primary: thresholds.max_primary !== undefined
      ? Math.round(thresholds.max_primary * ratio * 100) / 100
      : undefined,
    max_secondary: thresholds.max_secondary !== undefined
      ? Math.round(thresholds.max_secondary * ratio * 100) / 100
      : undefined,
    max_total: thresholds.max_total !== undefined
      ? Math.round(thresholds.max_total * ratio * 100) / 100
      : undefined
  }
}
