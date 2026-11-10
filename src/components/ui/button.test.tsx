import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './button'

describe('Button', () => {
  it.each([
    ['default', 'h-9'],
    ['sm', 'h-7'],
    ['icon', 'h-9 w-9'],
    ['icon-sm', 'h-7 w-7'],
  ] as const)('size %s is %s', (size, cls) => {
    render(<Button size={size}>x</Button>)
    for (const c of cls.split(' ')) expect(screen.getByRole('button').className).toContain(c)
  })

  it('sm text is xs', () => {
    render(<Button size="sm">x</Button>)
    expect(screen.getByRole('button').className).toContain('text-xs')
  })

  it('destructive-outline is red text on the background', () => {
    render(<Button variant="destructive-outline">Reject</Button>)
    const c = screen.getByRole('button').className
    expect(c).toContain('bg-background')
    expect(c).toContain('text-red-600')
    expect(c).toContain('dark:text-red-400')
  })
})
