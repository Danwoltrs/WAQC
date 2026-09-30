import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SamplePager, navPosition } from './sample-pager'

// The QC list 2026-09-30: lot 143/26 expanded to show its contract #2, 144/26.
const items = [
  { id: 'a', label: 'SMP 142/26' },
  { id: 'lot', label: 'SMP 143/26' },
  { id: 'c2', label: 'SMP 144/26' },
  { id: 'b', label: 'BR-037415/26' },
]

describe('navPosition', () => {
  it('finds the open sample and its neighbours', () => {
    expect(navPosition(items, 'lot', null)).toEqual({ index: 1, prev: items[0], next: items[2] })
  })
  it('steps from the lot when the open contract is not listed (its row collapsed)', () => {
    expect(navPosition(items, 'unlisted-contract', 'lot').index).toBe(1)
  })
  it('has no neighbours past either end, and no position for a sample off the list', () => {
    expect(navPosition(items, 'a', null).prev).toBeNull()
    expect(navPosition(items, 'b', null).next).toBeNull()
    expect(navPosition(items, 'x', 'y').index).toBe(-1)
  })
})

describe('SamplePager', () => {
  it('names the previous and next sample and steps to them', async () => {
    const onGo = vi.fn()
    const user = userEvent.setup()
    render(<SamplePager items={items} currentId="lot" lotId={null} onGo={onGo} />)
    expect(screen.getByText('2 / 4')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next sample: SMP 144/26' }))
    expect(onGo).toHaveBeenLastCalledWith('c2')
    await user.click(screen.getByRole('button', { name: 'Previous sample: SMP 142/26' }))
    expect(onGo).toHaveBeenLastCalledWith('a')
  })

  it('steps with the arrow keys, but not while a field has focus or a panel is open', () => {
    const onGo = vi.fn()
    const { rerender } = render(
      <>
        <input aria-label="field" />
        <SamplePager items={items} currentId="lot" lotId={null} onGo={onGo} />
      </>,
    )
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(onGo).toHaveBeenLastCalledWith('c2')
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'ArrowLeft' })
    expect(onGo).toHaveBeenCalledTimes(1)
    rerender(
      <>
        <input aria-label="field" />
        <SamplePager items={items} currentId="lot" lotId={null} onGo={onGo} keysDisabled />
      </>,
    )
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })
    expect(onGo).toHaveBeenCalledTimes(1)
  })

  it('hides itself when the open sample is not in the list', () => {
    const { container } = render(<SamplePager items={items} currentId="x" lotId={null} onGo={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
