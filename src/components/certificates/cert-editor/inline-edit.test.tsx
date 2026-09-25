import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InlineEdit } from './inline-edit'

// The primitive owns select-on-focus, so any editor put inside it overwrites
// rather than appends: the input Radix focuses on open, one the editor
// autofocuses, and one the user clicks into afterwards.
describe('InlineEdit', () => {
  it('starts every input that takes focus with its whole value selected', async () => {
    const user = userEvent.setup()
    render(
      <InlineEdit display="x">
        {() => (
          <>
            <input defaultValue="abc" />
            <input defaultValue="defg" />
          </>
        )}
      </InlineEdit>,
    )
    await user.click(screen.getByRole('button', { name: 'x' }))
    const first = (await screen.findByDisplayValue('abc')) as HTMLInputElement
    expect(first).toHaveFocus()
    expect([first.selectionStart, first.selectionEnd]).toEqual([0, 3])

    const second = screen.getByDisplayValue('defg') as HTMLInputElement
    await user.click(second)
    expect(second).toHaveFocus()
    expect([second.selectionStart, second.selectionEnd]).toEqual([0, 4])
  })

  it('selects an autofocused input too (autoFocus pre-empts Radix, which then selects nothing)', async () => {
    const user = userEvent.setup()
    render(<InlineEdit display="x">{() => <input autoFocus defaultValue="abc" />}</InlineEdit>)
    await user.click(screen.getByRole('button', { name: 'x' }))
    const input = (await screen.findByDisplayValue('abc')) as HTMLInputElement
    expect(input).toHaveFocus()
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3])
  })
})
