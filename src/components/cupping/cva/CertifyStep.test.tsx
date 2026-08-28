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
  it('an already-decided lot leads with the decision and its certificate, not with Certify', () => {
    // The lot has been through this step before. Offering Certify again invites
    // a re-cup nobody needs, and hides the one thing the viewer came for.
    render(<CertifyStep {...base} decision="approved" certificateHref="/certificates?open=s1" />)
    expect(screen.getByText(/already approved/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view certificate/i })).toHaveAttribute(
      'href', '/certificates?open=s1',
    )
    expect(screen.queryByRole('button', { name: /^certify$/i })).toBeNull()
  })

  it('keeps Override reachable on a decided lot, for a re-decision', () => {
    render(<CertifyStep {...base} decision="rejected" certificateHref="/certificates?open=s1" />)
    expect(screen.getByText(/already rejected/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^override$/i }))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('shows a decided lot its certificate even to someone who may not certify', () => {
    // Reading the outcome is not the same permission as changing it: the link
    // stays, the Override does not, and the "no permission" note would only be
    // noise beside a decision that has already been made.
    render(
      <CertifyStep {...base} canFinalize={false} decision="approved" certificateHref="/certificates?open=s1" />,
    )
    expect(screen.getByRole('link', { name: /view certificate/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^override$/i })).toBeNull()
    expect(screen.queryByText(/do not have permission/i)).toBeNull()
  })

  it('still offers Certify when nothing has been decided yet', () => {
    render(<CertifyStep {...base} decision={null} />)
    expect(screen.getByRole('button', { name: /^certify$/i })).toBeInTheDocument()
    expect(screen.queryByText(/already/i)).toBeNull()
  })

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

  // --- Review follow-ups: the unjudged pill's colour, and in-flight behaviour.

  it('renders the unjudged verdict with a solid, readable fill rather than the near-transparent hairline tint', () => {
    render(<CertifyStep {...base} minScore={null} />)
    const pill = screen.getByText(/cannot be judged/i)
    // Not var(--cva-hair) — that token is ~6% black in light mode and reads as
    // pale grey behind white text. #151618 (SCORE_ACCENT's own dark neutral)
    // stays readable in both themes.
    expect(pill).toHaveStyle({ background: '#151618' })
  })

  it('disables the primary actions while a request is in flight', () => {
    render(<CertifyStep {...base} busy />)
    expect(screen.getByRole('button', { name: /certify/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /override/i })).toBeDisabled()
  })

  it('disables the override form and its actions while a request is in flight', () => {
    const { rerender } = render(<CertifyStep {...base} />)
    fireEvent.click(screen.getByRole('button', { name: /override/i }))
    rerender(<CertifyStep {...base} busy />)
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /approve this lot/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /reject this lot/i })).toBeDisabled()
  })

  it('shows in-flight labels for the action actually taken, then resets the override form once the request resolves', () => {
    const onCertify = vi.fn()
    const { rerender } = render(<CertifyStep {...base} onCertify={onCertify} />)
    fireEvent.click(screen.getByRole('button', { name: /override/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'retry note' } })
    fireEvent.click(screen.getByRole('button', { name: /reject this lot/i }))
    expect(onCertify).toHaveBeenCalledWith({ decision: 'rejected', comment: 'retry note' })

    // Parent flips busy on for the round trip — only the clicked action's
    // button relabels; nothing was clicked on the Approve side.
    rerender(<CertifyStep {...base} onCertify={onCertify} busy />)
    expect(screen.getByRole('button', { name: /rejecting/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^approve this lot$/i })).toBeInTheDocument()

    // Parent flips busy back off once the response lands — the override form
    // closes and resets rather than sitting stale with the old comment.
    rerender(<CertifyStep {...base} onCertify={onCertify} busy={false} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('button', { name: /^certify$/i })).toBeInTheDocument()
  })
})
