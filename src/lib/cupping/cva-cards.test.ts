import { describe, it, expect } from 'vitest'
import { cvaQrPayload, expandCvaCards, guestKey, uniqueSampleIds } from './cva-cards'
import type { ThermalCuppingCardData } from '@/components/pdf/thermal-cupping-card'

function card(id: string, is_cva: boolean): ThermalCuppingCardData {
  return {
    sample_id: id,
    sample_number: `SAN-${id}`,
    tracking_number: `SAN-${id}/26`,
    template_id: `tpl-${id}`,
    template_name: 'T',
    template_scale_info: '1-9',
    attributes: [],
    num_cuppers: 2,
    qr_code: 'data:qr',
    is_cva,
  }
}

const roster = {
  cuppers: [
    { id: 'u1', full_name: 'Anderson Silva' },
    { id: 'u2', full_name: 'Bia Costa' },
  ],
  guests: [{ id: 'g1', name: 'Maria' }],
}

describe('expandCvaCards', () => {
  it('passes commodity cards through untouched, and first', () => {
    const commodity = card('b', false)
    const out = expandCvaCards([card('a', true), commodity], roster, { qr: true, blankCopies: 5 })
    expect(out[0].card).toBe(commodity)
    expect(out[0].qr_payload).toBeNull()
    expect(out).toHaveLength(1 + 3)
  })

  it('makes one specialty card per cupper per sample; stacks contiguous, staff then guests', () => {
    const out = expandCvaCards([card('a', true), card('b', true)], roster, { qr: true, blankCopies: 5 })
    expect(out.map((e) => [e.card.cupper_key, e.card.sample_id])).toEqual([
      ['u1', 'a'], ['u1', 'b'],
      ['u2', 'a'], ['u2', 'b'],
      ['g:g1', 'a'], ['g:g1', 'b'],
    ])
    expect(out[0].card.cupper_name).toBe('Anderson Silva')
    expect(out[4].card.cupper_name).toBe('Maria')
  })

  it('encodes sample, tracking, template and cupper in the QR payload', () => {
    const out = expandCvaCards([card('a', true)], roster, { qr: true, blankCopies: 5 })
    expect(out[0].qr_payload).toBe('WAQC-CVA:a:SAN-a/26:tpl-a:u1')
    expect(out[2].qr_payload).toBe('WAQC-CVA:a:SAN-a/26:tpl-a:g:g1')
    expect(out.every((e) => e.card.qr_code === '')).toBe(true) // filled in by the caller
  })

  it('drops the QR when switched off', () => {
    const out = expandCvaCards([card('a', true)], roster, { qr: false, blankCopies: 5 })
    expect(out.every((e) => e.qr_payload === null && e.card.qr_code === '')).toBe(true)
  })

  it('prints blank copies when nobody is on the roster', () => {
    const out = expandCvaCards([card('a', true)], { cuppers: [], guests: [] }, { qr: true, blankCopies: 3 })
    expect(out).toHaveLength(3)
    expect(out.map((e) => e.card.cupper_name)).toEqual([undefined, undefined, undefined])
    expect(out[0].qr_payload).toBe('WAQC-CVA:a:SAN-a/26:tpl-a:anon')
  })

  it('never prints zero copies', () => {
    expect(expandCvaCards([card('a', true)], { cuppers: [], guests: [] }, { qr: false, blankCopies: 0 })).toHaveLength(1)
  })
})

describe('helpers', () => {
  it('uniqueSampleIds collapses the per-cupper copies', () => {
    expect(uniqueSampleIds([{ sample_id: 'a' }, { sample_id: 'a' }, { sample_id: 'b' }])).toEqual(['a', 'b'])
  })

  it('guestKey and cvaQrPayload', () => {
    expect(guestKey('g1')).toBe('g:g1')
    expect(cvaQrPayload({ sample_id: 's', tracking_number: 't/26', template_id: undefined }, 'anon')).toBe(
      'WAQC-CVA:s:t/26::anon',
    )
  })
})
