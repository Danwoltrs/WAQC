import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EMPTY_FLOOR_PLAN } from '@/lib/storage/floor-plan'
import { Inspector } from './inspector'
import type { EditorDoc } from './editor-state'

const shelf = (key: string, letter: string, depth: number) => ({
  key, id: key, shelf_letter: letter, rows: 6, columns: 4, samples_per_position: 42,
  x_cm: 50, y_cm: 50, width_cm: 120, depth_cm: depth, rot: 0 as const, access_side: 'front' as const,
  locked: false, group_id: null, company_id: null, cubbies: [],
})

function editDepthThenSelectB(depthB: number) {
  const doc: EditorDoc = { plan: EMPTY_FLOOR_PLAN, shelves: [shelf('a', 'A', 40), shelf('b', 'B', depthB)] }
  const onPatch = vi.fn()
  const props = { doc, zones: new Map(), onPatch, onRotate: vi.fn(), onDelete: vi.fn() }
  const { rerender } = render(<Inspector {...props} selected={{ kind: 'shelf', key: 'a' }} />)
  const depth = screen.getByLabelText('Depth (cm)')
  fireEvent.focus(depth)
  fireEvent.change(depth, { target: { value: '60' } })
  // Clicking shelf B on the plan selects it on pointerdown, before the field blurs.
  rerender(<Inspector {...props} selected={{ kind: 'shelf', key: 'b' }} />)
  fireEvent.blur(depth)
  return { onPatch, depth }
}

describe('Inspector', () => {
  it('commits a typed value to the shape it was typed for when another shape of the same size is clicked', () => {
    const { onPatch, depth } = editDepthThenSelectB(40)
    expect(onPatch).toHaveBeenCalledTimes(1)
    expect(onPatch).toHaveBeenCalledWith({ kind: 'shelf', key: 'a' }, { d: 60 })
    expect(depth).toHaveValue('40')
  })

  it('keeps the typed value when the next shape differs, and then shows that shape', () => {
    const { onPatch, depth } = editDepthThenSelectB(50)
    expect(onPatch).toHaveBeenCalledWith({ kind: 'shelf', key: 'a' }, { d: 60 })
    expect(depth).toHaveValue('50')
  })
})
