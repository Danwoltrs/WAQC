import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SendHistoryCard } from './send-history-card'
import type { SendHistoryEntry } from '@/lib/approval-notification/send-history'

const entry = (over: Partial<SendHistoryEntry> = {}): SendHistoryEntry => ({
  party: 'seller',
  companyId: 'ldc',
  sentBy: 'Anderson Nunes',
  sentAt: '2026-11-12T14:30:00+00:00',
  to: ['qc@ldc.com', 'trader@ldc.com'],
  cc: ['wolthers@wolthers.com'],
  sandbox: false,
  sampleIds: ['s1'],
  ...over,
})

describe('SendHistoryCard', () => {
  it('renders nothing when the certificates were never sent to this party', () => {
    const { container } = render(<SendHistoryCard history={[]} total={1} />)
    expect(container).toBeEmptyDOMElement()
    expect(render(<SendHistoryCard total={1} />).container).toBeEmptyDOMElement()
  })

  it('names who sent it and every address it went to', () => {
    render(<SendHistoryCard history={[entry()]} total={1} />)
    const card = screen.getByRole('region', { name: 'Sent before' })
    expect(card).toHaveTextContent('Sent before · 1 time')
    expect(card).toHaveTextContent('Anderson Nunes')
    expect(card).toHaveTextContent('To qc@ldc.com, trader@ldc.com · CC wolthers@wolthers.com')
  })

  it('says how many of the certificates an earlier send covered, and marks a test send', () => {
    render(<SendHistoryCard history={[entry({ sampleIds: ['s1', 's2'], sandbox: true }), entry({ sentBy: null })]} total={3} />)
    const card = screen.getByRole('region', { name: 'Sent before' })
    expect(card).toHaveTextContent('Sent before · 2 times')
    expect(card).toHaveTextContent('2 of 3 certificates')
    expect(card).toHaveTextContent('test send')
    expect(card).toHaveTextContent('Sender unknown')
  })
})
