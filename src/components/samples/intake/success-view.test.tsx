import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SuccessView } from './success-view'

/**
 * The New Sample success screen printed the SAN- lab number as the
 * "Tracking Number" and linked to /samples/<SAN slug> (Daniel 2026-10-07:
 * "fix that please"). The lab number is a backend key and is never shown
 * (CLAUDE.md). A new lot has no certificate yet, so it is named by its own
 * reference and its contract, and opened by its id.
 */

const labUnit = {
  id: 's-1',
  tracking_number: 'SAN-00999/26',
  exporter_sample_number: 'SL 1201/26',
  container_nr: null,
  ico_number: null,
  wolthers_contract_nr: '42611/26',
}

describe('SuccessView', () => {
  it('names the lot by its own reference and contract, never its lab number', () => {
    render(<SuccessView samples={[labUnit]} onReset={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Sample created' })).toBeInTheDocument()
    expect(screen.getByText('SMP SL 1201/26')).toBeInTheDocument()
    expect(screen.getByText('Contract #42611/26')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/SAN-|Tracking Number/i)
  })

  it('opens the sample by its id, not by a link built from the lab number', () => {
    render(<SuccessView samples={[labUnit]} onReset={() => {}} />)
    const view = screen.getByRole('link', { name: 'View sample' })
    expect(view).toHaveAttribute('href', '/samples/qc?open=s-1')
    for (const link of screen.getAllByRole('link')) expect(link.getAttribute('href')).not.toMatch(/SAN/i)
  })

  it('counts the contracts a lot was taken in for', () => {
    const sibling = { ...labUnit, id: 's-2', tracking_number: 'SAN-01000/26', wolthers_contract_nr: '42612/26' }
    render(<SuccessView samples={[labUnit, sibling]} onReset={() => {}} />)
    expect(screen.getByRole('heading', { name: '2 samples created' })).toBeInTheDocument()
    expect(screen.getByText('Contracts #42611/26, #42612/26')).toBeInTheDocument()
  })

  it('says nothing it does not know: a lot with no reference or contract yet', () => {
    const bare = { id: 's-3', tracking_number: 'SAN-01001/26', exporter_sample_number: null, wolthers_contract_nr: null }
    render(<SuccessView samples={[bare]} onReset={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Sample created' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/SAN-|Contract/)
    expect(screen.getByRole('link', { name: 'View sample' })).toHaveAttribute('href', '/samples/qc?open=s-3')
  })

  it('starts another sample', () => {
    const onReset = vi.fn()
    render(<SuccessView samples={[labUnit]} onReset={onReset} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create another sample' }))
    expect(onReset).toHaveBeenCalled()
  })
})
