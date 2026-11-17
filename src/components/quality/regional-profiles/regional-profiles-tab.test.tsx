import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/sensory/sensory-wheel-dialog', () => ({
  SensoryWheelDialog: ({ open, cap, onSave }: any) =>
    open ? (
      <button style={{ pointerEvents: 'auto' }} onPointerDown={(e) => e.stopPropagation()} onClick={() => onSave([['Fruity', 'Berry', 'Blackberry'], ['Sweet', 'Vanilla']])}>
        mock-wheel-cap-{cap}
      </button>
    ) : null,
}))

import { RegionalProfilesTab } from './regional-profiles-tab'

const profiles = [
  { id: 'p1', name: 'Cerrado Mineiro', origin: 'Brazil', region: 'Cerrado Mineiro', notes: [['Sweet', 'Brown Sugar', 'Honey'], ['Nutty/Cocoa', 'Nutty', 'Almond']], description: 'Round and sweet', is_active: true },
  { id: 'p2', name: 'Old profile', origin: null, region: null, notes: [], description: null, is_active: false },
]

const fetchMock = vi.fn()

function reply(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (!init || !init.method) return reply({ profiles })
    return reply({ profile: { ...profiles[0], id: 'p3' } })
  })
})

describe('RegionalProfilesTab', () => {
  it('lists name, region, notes as words and status', async () => {
    render(<RegionalProfilesTab />)
    const row = (await screen.findByText('Round and sweet')).closest('[data-profile-row]') as HTMLElement
    expect(within(row).getByText('Cerrado Mineiro', { selector: '[data-field="name"]' })).toBeInTheDocument()
    expect(within(row).getByText('Honey, Almond')).toBeInTheDocument()
    expect(within(row).getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })

  it('creates a profile from the editor with notes picked on the wheel (cap 6)', async () => {
    const user = userEvent.setup()
    render(<RegionalProfilesTab />)
    await screen.findByText('Round and sweet')
    await user.click(screen.getByRole('button', { name: 'New profile' }))
    await user.type(screen.getByLabelText('Name'), 'Mantiqueira')
    await user.selectOptions(screen.getByLabelText('Origin'), 'Brazil')
    await user.selectOptions(screen.getByLabelText('Region'), 'Mantiqueira de Minas')
    await user.type(screen.getByLabelText('Description'), 'Bright')
    await user.click(screen.getByRole('button', { name: /Pick notes/ }))
    await user.click(screen.getByRole('button', { name: 'mock-wheel-cap-6', hidden: true }))
    expect(screen.getByText('Blackberry, Vanilla')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
      expect(post[0]).toBe('/api/regional-profiles')
      expect(JSON.parse(post[1].body)).toEqual({
        name: 'Mantiqueira',
        origin: 'Brazil',
        region: 'Mantiqueira de Minas',
        description: 'Bright',
        notes: [['Fruity', 'Berry', 'Blackberry'], ['Sweet', 'Vanilla']],
      })
    })
  })

  it('deactivates an active profile via PATCH is_active', async () => {
    const user = userEvent.setup()
    render(<RegionalProfilesTab />)
    const row = (await screen.findByText('Round and sweet')).closest('[data-profile-row]') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!
      expect(patch[0]).toBe('/api/regional-profiles/p1')
      expect(JSON.parse(patch[1].body)).toEqual({ is_active: false })
    })
  })
})
