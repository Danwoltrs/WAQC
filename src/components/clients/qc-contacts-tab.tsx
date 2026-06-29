'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Plus, Trash2, User, Users, Loader2, AlertCircle } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { usePickableContacts } from '@/lib/qc-contacts/use-pickable-contacts'

interface QcContact {
  id: string
  company_id: string
  email: string | null
  name: string
  nickname: string | null
  phone: string | null
  whatsapp: string | null
  preferred_language: string | null
  is_group: boolean
  is_primary: boolean | null
  is_active: boolean
  routing_purposes: string[]
}

const LANGS = ['en', 'pt', 'de', 'fr', 'es'] as const

type Draft = {
  id: string | null
  email: string
  name: string
  nickname: string
  phone: string
  whatsapp: string
  preferredLanguage: string
  isGroup: boolean
}

const emptyDraft = (): Draft => ({
  id: null, email: '', name: '', nickname: '', phone: '', whatsapp: '',
  preferredLanguage: 'en', isGroup: false,
})

const toDraft = (c: QcContact): Draft => ({
  id: c.id,
  email: c.email ?? '',
  name: c.name ?? '',
  nickname: c.nickname ?? '',
  phone: c.phone ?? '',
  whatsapp: c.whatsapp ?? '',
  preferredLanguage: c.preferred_language ?? 'en',
  isGroup: c.is_group,
})

const initials = (name: string, email: string): string => {
  const src = (name || email || '?').trim()
  const parts = src.split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || (src[0]?.toUpperCase() ?? '?')
}

const isInternal = (email: string): boolean => /@wolthers\.com$/i.test(email.trim())

export function QcContactsTab({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [people, setPeople] = useState<QcContact[]>([])
  const [groups, setGroups] = useState<QcContact[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false) // showing the pick combobox
  const { options: pickOptions, byId: pickById } = usePickableContacts(companyId)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/companies/${companyId}/qc-contacts`)
      if (!res.ok) throw new Error('Failed to load contacts')
      const data = await res.json()
      setPeople(data.people ?? [])
      setGroups(data.groups ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contacts')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { load() }, [load])

  const startAdd = () => { setError(null); setDraft(emptyDraft()) }
  const startEdit = (c: QcContact) => { setError(null); setDraft(toDraft(c)) }
  const discard = () => { setError(null); setDraft(null) }

  const startPick = () => { setError(null); setDraft(null); setAdding(true) }

  const pickExisting = async (id: string) => {
    const c = id ? pickById[id] : undefined
    if (!c) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/companies/${companyId}/qc-contacts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: c.email, name: c.name || null, nickname: c.nickname, isGroup: c.isGroup }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to add contact')
      setAdding(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add contact')
    } finally {
      setSaving(false)
    }
  }

  const addNew = () => { setAdding(false); startAdd() }

  const save = async () => {
    if (!draft) return
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
      const res = draft.id
        ? await fetch(`/api/companies/${companyId}/qc-contacts/${draft.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch(`/api/companies/${companyId}/qc-contacts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to save contact')
      setDraft(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save contact')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!draft?.id) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/companies/${companyId}/qc-contacts/${draft.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to remove contact')
      }
      setDraft(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove contact')
    } finally {
      setSaving(false)
    }
  }

  const total = people.length + groups.length

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
      {/* Left rail */}
      <div className="rounded-[14px] border border-border/60 p-2">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            Recipients ({total})
          </span>
          <Button variant="outline" size="sm" onClick={startPick} className="h-7 gap-1 rounded-[8px] text-[12px]">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-6 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <div className="px-2 py-6 text-[13px] text-red-600 dark:text-red-400">{error}</div>
        ) : total === 0 ? (
          <div className="px-2 py-6 text-[13px] text-muted-foreground">
            No one at {companyName} receives QC certificates yet.
          </div>
        ) : (
          <div className="space-y-3">
            {people.length > 0 && (
              <Section label="People" icon={<User className="h-3.5 w-3.5" />} rows={people} draftId={draft?.id ?? null} onPick={startEdit} />
            )}
            {groups.length > 0 && (
              <Section label="Group inboxes" icon={<Users className="h-3.5 w-3.5" />} rows={groups} draftId={draft?.id ?? null} onPick={startEdit} />
            )}
          </div>
        )}
      </div>

      {/* Right pane */}
      <div className="rounded-[14px] border border-border/60 p-4">
        {adding ? (
          <div className="max-w-xl space-y-3">
            <div className="text-[14px] font-semibold">Add a QC-certificate recipient</div>
            <p className="text-[12px] text-muted-foreground">
              Pick someone already on file for {companyName}, or add a brand-new contact.
            </p>
            <SearchableSelect
              options={pickOptions}
              value=""
              onValueChange={pickExisting}
              substringMatch
              allowCreate
              onCreateNew={addNew}
              createLabel="+ Add new contact"
              placeholder="Choose an existing contact…"
              searchPlaceholder="Search contacts…"
              emptyMessage="No other contacts on file."
            />
            {error && (
              <div className="flex items-center gap-1.5 text-[12px] text-red-600 dark:text-red-400">
                <AlertCircle className="h-3.5 w-3.5" /> {error}
              </div>
            )}
            <div>
              <button type="button" onClick={() => setAdding(false)} className="text-[13px] text-muted-foreground hover:underline">
                Cancel
              </button>
            </div>
          </div>
        ) : !draft ? (
          <div className="flex h-full items-center justify-center py-10 text-[13px] text-muted-foreground">
            Select a recipient, or add one to receive QC certificates.
          </div>
        ) : (
          <div className="max-w-xl space-y-4">
            <div className="text-[14px] font-semibold">
              {draft.id ? 'Edit recipient' : 'Add QC-certificate recipient'}
            </div>

            <Segmented
              value={draft.isGroup ? 'group' : 'person'}
              options={[{ value: 'person', label: 'Person' }, { value: 'group', label: 'Group inbox' }]}
              onChange={(v) => setDraft({ ...draft, isGroup: v === 'group' })}
            />

            <Field label="Email">
              <Input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="name@company.com" />
              {isInternal(draft.email) && (
                <p className="mt-1 text-[12px] text-amber-600 dark:text-amber-400">
                  Internal Wolthers address — always CC&apos;d as head office; it won&apos;t appear as a recipient.
                </p>
              )}
            </Field>

            {!draft.isGroup ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
                <Field label="Nickname (greeting)"><Input value={draft.nickname} onChange={(e) => setDraft({ ...draft, nickname: e.target.value })} /></Field>
              </div>
            ) : (
              <Field label="Label (optional)">
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. QC team inbox" />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone"><Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
              <Field label="WhatsApp"><Input value={draft.whatsapp} onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })} /></Field>
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

            <div className="flex items-center justify-between pt-2">
              {draft.id ? (
                <button type="button" onClick={remove} disabled={saving}
                  className="inline-flex items-center gap-1 text-[13px] text-red-600 dark:text-red-400 hover:underline disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" /> Remove from QC certificates
                </button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={discard} disabled={saving} className="h-9 rounded-[9px] text-[13px]">Discard</Button>
                <Button size="sm" onClick={save} disabled={saving} className="h-9 rounded-[9px] text-[13px]">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
            </div>

            <p className="pt-1 text-[11px] text-muted-foreground">
              Other contact settings (sale confirmations, shipping, etc.) are managed in sys.wolthers.com.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ label, icon, rows, draftId, onPick }: {
  label: string; icon: ReactNode; rows: QcContact[]; draftId: string | null; onPick: (c: QcContact) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="space-y-0.5">
        {rows.map((c) => (
          <button key={c.id} type="button" onClick={() => onPick(c)}
            className={cn('flex w-full items-center gap-2 rounded-[9px] px-2 py-1.5 text-left hover:bg-muted/60', draftId === c.id && 'bg-muted')}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
              {initials(c.name, c.email ?? '')}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px]">{c.name || c.email}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{c.email}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Segmented({ value, options, onChange }: {
  value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void
}) {
  return (
    <div className="inline-flex rounded-[10px] bg-muted p-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn('rounded-[7px] px-3 py-1 text-[12px]', value === o.value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
