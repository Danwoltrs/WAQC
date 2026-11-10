'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { PersonContact } from '@/lib/contacts/people'

const LANGS = ['en', 'pt', 'de', 'fr', 'es'] as const

interface Draft {
  email: string; name: string; nickname: string; phone: string; whatsapp: string
  preferredLanguage: string; isGroup: boolean
}

const toDraft = (c: Partial<PersonContact> | null): Draft => ({
  email: c?.email ?? '',
  name: c?.name ?? '',
  nickname: c?.nickname ?? '',
  phone: c?.phone ?? '',
  whatsapp: c?.whatsapp ?? '',
  preferredLanguage: c?.preferred_language ?? 'en',
  isGroup: c?.is_group ?? false,
})

const isInternal = (email: string) => /@wolthers\.com$/i.test(email.trim())

/**
 * Add or edit a contact in the shared `contacts` table. A new contact is saved
 * through the QC-certificates upsert, so it starts with the QC certs tick
 * (untick it in the matrix if they shouldn't get certificates). Editing never
 * touches the matrix ticks.
 */
export function ContactDialog({
  open, onOpenChange, companyId, companyName, contact, seed, onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  companyId: string
  companyName: string
  /** The contact being edited; null to add one. */
  contact: PersonContact | null
  /** Starting values for a new contact (e.g. a portal user being added). */
  seed?: Partial<PersonContact>
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<Draft>(toDraft(contact ?? seed ?? null))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setDraft(toDraft(contact ?? seed ?? null)); setError(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact?.id, seed?.email])

  async function save() {
    if (!draft.email.trim()) { setError('Email is required'); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        email: draft.email.trim(),
        name: draft.name.trim() || null,
        nickname: draft.nickname.trim() || null,
        isGroup: draft.isGroup,
        phone: draft.phone.trim() || null,
        whatsapp: draft.whatsapp.trim() || null,
        preferredLanguage: draft.preferredLanguage,
      }
      const res = contact
        ? await fetch(`/api/companies/${companyId}/qc-contacts/${contact.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch(`/api/companies/${companyId}/qc-contacts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'The contact could not be saved')
      onOpenChange(false)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The contact could not be saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] rounded-[10px]">
        <DialogHeader>
          <DialogTitle>{contact ? 'Edit contact' : `Add a contact at ${companyName}`}</DialogTitle>
          <DialogDescription>
            {contact
              ? 'Changes show in sys.wolthers.com straight away.'
              : 'Saved to the shared contact list, so sys.wolthers.com sees it too. A new contact starts with QC certificates ticked.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Segmented
            value={draft.isGroup ? 'group' : 'person'}
            options={[{ value: 'person', label: 'Person' }, { value: 'group', label: 'Group inbox' }]}
            onChange={(v) => setDraft({ ...draft, isGroup: v === 'group' })}
          />
          <Field label="Email">
            <Input id="contact-email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="name@company.com" />
            {isInternal(draft.email) && (
              <p className="mt-1 text-[12px] text-amber-600 dark:text-amber-400">
                Internal Wolthers address. Head office is always copied, so it won&apos;t appear as a recipient.
              </p>
            )}
          </Field>
          {draft.isGroup ? (
            <Field label="Label (optional)">
              <Input id="contact-label" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. QC team inbox" />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name"><Input id="contact-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
              <Field label="Nickname (greeting)"><Input id="contact-nickname" value={draft.nickname} onChange={(e) => setDraft({ ...draft, nickname: e.target.value })} /></Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><Input id="contact-phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
            <Field label="WhatsApp"><Input id="contact-whatsapp" value={draft.whatsapp} onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })} /></Field>
          </div>
          {!draft.isGroup && (
            <Field label="Preferred language">
              <Segmented
                value={draft.preferredLanguage}
                options={LANGS.map((l) => ({ value: l, label: l.toUpperCase() }))}
                onChange={(v) => setDraft({ ...draft, preferredLanguage: v })}
              />
            </Field>
          )}
          {error && (
            <div className="flex items-center gap-1.5 text-[12px] text-red-600 dark:text-red-400">
              <AlertCircle className="h-3.5 w-3.5" /> {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="h-9 rounded-[6px] text-[13px]">Cancel</Button>
          <Button onClick={save} disabled={saving} className="h-9 rounded-[6px] text-[13px]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : contact ? 'Save' : 'Add contact'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Segmented({ value, options, onChange }: {
  value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void
}) {
  return (
    <div className="inline-flex rounded-[6px] bg-muted p-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn('rounded-[4px] px-3 py-1 text-[12px]', value === o.value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
