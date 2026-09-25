import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The import chain reaches qc-config-panel, which pulls the browser Supabase
// client; nothing here talks to it.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { InfoStripBand } from './info-strip'
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
    ['ICO #', '002/4600/3508', 'ico_number', '002/4600/3509'],
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
