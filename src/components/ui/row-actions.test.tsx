import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RowActions, RowContextMenu, visibleRowActions, type RowAction } from './row-actions'

const actions: RowAction[] = [
  { id: 'del', label: 'Delete', onSelect: vi.fn(), destructive: true },
  { id: 'pdf', label: 'Download PDF', onSelect: vi.fn() },
  { id: 'edit', label: 'Edit', onSelect: vi.fn(), hidden: true },
  { id: 'ovr', label: 'Override status', onSelect: vi.fn() },
]

describe('RowActions', () => {
  it('visibleRowActions drops hidden and puts destructive last', () => {
    expect(visibleRowActions(actions).map((a) => a.id)).toEqual(['pdf', 'ovr', 'del'])
  })
  it('Open calls onOpen', async () => {
    const onOpen = vi.fn()
    render(<RowActions onOpen={onOpen} actions={actions} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(onOpen).toHaveBeenCalled()
  })
  it('More lists the visible actions in order', async () => {
    render(<RowActions onOpen={() => {}} actions={actions} />)
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Download PDF', 'Override status', 'Delete'])
  })
  it('the context menu lists the same items', async () => {
    render(<RowContextMenu actions={actions}><div>row</div></RowContextMenu>)
    fireEvent.contextMenu(screen.getByText('row'))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Download PDF', 'Override status', 'Delete'])
  })
  it('selecting an item calls it', async () => {
    render(<RowActions onOpen={() => {}} actions={actions} />)
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Override status' }))
    expect(actions[3].onSelect).toHaveBeenCalled()
  })
  it('Open and More clicks do not reach a parent onClick', async () => {
    const onRow = vi.fn()
    render(<div onClick={onRow}><RowActions onOpen={() => {}} actions={actions} /></div>)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Override status' }))
    expect(onRow).not.toHaveBeenCalled()
  })
  it('renders no More trigger when every action is hidden', () => {
    render(<RowActions onOpen={() => {}} actions={[{ id: 'x', label: 'X', onSelect: vi.fn(), hidden: true }]} />)
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()
  })
  it('renders no separator when there is no destructive action', async () => {
    render(<RowActions onOpen={() => {}} actions={[{ id: 'a', label: 'A', onSelect: vi.fn() }, { id: 'b', label: 'B', onSelect: vi.fn() }]} />)
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.queryByRole('separator')).toBeNull()
  })
  it('renders a separator before destructive items', async () => {
    render(<RowActions onOpen={() => {}} actions={actions} />)
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getAllByRole('separator')).toHaveLength(1)
  })
})
