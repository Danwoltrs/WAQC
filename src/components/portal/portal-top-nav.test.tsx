import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PortalTopNav } from './portal-top-nav'

describe('PortalTopNav', () => {
  it('renders all portal nav items and marks the active one', () => {
    render(<PortalTopNav pathname="/portal/samples" onSignOut={() => {}} />)
    for (const label of ['Overview', 'Contracts', 'Samples', 'Certificates']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Samples' })).toHaveAttribute('aria-current', 'page')
  })
})
