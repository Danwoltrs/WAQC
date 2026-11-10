import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input } from './input'

describe('Input', () => {
  it('defaults to h-9', () => {
    render(<Input aria-label="a" />)
    expect(screen.getByLabelText('a').className).toContain('h-9')
  })

  it('inputSize="sm" is h-7 text-xs', () => {
    render(<Input aria-label="a" inputSize="sm" />)
    expect(screen.getByLabelText('a').className).toMatch(/h-7.*text-xs|text-xs.*h-7/)
  })

  it('does not leak inputSize to the DOM', () => {
    render(<Input aria-label="a" inputSize="sm" />)
    expect(screen.getByLabelText('a').hasAttribute('inputsize')).toBe(false)
  })
})
