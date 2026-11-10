import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Select, SelectTrigger, SelectValue } from './select'

describe('SelectTrigger', () => {
  it('size="sm" is h-7 with py-1', () => {
    render(
      <Select>
        <SelectTrigger size="sm" aria-label="s">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    )
    const c = screen.getByLabelText('s').className
    expect(c).toContain('h-7')
    expect(c).toContain('py-1')
    expect(c).not.toContain('py-2')
  })
})
