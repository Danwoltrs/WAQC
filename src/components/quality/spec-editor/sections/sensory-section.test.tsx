import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SensorySection } from './sensory-section'
import type { RegionalProfile } from '@/lib/sensory'

const cerrado: RegionalProfile = {
  id: 'p1', name: 'Cerrado Mineiro', origin: 'Brazil', region: 'Minas Gerais',
  notes: [['Sweet', 'Chocolate'], ['Nutty']], description: 'Round and sweet.', is_active: true,
}
const sul: RegionalProfile = { ...cerrado, id: 'p2', name: 'Sul de Minas', region: 'South Minas', notes: [], description: null }

describe('SensorySection', () => {
  it('has a Sensory notes switch, off by default, that patches the flag', async () => {
    const patch = vi.fn()
    render(<SensorySection params={{}} patch={patch} profiles={[cerrado]} />)
    const sw = screen.getByRole('switch', { name: /sensory notes/i })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(sw)
    expect(patch).toHaveBeenCalledWith({ sensory_notes_enabled: true })
  })

  it('reads the switch from params', () => {
    render(<SensorySection params={{ sensory_notes_enabled: true }} patch={vi.fn()} profiles={[]} />)
    expect(screen.getByRole('switch', { name: /sensory notes/i })).toHaveAttribute('aria-checked', 'true')
  })

  it('picking a profile patches {id,name}', async () => {
    const patch = vi.fn()
    render(<SensorySection params={{}} patch={patch} profiles={[cerrado, sul]} />)
    await userEvent.click(screen.getByRole('combobox', { name: /regional profile/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Sul de Minas' }))
    expect(patch).toHaveBeenCalledWith({ regional_profile: { id: 'p2', name: 'Sul de Minas' } })
  })

  it('picking None patches regional_profile null', async () => {
    const patch = vi.fn()
    render(<SensorySection params={{ regional_profile: { id: 'p1', name: 'Cerrado Mineiro' } }} patch={patch} profiles={[cerrado]} />)
    await userEvent.click(screen.getByRole('combobox', { name: /regional profile/i }))
    await userEvent.click(screen.getByRole('option', { name: 'None' }))
    expect(patch).toHaveBeenCalledWith({ regional_profile: null })
  })

  it('shows region, notes as words and description of the selected profile', () => {
    render(<SensorySection params={{ regional_profile: { id: 'p1', name: 'Cerrado Mineiro' } }} patch={vi.fn()} profiles={[cerrado]} />)
    expect(screen.getByText('Minas Gerais')).toBeInTheDocument()
    expect(screen.getByText('Chocolate, Nutty')).toBeInTheDocument()
    expect(screen.getByText('Round and sweet.')).toBeInTheDocument()
  })

  it('an inactive profile already on the quality stays selected with (inactive)', () => {
    render(<SensorySection params={{ regional_profile: { id: 'gone', name: 'Old Region' } }} patch={vi.fn()} profiles={[cerrado]} />)
    expect(screen.getByRole('combobox', { name: /regional profile/i })).toHaveTextContent('Old Region (inactive)')
  })

  it('fetches the active profiles itself when profiles is null', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ profiles: [cerrado] }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<SensorySection params={{ regional_profile: { id: 'p1', name: 'Cerrado Mineiro' } }} patch={vi.fn()} profiles={null} />)
    expect(await screen.findByText('Round and sweet.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/regional-profiles?active=true')
    vi.unstubAllGlobals()
  })
})
