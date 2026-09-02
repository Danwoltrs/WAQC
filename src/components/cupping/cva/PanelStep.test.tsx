import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PanelStep } from './PanelStep'

const panel = (over: Record<string, unknown> = {}) => ({
  blind: false,
  cuppers: [
    { cupper_id: 'me', full_name: 'Me Myself', cva_score: 86.25, is_master: false, is_you: true, complete: true, sections: null },
    { cupper_id: 'o', full_name: 'A. Silva', cva_score: 84, is_master: true, is_you: false, complete: true, sections: null },
  ],
  guests: [],
  mean: 85.125, spread: 2.25, threshold: 3, flagged: false, outliers: [],
  authoritative_cupper_id: 'o',
  ...over,
})

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => panel() })) as any
})

describe('PanelStep', () => {
  it('shows every cupper once the panel is revealed', async () => {
    render(<PanelStep sessionId="s1" sampleId="lot-1" reference="ABC-1" />)
    expect(await screen.findByText('A. Silva')).toBeInTheDocument()
    expect(screen.getByText('86.25')).toBeInTheDocument()
  })

  it('says whose reading the certificate will assert', async () => {
    render(<PanelStep sessionId="s1" sampleId="lot-1" reference="ABC-1" />)
    expect(await screen.findByText(/authoritative/i)).toBeInTheDocument()
  })

  it('withholds the panel and explains why while blind', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => panel({ blind: true, cuppers: [], mean: null, spread: 0 }),
    })) as any
    render(<PanelStep sessionId="s1" sampleId="lot-1" reference="ABC-1" />)
    expect(await screen.findByText(/rate all eight sections/i)).toBeInTheDocument()
    expect(screen.queryByText('A. Silva')).not.toBeInTheDocument()
  })

  it('calls out a panel that disagrees by more than the threshold', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => panel({ spread: 4.5, flagged: true, outliers: ['o'] }),
    })) as any
    render(<PanelStep sessionId="s1" sampleId="lot-1" reference="ABC-1" />)
    expect(await screen.findByText(/wider than/i)).toBeInTheDocument()
  })

  it('lists guests as unrecorded so their paper cards get reconciled', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => panel({ guests: [{ id: 'g1', name: 'Ana Guest' }] }),
    })) as any
    render(<PanelStep sessionId="s1" sampleId="lot-1" reference="ABC-1" />)
    expect(await screen.findByText('Ana Guest')).toBeInTheDocument()
    expect(screen.getByText(/not recorded/i)).toBeInTheDocument()
  })
})
