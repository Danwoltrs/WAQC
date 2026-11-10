import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { RadioGroup, RadioGroupItem } from './radio-group'

describe('RadioGroupItem', () => {
  it('is neutral when unchecked and green only when checked', () => {
    render(
      <RadioGroup>
        <RadioGroupItem value="a" aria-label="a" />
      </RadioGroup>
    )
    const cls = screen.getByRole('radio').className.split(/\s+/)
    expect(cls).toContain('border-foreground')
    expect(cls).toContain('data-[state=checked]:border-primary')
    expect(cls).not.toContain('border-primary')
  })
})
