import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ZoneAssignBox } from './zone-assign-box'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify({
    clients: String(url).includes('search=aho') ? [{ id: 'co-1', name: 'Ahold Delhaize USA', company: 'Ahold' }] : [],
  }))))
})

describe('ZoneAssignBox', () => {
  it('offers General first and assigns nothing until a choice is made', () => {
    const onAssign = vi.fn()
    render(<ZoneAssignBox label="Assign 4 cubbies" onAssign={onAssign} />)
    const assign = screen.getByRole('button', { name: 'Assign 4 cubbies' })
    expect(assign).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'General (no client)' }))
    fireEvent.click(assign)
    expect(onAssign).toHaveBeenCalledWith(null)
  })

  it('searches QC clients and assigns the one picked, by trade name', async () => {
    const onAssign = vi.fn()
    render(<ZoneAssignBox label="Assign whole shelf" onAssign={onAssign} />)
    fireEvent.change(screen.getByLabelText('Search clients'), { target: { value: 'aho' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Ahold' }))
    fireEvent.click(screen.getByRole('button', { name: 'Assign whole shelf' }))
    expect(onAssign).toHaveBeenCalledWith({ id: 'co-1', name: 'Ahold' })
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).startsWith('/api/clients?search=aho'))).toBe(true)
  })
})
