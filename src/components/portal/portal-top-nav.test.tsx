import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PortalTopNav } from './portal-top-nav'
import { PORTAL_NAV } from './portal-nav'

describe('PortalTopNav', () => {
  it('links every item with the company and marks the active one', () => {
    render(<PortalTopNav pathname="/portal/samples" items={PORTAL_NAV.slice(0, 4)} companyId="c1"
      companies={[{ id: 'c1', name: 'Roastery One' }]} onSwitchCompany={() => {}} onSignOut={() => {}} />)
    expect(screen.getByRole('link', { name: 'Samples' })).toHaveAttribute('href', '/portal/samples?company=c1')
    expect(screen.getByRole('link', { name: 'Samples' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Roastery One')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('offers a company switcher only with more than one company', () => {
    const onSwitch = vi.fn()
    render(<PortalTopNav pathname="/portal" items={PORTAL_NAV.slice(0, 1)} companyId="c1"
      companies={[{ id: 'c1', name: 'Roastery One' }, { id: 'c2', name: 'Roastery Two' }]} onSwitchCompany={onSwitch} onSignOut={() => {}} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Company' }), { target: { value: 'c2' } })
    expect(onSwitch).toHaveBeenCalledWith('c2')
  })
})
