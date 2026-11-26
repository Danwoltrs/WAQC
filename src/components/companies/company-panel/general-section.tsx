'use client'

import { useState } from 'react'
import { Segmented } from '@/components/ui/segmented'
import { isBrazilCountry } from '@/lib/company-register/schema'
import { addressLines, addressPatch, type CompanyRecord } from '@/lib/company-register/company-schema'
import { Field, FormActions } from './field'

const toDraft = (c: CompanyRecord) => ({
  name: c.name ?? '', fantasy_name: c.fantasy_name ?? '', country: c.country ?? '',
  street: c.street ?? '', street_number: c.street_number ?? '', neighbourhood: c.neighbourhood ?? '',
  city: c.city ?? '', state: c.state ?? '', zip_code: c.zip_code ?? '',
  person_type: (c.person_type ?? 'J') as 'F' | 'J',
  document_cnpj: c.document_cnpj ?? '', document_ie: c.document_ie ?? '', vat_number: c.vat_number ?? '',
})

/** The legacy companies.address, shown only when street is empty: read, never written. */
const legacyAddress = (c: CompanyRecord) => (!(c.street ?? '').trim() && (c.address ?? '').trim()) || null

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
  const legacy = legacyAddress(company)

  if (!canEdit) {
    const rows: [string, string | null][] = [
      ['Name', company.name], ['Fantasy name', company.fantasy_name], ['Country', company.country ?? 'Brazil'],
      ['Address', addressLines(company).join(', ') || null],
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
      ...addressPatch(draft, brazil),
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
        {legacy && (
          <div className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">Old address on file (read only)</span>
            <p className="text-sm">{legacy}</p>
          </div>
        )}
        {brazil ? (
          <>
            <Field label="Street" value={draft.street} onChange={set('street')} error={fieldErrors.street} />
            <Field label="Number" value={draft.street_number} onChange={set('street_number')} error={fieldErrors.street_number} />
            <Field label="Neighbourhood" value={draft.neighbourhood} onChange={set('neighbourhood')} error={fieldErrors.neighbourhood} />
          </>
        ) : (
          <>
            <Field label="Address line 1" value={draft.street} onChange={set('street')} error={fieldErrors.street} />
            <Field label="Address line 2" value={draft.neighbourhood} onChange={set('neighbourhood')} error={fieldErrors.neighbourhood} />
          </>
        )}
        <Field label="City" value={draft.city} onChange={set('city')} error={fieldErrors.city} />
        <Field label={brazil ? 'State' : 'State / Province'} value={draft.state} onChange={set('state')} error={fieldErrors.state} />
        <Field label="Postal code" value={draft.zip_code} onChange={set('zip_code')} error={fieldErrors.zip_code} />
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
