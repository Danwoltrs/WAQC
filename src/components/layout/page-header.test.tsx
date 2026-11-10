import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PageHeader } from './page-header'

describe('PageHeader', () => {
  it('renders the last crumb as the green h1', () => {
    render(<PageHeader crumbs={[{ label: 'Samples', href: '/samples' }, { label: 'QC Samples' }]} />)
    const h1 = screen.getByRole('heading', { level: 1, name: 'QC Samples' })
    expect(h1.className).toContain('text-primary'); expect(h1.className).toContain('text-[18px]'); expect(h1.className).toContain('font-semibold')
  })
  it('links earlier crumbs and separates them with "/"', () => {
    render(<PageHeader crumbs={[{ label: 'Samples', href: '/samples' }, { label: 'QC Samples' }]} />)
    expect(screen.getByRole('link', { name: 'Samples' })).toHaveAttribute('href', '/samples')
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toContain('/')
  })
  it('calls onClick crumbs (overlays)', async () => {
    const onClick = vi.fn()
    render(<PageHeader crumbs={[{ label: 'Quality Templates', onClick }, { label: 'Basic information' }]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quality Templates' })); expect(onClick).toHaveBeenCalled()
  })
  it('shows an emphasis crumb in foreground 14px/600 with its badge', () => {
    render(<PageHeader crumbs={[{ label: 'Quality Templates', onClick: () => {} }, { label: 'Ahold SAP', emphasis: true, badge: <span>v4</span> }, { label: 'Basic information' }]} />)
    const rec = screen.getByText('Ahold SAP'); expect(rec.className).toContain('text-foreground'); expect(rec.className).toContain('text-[14px]')
    expect(screen.getByText('v4')).toBeInTheDocument()
  })
  it('shows the count after the title', () => {
    render(<PageHeader crumbs={[{ label: 'Quality Templates' }]} count={24} />)
    expect(screen.getByText('24')).toBeInTheDocument()
  })
  it('renders a back button with its label', () => {
    const onClick = vi.fn(); render(<PageHeader back={{ onClick, label: 'Back to Quality Templates' }} crumbs={[{ label: 'X' }]} />)
    expect(screen.getByRole('button', { name: 'Back to Quality Templates' })).toBeInTheDocument()
  })
  it('is sticky by default and not when sticky={false}', () => {
    const { container, rerender } = render(<PageHeader crumbs={[{ label: 'X' }]} />)
    expect((container.firstChild as HTMLElement).className).toContain('sticky')
    rerender(<PageHeader crumbs={[{ label: 'X' }]} sticky={false} />)
    expect((container.firstChild as HTMLElement).className).not.toContain('sticky')
  })
  it('places the toolbar on its own row by default, inline when asked', () => {
    const { rerender } = render(<PageHeader crumbs={[{ label: 'X' }]} toolbar={<input aria-label="Search" />} />)
    expect(screen.getByTestId('page-header-toolbar-row')).toContainElement(screen.getByLabelText('Search'))
    rerender(<PageHeader crumbs={[{ label: 'X' }]} toolbar={<input aria-label="Search" />} toolbarPlacement="inline" />)
    expect(screen.queryByTestId('page-header-toolbar-row')).toBeNull()
  })
  it('forwards its ref to the outer element', () => {
    const ref = React.createRef<HTMLDivElement>()
    const { container } = render(<PageHeader ref={ref} crumbs={[{ label: 'X' }]} />)
    expect(ref.current).toBe(container.firstChild)
  })
  it('hides all but the last two crumbs below sm', () => {
    render(<PageHeader crumbs={[{ label: 'A', href: '/a' }, { label: 'B', href: '/b' }, { label: 'C' }]} />)
    expect(screen.getByRole('link', { name: 'A' }).closest('li')!.className).toContain('hidden sm:flex')
    expect(screen.getByRole('link', { name: 'B' }).closest('li')!.className).not.toContain('hidden')
  })
})
