import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IcoNumberInput } from './ico-number-input'

describe('IcoNumberInput', () => {
  it('puts the cursor on the lot when clicked into, so typing replaces only the last segment', async () => {
    const user = userEvent.setup()
    render(<IcoNumberInput aria-label="ICO" defaultValue="002/4600/3508" />)
    const input = screen.getByLabelText('ICO') as HTMLInputElement
    await user.click(input)
    expect(input).toHaveFocus()
    expect([input.selectionStart, input.selectionEnd]).toEqual([9, 13])
    await user.keyboard('3509')
    expect(input).toHaveValue('002/4600/3509')
  })

  it('does the same when tabbed into', async () => {
    const user = userEvent.setup()
    render(<><button type="button">before</button><IcoNumberInput aria-label="ICO" defaultValue="2-0001-001-23-001" /></>)
    await user.click(screen.getByText('before'))
    await user.tab()
    const input = screen.getByLabelText('ICO') as HTMLInputElement
    await waitFor(() => expect([input.selectionStart, input.selectionEnd]).toEqual([14, 17]))
  })

  it('leaves a click inside an already focused field alone', async () => {
    const user = userEvent.setup()
    render(<IcoNumberInput aria-label="ICO" defaultValue="002/4600/3508" />)
    const input = screen.getByLabelText('ICO') as HTMLInputElement
    await user.click(input)
    input.setSelectionRange(2, 2)
    await user.pointer({ keys: '[MouseLeft]', target: input, offset: 2 })
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 2])
  })
})
