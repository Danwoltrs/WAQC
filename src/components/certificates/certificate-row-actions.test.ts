import { describe, it, expect, vi, afterEach } from 'vitest'
import { certificateRowActions } from './certificate-row-actions'

const setup = (canEdit: boolean) => {
  const handlers = { onDownload: vi.fn(), onEdit: vi.fn(), onOverride: vi.fn() }
  return { handlers, actions: certificateRowActions({ canEdit, ...handlers }) }
}
const byId = (actions: ReturnType<typeof certificateRowActions>, id: string) => actions.find((a) => a.id === id)!

afterEach(() => vi.useRealTimers())

describe('certificateRowActions', () => {
  it('lists Download PDF, Edit and Override status, in that order', () => {
    expect(setup(true).actions.map((a) => a.label)).toEqual(['Download PDF', 'Edit', 'Override status'])
  })

  it('hides Edit unless the user may edit', () => {
    expect(byId(setup(false).actions, 'edit').hidden).toBe(true)
    expect(byId(setup(true).actions, 'edit').hidden).toBe(false)
  })

  it('nothing is destructive', () => {
    expect(setup(true).actions.some((a) => a.destructive)).toBe(false)
  })

  it('Download PDF runs straight away', () => {
    const { actions, handlers } = setup(true)
    byId(actions, 'download').onSelect()
    expect(handlers.onDownload).toHaveBeenCalledTimes(1)
  })

  // R6: the menu must finish closing before a dialog takes focus.
  it('Edit and Override status open on the next tick, after the menu has closed', () => {
    vi.useFakeTimers()
    const { actions, handlers } = setup(true)
    byId(actions, 'edit').onSelect()
    byId(actions, 'override').onSelect()
    expect(handlers.onEdit).not.toHaveBeenCalled()
    expect(handlers.onOverride).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(handlers.onEdit).toHaveBeenCalledTimes(1)
    expect(handlers.onOverride).toHaveBeenCalledTimes(1)
  })
})
