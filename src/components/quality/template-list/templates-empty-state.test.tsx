import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TemplatesEmptyState } from './templates-empty-state'

describe('TemplatesEmptyState', () => {
  it('shows one outline New template button with a visible label', async () => {
    const onCreate = vi.fn()
    render(<TemplatesEmptyState searching={false} onCreate={onCreate} />)
    const buttons = screen.getAllByRole('button', { name: 'New template' })
    expect(buttons).toHaveLength(1)
    const b = buttons[0]
    expect(b.className).toContain('border')
    expect(b.className).toContain('bg-background')
    expect(b.className).not.toContain('max-sm:')
    expect(b.textContent).toContain('New template')
    await userEvent.click(b)
    expect(onCreate).toHaveBeenCalled()
  })

  it('has no button while searching', () => {
    render(<TemplatesEmptyState searching onCreate={vi.fn()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
