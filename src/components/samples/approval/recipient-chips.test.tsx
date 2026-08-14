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

describe('RecipientChips — provenance mode', () => {
  const META = {
    'marieke@ahold.nl': { name: 'Marieke de Vries', isGroup: false, contactId: 'c1' },
    'jan@ahold.nl': { name: null, isGroup: false, contactId: null },
  }

  it('shows the contact name for a saved contact, with the email as its title', () => {
    render(
      <RecipientChips label="TO" emails={['marieke@ahold.nl']} onChange={() => {}} meta={META} />,
    )
    const chip = screen.getByTitle('marieke@ahold.nl')
    expect(chip).toHaveTextContent('Marieke de Vries')
  })

  it('matches meta case-insensitively', () => {
    render(
      <RecipientChips label="TO" emails={['Marieke@Ahold.nl']} onChange={() => {}} meta={META} />,
    )
    expect(screen.getByTitle('Marieke@Ahold.nl')).toHaveTextContent('Marieke de Vries')
  })

  it('falls back to the email when a saved contact has no name', () => {
    const meta = { 'qc@ahold.nl': { name: null, isGroup: true, contactId: 'c2' } }
    render(<RecipientChips label="TO" emails={['qc@ahold.nl']} onChange={() => {}} meta={meta} />)
    expect(screen.getByTitle('qc@ahold.nl')).toHaveTextContent('qc@ahold.nl')
  })

  it('offers a save action on an address that is not a saved contact', async () => {
    const onSaveRequest = vi.fn()
    render(
      <RecipientChips
        label="TO"
        emails={['jan@ahold.nl']}
        onChange={() => {}}
        meta={META}
        onSaveRequest={onSaveRequest}
      />,
    )
    await userEvent.click(screen.getByLabelText('Save jan@ahold.nl'))
    expect(onSaveRequest).toHaveBeenCalledWith('jan@ahold.nl')
  })

  it('offers a save action on an address absent from meta entirely', async () => {
    const onSaveRequest = vi.fn()
    render(
      <RecipientChips
        label="TO"
        emails={['brand.new@ahold.nl']}
        onChange={() => {}}
        meta={META}
        onSaveRequest={onSaveRequest}
      />,
    )
    await userEvent.click(screen.getByLabelText('Save brand.new@ahold.nl'))
    expect(onSaveRequest).toHaveBeenCalledWith('brand.new@ahold.nl')
  })

  it('does not offer a save action on a saved contact', () => {
    render(
      <RecipientChips
        label="TO"
        emails={['marieke@ahold.nl']}
        onChange={() => {}}
        meta={META}
        onSaveRequest={() => {}}
      />,
    )
    expect(screen.queryByLabelText('Save marieke@ahold.nl')).toBeNull()
  })

  it('untags a saved contact without removing it from the list', async () => {
    const onUntag = vi.fn()
    const onChange = vi.fn()
    render(
      <RecipientChips
        label="TO"
        emails={['marieke@ahold.nl']}
        onChange={onChange}
        meta={META}
        onUntag={onUntag}
      />,
    )
    await userEvent.click(screen.getByLabelText('Stop pre-filling marieke@ahold.nl'))
    expect(onUntag).toHaveBeenCalledWith('c1', 'marieke@ahold.nl')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps the invalid treatment and offers no save action for a malformed address', () => {
    render(
      <RecipientChips
        label="TO"
        emails={['not-an-email']}
        onChange={() => {}}
        meta={META}
        onSaveRequest={() => {}}
      />,
    )
    expect(screen.getByText('not-an-email')).toBeInTheDocument()
    expect(screen.queryByLabelText('Save not-an-email')).toBeNull()
  })

  it('renders no provenance affordances when meta is omitted', () => {
    render(
      <RecipientChips
        label="TO"
        emails={['marieke@ahold.nl']}
        onChange={() => {}}
        onSaveRequest={() => {}}
        onUntag={() => {}}
      />,
    )
    expect(screen.getByText('marieke@ahold.nl')).toBeInTheDocument()
    expect(screen.queryByLabelText('Save marieke@ahold.nl')).toBeNull()
    expect(screen.queryByLabelText('Stop pre-filling marieke@ahold.nl')).toBeNull()
  })
})
