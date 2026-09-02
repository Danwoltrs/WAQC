import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import { NODES } from '@/lib/cva/flavor-wheel-data'
import { WheelScene } from './WheelScene'

const base = { pickedKeys: new Set<string>(), focusFamily: null, focusKey: null, onActivate: () => {}, svgRef: createRef<SVGSVGElement>() }

describe('WheelScene', () => {
  it('renders one accessible wedge per node and one label per node', () => {
    const { container } = render(<WheelScene {...base} />)
    expect(container.querySelectorAll('.wheel-wedge[role=button]')).toHaveLength(NODES.length)
    expect(container.querySelectorAll('.wheel-lw')).toHaveLength(NODES.length)
    expect(screen.getByRole('button', { name: 'Fruity / Berry / Blueberry' })).toBeTruthy()
  })

  it('contains no filters, no transforms and no transitions inside the svg', () => {
    const { container } = render(<WheelScene {...base} />)
    const svg = container.querySelector('svg')!
    expect(svg.querySelectorAll('filter, [filter]')).toHaveLength(0)
    for (const el of svg.querySelectorAll<SVGElement>('g, path')) {
      expect(el.getAttribute('transform'), el.className.baseVal).toBeNull()
      expect(el.style.transform).toBe('')
    }
    // labels keep their rotate() — that is static geometry, never animated
    expect(svg.querySelectorAll('text[transform]').length).toBeGreaterThan(0)
  })

  it('arcs and labels never take pointer events', () => {
    const { container } = render(<WheelScene {...base} />)
    expect(container.querySelector('.wheel-arcs')!.getAttribute('pointer-events')).toBe('none')
    expect(container.querySelector('.wheel-labels')!.getAttribute('pointer-events')).toBe('none')
  })

  it('reflects picked and focus state as classes only; hover is not a scene prop', () => {
    const { container } = render(
      <WheelScene {...base} pickedKeys={new Set(['Fruity>Berry>Blueberry'])} focusFamily="Fruity" focusKey="Fruity>Berry" />,
    )
    expect(screen.getByRole('button', { name: 'Fruity / Berry / Blueberry' }).classList.contains('is-picked')).toBe(true)
    expect(screen.getByRole('button', { name: 'Fruity / Berry' }).classList.contains('is-focus')).toBe(true)
    const fams = container.querySelectorAll('.wheel-fam')
    expect(fams).toHaveLength(9)
    expect(container.querySelectorAll('.wheel-fam.is-muted')).toHaveLength(8)
    expect(container.querySelector('.wheel-fam[data-fam="Fruity"]')!.classList.contains('is-muted')).toBe(false)
  })

  it('activating a wedge (assistive tech / keyboard path) calls onActivate with the node', () => {
    const onActivate = vi.fn()
    render(<WheelScene {...base} onActivate={onActivate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    expect(onActivate).toHaveBeenCalledWith(NODES.find((n) => n.name === 'Sweet'))
  })
})
