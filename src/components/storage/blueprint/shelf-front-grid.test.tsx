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
    expect(onCubbyClick).toHaveBeenCalledWith(cubby, 1, 2, { toggle: false, range: false })
  })

  it('reports Cmd/Ctrl and Shift, outlines picked cubbies, and names the client of a pending zone', () => {
    const onCubbyClick = vi.fn()
    render(
      <ShelfFrontGrid letter="B" rows={1} columns={2} capacity={42} cubbies={[]} zones={zoneStyles(['co-1'])}
        zoneOf={new Map([['1:1', 'co-1'], ['1:2', null]])} names={new Map([['co-1', 'Ahold']])}
        picked={new Set(['1:2'])} onCubbyClick={onCubbyClick} />,
    )
    expect(screen.getByTestId('cubby-B-A1')).toHaveTextContent('Ahold')
    expect(screen.getByTestId('cubby-B-A2')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('cubby-B-A1'), { metaKey: true })
    expect(onCubbyClick).toHaveBeenLastCalledWith(null, 1, 1, { toggle: true, range: false })
    fireEvent.click(screen.getByTestId('cubby-B-A2'), { shiftKey: true })
    expect(onCubbyClick).toHaveBeenLastCalledWith(null, 1, 2, { toggle: false, range: true })
  })
})
