import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApprovedWithCommentsBadge } from './approved-with-comments-badge'

describe('ApprovedWithCommentsBadge', () => {
  it('names the issued screen values', () => {
    render(
      <ApprovedWithCommentsBadge
        issued={{ screen_percentages: { '18': 30, '15': 66.1 }, defects: null }}
      />,
    )
    expect(screen.getByText(/Approved with comments/i)).toBeTruthy()
    expect(screen.getByText(/Issued: Screen 18 30%/i)).toBeTruthy()
  })

  it('names the issued defect total', () => {
    render(
      <ApprovedWithCommentsBadge
        issued={{ screen_percentages: null, defects: { counts: {}, primary: 2, secondary: 10, total: 12 } }}
      />,
    )
    expect(screen.getByText(/Issued: 12 defects/i)).toBeTruthy()
  })

  it('renders nothing without a decision', () => {
    const { container } = render(<ApprovedWithCommentsBadge issued={null} />)
    expect(container.firstChild).toBeNull()
  })
})
