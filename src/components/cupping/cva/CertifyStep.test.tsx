import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CertifyStep } from './CertifyStep'

const base = {
  reference: '032/26',
  score: 88.75,
  minScore: 84,
  canFinalize: true,
  onCertify: vi.fn(),
}

describe('CertifyStep', () => {
  it('shows the score against the mark and that the cup passes', () => {
    render(<CertifyStep {...base} />)
    expect(screen.getByText(/88\.75/)).toBeInTheDocument()
    expect(screen.getByText(/84/)).toBeInTheDocument()
    expect(screen.getByText(/passes/i)).toBeInTheDocument()
  })

  it('says the cup falls short when the score is below the mark', () => {
    render(<CertifyStep {...base} score={83.75} />)
    expect(screen.getByText(/below/i)).toBeInTheDocument()
  })

  it('hides both actions from someone who may not certify', () => {
    render(<CertifyStep {...base} canFinalize={false} />)
    expect(screen.queryByRole('button', { name: /certify/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /override/i })).toBeNull()
  })

  it('certifies with no override when the primary action is used', () => {
    const onCertify = vi.fn()
    render(<CertifyStep {...base} onCertify={onCertify} />)
    fireEvent.click(screen.getByRole('button', { name: /certify/i }))
    expect(onCertify).toHaveBeenCalledWith(null)
  })

  it('will not submit an override without a comment', () => {
    const onCertify = vi.fn()
    render(<CertifyStep {...base} onCertify={onCertify} />)
    fireEvent.click(screen.getByRole('button', { name: /override/i }))
    fireEvent.click(screen.getByRole('button', { name: /reject this lot/i }))
    expect(onCertify).not.toHaveBeenCalled()
    expect(screen.getByText(/comment is required/i)).toBeInTheDocument()
  })

  it('submits an override with its comment', () => {
    const onCertify = vi.fn()
    render(<CertifyStep {...base} onCertify={onCertify} />)
    fireEvent.click(screen.getByRole('button', { name: /override/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'right coffee for this buyer' } })
    fireEvent.click(screen.getByRole('button', { name: /reject this lot/i }))
    expect(onCertify).toHaveBeenCalledWith({
      decision: 'rejected',
      comment: 'right coffee for this buyer',
    })
  })

  // --- Beyond the brief's floor: the tri-state third outcome, and the
  // blank-comment guard exercised on both override buttons, not just Reject.

  it('says the cup cannot be judged when no pass mark is configured, and still allows certifying', () => {
    render(<CertifyStep {...base} minScore={null} />)
    expect(screen.getByText(/cannot be judged/i)).toBeInTheDocument()
    // Not judged is not the same as failed: the primary action stays available
    // (the actual finalize call is the one authority on the outcome).
    expect(screen.getByRole('button', { name: /certify/i })).toBeInTheDocument()
  })

  it('will not submit an override via Approve without a comment either', () => {
    const onCertify = vi.fn()
    render(<CertifyStep {...base} onCertify={onCertify} />)
    fireEvent.click(screen.getByRole('button', { name: /override/i }))
    fireEvent.click(screen.getByRole('button', { name: /approve this lot/i }))
    expect(onCertify).not.toHaveBeenCalled()
    expect(screen.getByText(/comment is required/i)).toBeInTheDocument()
  })

  it('cancelling an override closes it without submitting', () => {
    const onCertify = vi.fn()
    render(<CertifyStep {...base} onCertify={onCertify} />)
    fireEvent.click(screen.getByRole('button', { name: /override/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'some comment' } })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCertify).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /certify/i })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
