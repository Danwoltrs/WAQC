'use client'

// The add-company form's register parts: the company's documents (Brazil:
// person type, CNPJ or CPF, IE; elsewhere a tax ID) and the optional holders
// and bank accounts, kept as drafts until the company is saved (POST
// /api/clients saves them right after it). Reuses the company panel's forms.
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { BankAccountForm } from '@/components/companies/company-panel/bank-account-form'
import { HolderForm } from '@/components/companies/company-panel/holder-form'
import {
  emptyAccount, emptyHolder, type AccountDraft, type FieldErrors, type HolderDraft,
} from '@/components/companies/company-panel/drafts'
import { bankAccountSchemaFor, parseWith, titularInputSchema } from '@/lib/company-register/schema'

export interface CompanyDocuments {
  person_type: 'F' | 'J'
  document_cnpj: string
  document_ie: string
  vat_number: string
}

export const emptyDocuments = (): CompanyDocuments => ({ person_type: 'J', document_cnpj: '', document_ie: '', vat_number: '' })

/** The documents part of the POST body: Brazilian documents in Brazil, a tax ID elsewhere. */
export function documentsPayload(d: CompanyDocuments, brazil: boolean): Record<string, unknown> {
  return brazil
    ? { person_type: d.person_type, document_cnpj: d.document_cnpj.trim() || null, document_ie: d.document_ie.trim() || null }
    : { vat_number: d.vat_number.trim() || null }
}

const inputCls = 'h-8 text-sm rounded-none'

function DocField({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} aria-invalid={!!error || undefined} />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

/** Next to the country: the person type in Brazil (its documents follow in
 *  BrazilDocumentRow), the tax ID anywhere else. */
export function CompanyDocumentsFields({
  brazil, value, onChange, errors = {},
}: { brazil: boolean; value: CompanyDocuments; onChange: (v: CompanyDocuments) => void; errors?: FieldErrors }) {
  const set = <K extends keyof CompanyDocuments>(k: K) => (v: CompanyDocuments[K]) => onChange({ ...value, [k]: v })
  if (!brazil) {
    return <DocField id="modal_vat_number" label="Tax ID" value={value.vat_number} onChange={set('vat_number')} error={errors.vat_number} />
  }
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium">Person type</span>
      <div>
        <Segmented
          aria-label="Person type"
          size="sm"
          value={value.person_type}
          onValueChange={set('person_type')}
          options={[{ value: 'J', label: 'Company (CNPJ)' }, { value: 'F', label: 'Individual (CPF)' }]}
        />
      </div>
    </div>
  )
}

/** CNPJ or CPF, and IE: the second documents row in Brazil. */
export function BrazilDocumentRow({
  value, onChange, errors = {},
}: { value: CompanyDocuments; onChange: (v: CompanyDocuments) => void; errors?: FieldErrors }) {
  const set = <K extends keyof CompanyDocuments>(k: K) => (v: CompanyDocuments[K]) => onChange({ ...value, [k]: v })
  return (
    <div className="grid grid-cols-2 gap-2">
      <DocField id="modal_document_cnpj" label={value.person_type === 'F' ? 'CPF' : 'CNPJ'} value={value.document_cnpj}
        onChange={set('document_cnpj')} error={errors.document_cnpj} />
      <DocField id="modal_document_ie" label="IE" value={value.document_ie} onChange={set('document_ie')} error={errors.document_ie} />
    </div>
  )
}

export interface PendingAccount { key: string; draft: AccountDraft }
export interface PendingHolder { key: string; draft: HolderDraft; accounts: PendingAccount[] }
export interface PendingRegisterValue { accounts: PendingAccount[]; holders: PendingHolder[] }

export const emptyRegister = (): PendingRegisterValue => ({ accounts: [], holders: [] })

const accountBody = (d: AccountDraft, titularId: string | null = null) => {
  const { is_primary, ...rest } = d
  return { ...rest, account_type: rest.account_type || null, titular_id: titularId, is_primary }
}

/** The holders and bank accounts part of the POST body. Holders are Brazilian only. */
export function registerPayload(v: PendingRegisterValue, brazil: boolean): Record<string, unknown> {
  return {
    bank_accounts: v.accounts.map((a) => accountBody(a.draft)),
    titulares: brazil
      ? v.holders.map((h) => ({ ...h.draft, bank_accounts: h.accounts.map((a) => accountBody(a.draft)) }))
      : [],
  }
}

type Editing =
  | { kind: 'holder'; key: string | 'new'; draft: HolderDraft }
  | { kind: 'account'; key: string | 'new'; holderKey: string | null; draft: AccountDraft }
  | null

const ghostBtn = 'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground'
let seq = 0
const newKey = () => `p${++seq}`

/** Splits zod messages: field ones show under the field, the rest above the buttons. */
function checkErrors(r: { error: string; fieldErrors: FieldErrors }) {
  const fields = Object.fromEntries(Object.entries(r.fieldErrors).filter(([k]) => k !== '_'))
  return { fields, form: Object.keys(fields).length > 0 ? null : r.error }
}

/** Collapsible "Holders and bank accounts (optional)": rows are added here and saved with the company. */
export function PendingRegister({
  brazil, country, value, onChange, onEditingChange,
}: {
  brazil: boolean
  country: string | null
  value: PendingRegisterValue
  onChange: (v: PendingRegisterValue) => void
  onEditingChange: (editing: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Editing>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  useEffect(() => { onEditingChange(editing !== null) }, [editing, onEditingChange])

  const start = (e: Editing) => { setEditing(e); setFieldErrors({}); setFormError(null) }
  const count = value.accounts.length + (brazil ? value.holders.reduce((n, h) => n + 1 + h.accounts.length, 0) : 0)

  /** A primary account displaces the other pending primary of the same holder (or of the company). */
  const placeAccount = (list: PendingAccount[], key: string, draft: AccountDraft): PendingAccount[] => {
    const others = draft.is_primary ? list.map((a) => ({ ...a, draft: { ...a.draft, is_primary: false } })) : list
    return key === 'new' ? [...others, { key: newKey(), draft }] : others.map((a) => (a.key === key ? { key, draft } : a))
  }

  function submit() {
    if (!editing) return
    if (editing.kind === 'holder') {
      const r = parseWith(titularInputSchema, editing.draft)
      if (!r.ok) { const e = checkErrors(r); setFieldErrors(e.fields); setFormError(e.form); return }
      const holders = editing.key === 'new'
        ? [...value.holders, { key: newKey(), draft: editing.draft, accounts: [] }]
        : value.holders.map((h) => (h.key === editing.key ? { ...h, draft: editing.draft } : h))
      onChange({ ...value, holders })
    } else {
      const r = parseWith(bankAccountSchemaFor(country), accountBody(editing.draft))
      if (!r.ok) { const e = checkErrors(r); setFieldErrors(e.fields); setFormError(e.form); return }
      if (editing.holderKey === null) {
        onChange({ ...value, accounts: placeAccount(value.accounts, editing.key, editing.draft) })
      } else {
        const holderKey = editing.holderKey
        onChange({
          ...value,
          holders: value.holders.map((h) => (h.key === holderKey ? { ...h, accounts: placeAccount(h.accounts, editing.key, editing.draft) } : h)),
        })
      }
    }
    setEditing(null)
  }

  const removeAccount = (holderKey: string | null, key: string) =>
    onChange(holderKey === null
      ? { ...value, accounts: value.accounts.filter((a) => a.key !== key) }
      : { ...value, holders: value.holders.map((h) => (h.key === holderKey ? { ...h, accounts: h.accounts.filter((a) => a.key !== key) } : h)) })

  function accountForm(holderKey: string | null, key: string) {
    if (editing?.kind !== 'account' || editing.key !== key || editing.holderKey !== holderKey) return null
    return (
      <BankAccountForm value={editing.draft} onChange={(d) => setEditing({ ...editing, draft: d })} onSubmit={submit}
        onCancel={() => setEditing(null)} brazil={brazil} errors={fieldErrors} formError={formError}
        submitLabel={key === 'new' ? 'Add account' : 'Save account'} />
    )
  }

  function accountRows(holderKey: string | null, rows: PendingAccount[], addLabel: string) {
    return (
      <div className="space-y-2">
        {rows.map((a) =>
          editing?.kind === 'account' && editing.key === a.key ? <div key={a.key}>{accountForm(holderKey, a.key)}</div> : (
            <div key={a.key} className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-border px-3 py-2">
              <div className="min-w-0 text-sm">
                <span className="font-medium">{a.draft.label || a.draft.bank_name || 'Account'}</span>
                {a.draft.is_primary && <span className="ml-2 rounded-[4px] bg-primary/10 px-1.5 py-0.5 text-xs text-primary">Primary</span>}
                <div className="text-xs text-muted-foreground">
                  {[a.draft.bank_name, a.draft.routing_code, a.draft.branch && `${brazil ? 'Agência' : 'Branch'} ${a.draft.branch}`,
                    a.draft.account_number, brazil && a.draft.pix_key && `PIX ${a.draft.pix_key}`].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="flex gap-1">
                <button type="button" className={ghostBtn} onClick={() => start({ kind: 'account', key: a.key, holderKey, draft: a.draft })}>Edit</button>
                <button type="button" className={ghostBtn} onClick={() => removeAccount(holderKey, a.key)}>Remove</button>
              </div>
            </div>
          ))}
        {accountForm(holderKey, 'new')}
        {!(editing?.kind === 'account' && editing.key === 'new' && editing.holderKey === holderKey) && (
          <button type="button" className={ghostBtn} onClick={() => start({ kind: 'account', key: 'new', holderKey, draft: emptyAccount() })}>
            <Plus className="h-3.5 w-3.5" />{addLabel}
          </button>
        )}
      </div>
    )
  }

  const holderForm = (key: string) =>
    editing?.kind === 'holder' && editing.key === key ? (
      <HolderForm value={editing.draft} onChange={(d) => setEditing({ ...editing, draft: d })} onSubmit={submit}
        onCancel={() => setEditing(null)} errors={fieldErrors} formError={formError}
        submitLabel={key === 'new' ? 'Add holder' : 'Save holder'} />
    ) : null

  return (
    <div className="space-y-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {brazil ? 'Holders and bank accounts (optional)' : 'Bank accounts (optional)'}
        {count > 0 && <span className="font-normal text-muted-foreground">{count} added</span>}
      </button>
      {open && (
        <div className="space-y-4">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold">Company accounts</h3>
            {accountRows(null, value.accounts, 'Add company account')}
          </section>
          {brazil ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold">Holders</h3>
              {value.holders.map((h) => (
                <div key={h.key} className="space-y-2 rounded-[10px] border border-border p-3">
                  {holderForm(h.key) ?? (
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="text-sm">
                        <span className="font-medium">{h.draft.name}</span>
                        <div className="text-xs text-muted-foreground">
                          {[h.draft.person_type === 'J' ? 'CNPJ' : 'CPF', h.draft.cpf_cnpj, h.draft.farm_line].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" className={ghostBtn} onClick={() => start({ kind: 'holder', key: h.key, draft: h.draft })}>Edit</button>
                        <button type="button" className={ghostBtn}
                          onClick={() => onChange({ ...value, holders: value.holders.filter((x) => x.key !== h.key) })}>Remove</button>
                      </div>
                    </div>
                  )}
                  {accountRows(h.key, h.accounts, 'Add bank account')}
                </div>
              ))}
              {holderForm('new') ?? (
                <button type="button" className={ghostBtn} onClick={() => start({ kind: 'holder', key: 'new', draft: emptyHolder() })}>
                  <Plus className="h-3.5 w-3.5" />Add holder
                </button>
              )}
            </section>
          ) : value.holders.length > 0 && (
            <p className="text-xs text-muted-foreground">Holders are for companies in Brazil: they are not saved for this country.</p>
          )}
        </div>
      )}
    </div>
  )
}
