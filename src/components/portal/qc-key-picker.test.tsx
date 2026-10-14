// src/components/portal/qc-key-picker.test.tsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QcKeyPicker } from './qc-key-picker'

describe('QcKeyPicker', () => {
  it('applies a preset', () => {
    const onChange = vi.fn()
    render(<QcKeyPicker value={{ views: [], capabilities: [] }} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Viewer' }))
    expect(onChange).toHaveBeenCalledWith({ views: ['qc_samples', 'qc_certificates', 'qc_dashboard', 'qc_reports'], capabilities: [] })
  })

  it('toggles a key and keeps registry order', () => {
    const onChange = vi.fn()
    render(<QcKeyPicker value={{ views: ['qc_certificates'], capabilities: [] }} onChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Samples and contracts' }))
    expect(onChange).toHaveBeenCalledWith({ views: ['qc_samples', 'qc_certificates'], capabilities: [] })
  })

  it('disables keys above the ceiling and clamps presets to it', () => {
    const onChange = vi.fn()
    render(<QcKeyPicker value={{ views: [], capabilities: [] }} onChange={onChange}
      ceiling={{ views: ['qc_samples', 'qc_certificates'], capabilities: [] }} />)
    expect(screen.getByRole('checkbox', { name: 'Dashboard' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Full' }))
    expect(onChange).toHaveBeenCalledWith({ views: ['qc_samples', 'qc_certificates'], capabilities: [] })
  })
})
