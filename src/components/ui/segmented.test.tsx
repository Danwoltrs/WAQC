import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Segmented } from './segmented'

const options = [
  { value: 'all', label: 'All', count: 128 },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

function setup(value = 'all') {
  const onValueChange = vi.fn()
  render(
    <Segmented value={value} onValueChange={onValueChange} options={options} aria-label="Status filter" />
  )
  return onValueChange
}

describe('Segmented', () => {
  it('renders a radiogroup (Radix single-select) with the given aria-label', () => {
    setup()
    expect(screen.getByRole('radiogroup', { name: 'Status filter' })).toBeInTheDocument()
  })

  it('marks the active item with data-state="on"', () => {
    setup('active')
    expect(screen.getByRole('radio', { name: 'Active' })).toHaveAttribute('data-state', 'on')
    expect(screen.getByRole('radio', { name: /All/ })).toHaveAttribute('data-state', 'off')
  })

  it('calls onValueChange with the clicked value', async () => {
    const onValueChange = setup()
    await userEvent.click(screen.getByText('Active'))
    expect(onValueChange).toHaveBeenCalledWith('active')
  })

  it('does not empty the selection when the active item is clicked again', async () => {
    const onValueChange = setup()
    await userEvent.click(screen.getByText('All'))
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('renders a count as separate muted text', () => {
    setup()
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('128')).toHaveClass('text-muted-foreground')
  })

  it('sizes the track h-9 by default and h-7 for sm', () => {
    const { unmount } = render(
      <Segmented value="all" onValueChange={() => {}} options={options} aria-label="a" />
    )
    expect(screen.getByRole('radiogroup', { name: 'a' })).toHaveClass('h-9')
    unmount()
    render(<Segmented value="all" onValueChange={() => {}} options={options} aria-label="b" size="sm" />)
    expect(screen.getByRole('radiogroup', { name: 'b' })).toHaveClass('h-7')
  })
})
