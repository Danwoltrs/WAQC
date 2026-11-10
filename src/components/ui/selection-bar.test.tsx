import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectionBar } from '@/components/ui/selection-bar'

describe('SelectionBar', () => {
  it('renders nothing at 0', () => {
    const { container } = render(<SelectionBar count={0} onClear={() => {}} actions={null} />)
    expect(container.firstChild).toBeNull()
  })
  it('shows "3 selected" and Clear', async () => {
    const onClear = vi.fn()
    render(<SelectionBar count={3} onClear={onClear} actions={<button>Send</button>} />)
    expect(screen.getByText('3 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalled()
  })
  it('uses the noun', () => {
    render(<SelectionBar count={2} noun="in list" onClear={() => {}} actions={null} />)
    expect(screen.getByText('2 in list')).toBeInTheDocument()
  })
  it('puts destructive last after a divider', () => {
    render(
      <SelectionBar
        count={1}
        onClear={() => {}}
        actions={<button>Export</button>}
        destructive={<button>Delete</button>}
      />
    )
    const names = screen.getAllByRole('button').map((b) => b.textContent)
    expect(names).toEqual(['Clear', 'Export', 'Delete'])
    expect(screen.getByRole('separator')).toBeInTheDocument()
  })
  it('has no divider without destructive', () => {
    render(<SelectionBar count={1} onClear={() => {}} actions={<button>Export</button>} />)
    expect(screen.queryByRole('separator')).toBeNull()
  })
  it('announces the count politely', () => {
    render(<SelectionBar count={1} onClear={() => {}} actions={null} />)
    expect(screen.getByText('1 selected')).toHaveAttribute('aria-live', 'polite')
  })
  it('is a square sticky bar', () => {
    const { container } = render(<SelectionBar count={1} onClear={() => {}} actions={null} />)
    const c = (container.firstChild as HTMLElement).className
    for (const cls of ['sticky', 'bottom-0', 'border-t', 'bg-background']) expect(c).toContain(cls)
    expect(c).not.toMatch(/rounded/)
  })
})
