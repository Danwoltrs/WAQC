import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShelfFrontGrid } from './shelf-front-grid'
import { zoneStyles } from './zone-colors'

describe('ShelfFrontGrid', () => {
  it('draws one square per cubby with its fill, and reports clicks', () => {
    const onCubbyClick = vi.fn()
    const cubby = { id: 'p1', row: 1, column: 2, code: 'B-A2', capacity: 42, occupied: 31, company_id: 'co-1' }
    render(
      <ShelfFrontGrid letter="B" rows={2} columns={3} capacity={42} cubbies={[cubby]}
        zones={zoneStyles(['co-1'])} onCubbyClick={onCubbyClick} />,
    )
    expect(screen.getAllByRole('button')).toHaveLength(6)
    const filled = screen.getByTestId('cubby-B-A2')
    expect(filled).toHaveTextContent('31/42')
    expect(screen.getByTestId('cubby-B-B3')).toHaveTextContent('0/42')
    fireEvent.click(filled)
    expect(onCubbyClick).toHaveBeenCalledWith(cubby, 1, 2)
  })
})
