import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CertificatePager } from './certificate-pager'

describe('CertificatePager', () => {
  it('renders nothing while every certificate fits on one page', () => {
    const { container } = render(<CertificatePager page={1} pageSize={100} total={100} onPage={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('counts a part-filled last page and pages one step at a time', () => {
    const onPage = vi.fn()
    render(<CertificatePager page={2} pageSize={100} total={301} onPage={onPage} />)
    expect(screen.getByText('Page 2 of 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onPage.mock.calls).toEqual([[1], [3]])
  })

  it('disables Previous on the first page and Next on the last', () => {
    const { rerender } = render(<CertificatePager page={1} pageSize={100} total={101} onPage={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    rerender(<CertificatePager page={2} pageSize={100} total={101} onPage={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})
