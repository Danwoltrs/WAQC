'use client'

import { Segmented } from '@/components/ui/segmented'
import { Field, FormActions } from './field'
import type { AccountDraft, FieldErrors } from './drafts'

/** Presentational: values in, changes out. The caller saves. `brazil` shows
 *  the Brazilian fields (Agência, account type, PIX); elsewhere the bank code
 *  is a SWIFT / ABA code and the account number is required. */
export function BankAccountForm({
  value, onChange, onSubmit, onCancel, brazil, errors = {}, formError, saving, showPrimary = true, submitLabel = 'Save account',
}: {
  value: AccountDraft
  onChange: (next: AccountDraft) => void
  onSubmit: () => void
  onCancel: () => void
  brazil: boolean
  errors?: FieldErrors
  formError?: string | null
  saving?: boolean
  showPrimary?: boolean
  submitLabel?: string
}) {
  const set = <K extends keyof AccountDraft>(k: K) => (v: AccountDraft[K]) => onChange({ ...value, [k]: v })
  return (
    <form
      className="space-y-3 rounded-[10px] border border-border bg-muted/30 p-4"
      onSubmit={(e) => { e.preventDefault(); onSubmit() }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Label" value={value.label} onChange={set('label')} error={errors.label} />
        <Field label="Bank" value={value.bank_name} onChange={set('bank_name')} error={errors.bank_name} />
        <Field label={brazil ? 'Bank code' : 'SWIFT / ABA'} value={value.routing_code} onChange={set('routing_code')} error={errors.routing_code} />
        <Field label={brazil ? 'Agência' : 'Branch'} value={value.branch} onChange={set('branch')} error={errors.branch} />
        <Field label="Account number" value={value.account_number} onChange={set('account_number')} error={errors.account_number} />
        {brazil && <Field label="PIX key" value={value.pix_key} onChange={set('pix_key')} error={errors.pix_key} />}
      </div>
      {brazil && (
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Account type</span>
          <div>
            <Segmented
              aria-label="Account type"
              value={value.account_type || 'none'}
              onValueChange={(v) => set('account_type')(v === 'none' ? '' : (v as 'corrente' | 'poupanca'))}
              options={[
                { value: 'none', label: 'Not set' },
                { value: 'corrente', label: 'Corrente' },
                { value: 'poupanca', label: 'Poupança' },
              ]}
            />
          </div>
        </div>
      )}
      {showPrimary && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value.is_primary} onChange={(e) => set('is_primary')(e.target.checked)} />
          Primary account
        </label>
      )}
      <FormActions saving={saving} submitLabel={submitLabel} onCancel={onCancel} error={formError} />
    </form>
  )
}
