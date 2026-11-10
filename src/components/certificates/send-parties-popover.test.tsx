import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SendPartiesPopover } from './send-parties-popover'
import type { PartyOption } from '@/lib/approval-notification/certificate-parties'

const dunkin: PartyOption[] = [
  { party: 'seller', companies: [{ id: 'ldc', name: 'LDC Suisse' }] },
  { party: 'importer', companies: [{ id: 'imp', name: 'Olam' }] },
  { party: 'roaster', companies: [{ id: 'roa', name: 'Roaster Co' }] },
  { party: 'buyer', companies: [{ id: 'd', name: "Dunkin'" }] },
]

const response = (body: unknown, status = 200) =>
  ({ ok: status < 300, status, json: async () => body }) as Response

function mockFetch(body: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValue(response(body, status)) as unknown as typeof fetch
}

const original = global.fetch
beforeEach(() => {
  global.fetch = original
})
afterEach(() => {
  global.fetch = original
})

const openPopover = () => userEvent.click(screen.getByRole('button', { name: 'Send' }))

describe('SendPartiesPopover', () => {
  it('fetches the parties for the selection when opened', async () => {
    mockFetch({ parties: dunkin })
    render(<SendPartiesPopover sampleIds={['s1', 's2']} onSend={vi.fn()} />)
    await openPopover()
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('view=parties&sampleIds=s1%2Cs2'))
    expect(await screen.findByText('Seller · LDC Suisse')).toBeInTheDocument()
  })

  it('two parties, two rows', async () => {
    mockFetch({ parties: [dunkin[0], dunkin[3]] })
    render(<SendPartiesPopover sampleIds={['s1']} onSend={vi.fn()} />)
    await openPopover()
    await screen.findByText("Client · Dunkin'")
    expect(screen.queryByText(/Importer/)).toBeNull()
  })

  it('sends the ticked parties and the include-sent choice', async () => {
    const onSend = vi.fn()
    mockFetch({ parties: dunkin })
    render(<SendPartiesPopover sampleIds={['s1']} onSend={onSend} />)
    await openPopover()
    await userEvent.click(await screen.findByLabelText('Roaster · Roaster Co'))
    await userEvent.click(screen.getByLabelText('Include already sent'))
    await userEvent.click(screen.getByRole('button', { name: 'Send emails' }))
    expect(onSend).toHaveBeenCalledWith(['buyer', 'importer', 'seller'], true)
  })

  it('on error it says so and Send stays disabled', async () => {
    mockFetch({ error: 'Failed to load certificates' }, 500)
    render(<SendPartiesPopover sampleIds={['s1']} onSend={vi.fn()} />)
    await openPopover()
    expect(await screen.findByText('Failed to load certificates')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send emails' })).toBeDisabled()
  })

  it('refetches when the selection changes between openings', async () => {
    mockFetch({ parties: dunkin })
    const { rerender } = render(<SendPartiesPopover sampleIds={['s1']} onSend={vi.fn()} />)
    await openPopover()
    await screen.findByText('Seller · LDC Suisse')
    await userEvent.keyboard('{Escape}')
    mockFetch({ parties: [dunkin[3]] })
    rerender(<SendPartiesPopover sampleIds={['s9']} onSend={vi.fn()} />)
    await openPopover()
    expect(await screen.findByText("Client · Dunkin'")).toBeInTheDocument()
    expect(screen.queryByText('Seller · LDC Suisse')).toBeNull()
  })

  it('a selection with no parties says so', async () => {
    mockFetch({ parties: [] })
    render(<SendPartiesPopover sampleIds={['s1']} onSend={vi.fn()} />)
    await openPopover()
    expect(await screen.findByText('No one to send these to.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send emails' })).toBeDisabled()
    expect(screen.queryByText('All parties')).toBeNull()
  })

  it('never shows a late response for an earlier selection', async () => {
    let resolveFirst!: (r: Response) => void
    const first = new Promise<Response>((r) => (resolveFirst = r))
    global.fetch = vi.fn().mockReturnValueOnce(first) as unknown as typeof fetch
    const { rerender } = render(<SendPartiesPopover sampleIds={['s1']} onSend={vi.fn()} />)
    await openPopover()
    await userEvent.keyboard('{Escape}')
    global.fetch = vi.fn().mockResolvedValue(response({ parties: [dunkin[3]] })) as unknown as typeof fetch
    rerender(<SendPartiesPopover sampleIds={['s9']} onSend={vi.fn()} />)
    await openPopover()
    expect(await screen.findByText("Client · Dunkin'")).toBeInTheDocument()
    await act(async () => {
      resolveFirst(response({ parties: dunkin }))
    })
    expect(screen.queryByText('Seller · LDC Suisse')).toBeNull()
    expect(screen.getByText("Client · Dunkin'")).toBeInTheDocument()
  })

  it('disables Send emails once no party is ticked', async () => {
    mockFetch({ parties: [dunkin[0]] })
    render(<SendPartiesPopover sampleIds={['s1']} onSend={vi.fn()} />)
    await openPopover()
    await userEvent.click(await screen.findByLabelText('Seller · LDC Suisse'))
    expect(screen.getByRole('button', { name: 'Send emails' })).toBeDisabled()
  })

  it('announces the loading state as a status named Loading parties', async () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as unknown as typeof fetch
    render(<SendPartiesPopover sampleIds={['s1']} onSend={vi.fn()} />)
    await openPopover()
    expect(screen.getByRole('status', { name: 'Loading parties' })).toBeInTheDocument()
  })
})
