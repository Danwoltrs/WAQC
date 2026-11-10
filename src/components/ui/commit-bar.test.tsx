import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CommitBar } from '@/components/ui/commit-bar'

describe('CommitBar', () => {
  it('orders start, then children', () => {
    render(
      <CommitBar start={<button>Back</button>}>
        <button>Cancel</button>
        <button>Next</button>
      </CommitBar>
    )
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Back', 'Cancel', 'Next'])
  })

  it('is a square pinned bar', () => {
    const { container } = render(
      <CommitBar>
        <button>Apply</button>
      </CommitBar>
    )
    const c = (container.firstChild as HTMLElement).className
    for (const cls of ['sticky', 'bottom-0', 'border-t', 'bg-muted', 'py-3']) expect(c).toContain(cls)
    expect(c).not.toMatch(/rounded/)
  })

  it('merges className', () => {
    const { container } = render(
      <CommitBar className="z-20">
        <button>Apply</button>
      </CommitBar>
    )
    expect((container.firstChild as HTMLElement).className).toContain('z-20')
  })
})
