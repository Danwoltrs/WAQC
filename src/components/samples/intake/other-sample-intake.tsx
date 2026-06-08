'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Loader2, X, Plus, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'
import { buildSplitLeaves, buildChoiceLeaves, type LeafPayload, type SampleGroupKind } from './sample-groups'

// Mirrors sys.wolthers.com's "New sample" modal (wolthers-app SampleModal),
// adapted for WAQC: a contract-ref search resolves the contract (buyer, seller,
// their references, total bags, allocations), then the sample is written to the
// SHARED shipment_samples table — single insert, or the create_sample_group RPC
// for Per-container / Choices. Couriers come from the shared `couriers` table.

type SampleType = 'pss' | 'ss' | 'stocklot' | 'type'
type ModalKind = 'single' | SampleGroupKind // 'single' | 'container_split' | 'choices'

const TYPE_CARDS: { value: SampleType; title: string; subtitle: string }[] = [
  { value: 'pss', title: 'PSS', subtitle: 'Pre-shipment' },
  { value: 'ss', title: 'Shipment', subtitle: 'In transit' },
  { value: 'stocklot', title: 'Stocklot', subtitle: 'Offered' },
  { value: 'type', title: 'Type', subtitle: 'Reference' },
]

interface CourierOption {
  id: string
  name: string
  tracking_url_template: string | null
}

interface CompanyRow {
  id: string
  name: string
  fantasy_name: string | null
}

interface SearchResultRow {
  id: string
  contract_number: string
  seller_reference: string | null
  buyer_reference: string | null
  seller: { fantasy_name: string | null; name: string | null } | null
  buyer: { fantasy_name: string | null; name: string | null } | null
}

interface LinkedContract {
  id: string
  contract_number: string
  seller_label: string | null
  buyer_label: string | null
  seller_reference: string | null
  buyer_reference: string | null
  buyer_id: string | null
  volume_bags: number | null
}

interface AllocationOption {
  id: string
  label: string
}

function resolveTrackingUrl(couriers: CourierOption[], courierId: string, awb: string): string | null {
  const trimmed = awb.trim()
  if (!trimmed) return null
  const c = couriers.find((c) => c.id === courierId)
  if (!c?.tracking_url_template) return null
  return c.tracking_url_template.replace('{awb}', encodeURIComponent(trimmed))
}

/** Local YYYY-MM-DD for an <input type="date"> default/max. */
function todayIso(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

interface OtherSampleIntakeProps {
  asDialog?: boolean
  /** Called after a sample is saved so the parent can refresh the list. */
  onSaved?: () => void
}

export function OtherSampleIntake({ asDialog = false, onSaved }: OtherSampleIntakeProps) {
  const { profile } = useAuth()
  const sentByName =
    (profile as { full_name?: string | null } | null)?.full_name ?? profile?.email ?? 'you'

  const bagsUserEdited = useRef(false)
  const [contract, setContract] = useState<LinkedContract | null>(null)
  const [allocations, setAllocations] = useState<AllocationOption[]>([])

  const [sampleType, setSampleType] = useState<SampleType>('pss')
  const [kind, setKind] = useState<ModalKind>('single')
  const [sampleCount, setSampleCount] = useState<string>('2')
  const [choices, setChoices] = useState<Array<{ description: string; bags: string }>>([
    { description: '', bags: '' },
    { description: '', bags: '' },
  ])
  const [allocationId, setAllocationId] = useState<string>('')
  const [couriers, setCouriers] = useState<CourierOption[]>([])
  const [courierId, setCourierId] = useState<string>('')
  const [awb, setAwb] = useState<string>('')
  const [sentDate, setSentDate] = useState<string>(todayIso())
  const [notes, setNotes] = useState<string>('')
  const [bags, setBags] = useState<string>('')
  const [recipientCompanyId, setRecipientCompanyId] = useState<string>('')
  const [recipientContactId, setRecipientContactId] = useState<string>('')
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [recentRecipientIds, setRecentRecipientIds] = useState<string[]>([])
  const [contacts, setContacts] = useState<Array<{ id: string; name: string }>>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedCode, setSavedCode] = useState<string | null>(null)

  const [addCourierOpen, setAddCourierOpen] = useState(false)

  // Active couriers (shared table) — same list as sys.wolthers.com.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await (supabase as any)
        .from('couriers')
        .select('id, name, tracking_url_template')
        .eq('active', true)
        .order('name')
      if (cancelled) return
      const list = (data ?? []) as CourierOption[]
      setCouriers(list)
      setCourierId((prev) => prev || list[0]?.id || '')
    })()
    return () => { cancelled = true }
  }, [])

  // Active companies for the "Sent to" dropdown.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await (supabase as any)
        .from('companies')
        .select('id, name, fantasy_name')
        .eq('is_active', true)
        .order('name')
      if (cancelled) return
      setCompanies((data ?? []) as CompanyRow[])
    })()
    return () => { cancelled = true }
  }, [])

  // Recent distinct recipients on the linked contract → "recent" group.
  useEffect(() => {
    if (!contract?.id) {
      setRecentRecipientIds([])
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await (supabase as any)
        .from('shipment_samples')
        .select('recipient_company_id, created_at')
        .eq('contract_id', contract.id)
        .not('recipient_company_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50)
      if (cancelled) return
      const seen = new Set<string>()
      const ids: string[] = []
      for (const row of (data ?? []) as Array<{ recipient_company_id: string | null }>) {
        const id = row.recipient_company_id
        if (id && !seen.has(id)) {
          seen.add(id)
          ids.push(id)
          if (ids.length >= 6) break
        }
      }
      setRecentRecipientIds(ids)
    })()
    return () => { cancelled = true }
  }, [contract?.id])

  // Contacts for the selected recipient company.
  useEffect(() => {
    if (!recipientCompanyId) {
      setContacts([])
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await (supabase as any)
        .from('contacts')
        .select('id, name')
        .eq('company_id', recipientCompanyId)
        .eq('is_active', true)
        .order('name')
      if (cancelled) return
      setContacts((data ?? []) as Array<{ id: string; name: string }>)
    })()
    return () => { cancelled = true }
  }, [recipientCompanyId])

  const trackingUrl = useMemo(
    () => resolveTrackingUrl(couriers, courierId, awb),
    [couriers, courierId, awb],
  )

  const recipientGroups = useMemo(() => {
    const byId = new Map(companies.map((c) => [c.id, c] as const))
    const buyerId = contract?.buyer_id ?? null
    const buyer = buyerId ? byId.get(buyerId) ?? null : null
    const recent = recentRecipientIds
      .filter((id) => id !== buyerId)
      .map((id) => byId.get(id))
      .filter((c): c is CompanyRow => !!c)
    const shown = new Set<string>()
    if (buyer) shown.add(buyer.id)
    for (const r of recent) shown.add(r.id)
    const others = companies.filter((c) => !shown.has(c.id))
    return { buyer, recent, others }
  }, [companies, recentRecipientIds, contract?.buyer_id])

  // Pull contract details + allocations + defaults when a contract is linked.
  async function linkContract(row: SearchResultRow) {
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${row.id}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to load contract')
      const c = body.contract as {
        id: string
        contract_number: string
        volume_bags: number | null
        seller_reference: string | null
        buyer_reference: string | null
        buyer_id: string | null
        seller: { id: string; fantasy_name: string | null; name: string | null } | null
        buyer: { id: string; fantasy_name: string | null; name: string | null } | null
      }
      const linked: LinkedContract = {
        id: c.id,
        contract_number: c.contract_number,
        seller_label: c.seller?.fantasy_name || c.seller?.name || null,
        buyer_label: c.buyer?.fantasy_name || c.buyer?.name || null,
        seller_reference: c.seller_reference,
        buyer_reference: c.buyer_reference,
        buyer_id: c.buyer?.id ?? c.buyer_id ?? null,
        volume_bags: c.volume_bags,
      }
      setContract(linked)
      // Default the recipient to the buyer and the bags to the contract total.
      if (linked.buyer_id) setRecipientCompanyId(linked.buyer_id)
      if (!bagsUserEdited.current && linked.volume_bags != null) setBags(String(linked.volume_bags))

      // Allocations (contract legs).
      const { data: splits } = await (supabase as any)
        .from('contract_splits')
        .select('id, destination_port, volume_bags')
        .eq('contract_id', c.id)
        .order('created_at', { ascending: true })
      setAllocations(
        ((splits ?? []) as Array<{ id: string; destination_port: string | null; volume_bags: number }>).map(
          (s) => ({
            id: s.id,
            label: `${s.destination_port ?? 'No POD'} · ${s.volume_bags.toLocaleString()} bags`,
          }),
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contract')
    }
  }

  function unlinkContract() {
    setContract(null)
    setAllocations([])
    setAllocationId('')
    setRecipientCompanyId('')
    setRecipientContactId('')
  }

  function resetForNext() {
    setSavedCode(null)
    setSampleType('pss')
    setKind('single')
    setSampleCount('2')
    setChoices([{ description: '', bags: '' }, { description: '', bags: '' }])
    setAwb('')
    setNotes('')
    setSentDate(todayIso())
    bagsUserEdited.current = false
    setBags(contract?.volume_bags != null ? String(contract.volume_bags) : '')
    setRecipientCompanyId(contract?.buyer_id ?? '')
    setRecipientContactId('')
    setAllocationId('')
    setError(null)
  }

  async function handleSave() {
    setError(null)
    if (!contract?.id) {
      setError('Link a contract first')
      return
    }
    if (!sentDate) {
      setError('Sent date is required')
      return
    }
    if (!recipientCompanyId) {
      setError('Recipient is required')
      return
    }
    setSaving(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const courier = couriers.find((c) => c.id === courierId) ?? null

      if (kind === 'single') {
        const { error: insErr } = await (supabase as any).from('shipment_samples').insert({
          contract_id: contract.id,
          shipment_id: null,
          split_id: allocationId || null,
          sample_type: sampleType,
          status: 'pending',
          courier_id: courierId || null,
          courier_company: courier?.name ?? null,
          tracking_number: awb.trim() || null,
          sent_date: sentDate,
          notes: notes.trim() || null,
          bags: bags.trim() && !Number.isNaN(Number(bags)) ? Number(bags) : null,
          created_by: user.id,
          recipient_company_id: recipientCompanyId,
          recipient_contact_id: recipientContactId || null,
        })
        if (insErr) throw insErr
      } else {
        let leaves: LeafPayload[]
        if (kind === 'container_split') {
          const n = Math.max(1, Math.floor(Number(sampleCount) || 0))
          const total = bags.trim() && !Number.isNaN(Number(bags)) ? Number(bags) : null
          leaves = buildSplitLeaves(total, n)
        } else {
          const filled = choices.filter((c) => c.description.trim().length > 0)
          if (filled.length < 1) throw new Error('Add at least one choice with a description')
          leaves = buildChoiceLeaves(
            filled.map((c) => ({
              description: c.description,
              bags: c.bags.trim() && !Number.isNaN(Number(c.bags)) ? Number(c.bags) : null,
            })),
          )
        }
        const { error: rpcErr } = await (supabase.rpc as any)('create_sample_group', {
          p_contract_id: contract.id,
          p_split_id: allocationId || null,
          p_sample_type: sampleType,
          p_kind: kind,
          p_courier_id: courierId || null,
          p_tracking_number: awb.trim() || null,
          p_sent_date: sentDate,
          p_recipient_company_id: recipientCompanyId,
          p_recipient_contact_id: recipientContactId || null,
          p_notes: notes.trim() || null,
          p_leaves: leaves,
          p_rerequested_from_group_id: null,
        })
        if (rpcErr) throw rpcErr
      }

      onSaved?.()
      setSavedCode(contract.contract_number)
    } catch (err) {
      console.error('[other-sample-intake] save failed:', err)
      const supaErr = err as { message?: string; details?: string; code?: string }
      const msg = supaErr?.message
        ? `${supaErr.message}${supaErr.details ? ` — ${supaErr.details}` : ''}${supaErr.code ? ` (${supaErr.code})` : ''}`
        : err instanceof Error
          ? err.message
          : 'Failed to save sample'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddCourier(name: string, template: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data, error: insErr } = await (supabase as any)
      .from('couriers')
      .insert({ name: name.trim(), tracking_url_template: template.trim() || null, created_by: user?.id ?? null })
      .select('id, name, tracking_url_template')
      .single()
    if (insErr) throw insErr
    const row = data as CourierOption
    setCouriers((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)))
    setCourierId(row.id)
  }

  // Success state after a save — let the user log another or close via the dialog X.
  if (savedCode) {
    return (
      <div data-intake-narrow className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        <div>
          <div className="text-sm font-semibold">Sample logged for contract #{savedCode}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            It now appears under the contract on sys.wolthers.com.
          </div>
        </div>
        <button
          type="button"
          onClick={resetForNext}
          className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
        >
          Log another sample
        </button>
      </div>
    )
  }

  return (
    // `data-intake-narrow` tells the shared intake DialogContent to shrink to a
    // ~2xl box that fits this single-column flow (see INTAKE_DIALOG_CONTENT_CLASS).
    <div data-intake-narrow className={`flex min-h-0 flex-col ${asDialog ? 'h-full flex-1' : ''}`}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[600px] space-y-3 pb-4">
          {/* Contract search / linked header */}
          <ContractField contract={contract} onPick={linkContract} onUnlink={unlinkContract} />

          {/* Sample type — 2x2 cards */}
          <div>
            <FieldLabel>Sample type</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              {TYPE_CARDS.map((t) => {
                const active = sampleType === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setSampleType(t.value)}
                    className={`rounded border px-3 py-2 text-left transition-colors ${
                      active ? 'border-blue-500/60 bg-blue-500/[0.08]' : 'border-input bg-background hover:border-foreground/30'
                    }`}
                  >
                    <div className="text-[13px] font-semibold text-foreground">{t.title}</div>
                    <div className="text-[10px] text-muted-foreground">{t.subtitle}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* How many samples */}
          <div>
            <FieldLabel>How many samples</FieldLabel>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: 'single', title: 'Single', subtitle: 'One sample' },
                  { value: 'container_split', title: 'Per container', subtitle: 'Split across N' },
                  { value: 'choices', title: 'Choices', subtitle: 'Buyer picks' },
                ] as { value: ModalKind; title: string; subtitle: string }[]
              ).map((k) => {
                const active = kind === k.value
                return (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={`rounded border px-2 py-1.5 text-left transition-colors ${
                      active ? 'border-blue-500/60 bg-blue-500/[0.08]' : 'border-input bg-background hover:border-foreground/30'
                    }`}
                  >
                    <div className="text-[12px] font-semibold text-foreground">{k.title}</div>
                    <div className="text-[10px] text-muted-foreground">{k.subtitle}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {kind === 'container_split' && (
            <div>
              <FieldLabel>Number of samples sent</FieldLabel>
              <input
                type="number"
                min={1}
                value={sampleCount}
                onChange={(e) => setSampleCount(e.target.value)}
                className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-foreground/30"
              />
              <div className="mt-1 text-[10px] text-muted-foreground">
                {(() => {
                  const n = Math.max(1, Math.floor(Number(sampleCount) || 0))
                  const total = Number(bags) || 0
                  const per = buildSplitLeaves(total, n).map((l) => l.bags)
                  return `${n} sub-sample${n === 1 ? '' : 's'} · bags: ${per.join(', ')}`
                })()}
              </div>
            </div>
          )}

          {kind === 'choices' && (
            <div className="space-y-2">
              <FieldLabel>Choices</FieldLabel>
              {choices.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-5 text-[11px] font-semibold text-foreground">{String.fromCharCode(65 + i)}</span>
                  <input
                    type="text"
                    value={c.description}
                    onChange={(e) => {
                      const next = choices.slice()
                      next[i] = { ...next[i], description: e.target.value }
                      setChoices(next)
                    }}
                    placeholder="Lot / quality"
                    className="flex-1 rounded border border-input bg-background px-2 py-1 text-[12px] text-foreground outline-none focus:border-foreground/30"
                  />
                  <input
                    type="number"
                    min={0}
                    value={c.bags}
                    onChange={(e) => {
                      const next = choices.slice()
                      next[i] = { ...next[i], bags: e.target.value }
                      setChoices(next)
                    }}
                    placeholder="Bags"
                    className="w-20 rounded border border-input bg-background px-2 py-1 text-[12px] text-foreground outline-none focus:border-foreground/30"
                  />
                  {choices.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setChoices(choices.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-rose-400"
                      aria-label="Remove choice"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setChoices([...choices, { description: '', bags: '' }])}
                className="inline-flex items-center gap-1 text-[11px] text-emerald-500 hover:text-emerald-400"
              >
                <Plus className="h-3 w-3" /> Add choice
              </button>
            </div>
          )}

          {/* Sent on + Bags */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Sent on *</FieldLabel>
              <input
                type="date"
                value={sentDate}
                max={todayIso()}
                onChange={(e) => setSentDate(e.target.value)}
                className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-foreground/30"
              />
            </div>
            <div>
              <FieldLabel>Bags</FieldLabel>
              <input
                type="number"
                min={0}
                value={bags}
                onChange={(e) => { bagsUserEdited.current = true; setBags(e.target.value) }}
                placeholder="Bags"
                className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-foreground/30"
              />
            </div>
          </div>

          {/* Allocation + Sent to */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Allocation</FieldLabel>
              <select
                value={allocationId}
                onChange={(e) => setAllocationId(e.target.value)}
                disabled={allocations.length === 0}
                className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-foreground/30 disabled:opacity-50"
              >
                <option value="">{allocations.length === 0 ? 'Contract-wide (no leg)' : 'Contract-wide (no leg)'}</option>
                {allocations.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Sent to (company) *</FieldLabel>
              <select
                value={recipientCompanyId}
                onChange={(e) => {
                  setRecipientCompanyId(e.target.value)
                  setRecipientContactId('')
                }}
                className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-foreground/30"
              >
                {!recipientCompanyId && <option value="">— Select recipient —</option>}
                {recipientGroups.buyer && (
                  <optgroup label="Buyer (default)">
                    <option value={recipientGroups.buyer.id}>{recipientGroups.buyer.fantasy_name ?? recipientGroups.buyer.name}</option>
                  </optgroup>
                )}
                {recipientGroups.recent.length > 0 && (
                  <optgroup label="Recent on this contract">
                    {recipientGroups.recent.map((c) => (
                      <option key={c.id} value={c.id}>{c.fantasy_name ?? c.name}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="All companies">
                  {recipientGroups.others.map((c) => (
                    <option key={c.id} value={c.id}>{c.fantasy_name ?? c.name}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {recipientCompanyId && (
            <div>
              <FieldLabel>Contact (optional)</FieldLabel>
              <select
                value={recipientContactId}
                onChange={(e) => setRecipientContactId(e.target.value)}
                className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-foreground/30"
              >
                <option value="">— Any contact —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || '(unnamed)'}</option>
                ))}
              </select>
              <div className="mt-1 text-[10px] text-muted-foreground">Sent by {sentByName}</div>
            </div>
          )}

          {/* Courier + AWB */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Courier</FieldLabel>
              <select
                value={courierId}
                onChange={(e) => {
                  if (e.target.value === '__add__') { setAddCourierOpen(true); return }
                  setCourierId(e.target.value)
                }}
                className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-foreground/30"
              >
                <option value="">Hand-carry / other</option>
                {couriers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value="__add__">+ Add new courier…</option>
              </select>
            </div>
            <div>
              <FieldLabel>AWB / Tracking</FieldLabel>
              <input
                type="text"
                value={awb}
                onChange={(e) => setAwb(e.target.value)}
                placeholder="8823045…"
                className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-foreground/30"
              />
            </div>
          </div>
          {trackingUrl && (
            <div className="truncate text-[10px] text-muted-foreground">
              Tracks at{' '}
              <a href={trackingUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{trackingUrl}</a>
            </div>
          )}

          {/* Notes */}
          <div>
            <FieldLabel>Notes</FieldLabel>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional — recipient contact, special handling, etc."
              className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-foreground/30"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-[12px] text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !contract || !sentDate || !recipientCompanyId}
          className="rounded-md border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-40 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200 dark:hover:bg-emerald-400/20"
        >
          {saving ? 'Saving…' : 'Save sample'}
        </button>
      </div>

      <AddCourierSubModal open={addCourierOpen} onOpenChange={setAddCourierOpen} onAdd={handleAddCourier} />
    </div>
  )
}

/* ----------------------------- Contract field ---------------------------- */

function ContractField({
  contract,
  onPick,
  onUnlink,
}: {
  contract: LinkedContract | null
  onPick: (row: SearchResultRow) => void
  onUnlink: () => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResultRow[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (contract) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/contracts/search?q=${encodeURIComponent(trimmed)}`)
        if (res.ok) {
          const j = (await res.json()) as { contracts: SearchResultRow[] }
          setResults(j.contracts ?? [])
        }
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [q, contract])

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDocMouseDown)
    return () => window.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  if (contract) {
    return (
      <div>
        <FieldLabel>Contract *</FieldLabel>
        <div className="flex items-start justify-between gap-2 rounded border border-[#556b2f]/30 bg-[#556b2f]/10 px-3 py-2">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-foreground">#{contract.contract_number}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {(contract.seller_label ?? '—')}
              {contract.seller_reference ? ` (${contract.seller_reference})` : ''}
              {' → '}
              {(contract.buyer_label ?? '—')}
              {contract.buyer_reference ? ` (${contract.buyer_reference})` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onUnlink}
            className="flex-shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Unlink
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef}>
      <FieldLabel>Contract * — search to link</FieldLabel>
      <div className="relative">
        <div className="flex items-center gap-2 rounded border border-input bg-background px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => { if (q.trim().length > 0) setOpen(true) }}
            placeholder="Contract #, buyer / seller reference…"
            className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        {open && q.trim().length >= 2 && results.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded border border-input bg-popover shadow-lg">
            {results.map((c) => {
              const sellerLabel = c.seller?.fantasy_name ?? c.seller?.name ?? '—'
              const buyerLabel = c.buyer?.fantasy_name ?? c.buyer?.name ?? '—'
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => { onPick(c); setOpen(false); setQ('') }}
                  className="block w-full border-b border-border px-2.5 py-1.5 text-left last:border-0 hover:bg-accent"
                >
                  <div className="text-[12px] font-semibold text-foreground">#{c.contract_number}</div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {sellerLabel} → {buyerLabel}
                    {c.seller_reference ? ` · ${c.seller_reference}` : ''}
                    {c.buyer_reference ? ` · ${c.buyer_reference}` : ''}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* --------------------------- Add-courier sub-modal --------------------------- */

function AddCourierSubModal({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (name: string, template: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setTemplate('')
    setError(null)
  }, [open])

  if (!open) return null

  async function handleSave() {
    if (!name.trim()) {
      setError('Courier name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onAdd(name, template)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add courier')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[320] bg-black/60" onClick={() => !saving && onOpenChange(false)} />
      <div className="fixed left-1/2 top-1/2 z-[330] w-[92vw] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-foreground">
            <Plus className="h-4 w-4 text-emerald-500" />
            <span className="text-[13px] font-medium">Add courier</span>
          </div>
          <button onClick={() => !saving && onOpenChange(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <div>
            <FieldLabel>Name *</FieldLabel>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. SF Express"
              className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-foreground/30"
            />
          </div>
          <div>
            <FieldLabel>Tracking URL template (optional)</FieldLabel>
            <input
              type="text"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="https://example.com/track?id={awb}"
              className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-foreground/30"
            />
            <span className="text-[10px] text-muted-foreground">
              Use <code className="text-foreground/70">{`{awb}`}</code> as the placeholder for the tracking number.
            </span>
          </div>
          {error && <div className="text-[12px] text-destructive">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={() => !saving && onOpenChange(false)}
            disabled={saving}
            className="rounded border border-input px-3 py-1.5 text-[12px] text-foreground/70 transition-colors hover:bg-accent disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-40 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200 dark:hover:bg-emerald-400/20"
          >
            {saving ? 'Saving…' : 'Add courier'}
          </button>
        </div>
      </div>
    </>
  )
}

/* ------------------------------- Tiny helper ------------------------------ */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </span>
  )
}
