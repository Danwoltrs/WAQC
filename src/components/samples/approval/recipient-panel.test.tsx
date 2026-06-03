import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecipientPanel } from './recipient-panel'

const panel = {
  title: 'SELLER',
  to: ['seller@x.com'],
  cc: ['qualitycontrol@wolthers.com'],
  body: 'Dear Seller,\n\nWolthers has approved the following sample.',
}

describe('RecipientPanel', () => {
  it('renders title, TO/CC chips and the body', () => {
    render(<RecipientPanel {...panel} onChange={() => {}} />)
    expect(screen.getByText('SELLER')).toBeInTheDocument()
    expect(screen.getByText('seller@x.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/Wolthers has approved/)).toBeInTheDocument()
  })

  it('emits body changes', async () => {
    const onChange = vi.fn()
    render(<RecipientPanel {...panel} onChange={onChange} />)
    const textarea = screen.getByRole('textbox', { name: /message/i })
    await userEvent.type(textarea, '!')
    expect(onChange).toHaveBeenCalled()
    const last = onChange.mock.calls.at(-1)![0]
    expect(last.body.endsWith('!')).toBe(true)
  })
})
