'use client'

import { Segmented } from '@/components/ui/segmented'
import { Field, FormActions } from './field'
import type { FieldErrors, HolderDraft } from './drafts'

/** Presentational: values in, changes out. The caller saves. */
export function HolderForm({
  value, onChange, onSubmit, onCancel, errors = {}, formError, saving, submitLabel = 'Save holder',
}: {
  value: HolderDraft
  onChange: (next: HolderDraft) => void
  onSubmit: () => void
  onCancel: () => void
  errors?: FieldErrors
  formError?: string | null
  saving?: boolean
  submitLabel?: string
}) {
  const set = <K extends keyof HolderDraft>(k: K) => (v: HolderDraft[K]) => onChange({ ...value, [k]: v })
  const company = value.person_type === 'J'
  return (
    <form
      className="space-y-3 rounded-[10px] border border-border bg-muted/30 p-4"
      onSubmit={(e) => { e.preventDefault(); onSubmit() }}
    >
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Holder type</span>
        <div>
          <Segmented
            aria-label="Holder type"
            value={value.person_type}
            onValueChange={set('person_type')}
            options={[{ value: 'J', label: 'CNPJ (company)' }, { value: 'F', label: 'CPF (person)' }]}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" value={value.name} onChange={set('name')} error={errors.name} />
        <Field label={company ? 'CNPJ' : 'CPF'} value={value.cpf_cnpj} onChange={set('cpf_cnpj')} error={errors.cpf_cnpj} />
        {!company && <Field label="RG" value={value.rg} onChange={set('rg')} error={errors.rg} />}
        <Field label={company ? 'IE' : 'IPR'} value={value.ie_ipr} onChange={set('ie_ipr')} error={errors.ie_ipr} />
        <Field label="Farm line" value={value.farm_line} onChange={set('farm_line')} error={errors.farm_line} />
        <Field label="Address" value={value.address} onChange={set('address')} error={errors.address} />
        <Field label="Zip" value={value.zip} onChange={set('zip')} error={errors.zip} />
        <Field label="City" value={value.city} onChange={set('city')} error={errors.city} />
        <Field label="State" value={value.state} onChange={set('state')} error={errors.state} />
        <Field label="Notes" value={value.notes} onChange={set('notes')} error={errors.notes} />
      </div>
      <FormActions saving={saving} submitLabel={submitLabel} onCancel={onCancel} error={formError} />
    </form>
  )
}
