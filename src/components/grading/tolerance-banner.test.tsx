import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToleranceBanner } from './tolerance-banner'
import type { ToleranceAssessment, ToleranceItem, ToleranceQuadrant } from '@/lib/tolerance/types'

const distributionItem: ToleranceItem = {
  key: 'screen_18_max',
  label: 'Screen 18',
  quadrant: 'distribution',
  direction: 'max',
  actual: 12.5,
  limit: 10,
  gap: 2.5,
  tolerance: 3,
}

const defectsItem: ToleranceItem = {
  key: 'defects_total',
  label: 'Total defects',
  quadrant: 'defects',
  direction: 'max',
  actual: 22,
  limit: 20,
  gap: 2,
  tolerance: 5,
}

const assessment = (items: ToleranceItem[], offered = true): ToleranceAssessment => ({
  offered,
  items,
  blockedBy: [],
})

/**
 * Mirrors the grading page's own wiring: a combined banner (no `quadrant`
 * prop) renders only when the offered items span more than one quadrant;
 * otherwise each quadrant renders its own single-quadrant banner. Exercising
 * both call sites together is what proves exactly one banner is ever visible
 * for a given assessment, which is the behavior the brief requires.
 */
function PageLikeBanners({ a, onApprove }: { a: ToleranceAssessment; onApprove: () => void }) {
  const quadrantCount = new Set(a.items.map((i) => i.quadrant)).size
  return (
    <div>
      {quadrantCount > 1 && <ToleranceBanner assessment={a} onApprove={onApprove} />}
      <div data-testid="distribution-card">
        {quadrantCount === 1 && (
          <ToleranceBanner assessment={a} quadrant="distribution" onApprove={onApprove} />
        )}
      </div>
      <div data-testid="defects-card">
        {quadrantCount === 1 && (
          <ToleranceBanner assessment={a} quadrant="defects" onApprove={onApprove} />
        )}
      </div>
    </div>
  )
}

describe('ToleranceBanner', () => {
  it('renders nothing when the assessment is not offered', () => {
    const { container } = render(
      <ToleranceBanner assessment={assessment([distributionItem], false)} onApprove={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a quadrant with no items', () => {
    const { container } = render(
      <ToleranceBanner assessment={assessment([distributionItem])} quadrant="defects" onApprove={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders exactly one combined banner when misses span both quadrants', () => {
    render(<PageLikeBanners a={assessment([distributionItem, defectsItem])} onApprove={() => {}} />)
    expect(screen.getAllByText(/items within tolerance/)).toHaveLength(1)
    expect(screen.getByText(/Screen 18/)).toBeInTheDocument()
    expect(screen.getByText(/Total defects/)).toBeInTheDocument()
  })

  it('renders exactly one single-quadrant banner, inside the affected quadrant only, when misses are confined to one', () => {
    render(<PageLikeBanners a={assessment([distributionItem])} onApprove={() => {}} />)
    expect(screen.getAllByText(/item.* within tolerance/)).toHaveLength(1)
    const distributionCard = screen.getByTestId('distribution-card')
    const defectsCard = screen.getByTestId('defects-card')
    expect(distributionCard).toHaveTextContent('Screen 18')
    expect(defectsCard).toBeEmptyDOMElement()
  })

  it('singularizes the label for exactly one item', () => {
    render(<ToleranceBanner assessment={assessment([distributionItem])} onApprove={() => {}} />)
    expect(screen.getByText('1 item within tolerance:')).toBeInTheDocument()
  })

  it('calls onApprove when the button is clicked', async () => {
    const user = userEvent.setup()
    const onApprove = vi.fn()
    render(<ToleranceBanner assessment={assessment([distributionItem])} onApprove={onApprove} />)
    await user.click(screen.getByRole('button', { name: 'Approve with comments' }))
    expect(onApprove).toHaveBeenCalledTimes(1)
  })
})
