// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The QC services panel imports the browser client, which needs env vars.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { AddClientModal } from './add-client-modal'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function stubFetch() {
  const calls: { url: string; body: any }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
    return new Response(JSON.stringify({ client: { id: 'new-co', fantasy_name: 'Boa Vista' } }), { status: 201 })
  }))
  return calls
}

const field = (label: string) => screen.getByLabelText(label, { selector: 'input' })

describe('AddClientModal', () => {
  it('Brazil: person type, CNPJ and IE; one POST to /api/clients and no exporter, importer or roaster posts', async () => {
    const calls = stubFetch()
    const onSuccess = vi.fn()
    render(<AddClientModal open onOpenChange={() => {}} defaultRole="exporter" onSuccess={onSuccess} />)
    expect(screen.queryByLabelText('Tax ID')).toBeNull()
    await userEvent.type(field('Company Name *'), 'Fazenda Boa Vista Ltda')
    await userEvent.type(field('Fantasy/Brand Name'), 'Boa Vista')
    await userEvent.type(field('CNPJ'), '11222333000181')
    await userEvent.type(field('IE'), '123.456')
    // The role it was opened for is kept even when the box is unticked (the party picker needs it).
    await userEvent.click(screen.getByLabelText('Exporter'))
    await userEvent.click(screen.getByRole('button', { name: 'Create Seller/Exporter' }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('Boa Vista', 'new-co'))
    expect(calls.map((c) => c.url)).toEqual(['/api/clients'])
    expect(calls[0].body).toMatchObject({
      name: 'Fazenda Boa Vista Ltda', fantasy_name: 'Boa Vista', person_type: 'J',
      document_cnpj: '11222333000181', document_ie: '123.456', client_types: ['exporter'],
    })
    expect(calls[0].body.vat_number ?? null).toBeNull()
  })

  it('an individual (CPF) in Brazil', async () => {
    const calls = stubFetch()
    render(<AddClientModal open onOpenChange={() => {}} onSuccess={vi.fn()} />)
    await userEvent.type(field('Company Name *'), 'Joao Silva')
    await userEvent.click(screen.getByRole('radio', { name: 'Individual (CPF)' }))
    await userEvent.type(field('CPF'), '52998224725')
    await userEvent.click(screen.getByRole('button', { name: 'Create Client' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].body).toMatchObject({ person_type: 'F', document_cnpj: '52998224725' })
  })

  it('outside Brazil: a Tax ID instead of CNPJ and IE', async () => {
    const calls = stubFetch()
    render(<AddClientModal open onOpenChange={() => {}} onSuccess={vi.fn()} />)
    await userEvent.type(field('Company Name *'), 'Cafe de Colombia SAS')
    await userEvent.click(screen.getByRole('combobox', { name: 'Country' }))
    await userEvent.click(screen.getByRole('option', { name: 'Colombia' }))
    expect(screen.queryByLabelText('CNPJ')).toBeNull()
    expect(screen.queryByLabelText('IE')).toBeNull()
    await userEvent.type(field('Tax ID'), '900.123.456-7')
    await userEvent.click(screen.getByRole('button', { name: 'Create Client' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].body).toMatchObject({ country: 'Colombia', vat_number: '900.123.456-7' })
    expect(calls[0].body.document_cnpj ?? null).toBeNull()
  })

  it('optional holders and bank accounts: added rows go in the same POST', async () => {
    const calls = stubFetch()
    render(<AddClientModal open onOpenChange={() => {}} onSuccess={vi.fn()} />)
    await userEvent.type(field('Company Name *'), 'Fazenda Boa Vista Ltda')
    await userEvent.click(screen.getByRole('button', { name: /Holders and bank accounts \(optional\)/ }))

    await userEvent.click(screen.getByRole('button', { name: 'Add company account' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }))
    // Neither an account number nor a PIX key: refused in place, nothing added.
    expect(await screen.findByText('Enter the account number or the PIX key')).toBeInTheDocument()
    await userEvent.type(field('Bank'), 'Itau')
    // The field's error sits inside its label, so match the label's start.
    await userEvent.type(screen.getByLabelText(/^Account number/, { selector: 'input' }), '12345-6')
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }))
    expect(await screen.findByText(/Itau · 12345-6/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add holder' }))
    await userEvent.click(screen.getByRole('radio', { name: 'CPF (person)' }))
    await userEvent.type(field('Name'), 'Joao Silva')
    await userEvent.type(field('CPF'), '52998224725')
    await userEvent.click(screen.getByRole('button', { name: 'Add holder' }))
    expect(await screen.findByText('Joao Silva')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Create Client' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].body.bank_accounts).toEqual([
      expect.objectContaining({ bank_name: 'Itau', account_number: '12345-6', account_type: null, titular_id: null }),
    ])
    expect(calls[0].body.titulares).toEqual([
      expect.objectContaining({ person_type: 'F', name: 'Joao Silva', cpf_cnpj: '52998224725', bank_accounts: [] }),
    ])
  })

  it('Create waits while a holder or account form is still open', async () => {
    stubFetch()
    render(<AddClientModal open onOpenChange={() => {}} onSuccess={vi.fn()} />)
    await userEvent.type(field('Company Name *'), 'Fazenda Boa Vista Ltda')
    await userEvent.click(screen.getByRole('button', { name: /Holders and bank accounts \(optional\)/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Add company account' }))
    expect(screen.getByRole('button', { name: 'Create Client' })).toBeDisabled()
    // The account form's Cancel comes before the dialog's own.
    await userEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
    expect(screen.getByRole('button', { name: 'Create Client' })).toBeEnabled()
  })
})
