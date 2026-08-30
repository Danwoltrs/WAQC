/**
 * Sample Information Visibility Settings
 * Shared between grading pages and print dialogs
 */

const VISIBILITY_KEY = 'sample-info-visibility'

export interface SampleVisibilitySettings {
  showQuality: boolean
  showBuyer: boolean
  showSupplier: boolean
  showExporter: boolean
  // QR code on specialty (CVA) cupping cards
  showCvaQr: boolean
}

const DEFAULT_SETTINGS: SampleVisibilitySettings = {
  showQuality: true,
  showBuyer: true,
  showSupplier: true,
  showExporter: true,
  showCvaQr: true,
}

/**
 * Get visibility settings from localStorage
 */
export function getVisibilitySettings(): SampleVisibilitySettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS
  }

  try {
    const stored = localStorage.getItem(VISIBILITY_KEY)
    if (stored) {
      // Defaults fill any key an older stored object lacks
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
    }
  } catch (error) {
    console.error('Error reading visibility settings:', error)
  }

  return DEFAULT_SETTINGS
}

/**
 * Save visibility settings to localStorage
 */
export function setVisibilitySettings(settings: SampleVisibilitySettings): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    localStorage.setItem(VISIBILITY_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('Error saving visibility settings:', error)
  }
}

/**
 * Update a single visibility setting
 */
export function updateVisibilitySetting(
  key: keyof SampleVisibilitySettings,
  value: boolean
): SampleVisibilitySettings {
  const current = getVisibilitySettings()
  const updated = { ...current, [key]: value }
  setVisibilitySettings(updated)
  return updated
}
