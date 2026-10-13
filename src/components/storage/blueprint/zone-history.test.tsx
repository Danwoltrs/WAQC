import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ZoneHistory, zoneEventLine } from './zone-history'

describe('zoneEventLine', () => {
  it('writes the time, who, the cubbies in shelf order and the change', () => {
    const at = new Date(2026, 9, 13, 14, 2).toISOString()
    const codes = ['B-A10', 'B-A2', 'B-A1', 'B-A3', 'B-A4', 'B-A5', 'B-A6', 'B-A7', 'B-A8', 'B-A9']
    expect(zoneEventLine({ changed_at: at, changed_by_name: 'Daniel Wolthers', from_name: null, to_name: 'Ahold', codes })).toEqual({
      when: '13 Oct 14:02',
      who: 'Daniel Wolthers',
      what: 'B-A1, B-A2, B-A3, B-A4, B-A5, B-A6, B-A7, B-A8 +2 more: General → Ahold',
    })
  })
})

describe('ZoneHistory', () => {
  it("loads one shelf's history and says when there is none", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ events: [] })))
    vi.stubGlobal('fetch', fetchMock)
    render(<ZoneHistory laboratoryId="lab" shelfId="s-1" pageSize={10} token={0} />)
    expect(await screen.findByText('No zone changes yet')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/laboratories/lab/storage/zone-history?limit=10&shelf=s-1')
  })

  it('says the history is unavailable when it fails to load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    render(<ZoneHistory laboratoryId="lab" shelfId={null} pageSize={20} token={0} />)
    expect(await screen.findByText('Zone history unavailable')).toBeInTheDocument()
  })
})
