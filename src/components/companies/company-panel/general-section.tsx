'use client'

import { useState } from 'react'
import { Segmented } from '@/components/ui/segmented'
import { isBrazilCountry } from '@/lib/company-register/schema'
import type { CompanyRecord } from '@/lib/company-register/company-schema'
import { Field, FormActions } from './field'

const toDraft = (c: CompanyRecord) => ({
  name: c.name ?? '', fantasy_name: c.fantasy_name ?? '', country: c.country ?? '',
  address: c.address ?? '', city: c.city ?? '', state: c.state ?? '', zip_code: c.zip_code ?? '',
  person_type: (c.person_type ?? 'J') as 'F' | 'J',
  document_cnpj: c.document_cnpj ?? '', document_ie: c.document_ie ?? '', vat_number: c.vat_number ?? '',
})

/** The company's own fields. Read-only (with a note) for a caller who may not edit them. */
export function GeneralSection({
  company, canEdit, onSaved,
}: { company: CompanyRecord; canEdit: boolean; onSaved: (c: CompanyRecord) => void }) {
  const [draft, setDraft] = useState(() => toDraft(company))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof typeof draft>(k: K) => (v: (typeof draft)[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const brazil = isBrazilCountry(canEdit ? draft.country : company.country)
  const docLabel = (canEdit ? draft.person_type : (company.person_type ?? 'J')) === 'F' ? 'CPF' : 'CNPJ'

  if (!canEdit) {
    const rows: [string, string | null][] = [
      ['Name', company.name], ['Fantasy name', company.fantasy_name], ['Country', company.country ?? 'Brazil'],
      ['Address', [company.address, company.city, company.state, company.zip_code].filter(Boolean).join(', ') || null],
      ...(brazil
        ? ([['Person type', company.person_type === 'F' ? 'PF (person)' : 'PJ (company)'], [docLabel, company.document_cnpj], ['IE', company.document_ie]] as [string, string | null][])
        : ([['Tax ID', company.vat_number]] as [string, string | null][])),
    ]
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Only the laboratory that added this company can change its details. Holders, bank accounts and contacts can still be edited.
        </p>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-sm">{v || '-'}</dd>
            </div>
          ))}
        </dl>
      </div>
    )
  }

  async function save() {
    setSaving(true); setError(null); setFieldErrors({})
    const body: Record<string, unknown> = {
      name: draft.name, fantasy_name: draft.fantasy_name, country: draft.country,
      address: draft.address, city: draft.city, state: draft.state, zip_code: draft.zip_code,
      ...(brazil
        ? { person_type: draft.person_type, document_cnpj: draft.document_cnpj, document_ie: draft.document_ie }
        : { vat_number: draft.vat_number }),
    }
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Could not save')
        setFieldErrors(json.fieldErrors ?? {})
        return
      }
      onSaved(json.company)
    } catch {
      setError('Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" value={draft.name} onChange={set('name')} error={fieldErrors.name} />
        <Field label="Fantasy name" value={draft.fantasy_name} onChange={set('fantasy_name')} error={fieldErrors.fantasy_name} />
        <Field label="Country" value={draft.country} onChange={set('country')} error={fieldErrors.country} />
        <Field label="Address" value={draft.address} onChange={set('address')} error={fieldErrors.address} />
        <Field label="City" value={draft.city} onChange={set('city')} error={fieldErrors.city} />
        <Field label="State" value={draft.state} onChange={set('state')} error={fieldErrors.state} />
        <Field label="Zip" value={draft.zip_code} onChange={set('zip_code')} error={fieldErrors.zip_code} />
        {brazil ? (
          <>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Person type</span>
              <div>
                <Segmented aria-label="Person type" value={draft.person_type} onValueChange={set('person_type')}
                  options={[{ value: 'J', label: 'PJ (company)' }, { value: 'F', label: 'PF (person)' }]} />
              </div>
            </div>
            <Field label={docLabel} value={draft.document_cnpj} onChange={set('document_cnpj')} error={fieldErrors.document_cnpj} />
            <Field label="IE" value={draft.document_ie} onChange={set('document_ie')} error={fieldErrors.document_ie} />
          </>
        ) : (
          <Field label="Tax ID" value={draft.vat_number} onChange={set('vat_number')} error={fieldErrors.vat_number} />
        )}
      </div>
      <FormActions saving={saving} submitLabel="Save details" onCancel={() => { setDraft(toDraft(company)); setError(null); setFieldErrors({}) }} error={error} />
    </form>
  )
}
