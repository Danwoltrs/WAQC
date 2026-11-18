import { describe, it, expect } from 'vitest'
import { fakeSupabase } from '@/lib/storage/__fixtures__/fake-supabase'
import {
  MAX_SAVED_SAMPLE_ADDRESSES,
  companyAddressDestination,
  defaultDestination,
  listDestinationOptions,
  planSampleAddressSave,
  sameAddressKey,
  staffDestinationInputSchema,
} from './destinations'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const blaser = {
  id: CLIENT, name: 'Blaser Trading AG', fantasy_name: 'Blaser', group_id: null,
  street: 'Guterstrasse 4', street_number: null, neighbourhood: null, city: 'Bern', state: null,
  zip_code: 'CH-3001', country: 'Switzerland',
}
const row = (o: Record<string, unknown>) => ({
  id: 'a', company_id: CLIENT, kind: 'sample', label: 'L', recipient_name: null, attention: null, phone: null,
  lines: 'Somewhere 1\n1000 City', country: 'Switzerland', instructions: null, destination_company_id: null,
  is_active: true, is_default: false, updated_at: '2026-01-01', ...o,
})

describe('planSampleAddressSave', () => {
  it('repeats an active twin however typed', () => {
    const p = planSampleAddressSave([{ kind: 'sample', lines: 'Foo  Street 1\n\nBern', is_active: true }], 'foo street 1\nbern')
    expect(p.action).toBe('repeat')
  })
  it('does not repeat a retired twin', () => {
    expect(planSampleAddressSave([{ kind: 'sample', lines: 'A', is_active: false }], 'A').action).toBe('insert')
  })
  it('is full at 50 including retired rows', () => {
    const rows = Array.from({ length: MAX_SAVED_SAMPLE_ADDRESSES }, (_, i) => ({ kind: 'sample', lines: `L${i}`, is_active: i % 2 === 0 }))
    expect(planSampleAddressSave(rows, 'new').action).toBe('full')
  })
  it('inserts otherwise', () => {
    expect(planSampleAddressSave([], 'x').action).toBe('insert')
  })
  it('normalises keys', () => expect(sameAddressKey(' A  b \r\n\n C ')).toBe('a b\nc'))
})

describe('staffDestinationInputSchema', () => {
  it('requires label and lines', () => {
    expect(staffDestinationInputSchema.safeParse({ lines: 'x' }).success).toBe(false)
    expect(staffDestinationInputSchema.safeParse({ label: 'x' }).success).toBe(false)
    expect(staffDestinationInputSchema.safeParse({ label: 'x', lines: 'y' }).success).toBe(true)
  })
})

describe('companyAddressDestination', () => {
  it('builds Blaser lines', () => {
    const d = companyAddressDestination(blaser as never)!
    expect(d.lines).toEqual(['Guterstrasse 4', 'CH-3001 Bern'])
    expect(d.country).toBe('Switzerland')
    expect(d.companyName).toBe('Blaser')
  })
  it('is null without street and city', () => {
    expect(companyAddressDestination({ ...blaser, street: null, city: ' ' } as never)).toBeNull()
  })
})

describe('defaultDestination', () => {
  const tables = (rows: unknown[]) => ({ companies: [blaser], company_addresses: rows })
  it('prefers the setting address', async () => {
    const db = fakeSupabase({ tables: tables([row({ id: 'a', is_default: true }), row({ id: 'b', lines: 'B 1' })]) })
    const d = await defaultDestination(db as never, { clientId: CLIENT, addressId: 'b' })
    expect(d?.savedAddressId).toBe('b')
  })
  it('then is_default', async () => {
    const db = fakeSupabase({ tables: tables([row({ id: 'a', updated_at: '2026-05-01' }), row({ id: 'b', is_default: true })]) })
    expect((await defaultDestination(db as never, { clientId: CLIENT, addressId: 'gone' }))?.savedAddressId).toBe('b')
  })
  it('then the newest', async () => {
    const db = fakeSupabase({ tables: tables([row({ id: 'a', updated_at: '2026-01-01' }), row({ id: 'b', updated_at: '2026-06-01' })]) })
    expect((await defaultDestination(db as never, { clientId: CLIENT, addressId: null }))?.savedAddressId).toBe('b')
  })
  it('then the company address', async () => {
    const db = fakeSupabase({ tables: tables([]) })
    const d = await defaultDestination(db as never, { clientId: CLIENT, addressId: null })
    expect(d?.savedAddressId).toBeNull()
    expect(d?.lines).toEqual(['Guterstrasse 4', 'CH-3001 Bern'])
  })
})

describe('rowToDestination owner identity', () => {
  it('companyId is the owning company even when destination_company_id differs', async () => {
    const other = '22222222-2222-4222-8222-222222222222'
    const db = fakeSupabase({ tables: { companies: [blaser], company_addresses: [row({ id: 'z', destination_company_id: other })] } })
    const d = await defaultDestination(db as never, { clientId: CLIENT, addressId: 'z' })
    expect(d?.companyId).toBe(CLIENT)
    expect(d?.companyName).toBe('Blaser')
  })
})

describe('listDestinationOptions', () => {
  it('lists saved then company address, with titles', async () => {
    const db = fakeSupabase({ tables: { companies: [blaser], company_addresses: [row({})] } })
    const o = await listDestinationOptions(db as never, { clientId: CLIENT })
    expect(o.map((x) => x.section)).toEqual(['saved', 'company'])
    expect(o[0].sectionTitle).toBe('Saved for Blaser')
    expect(o[1].sectionTitle).toBe('Blaser company address')
  })
})
