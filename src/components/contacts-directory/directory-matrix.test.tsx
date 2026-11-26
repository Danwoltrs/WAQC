import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DirectoryMatrix } from './directory-matrix'
import type { DirectoryCompany } from './types'

const contact = (over: Record<string, unknown> = {}) => ({
  id: 'c1', name: 'Ana Silva', nickname: null, email: 'ana@acme.com', phone: null, whatsapp: null,
  preferred_language: 'en', role: 'QC', is_group: false, is_primary: false, routing_purposes: ['sale_confirmations'],
  ...over,
})

const companies: DirectoryCompany[] = [
  { id: 'co1', name: 'Acme Legal Ltd', fantasy_name: 'Acme', trading_roles: ['buyer'], contacts: [contact() as any] },
  { id: 'co2', name: 'Empty Co', fantasy_name: null, trading_roles: [], contacts: [] },
]

function setup(over: Partial<React.ComponentProps<typeof DirectoryMatrix>> = {}) {
  const props = {
    companies,
    pending: new Set<string>(),
    onOpenCompany: vi.fn(),
    onOpenContact: vi.fn(),
    onAddContact: vi.fn(),
    onTogglePurpose: vi.fn(),
    ...over,
  }
  render(<DirectoryMatrix {...props} />)
  return props
}

describe('DirectoryMatrix', () => {
  it('opens the company when its name is clicked', () => {
    const p = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Acme' }))
    expect(p.onOpenCompany).toHaveBeenCalledWith('co1')
  })

  it('shows the fantasy name, never only the legal name', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Acme' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Acme Legal Ltd' })).toBeNull()
  })

  it('ticking a cell asks to set that purpose', () => {
    const p = setup()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ana Silva: Price report' }))
    expect(p.onTogglePurpose).toHaveBeenCalledWith('co1', expect.objectContaining({ id: 'c1' }), 'price_report', true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ana Silva: Sale confirmations' }))
    expect(p.onTogglePurpose).toHaveBeenLastCalledWith('co1', expect.objectContaining({ id: 'c1' }), 'sale_confirmations', false)
  })

  it('a company without contacts says so and offers Add', () => {
    const p = setup()
    const row = screen.getByText('Empty Co').closest('tr')!
    expect(within(row).getByText('no contacts')).toBeTruthy()
    fireEvent.click(within(row).getByRole('button', { name: /add/i }))
    expect(p.onAddContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'co2' }))
  })

  it('clicking a contact opens it', () => {
    const p = setup()
    fireEvent.click(screen.getByText('Ana Silva'))
    expect(p.onOpenContact).toHaveBeenCalledWith('co1', expect.objectContaining({ id: 'c1' }))
  })

  it('a contact without email cannot be ticked', () => {
    const p = setup({ companies: [{ ...companies[0], contacts: [contact({ email: null }) as any] }] })
    const box = screen.getByRole('checkbox', { name: 'Ana Silva: Price report' })
    fireEvent.click(box)
    expect(p.onTogglePurpose).not.toHaveBeenCalled()
  })
})
