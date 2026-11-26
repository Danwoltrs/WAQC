// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/components/clients/client-page/client-people-tab', () => ({
  ClientPeopleTab: ({ companyName }: { companyName: string }) => <div>People of {companyName}</div>,
}))

import { CompanyPanel } from './company-panel'
import { CompanyDetails } from './company-details'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const CO = {
  id: 'co1', name: 'Fazenda Legal Ltda', fantasy_name: 'Fazenda', country: 'Brazil',
  street: 'Rua XV de Novembro', street_number: '95', neighbourhood: 'Centro', address: null, city: 'Santos',
  state: 'SP', zip_code: '11010-151', person_type: 'J', document_cnpj: '11.222.333/0001-81', document_ie: '123', vat_number: null,
}
const HOLDER = {
  id: 't1', company_id: 'co1', person_type: 'J', name: 'Holder One', cpf_cnpj: null, rg: null, ie_ipr: null, farm_line: null,
  address: null, zip: null, city: null, state: null, notes: null, is_active: true, owner_lab_id: null,
}

function stub(company: any, canEdit: boolean) {
  const calls: { url: string; init?: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const body =
      url === '/api/companies/co1' ? { company, canEditCompany: canEdit }
      : url.endsWith('/titulares') ? { rows: [HOLDER] }
      : url.endsWith('/bank-accounts') ? { rows: [] }
      : {}
    return new Response(JSON.stringify(body))
  }))
  return calls
}

describe('CompanyPanel', () => {
  it('read-only: CNPJ is text, not an input, and Add bank account is still offered', async () => {
    stub(CO, false)
    render(<CompanyPanel companyId="co1" open onOpenChange={() => {}} />)
    expect(await screen.findByText('11.222.333/0001-81')).toBeTruthy()
    expect(screen.queryByLabelText('CNPJ')).toBeNull()
    expect(screen.getByText(/Only the laboratory that added this company/)).toBeTruthy()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Holders and bank accounts' }), { button: 0 })
    fireEvent.click(screen.getByRole('tab', { name: 'Holders and bank accounts' }))
    expect(await screen.findByText('Add holder')).toBeTruthy()
    expect(screen.getAllByText('Add bank account').length).toBeGreaterThan(0)
  })

  it('Brazil shows CNPJ and IE inputs when editable', async () => {
    stub(CO, true)
    render(<CompanyPanel companyId="co1" open onOpenChange={() => {}} />)
    expect(await screen.findByLabelText('CNPJ')).toBeTruthy()
    expect(screen.getByLabelText('IE')).toBeTruthy()
    expect(screen.queryByLabelText('Tax ID')).toBeNull()
  })

  it('Colombia shows Tax ID, and no holders in the register', async () => {
    stub({ ...CO, country: 'Colombia', vat_number: '900' }, true)
    render(<CompanyPanel companyId="co1" open onOpenChange={() => {}} initialTab="register" />)
    await waitFor(() => expect(screen.getByText('Company accounts')).toBeTruthy())
    expect(screen.queryByText('Add holder')).toBeNull()
    cleanup()
    render(<CompanyPanel companyId="co1" open onOpenChange={() => {}} />)
    expect(await screen.findByLabelText('Tax ID')).toBeTruthy()
    expect(screen.queryByLabelText('CNPJ')).toBeNull()
  })

  it('a NULL country is Brazil', async () => {
    stub({ ...CO, country: null }, true)
    render(<CompanyPanel companyId="co1" open onOpenChange={() => {}} />)
    expect(await screen.findByLabelText('CNPJ')).toBeTruthy()
  })

  it('saves a company edit with PATCH', async () => {
    const calls = stub(CO, true)
    render(<CompanyPanel companyId="co1" open onOpenChange={() => {}} />)
    const ie = await screen.findByLabelText('IE')
    fireEvent.change(ie, { target: { value: '999' } })
    fireEvent.click(screen.getByText('Save details'))
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(true))
    const patch = calls.find((c) => c.init?.method === 'PATCH')!
    expect(JSON.parse(patch.init!.body as string)).toMatchObject({ document_ie: '999', document_cnpj: '11.222.333/0001-81' })
  })

  it('Brazil edits street, number and neighbourhood, the columns sys uses; address is never sent', async () => {
    const calls = stub(CO, true)
    render(<CompanyPanel companyId="co1" open onOpenChange={() => {}} />)
    expect(((await screen.findByLabelText('Street')) as HTMLInputElement).value).toBe('Rua XV de Novembro')
    expect((screen.getByLabelText('Number') as HTMLInputElement).value).toBe('95')
    expect((screen.getByLabelText('Neighbourhood') as HTMLInputElement).value).toBe('Centro')
    expect((screen.getByLabelText('Postal code') as HTMLInputElement).value).toBe('11010-151')
    expect(screen.queryByLabelText('Address')).toBeNull()
    fireEvent.change(screen.getByLabelText('Number'), { target: { value: '101' } })
    fireEvent.click(screen.getByText('Save details'))
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(true))
    const body = JSON.parse(calls.find((c) => c.init?.method === 'PATCH')!.init!.body as string)
    expect(body).toMatchObject({
      street: 'Rua XV de Novembro', street_number: '101', neighbourhood: 'Centro', city: 'Santos', state: 'SP', zip_code: '11010-151',
    })
    expect('address' in body).toBe(false)
  })

  it('outside Brazil: two address lines, no number; a leftover number is folded into the street', async () => {
    const calls = stub({ ...CO, country: 'Colombia', street: 'Calle 10', street_number: '43-12', neighbourhood: 'Piso 2', vat_number: '900' }, true)
    render(<CompanyPanel companyId="co1" open onOpenChange={() => {}} />)
    expect(((await screen.findByLabelText('Address line 1')) as HTMLInputElement).value).toBe('Calle 10')
    expect((screen.getByLabelText('Address line 2') as HTMLInputElement).value).toBe('Piso 2')
    expect(screen.queryByLabelText('Number')).toBeNull()
    fireEvent.click(screen.getByText('Save details'))
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(true))
    const body = JSON.parse(calls.find((c) => c.init?.method === 'PATCH')!.init!.body as string)
    expect(body).toMatchObject({ street: 'Calle 10, 43-12', street_number: null, neighbourhood: 'Piso 2', vat_number: '900' })
    expect('person_type' in body).toBe(false)
  })

  it('read-only shows the street address; the legacy address only when street is empty, and it is never sent', async () => {
    stub(CO, false)
    render(<CompanyPanel companyId="co1" open onOpenChange={() => {}} />)
    expect(await screen.findByText('Rua XV de Novembro, 95, Centro, Santos, SP, 11010-151')).toBeTruthy()
    cleanup()
    const calls = stub({ ...CO, street: null, street_number: null, neighbourhood: null, address: 'Av. Antiga 1' }, true)
    render(<CompanyPanel companyId="co1" open onOpenChange={() => {}} />)
    expect(await screen.findByText('Av. Antiga 1')).toBeTruthy()
    expect(screen.getByText('Old address on file (read only)')).toBeTruthy()
    fireEvent.click(screen.getByText('Save details'))
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(true))
    const body = JSON.parse(calls.find((c) => c.init?.method === 'PATCH')!.init!.body as string)
    expect('address' in body).toBe(false)
  })
})

describe('CompanyDetails (client tab)', () => {
  it('renders general and register inline', async () => {
    stub(CO, true)
    render(<CompanyDetails companyId="co1" />)
    expect(await screen.findByLabelText('CNPJ')).toBeTruthy()
    expect(await screen.findByText('Holder One')).toBeTruthy()
  })
})
