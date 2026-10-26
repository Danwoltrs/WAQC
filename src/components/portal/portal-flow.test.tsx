// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { PortalFlow } from './portal-flow'
import type { FlowModel } from '@/lib/portal/overview-model'

afterEach(cleanup)

const sankey: FlowModel = {
  kind: 'sankey',
  steps: ['origin', 'lab', 'seller'],
  nodes: [
    { id: 'origin:Brazil', step: 'origin', value: 'Brazil', label: 'Brazil', size: 564, approvalRate: 80 },
    { id: 'lab:Santos', step: 'lab', value: 'Santos', label: 'Santos lab', size: 564, approvalRate: 80 },
    { id: 'seller:OFI', step: 'seller', value: 'OFI', label: 'OFI', size: 100, approvalRate: 59 },
    { id: 'seller:Cooxupé', step: 'seller', value: 'Cooxupé', label: 'Cooxupé', size: 464, approvalRate: 90 },
  ],
  links: [
    { source: 'origin:Brazil', target: 'lab:Santos', size: 564, approvalRate: 80 },
    { source: 'lab:Santos', target: 'seller:OFI', size: 100, approvalRate: 59 },
    { source: 'lab:Santos', target: 'seller:Cooxupé', size: 464, approvalRate: 90 },
  ],
}

describe('PortalFlow', () => {
  it('shows headers for the drawn steps only', () => {
    render(<PortalFlow flow={sankey} onSelect={() => {}} />)
    const heads = screen.getAllByText(/^(Origin|Lab|Seller|Importer|Roaster)$/).map(e => e.textContent)
    expect(heads).toEqual(['Origin', 'Lab', 'Seller'])
  })

  it('clicking a node label selects its step and value', () => {
    const onSelect = vi.fn()
    render(<PortalFlow flow={sankey} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Brazil 564'))
    expect(onSelect).toHaveBeenCalledWith('origin', 'Brazil')
  })

  it('colours a 59% link red and titles it', () => {
    const { container } = render(<PortalFlow flow={sankey} onSelect={() => {}} />)
    const strokes = [...container.querySelectorAll('path')].map(p => p.getAttribute('stroke'))
    expect(strokes).toContain('#ef4444')
    expect(container.textContent).toContain('Santos lab → OFI: 100 certificates, 59% approved')
  })

  it('words link titles and node labels in MT when unit is mt', () => {
    const { container } = render(<PortalFlow flow={sankey} unit="mt" onSelect={() => {}} />)
    expect(container.textContent).toContain('Santos lab → OFI: 100.0 MT on SS, 59% approved')
    expect(container.querySelector('[aria-label="OFI, 100.0 MT on SS, 59% approved"]')).toBeTruthy()
    expect(container.textContent).not.toContain('100 certificates')
  })

  it('renders a ranking table and selects by row name', () => {
    const onSelect = vi.fn()
    const flow: FlowModel = {
      kind: 'ranking', step: 'seller',
      rows: [
        { value: 'OFI', label: 'OFI', certificates: 20, rejected: 0, approvalRate: 100, fewLots: false },
        { value: 'Brascof', label: 'Brascof', certificates: 8, rejected: 2, approvalRate: 75, fewLots: true },
      ],
    }
    render(<PortalFlow flow={flow} onSelect={onSelect} />)
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText('75%')).toBeTruthy()
    fireEvent.click(screen.getByText('Brascof'))
    expect(onSelect).toHaveBeenCalledWith('seller', 'Brascof')
  })

  it('renders the empty state', () => {
    render(<PortalFlow flow={{ kind: 'empty' }} onSelect={() => {}} />)
    expect(screen.getByText('No certificates for this selection')).toBeTruthy()
  })

  it('Enter on a node selects it', () => {
    const onSelect = vi.fn()
    render(<PortalFlow flow={sankey} onSelect={onSelect} />)
    const node = screen.getByRole('button', { name: 'OFI, 100 certificates, 59% approved' })
    fireEvent.keyDown(node, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('seller', 'OFI')
  })

  it('measures the container when a ranking is replaced by a sankey', () => {
    const observed: Element[] = []
    class RO { observe(el: Element) { observed.push(el) } disconnect() {} }
    vi.stubGlobal('ResizeObserver', RO)
    const spy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(700)
    const ranking: FlowModel = { kind: 'ranking', step: 'seller', rows: [] }
    const { container, rerender } = render(<PortalFlow flow={ranking} onSelect={() => {}} />)
    expect(observed).toHaveLength(0)
    rerender(<PortalFlow flow={sankey} onSelect={() => {}} />)
    expect(observed).toHaveLength(1)
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('700')
    spy.mockRestore()
    vi.unstubAllGlobals()
  })
})
