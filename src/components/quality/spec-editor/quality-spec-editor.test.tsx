import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QualitySpecEditor } from './quality-spec-editor'
import { sectionTitle } from './spec-editor-body'
import { MainLayoutContext } from '@/components/layout/main-layout-context'

const noop = () => Promise.resolve()

describe('QualitySpecEditor shell', () => {
  it('shows the section name as the green last crumb', () => {
    render(<QualitySpecEditor template={{ name_en: 'Ahold SAP', version: 4, parameters: {} }} onSave={noop} onCancel={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Basic information' }).className).toContain('text-primary')
    expect(screen.getByText('Ahold SAP')).toBeInTheDocument()
    expect(screen.getByText('v4')).toBeInTheDocument()
  })

  it('follows the nav', async () => {
    render(<QualitySpecEditor template={{ name_en: 'Ahold SAP', parameters: {} }} onSave={noop} onCancel={vi.fn()} />)
    await userEvent.click(screen.getAllByText('Defects')[0])
    expect(screen.getByRole('heading', { level: 1, name: 'Defects' })).toBeInTheDocument()
  })

  it('has no section heading or subtitle in the body', () => {
    render(<QualitySpecEditor template={{ name_en: 'X', parameters: {} }} onSave={noop} onCancel={vi.fn()} />)
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    expect(screen.queryByText('Name, origin and how this template is shared.')).toBeNull()
  })

  it('the Quality Templates crumb and the back arrow cancel', async () => {
    const onCancel = vi.fn()
    render(<QualitySpecEditor template={{ name_en: 'X', parameters: {} }} onSave={noop} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quality Templates' }))
    await userEvent.click(screen.getByRole('button', { name: 'Back to Quality Templates' }))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('marks Active in the primary colour when on, muted when off', () => {
    const { unmount } = render(<QualitySpecEditor template={{ name_en: 'X', parameters: {}, is_active: true }} onSave={noop} onCancel={vi.fn()} />)
    expect(screen.getByText('Active').className).toContain('text-primary')
    unmount()
    render(<QualitySpecEditor template={{ name_en: 'X', parameters: {}, is_active: false }} onSave={noop} onCancel={vi.fn()} />)
    expect(screen.getByText('Active').className).toContain('text-muted-foreground')
  })

  it('adds no menu-button padding even inside MainLayout (R2)', () => {
    render(
      <MainLayoutContext.Provider value={true}>
        <QualitySpecEditor template={{ name_en: 'X', parameters: {} }} onSave={noop} onCancel={vi.fn()} />
      </MainLayoutContext.Provider>,
    )
    const row = screen.getByRole('navigation', { name: 'Breadcrumb' }).parentElement!
    expect(row.className).not.toContain('max-lg:pl-16')
  })

  it('has no card frames in the basic section', () => {
    const { container } = render(<QualitySpecEditor template={{ name_en: 'X', parameters: {} }} onSave={noop} onCancel={vi.fn()} />)
    expect(container.querySelector('.rounded-2xl')).toBeNull()
  })

  it('sectionTitle names every section', () => {
    expect(sectionTitle('screen')).toBe('Screen sizes')
  })
})
