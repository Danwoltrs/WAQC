/**
 * Screen size constraint types for quality templates
 * Supports flexible, rule-based screen size requirements
 */

/**
 * Screen size constraint types:
 * - minimum: At least X% must be this screen size (operator >=)
 * - maximum: At most X% can be this screen size (operator <=)
 * - range: Screen size must be between min-max% (operator between)
 * - any: No constraint, just track the screen size exists
 */
export type ConstraintType = 'minimum' | 'maximum' | 'range' | 'any'

/**
 * Individual screen size constraint
 */
export interface ScreenSizeConstraint {
  /** Screen size identifier (e.g., 'Pan', 'Screen 14', 'Screen 16') */
  screen_size: string

  /** Type of constraint */
  constraint_type: ConstraintType

  /**
   * Minimum value for 'minimum' and 'range' constraints
   * For 'minimum': value represents >=X%
   * For 'range': min_value represents lower bound
   */
  min_value?: number

  /**
   * Maximum value for 'maximum' and 'range' constraints
   * For 'maximum': value represents <=X%
   * For 'range': max_value represents upper bound
   */
  max_value?: number

  /** Display order for UI */
  display_order?: number
}

/**
 * Screen size requirements structure for quality templates
 */
export interface ScreenSizeRequirements {
  /** Array of screen size constraints */
  constraints: ScreenSizeConstraint[]

  /** Optional notes about the screen size requirements */
  notes?: string
}

/**
 * Standard screen sizes available in the system
 * Ordered from largest to smallest: 19 → 18 → ... → 12 → Peas 11 → Peas 10 → Peas 9 → Pan
 */
export const STANDARD_SCREEN_SIZES = [
  'Screen 19',
  'Screen 18',
  'Screen 17',
  'Screen 16',
  'Screen 15',
  'Screen 14',
  'Screen 13',
  'Screen 12',
  'Peas 11',
  'Peas 10',
  'Peas 9',
  'Pan'
] as const

/**
 * Screen size sort order map (lower number = displayed first)
 * Order: 19 → 18 → 17 → 16 → 15 → 14 → 13 → 12 → Peas 11 → Peas 10 → Peas 9 → Pan
 */
export const SCREEN_SIZE_ORDER: Record<string, number> = {
  '20': 0,
  '19': 1,
  '18': 2,
  '17': 3,
  '16': 4,
  '15': 5,
  '14': 6,
  '13': 7,
  '12': 8,
  'Peas 11': 9,
  'Peas 10': 10,
  'Peas 9': 11,
  'Pan': 12,
  // Alternate formats
  'Screen 20': 0,
  'Screen 19': 1,
  'Screen 18': 2,
  'Screen 17': 3,
  'Screen 16': 4,
  'Screen 15': 5,
  'Screen 14': 6,
  'Screen 13': 7,
  'Screen 12': 8,
}

/**
 * Get the sort order for a screen size
 * Returns a number where lower values should appear first (largest screens first, Pan last)
 */
export function getScreenSizeOrder(screenSize: string): number {
  // Check direct match first
  if (SCREEN_SIZE_ORDER[screenSize] !== undefined) {
    return SCREEN_SIZE_ORDER[screenSize]
  }

  const lower = screenSize.toLowerCase()

  // Pan is always last
  if (lower === 'pan' || lower.includes('pan')) {
    return 100
  }

  // Peaberries: Peas 11 → Peas 10 → Peas 9
  if (lower.includes('peas') || lower.includes('pea')) {
    const match = screenSize.match(/(\d+)/)
    if (match) {
      const num = parseInt(match[1])
      // Peas 11 = order 9, Peas 10 = order 10, Peas 9 = order 11
      return 20 - num // This gives: 11→9, 10→10, 9→11
    }
    return 50 // Unknown peaberry
  }

  // Regular screens: extract number and sort by size descending
  const match = screenSize.match(/(\d+)/)
  if (match) {
    const num = parseInt(match[1])
    // Screen 19 = order 1, Screen 18 = order 2, etc.
    return 20 - num
  }

  return 99 // Unknown
}

/**
 * Sort screen sizes from largest to smallest
 * Order: 19 → 18 → 17 → 16 → 15 → 14 → 13 → 12 → Peas 11 → Peas 10 → Peas 9 → Pan
 */
export function sortScreenSizes<T extends { screen_size: string }>(screens: T[]): T[] {
  return [...screens].sort((a, b) => getScreenSizeOrder(a.screen_size) - getScreenSizeOrder(b.screen_size))
}

/**
 * Sort screen size entries (key-value pairs) from largest to smallest
 */
export function sortScreenSizeEntries(entries: [string, number][]): [string, number][] {
  return [...entries].sort((a, b) => getScreenSizeOrder(a[0]) - getScreenSizeOrder(b[0]))
}

export type StandardScreenSize = typeof STANDARD_SCREEN_SIZES[number]

/**
 * Validation result for screen size distribution
 */
export interface ConstraintValidationResult {
  is_valid: boolean
  violations: ConstraintViolation[]
}

/**
 * Constraint violation details
 */
export interface ConstraintViolation {
  screen_size: string
  constraint_type: ConstraintType
  expected: string // Human-readable expected value
  actual: number // Actual percentage value
  message: string
}

/**
 * Screen size distribution data (actual measurements)
 */
export interface ScreenSizeDistribution {
  [screen_size: string]: number // percentage
}

/**
 * Validate screen size distribution against constraints
 */
export function validateScreenSizeDistribution(
  distribution: ScreenSizeDistribution,
  requirements: ScreenSizeRequirements
): ConstraintValidationResult {
  const violations: ConstraintViolation[] = []

  for (const constraint of requirements.constraints) {
    const actualValue = distribution[constraint.screen_size] || 0

    switch (constraint.constraint_type) {
      case 'minimum':
        if (constraint.min_value !== undefined && actualValue < constraint.min_value) {
          violations.push({
            screen_size: constraint.screen_size,
            constraint_type: 'minimum',
            expected: `≥${constraint.min_value}%`,
            actual: actualValue,
            message: `${constraint.screen_size} must be at least ${constraint.min_value}%, but is ${actualValue}%`
          })
        }
        break

      case 'maximum':
        if (constraint.max_value !== undefined && actualValue > constraint.max_value) {
          violations.push({
            screen_size: constraint.screen_size,
            constraint_type: 'maximum',
            expected: `≤${constraint.max_value}%`,
            actual: actualValue,
            message: `${constraint.screen_size} must be at most ${constraint.max_value}%, but is ${actualValue}%`
          })
        }
        break

      case 'range':
        if (
          constraint.min_value !== undefined &&
          constraint.max_value !== undefined &&
          (actualValue < constraint.min_value || actualValue > constraint.max_value)
        ) {
          violations.push({
            screen_size: constraint.screen_size,
            constraint_type: 'range',
            expected: `${constraint.min_value}%-${constraint.max_value}%`,
            actual: actualValue,
            message: `${constraint.screen_size} must be between ${constraint.min_value}% and ${constraint.max_value}%, but is ${actualValue}%`
          })
        }
        break

      case 'any':
        // No validation needed, just tracking
        break
    }
  }

  return {
    is_valid: violations.length === 0,
    violations
  }
}

/**
 * Get constraint display text for UI
 */
export function getConstraintDisplayText(constraint: ScreenSizeConstraint): string {
  switch (constraint.constraint_type) {
    case 'minimum':
      return `≥${constraint.min_value}%`
    case 'maximum':
      return `≤${constraint.max_value}%`
    case 'range':
      return `${constraint.min_value}%-${constraint.max_value}%`
    case 'any':
      return 'Any amount'
    default:
      return ''
  }
}

/**
 * Helper to get only the screen sizes that have defined constraints
 * Used to filter UI displays during QC grading
 */
export function getConstrainedScreenSizes(requirements: ScreenSizeRequirements): string[] {
  return requirements.constraints.map(c => c.screen_size)
}
