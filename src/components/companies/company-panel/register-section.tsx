'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { isBrazilCountry } from '@/lib/company-register/schema'
import type { BankAccount, Titular } from '@/types/company-register'
import { BankAccountForm } from './bank-account-form'
import { HolderForm } from './holder-form'
import {
  accountToDraft, emptyAccount, emptyHolder, holderToDraft,
  type AccountDraft, type FieldErrors, type HolderDraft,
} from './drafts'

type Editing =
  | { kind: 'holder'; id: string | 'new'; draft: HolderDraft }
  | { kind: 'account'; id: string | 'new'; titularId: string | null; draft: AccountDraft }
  | null

const ghostBtn = 'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground'

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, json }
}

/** The company's own bank accounts, then (Brazil only) each holder with its accounts. Open to every QC login. */
export function RegisterSection({ companyId, country }: { companyId: string; country: string | null }) {
  const brazil = isBrazilCountry(country)
  const [holders, setHolders] = useState<Titular[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Editing>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const load = useCallback(async () => {
    try {
      const [h, a] = await Promise.all([
        fetch(`/api/companies/${companyId}/titulares`), fetch(`/api/companies/${companyId}/bank-accounts`),
      ])
      if (!h.ok || !a.ok) throw new Error()
      setHolders((await h.json()).rows ?? [])
      setAccounts((await a.json()).rows ?? [])
      setLoadError(null)
    } catch {
      setLoadError('The holders and bank accounts could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { void load() }, [load])

  const open = (e: Editing) => { setEditing(e); setFormError(null); setFieldErrors({}) }

  async function run(url: string, method: string, body: unknown) {
    setSaving(true); setFormError(null); setFieldErrors({})
    try {
      const { ok, json } = await send(url, method, body)
      if (!ok) { setFormError(json.error ?? 'Could not save'); setFieldErrors(json.fieldErrors ?? {}); return false }
      await load()
      return true
    } catch {
      setFormError('Could not save')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function submit() {
    if (!editing) return
    let ok = false
    if (editing.kind === 'holder') {
      const isNew = editing.id === 'new'
      ok = await run(
        isNew ? `/api/companies/${companyId}/titulares` : `/api/companies/${companyId}/titulares/${editing.id}`,
        isNew ? 'POST' : 'PATCH', editing.draft,
      )
    } else {
      const isNew = editing.id === 'new'
      const { is_primary, ...rest } = editing.draft
      const body = { ...rest, account_type: rest.account_type || null, titular_id: editing.titularId, ...(isNew || is_primary ? { is_primary } : {}) }
      ok = await run(
        isNew ? `/api/companies/${companyId}/bank-accounts` : `/api/companies/${companyId}/bank-accounts/${editing.id}`,
        isNew ? 'POST' : 'PATCH', body,
      )
    }
    if (ok) setEditing(null)
  }

  async function quick(url: string, body: unknown) {
    const { ok, json } = await send(url, 'PATCH', body)
    if (!ok) setLoadError(json.error ?? 'Could not save')
    else await load()
  }

  const visible = <T extends { is_active: boolean }>(rows: T[]) => (showInactive ? rows : rows.filter((r) => r.is_active))

  function accountForm(titularId: string | null, id: string | 'new') {
    if (!editing || editing.kind !== 'account' || editing.id !== id || editing.titularId !== titularId) return null
    return (
      <BankAccountForm
        value={editing.draft} onChange={(d) => setEditing({ ...editing, draft: d })} onSubmit={submit}
        onCancel={() => setEditing(null)} brazil={brazil} errors={fieldErrors} formError={formError} saving={saving}
        showPrimary={id === 'new'}
      />
    )
  }

  function accountRows(titularId: string | null) {
    const rows = visible(accounts.filter((a) => a.titular_id === titularId))
    return (
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">No bank accounts.</p>}
        {rows.map((a) =>
          editing?.kind === 'account' && editing.id === a.id ? <div key={a.id}>{accountForm(titularId, a.id)}</div> : (
            <div key={a.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-border px-3 py-2 ${a.is_active ? '' : 'opacity-60'}`}>
              <div className="min-w-0 text-sm">
                <span className="font-medium">{a.label || a.bank_name || 'Account'}</span>
                {a.is_primary && <span className="ml-2 rounded-[4px] bg-primary/10 px-1.5 py-0.5 text-xs text-primary">Primary</span>}
                {!a.is_active && <span className="ml-2 text-xs text-muted-foreground">Inactive</span>}
                <div className="text-xs text-muted-foreground">
                  {[a.bank_name, a.routing_code, a.branch && `${brazil ? 'Agência' : 'Branch'} ${a.branch}`, a.account_number, a.pix_key && `PIX ${a.pix_key}`].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="flex gap-1">
                <button type="button" className={ghostBtn} onClick={() => open({ kind: 'account', id: a.id, titularId, draft: accountToDraft(a) })}>Edit</button>
                {a.is_active && !a.is_primary && (
                  <button type="button" className={ghostBtn} onClick={() => void quick(`/api/companies/${companyId}/bank-accounts/${a.id}`, { is_primary: true })}>Set primary</button>
                )}
                <button type="button" className={ghostBtn} onClick={() => void quick(`/api/companies/${companyId}/bank-accounts/${a.id}`, { is_active: !a.is_active })}>
                  {a.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        {accountForm(titularId, 'new')}
        {!(editing?.kind === 'account' && editing.id === 'new' && editing.titularId === titularId) && (
          <button type="button" className={ghostBtn} onClick={() => open({ kind: 'account', id: 'new', titularId, draft: emptyAccount() })}>
            <Plus className="h-3.5 w-3.5" />Add bank account
          </button>
        )}
      </div>
    )
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>

  return (
    <div className="space-y-5">
      {loadError && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{loadError}</p>}
      <div className="flex justify-end">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Company accounts</h3>
        {accountRows(null)}
      </section>
      {brazil && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Holders</h3>
          {visible(holders).length === 0 && <p className="text-xs text-muted-foreground">No holders.</p>}
          {visible(holders).map((h) => (
            <div key={h.id} className={`space-y-3 rounded-[10px] border border-border p-4 ${h.is_active ? '' : 'opacity-60'}`}>
              {editing?.kind === 'holder' && editing.id === h.id ? (
                <HolderForm value={editing.draft} onChange={(d) => setEditing({ ...editing, draft: d })} onSubmit={submit}
                  onCancel={() => setEditing(null)} errors={fieldErrors} formError={formError} saving={saving} />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-medium">{h.name}</span>
                    {!h.is_active && <span className="ml-2 text-xs text-muted-foreground">Inactive</span>}
                    <div className="text-xs text-muted-foreground">
                      {[h.person_type === 'J' ? 'CNPJ' : 'CPF', h.cpf_cnpj, h.ie_ipr && `${h.person_type === 'J' ? 'IE' : 'IPR'} ${h.ie_ipr}`, h.farm_line].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className={ghostBtn} onClick={() => open({ kind: 'holder', id: h.id, draft: holderToDraft(h) })}>Edit</button>
                    <button type="button" className={ghostBtn} onClick={() => void quick(`/api/companies/${companyId}/titulares/${h.id}`, { is_active: !h.is_active })}>
                      {h.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              )}
              {accountRows(h.id)}
            </div>
          ))}
          {editing?.kind === 'holder' && editing.id === 'new' ? (
            <HolderForm value={editing.draft} onChange={(d) => setEditing({ ...editing, draft: d })} onSubmit={submit}
              onCancel={() => setEditing(null)} errors={fieldErrors} formError={formError} saving={saving} />
          ) : (
            <button type="button" className={ghostBtn} onClick={() => open({ kind: 'holder', id: 'new', draft: emptyHolder() })}>
              <Plus className="h-3.5 w-3.5" />Add holder
            </button>
          )}
        </section>
      )}
    </div>
  )
}
