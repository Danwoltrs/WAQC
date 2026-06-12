import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FlavorWheel, splitLabel } from './FlavorWheel'

describe('FlavorWheel — render + tap path', () => {
  it('renders all 110 selectable wedges', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    expect(screen.getAllByRole('button', { name: /.+/ }).filter((b) => b.tagName.toLowerCase() === 'g')).toHaveLength(110)
  })

  it('starts at rest; tapping a family zooms it; tapping a note then toggles the pick', () => {
    const onToggle = vi.fn()
    const { container } = render(<FlavorWheel picks={[]} onToggle={onToggle} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-zoom-mode')).toBe('rest')

    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    expect(svg.getAttribute('data-zoom-mode')).toBe('full')
    expect(onToggle).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Fruity / Berry / Blueberry' }))
    expect(onToggle).toHaveBeenCalledWith({ path: ['Fruity', 'Berry', 'Blueberry'] })
  })

  it('tapping a different family while focused re-aims instead of toggling', () => {
    const onToggle = vi.fn()
    const { container } = render(<FlavorWheel picks={[]} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roasted / Cereal / Malt' }))
    expect(onToggle).not.toHaveBeenCalled()
    expect(container.querySelector('svg')!.getAttribute('data-zoom-mode')).toBe('full')
  })

  it('background click and Escape return to rest', () => {
    const { container } = render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const svg = container.querySelector('svg')!
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    fireEvent.click(svg)
    expect(svg.getAttribute('data-zoom-mode')).toBe('rest')
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(svg.getAttribute('data-zoom-mode')).toBe('rest')
  })

  it('picked wedges carry the is-picked class', () => {
    render(<FlavorWheel picks={[{ path: ['Fruity', 'Berry', 'Blueberry'] }]} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Fruity / Berry / Blueberry' }).classList.contains('is-picked')).toBe(true)
  })

  it('frost: only the focused family clears its outer-ring frost', () => {
    const { container } = render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    expect(container.querySelectorAll('.cva-wheel-w3.is-clear')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    const clear = container.querySelectorAll('.cva-wheel-w3.is-clear')
    expect(clear).toHaveLength(1)
  })

  it('splitLabel wraps at the slash, then the most central space, else not at all', () => {
    expect(splitLabel('Sour/Fermented', 11)).toEqual(['Sour/', 'Fermented'])
    expect(splitLabel('Citrus Fruit', 11)).toEqual(['Citrus', 'Fruit'])
    expect(splitLabel('Sweet Aromatics', 22)).toEqual(['Sweet Aromatics'])
    expect(splitLabel('Blackberry', 22)).toEqual(['Blackberry'])
  })
})
