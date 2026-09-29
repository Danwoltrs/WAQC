import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ScreenSizesSection } from './screen-sizes-section'

// Daniel 2026-09-29: "Screen 18 ≥ 35%, Screen 16 ≥ 40%, Pan ≤ 5%" shows
// Screen 17 without listing it, and every row (Pan too) edits in place.
const params = {
  screen_size_requirements: {
    constraints: [
      { screen_size: 'Screen 18', constraint_type: 'minimum', min_value: 35 },
      { screen_size: 'Screen 16', constraint_type: 'minimum', min_value: 40 },
      { screen_size: 'Pan', constraint_type: 'maximum', max_value: 5 },
    ],
  },
}

describe('ScreenSizesSection', () => {
  it('shows the screen between two listed screens, largest first, Pan last', () => {
    render(<ScreenSizesSection params={params} patch={vi.fn()} />)
    const rows = screen.getAllByTestId(/^screen-row-/).map((r) => r.dataset.testid)
    expect(rows).toEqual(['screen-row-Screen 18', 'screen-row-Screen 17', 'screen-row-Screen 16', 'screen-row-Pan'])
    expect(screen.getByTestId('screen-row-Screen 17')).toHaveTextContent('Any amount')
    expect(screen.getByTestId('screen-row-Screen 17')).toHaveTextContent('Between listed screens')
    expect(screen.queryByRole('button', { name: 'Remove Screen 17' })).not.toBeInTheDocument()
  })

  it('edits the Pan maximum in place', () => {
    const patch = vi.fn()
    render(<ScreenSizesSection params={params} patch={patch} />)
    fireEvent.change(screen.getByLabelText('Pan maximum %'), { target: { value: '8' } })
    const next = patch.mock.calls[0][0].screen_size_requirements.constraints
    expect(next.find((c: any) => c.screen_size === 'Pan')).toEqual({ screen_size: 'Pan', constraint_type: 'maximum', max_value: 8 })
    expect(next).toHaveLength(3)
  })

  it('removes a listed screen', () => {
    const patch = vi.fn()
    render(<ScreenSizesSection params={params} patch={patch} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Screen 16' }))
    expect(patch.mock.calls[0][0].screen_size_requirements.constraints.map((c: any) => c.screen_size))
      .toEqual(['Screen 18', 'Pan'])
  })
})
