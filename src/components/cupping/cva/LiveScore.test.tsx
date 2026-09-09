import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LiveScore } from './LiveScore'
import type { LiveScore as Live } from '@/lib/cva/scoring'

const live = (over: Partial<Live> = {}): Live => ({
  sum: 26, count: 4, complete: false, u: 0, d: 0, score: 69.75, ...over,
})

describe('LiveScore', () => {
  it('counts sections while the assessment is unfinished, never a partial score', () => {
    // The pill used to print live.score whenever count > 0. That number is the
    // CVA formula applied to a partial sum: with 4 of 8 sections rated it read
    // "69.75", which looks like a grade and means nothing — a cupper could read
    // it as the coffee already scoring in the 60s.
    render(<LiveScore live={live()} />)
    expect(screen.getByRole('button')).toHaveTextContent('4 / 8')
    expect(screen.getByRole('button')).not.toHaveTextContent('69.75')
  })

  it('shows nothing rated yet as 0 / 8', () => {
    render(<LiveScore live={live({ sum: 0, count: 0, score: 0 })} />)
    expect(screen.getByRole('button')).toHaveTextContent('0 / 8')
  })

  it('shows the real score once all eight sections are in', () => {
    render(<LiveScore live={live({ count: 8, complete: true, score: 84.25 })} />)
    const pill = screen.getByRole('button')
    expect(pill).toHaveTextContent('84.25')
    expect(pill).not.toHaveTextContent('8 / 8')
  })

  it('labels itself so the number is never read bare', () => {
    render(<LiveScore live={live()} />)
    expect(screen.getByRole('button')).toHaveAccessibleName(/4 of 8 sections rated/i)
    render(<LiveScore live={live({ count: 8, complete: true, score: 84.25 })} />)
    expect(screen.getAllByRole('button')[1]).toHaveAccessibleName(/84\.25/)
  })
})
