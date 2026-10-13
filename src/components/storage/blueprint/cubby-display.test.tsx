import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CubbyDisplay, type CubbyDisplayProps } from './cubby-display'
import type { EditorShelf } from './editor-state'
import { zoneStyles } from './zone-colors'

const shelf: EditorShelf = {
  key: 's-b', id: 's-b', shelf_letter: 'B', rows: 2, columns: 2, samples_per_position: 42,
  x_cm: 0, y_cm: 0, width_cm: 100, depth_cm: 40, rot: 0, access_side: 'front',
  locked: false, group_id: null, company_id: null,
  cubbies: [{ id: 'p1', row: 1, column: 1, code: 'B-A1', capacity: 42, occupied: 2, company_id: null }],
  zone_edits: { '1:2': 'co-1' },
}
const props = (over: Partial<CubbyDisplayProps> = {}): CubbyDisplayProps => ({
  laboratoryId: 'lab', shelf, mode: 'edit', zones: zoneStyles(['co-1']), names: new Map([['co-1', 'Ahold']]),
  pick: null, highlightCubbyId: null, historyToken: 0, onClose: vi.fn(), onPick: vi.fn(), onAssign: vi.fn(), ...over,
})

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/cubbies/')) {
      return new Response(JSON.stringify({
        cubby: { id: 'p1', code: 'B-A1' },
        samples: [{ id: 'x', label: 'SAG-011895/26', contract: '42273/26', client: 'Ahold' }],
      }))
    }
    if (url.includes('zone-history')) return new Response(JSON.stringify({ events: [] }))
    return new Response(JSON.stringify({ clients: [] }))
  }))
})

describe('CubbyDisplay', () => {
  it('shows the shelf big with its pending zones, and turns clicks into picks', () => {
    const p = props()
    render(<CubbyDisplay {...p} />)
    expect(screen.getByRole('dialog', { name: 'Shelf B' })).toBeInTheDocument()
    expect(screen.getByTestId('cubby-B-A2')).toHaveTextContent('Ahold')
    fireEvent.click(screen.getByTestId('cubby-B-A1'))
    fireEvent.click(screen.getByTestId('cubby-B-B2'), { metaKey: true })
    fireEvent.click(screen.getByTestId('cubby-B-B1'), { shiftKey: true })
    expect(vi.mocked(p.onPick).mock.calls).toEqual([['1:1', 'only'], ['2:2', 'toggle'], ['2:1', 'range']])
  })

  it('names the assign button by the pick and outlines the picked cubbies', () => {
    render(<CubbyDisplay {...props({ pick: { shelfKey: 's-b', cells: ['1:1', '1:2'], anchor: '1:1' } })} />)
    expect(screen.getByRole('button', { name: 'Assign 2 cubbies' })).toBeInTheDocument()
    expect(screen.getByTestId('cubby-B-A1')).toHaveAttribute('aria-pressed', 'true')
  })

  it("when viewing, lists a clicked cubby's samples by certificate number, with no assigning", async () => {
    render(<CubbyDisplay {...props({ mode: 'view' })} />)
    fireEvent.click(screen.getByTestId('cubby-B-A1'))
    expect(await screen.findByText('SAG-011895/26')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Assign/ })).toBeNull()
  })

  it('asks no history for a shelf drawn in this session', () => {
    render(<CubbyDisplay {...props({ shelf: { ...shelf, id: undefined } })} />)
    expect(screen.getByText("Save the plan to start this shelf's zone history.")).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes('zone-history'))).toBe(false)
  })

  it('closes on Escape, and the page behind sees the key as handled', () => {
    const p = props()
    const behind = vi.fn()
    window.addEventListener('keydown', behind)
    render(<CubbyDisplay {...p} />)
    fireEvent.keyDown(screen.getByTestId('cubby-B-A1'), { key: 'Escape' })
    window.removeEventListener('keydown', behind)
    expect(p.onClose).toHaveBeenCalled()
    expect(behind.mock.calls.every(([e]) => (e as KeyboardEvent).defaultPrevented)).toBe(true)
  })
})
