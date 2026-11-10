import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Checkbox } from './checkbox'

describe('Checkbox', () => {
  it('is neutral when unchecked and green only when checked', () => {
    render(<Checkbox aria-label="c" />)
    const cls = screen.getByRole('checkbox').className.split(/\s+/)
    expect(cls).toContain('border-foreground')
    expect(cls).toContain('data-[state=checked]:border-primary')
    expect(cls).not.toContain('border-primary')
  })
})
