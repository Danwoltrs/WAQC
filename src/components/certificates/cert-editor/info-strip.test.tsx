import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The import chain reaches qc-config-panel, which pulls the browser Supabase
// client; nothing here talks to it.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { DetailsEditPanel, InfoStripBand } from './info-strip'
import type { CertSample } from './use-cert-editor'

// SAN-01088/26 after its container was retyped (2026-09-23): the user opened
// the Container tile and typed the next container, and got
// "BMOU 141.685-9TGBU" because the caret sat at the end of the old value.
const sample = {
  id: 's-01088', tracking_number: 'SAN-01088/26', status: 'in_progress', created_at: '2026-09-23',
  sample_type: 'ss',
  container_nr: 'BMOU 141.685-9', ico_number: '002/4600/3508',
  seller_contract_nr: 'S664243-12', wolthers_contract_nr: '41999/26',
  bag_type: 'jute_bag', bag_count: 333, bag_weight_kg: 60,
} as unknown as CertSample

describe('InfoStripBand — inline edits overwrite', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it.each([
    ['Container', 'BMOU 141.685-9', 'container_nr', 'TGBU 130.189-5'],
    ['Seller ref', 'S664243-12', 'seller_contract_nr', 'S664243-9'],
    ['Wolthers ref', '41999/26', 'wolthers_contract_nr', '42000/26'],
  ])('%s: opening the tile selects the whole value, so typing replaces it', async (_label, current, field, typed) => {
    const onFieldChange = vi.fn()
    const user = userEvent.setup()
    render(<InfoStripBand sample={sample} draftSample={{}} onFieldChange={onFieldChange} />)
    await user.click(screen.getByText(current).closest('button')!)
    const input = (await screen.findByDisplayValue(current)) as HTMLInputElement
    expect(input).toHaveFocus()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(current.length)
    await user.keyboard(`${typed}{Enter}`)
    expect(onFieldChange).toHaveBeenCalledWith(field, typed)
  })

  // A copied ICO differs per container only in its last segment (the lot):
  // the tile opens with the cursor on it, so typing the new lot is enough.
  it('ICO #: opening the tile selects only the last segment, so typing replaces the lot', async () => {
    const onFieldChange = vi.fn()
    const user = userEvent.setup()
    render(<InfoStripBand sample={sample} draftSample={{}} onFieldChange={onFieldChange} />)
    await user.click(screen.getByText('002/4600/3508').closest('button')!)
    const input = (await screen.findByDisplayValue('002/4600/3508')) as HTMLInputElement
    expect(input).toHaveFocus()
    expect([input.selectionStart, input.selectionEnd]).toEqual([9, 13])
    await user.keyboard('3509{Enter}')
    expect(onFieldChange).toHaveBeenCalledWith('ico_number', '002/4600/3509')
  })

  it('Quantity: clicking into the bag weight selects it too', async () => {
    const user = userEvent.setup()
    // jsdom reports no selection range on type=number inputs, so watch the call.
    const select = vi.spyOn(HTMLInputElement.prototype, 'select')
    render(<InfoStripBand sample={sample} draftSample={{}} onFieldChange={vi.fn()} />)
    await user.click(screen.getByText(/333/).closest('button')!)
    const weight = (await screen.findByDisplayValue('60')) as HTMLInputElement
    select.mockClear()
    await user.click(weight)
    expect(select.mock.contexts).toContain(weight)
  })
})

// 2026-09-25: staff duplicate a sample, then type any of the contract's
// numbers (Wolthers nr, seller ref or buyer ref) into the Wolthers ref and
// pick the contract; the host fills the parties and refs from it.
describe('Wolthers ref finds the contract by any of its numbers', () => {
  const found = {
    id: 'c-new', contract_number: '41871/26', split_suffix: null,
    seller_reference: 'S664243-13', buyer_reference: 'IR0007621-1', contract_date: null, crop: null,
    seller: { fantasy_name: 'Ecom', name: null }, buyer: { fantasy_name: 'Ahold', name: null },
  }
  const stubSearch = (contracts: unknown[]) =>
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response(JSON.stringify(String(url).startsWith('/api/contracts/search') ? { contracts } : {}), { status: 200 })))
  afterEach(() => { vi.unstubAllGlobals() })

  it('tile: picking the contract a buyer ref finds sets its number and hands it on, never the typed ref', async () => {
    stubSearch([found])
    const onFieldChange = vi.fn()
    const onPickContract = vi.fn()
    const user = userEvent.setup()
    render(<InfoStripBand sample={sample} draftSample={{}} onFieldChange={onFieldChange} onPickContract={onPickContract} />)
    await user.click(screen.getByText('41999/26').closest('button')!)
    await user.keyboard('IR0007621')
    await user.click(await screen.findByText('41871/26', {}, { timeout: 2000 }))
    expect(onPickContract).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-new' }))
    expect(onFieldChange).toHaveBeenCalledWith('wolthers_contract_nr', '41871/26')
    expect(onFieldChange).not.toHaveBeenCalledWith('wolthers_contract_nr', 'IR0007621')
  })

  it('tile: closing it without a pick keeps the typed number', async () => {
    stubSearch([])
    const onFieldChange = vi.fn()
    const user = userEvent.setup()
    render(<InfoStripBand sample={sample} draftSample={{}} onFieldChange={onFieldChange} onPickContract={vi.fn()} />)
    await user.click(screen.getByText('41999/26').closest('button')!)
    await user.keyboard('42000/26')
    await user.click(document.body)
    expect(onFieldChange).toHaveBeenCalledWith('wolthers_contract_nr', '42000/26')
  })

  it("details panel: a pick fills the panel's own form, which Save hands on", async () => {
    stubSearch([found])
    const onApply = vi.fn()
    const onPickContract = vi.fn((_m: unknown, _current: unknown, apply: (f: string, v: unknown) => void) => {
      apply('importer_id', 'buyer-1')
    })
    const user = userEvent.setup()
    render(
      <DetailsEditPanel open sample={sample} draftSample={{}} qualityOptions={[]}
        onCancel={vi.fn()} onApply={onApply} onPickContract={onPickContract} />,
    )
    const box = screen.getByPlaceholderText('Contract # or ref')
    await user.clear(box)
    await user.type(box, 'S664243')
    await user.click(await screen.findByText('41871/26', {}, { timeout: 2000 }))
    expect(onPickContract).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-new' }), expect.anything(), expect.any(Function))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ wolthers_contract_nr: '41871/26', importer_id: 'buyer-1' }))
  })
})

// 2026-09-29: the details panel reads the sys contract's quality and offers
// its specification; a saved quality only changes on a click.
describe('details panel: quality from the sys contract', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('offers the contract\'s specification, and Use puts it in the form Save hands on', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(
      String(url) === '/api/contracts/c-41999'
        ? {
            contract: { id: 'c-41999', contract_number: '41999/26', split_suffix: null, quality_description: 'NY 2, 16/18, Fine Cup' },
            resolution: { quality_match: { confidence: 'high', spec_id: 'spec-fc', spec_label: 'NY2 16/18 FC', source_text: 'NY 2, 16/18, Fine Cup' } },
          }
        : {},
    ), { status: 200 })))
    const onApply = vi.fn()
    const user = userEvent.setup()
    render(
      <DetailsEditPanel open sample={{ ...sample, contract_id: 'c-41999', quality_spec_id: 'spec-old' } as CertSample}
        draftSample={{}} qualityOptions={[{ id: 'spec-old', custom_name: 'NY2 17/18 GC', quality_code: null }] as any}
        onCancel={vi.fn()} onApply={onApply} />,
    )
    expect(await screen.findByText(/Contract #41999\/26 says/, {}, { timeout: 2000 })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use NY2 16/18 FC' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ quality_spec_id: 'spec-fc', quality_name: 'NY2 16/18 FC' }))
  })
})
