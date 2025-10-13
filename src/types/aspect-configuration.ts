/**
 * Visual Aspect Configuration
 * Used for both Green Aspect (raw bean appearance) and Roast Aspect (roasted bean appearance)
 */

export interface AspectWording {
  id: string
  label: string
  value: number // For validation purposes (higher = better quality)
  display_order: number
  description?: string
}

export interface AspectConfiguration {
  wordings: AspectWording[]
  validation?: {
    min_acceptable_value?: number // Minimum value that passes validation
    validation_message?: string
  }
  notes?: string
}

export interface AspectConfigTemplate {
  id: string
  name: string
  description: string
  configuration: AspectConfiguration
}

// Helper function to create a new wording
export function createAspectWording(
  label: string,
  value: number,
  order: number,
  description?: string
): AspectWording {
  return {
    id: crypto.randomUUID(),
    label,
    value,
    display_order: order,
    description
  }
}

// Helper function to create an empty configuration
export function createEmptyAspectConfiguration(): AspectConfiguration {
  return {
    wordings: [],
    validation: undefined,
    notes: ''
  }
}

// Validate aspect configuration
export function validateAspectConfiguration(config: AspectConfiguration): {
  valid: boolean
  error?: string
} {
  if (config.wordings.length === 0) {
    return {
      valid: false,
      error: 'At least one wording option is required'
    }
  }

  // Check for duplicate labels
  const labels = config.wordings.map(w => w.label.toLowerCase().trim())
  const uniqueLabels = new Set(labels)
  if (labels.length !== uniqueLabels.size) {
    return {
      valid: false,
      error: 'Duplicate wording labels are not allowed'
    }
  }

  // Check for duplicate values
  const values = config.wordings.map(w => w.value)
  const uniqueValues = new Set(values)
  if (values.length !== uniqueValues.size) {
    return {
      valid: false,
      error: 'Duplicate values are not allowed'
    }
  }

  // Validate min_acceptable_value if set
  if (config.validation?.min_acceptable_value !== undefined) {
    const validValue = config.wordings.some(
      w => w.value === config.validation!.min_acceptable_value
    )
    if (!validValue) {
      return {
        valid: false,
        error: 'Minimum acceptable value must match one of the wording values'
      }
    }
  }

  return { valid: true }
}

// ==============================================
// PREDEFINED TEMPLATES - GREEN ASPECT
// ==============================================

const GREEN_ASPECT_STANDARD: AspectConfigTemplate = {
  id: 'green-standard',
  name: 'Standard Green Aspect',
  description: 'Industry standard green bean appearance scale',
  configuration: {
    wordings: [
      createAspectWording('Uneven', 1, 0, 'Inconsistent color and appearance'),
      createAspectWording('Brownish', 2, 1, 'Brown-tinted beans'),
      createAspectWording('Yellowish', 3, 2, 'Yellow-tinted beans'),
      createAspectWording('Yellow', 4, 3, 'Yellow colored beans'),
      createAspectWording('Yellow-Green', 5, 4, 'Yellow-green transition'),
      createAspectWording('Greenish', 6, 5, 'Light green beans'),
      createAspectWording('Green', 7, 6, 'Green colored beans'),
      createAspectWording('Bluish-Green', 8, 7, 'Blue-green tinted beans'),
      createAspectWording('Blue-Green', 9, 8, 'Premium blue-green beans')
    ],
    validation: undefined,
    notes: 'Higher quality beans typically show greener to blue-green colors'
  }
}

const GREEN_ASPECT_SIMPLIFIED: AspectConfigTemplate = {
  id: 'green-simplified',
  name: 'Simplified Green Aspect',
  description: 'Basic 3-level green bean appearance scale',
  configuration: {
    wordings: [
      createAspectWording('Poor', 1, 0, 'Low quality appearance'),
      createAspectWording('Good', 5, 1, 'Acceptable appearance'),
      createAspectWording('Excellent', 9, 2, 'Premium appearance')
    ],
    validation: undefined,
    notes: 'Simple classification for quick assessment'
  }
}

export const GREEN_ASPECT_TEMPLATES: AspectConfigTemplate[] = [
  GREEN_ASPECT_STANDARD,
  GREEN_ASPECT_SIMPLIFIED
]

// ==============================================
// PREDEFINED TEMPLATES - ROAST ASPECT
// ==============================================

const ROAST_ASPECT_STANDARD: AspectConfigTemplate = {
  id: 'roast-standard',
  name: 'Standard Roast Aspect',
  description: 'Industry standard roasted bean appearance scale',
  configuration: {
    wordings: [
      createAspectWording('Uneven', 1, 0, 'Inconsistent roast, mixed colors'),
      createAspectWording('Good', 4, 1, 'Acceptable roast appearance'),
      createAspectWording('Good to Fine', 7, 2, 'Above average appearance'),
      createAspectWording('Fine', 10, 3, 'Excellent roast appearance')
    ],
    validation: undefined,
    notes: 'Even coloration indicates consistent roasting. Equal quartile scale (1, 4, 7, 10).'
  }
}

const ROAST_ASPECT_DETAILED: AspectConfigTemplate = {
  id: 'roast-detailed',
  name: 'Detailed Roast Aspect',
  description: 'Detailed roasted bean appearance scale with more granularity',
  configuration: {
    wordings: [
      createAspectWording('Very Uneven', 1, 0, 'Highly inconsistent appearance'),
      createAspectWording('Uneven', 2.5, 1, 'Inconsistent roast'),
      createAspectWording('Fair', 4, 2, 'Somewhat even'),
      createAspectWording('Good', 5.5, 3, 'Acceptable appearance'),
      createAspectWording('Good to Fine', 7, 4, 'Above average'),
      createAspectWording('Fine', 8.5, 5, 'Very good appearance'),
      createAspectWording('Excellent', 10, 6, 'Outstanding appearance')
    ],
    validation: undefined,
    notes: 'More granular scale for detailed quality grading (1-10 range with 1.5 point increments)'
  }
}

export const ROAST_ASPECT_TEMPLATES: AspectConfigTemplate[] = [
  ROAST_ASPECT_STANDARD,
  ROAST_ASPECT_DETAILED
]
