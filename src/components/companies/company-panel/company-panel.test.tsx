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
  id: 'co1', name: 'Fazenda Legal Ltda', fantasy_name: 'Fazenda', country: 'Brazil', address: null, city: null,
  state: null, zip_code: null, person_type: 'J', document_cnpj: '11.222.333/0001-81', document_ie: '123', vat_number: null,
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
})

describe('CompanyDetails (client tab)', () => {
  it('renders general and register inline', async () => {
    stub(CO, true)
    render(<CompanyDetails companyId="co1" />)
    expect(await screen.findByLabelText('CNPJ')).toBeTruthy()
    expect(await screen.findByText('Holder One')).toBeTruthy()
  })
})
