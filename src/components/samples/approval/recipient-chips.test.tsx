import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecipientChips } from './recipient-chips'

describe('RecipientChips', () => {
  it('renders existing emails as chips', () => {
    render(<RecipientChips label="TO" emails={['a@x.com', 'b@y.com']} onChange={() => {}} />)
    expect(screen.getByText('a@x.com')).toBeInTheDocument()
    expect(screen.getByText('b@y.com')).toBeInTheDocument()
  })

  it('adds an email on Enter', async () => {
    const onChange = vi.fn()
    render(<RecipientChips label="TO" emails={[]} onChange={onChange} />)
    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'new@z.com{Enter}')
    expect(onChange).toHaveBeenCalledWith(['new@z.com'])
  })

  it('removes an email when its × is clicked', async () => {
    const onChange = vi.fn()
    render(<RecipientChips label="TO" emails={['a@x.com', 'b@y.com']} onChange={onChange} />)
    await userEvent.click(screen.getByLabelText('Remove a@x.com'))
    expect(onChange).toHaveBeenCalledWith(['b@y.com'])
  })
})
