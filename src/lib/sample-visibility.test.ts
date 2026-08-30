// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { getVisibilitySettings, updateVisibilitySetting } from './sample-visibility'

describe('sample visibility settings', () => {
  beforeEach(() => localStorage.clear())

  it('defaults showCvaQr on', () => {
    expect(getVisibilitySettings().showCvaQr).toBe(true)
  })

  it('fills a key missing from an older stored object with its default', () => {
    localStorage.setItem(
      'sample-info-visibility',
      JSON.stringify({ showQuality: false, showBuyer: true, showSupplier: true, showExporter: true }),
    )
    const settings = getVisibilitySettings()
    expect(settings.showQuality).toBe(false)
    expect(settings.showCvaQr).toBe(true)
  })

  it('persists a toggle', () => {
    updateVisibilitySetting('showCvaQr', false)
    expect(getVisibilitySettings().showCvaQr).toBe(false)
  })
})
