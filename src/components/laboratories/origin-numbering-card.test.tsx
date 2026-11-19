import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OriginNumberingCard } from './origin-numbering-card'

const colombia = { origin: 'Colombia', code: 'COL', next_number: 1, counter_year: new Date().getFullYear(), resets_yearly: true, padding: 6, is_active: true }
const peru = { ...colombia, origin: 'Peru', code: 'PE' }
const yy = String(new Date().getFullYear()).slice(-2)

function serve(over: { can_edit?: boolean; available?: boolean; lines?: unknown[] } = {}) {
  const sent: Array<{ method: string; body: any }> = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method) {
      const body = JSON.parse(String(init.body))
      sent.push({ method: init.method, body })
      return { ok: true, json: async () => ({ line: { ...colombia, ...body } }) } as Response
    }
    return { ok: true, json: async () => ({ lines: [colombia, peru], available: true, can_edit: true, ...over }) } as Response
  }))
  return sent
}

describe('OriginNumberingCard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows each origin with the number its next certificate gets', async () => {
    serve()
    render(<OriginNumberingCard />)
    expect(await screen.findByText(`000001-COL/${yy}`)).toBeInTheDocument()
    expect(screen.getByText(`000001-PE/${yy}`)).toBeInTheDocument()
  })

  it('lets a global admin set where a line continues, previewing the number first', async () => {
    const sent = serve()
    const user = userEvent.setup()
    render(<OriginNumberingCard />)
    const next = await screen.findByRole('spinbutton', { name: 'Next number for Colombia' })
    await user.clear(next)
    await user.type(next, '4512')
    expect(screen.getByText(`004512-COL/${yy}`)).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])
    await waitFor(() => expect(sent).toEqual([{ method: 'PATCH', body: { origin: 'Colombia', code: 'COL', next_number: 4512 } }]))
  })

  it('refuses a code that is not letters: Save stays off', async () => {
    serve()
    const user = userEvent.setup()
    render(<OriginNumberingCard />)
    const code = await screen.findByRole('textbox', { name: 'Code for Colombia' })
    await user.clear(code)
    await user.type(code, 'C0')
    expect(screen.getAllByRole('button', { name: 'Save' })[0]).toBeDisabled()
  })

  it('shows the lines without controls to someone who may not change them', async () => {
    serve({ can_edit: false })
    render(<OriginNumberingCard />)
    expect(await screen.findByText('Colombia')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'New origin' })).toBeNull()
    expect(screen.getByRole('switch', { name: 'Number Colombia certificates on this line' })).toBeDisabled()
  })

  it('shows nothing to a lab user when the numbering is not set up', async () => {
    serve({ available: false, can_edit: false, lines: [] })
    const { container } = render(<OriginNumberingCard />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
