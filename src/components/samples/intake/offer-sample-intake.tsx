'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, QrCode } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { Switch } from '@/components/ui/switch'
import { PrintLabelsDialog } from '@/components/samples/print-labels-dialog'
import { sampleOpenHref } from '@/components/command-palette/selection'
import { ORIGINS, microOriginOptions } from './constants'

/**
 * Type and stocklot samples — brokerage offers (Daniel 2026-10-21).
 *
 * No contract: the coffee is being offered, not yet sold. What matters is who
 * the seller is, an open description of the quality, and who we sent it to.
 * Each one gets the shared TS- running number (DB trigger, type and stocklot in
 * one sequence) so it can be searched later. Usually the lab does not cup or
 * grade these; when it does, the switch puts it in the lab flow and the QR tin
 * label is offered after saving.
 *
 * Written to WAQC's own `samples` table (sample_category 'other'): sys's
 * shipment_samples requires a contract.
 */

export type OfferSampleType = 'type' | 'stocklot'

interface CompanyRow {
  id: string
  name: string
  fantasy_name: string | null
}

interface ContactRow {
  id: string
  name: string
  email: string | null
}

interface CourierOption {
  id: string
  name: string
}

interface LabRow {
  id: string
  name: string
  is_active?: boolean
}

interface SavedOffer {
  id: string
  offer_number: string | null
  qc_in_house: boolean
}

interface OfferSampleIntakeProps {
  sampleType: OfferSampleType
  /** Rendered at the top of the scroll area (the sample-type cards). */
  header?: React.ReactNode
  asDialog?: boolean
  onSaved?: () => void
}

const inputClass =
  'w-full rounded border border-input bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-foreground/30'

/** First line of the description, trimmed for lists and labels. */
function shortQualityName(description: string): string {
  const first = description.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  return first.length > 120 ? `${first.slice(0, 117)}…` : first
}

export function OfferSampleIntake({ sampleType, header, asDialog = false, onSaved }: OfferSampleIntakeProps) {
  const { profile } = useAuth()

  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [labs, setLabs] = useState<LabRow[]>([])
  const [couriers, setCouriers] = useState<CourierOption[]>([])
  const [contacts, setContacts] = useState<ContactRow[]>([])

  const [sellerId, setSellerId] = useState('')
  const [sellerRef, setSellerRef] = useState('')
  const [origin, setOrigin] = useState('Brazil')
  const [microOrigin, setMicroOrigin] = useState('')
  const [cropYear, setCropYear] = useState('')
  const [qualityDescription, setQualityDescription] = useState('')
  const [bags, setBags] = useState('')
  const [recipientId, setRecipientId] = useState('')
  const [contactId, setContactId] = useState('')
  const [courierName, setCourierName] = useState('')
  const [awb, setAwb] = useState('')
  const [labId, setLabId] = useState('')
  const [qcInHouse, setQcInHouse] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedOffer | null>(null)
  const [printOpen, setPrintOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ data: comp }, { data: cour }, labsRes] = await Promise.all([
        (supabase as any).from('companies').select('id, name, fantasy_name').eq('is_active', true).order('name'),
        (supabase as any).from('couriers').select('id, name').eq('active', true).order('name'),
        fetch('/api/laboratories').then((r) => (r.ok ? r.json() : { laboratories: [] })).catch(() => ({ laboratories: [] })),
      ])
      if (cancelled) return
      setCompanies((comp ?? []) as CompanyRow[])
      setCouriers((cour ?? []) as CourierOption[])
      const active = ((labsRes?.laboratories ?? []) as LabRow[]).filter((l) => l.is_active !== false)
      setLabs(active)
    })()
    return () => { cancelled = true }
  }, [])

  // Default lab: the user's own, else the only one.
  useEffect(() => {
    if (labId || labs.length === 0) return
    const own = profile?.laboratory_id && labs.find((l) => l.id === profile.laboratory_id)
    setLabId(own ? own.id : labs[0].id)
  }, [labs, labId, profile?.laboratory_id])

  useEffect(() => {
    if (!recipientId) {
      setContacts([])
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await (supabase as any)
        .from('contacts')
        .select('id, name, email')
        .eq('company_id', recipientId)
        .eq('is_active', true)
        .order('name')
      if (!cancelled) setContacts((data ?? []) as ContactRow[])
    })()
    return () => { cancelled = true }
  }, [recipientId])

  const companyOptions: SearchableSelectOption[] = useMemo(
    () =>
      companies.map((c) => ({
        value: c.id,
        label: c.fantasy_name || c.name,
        keywords: c.fantasy_name && c.fantasy_name !== c.name ? [c.name] : undefined,
      })),
    [companies],
  )

  const microOptions = microOriginOptions(origin)
  const typeLabel = sampleType === 'type' ? 'type sample' : 'stocklot sample'
  const canSave = !!sellerId && !!origin && qualityDescription.trim().length > 0 && !!labId && !saving

  function resetForNext() {
    setSaved(null)
    setSellerRef('')
    setQualityDescription('')
    setBags('')
    setAwb('')
    setContactId('')
    setError(null)
    // Seller, origin, recipient, courier, lab and the QC switch stay: offers
    // usually go out in batches from the same seller to the same buyer.
  }

  async function handleSave() {
    setError(null)
    if (!sellerId) return setError('Pick the seller')
    if (!qualityDescription.trim()) return setError('Describe the quality')
    if (!labId) return setError('No laboratory available for your account')

    setSaving(true)
    try {
      const bagCount = bags.trim() && Number(bags) > 0 ? Math.round(Number(bags)) : null
      const res = await fetch('/api/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sample_category: 'other',
          sample_type: sampleType,
          laboratory_id: labId,
          origin,
          micro_origin: microOrigin || null,
          crop_year: cropYear.trim() || null,
          seller_id: sellerId,
          same_seller_shipper: true,
          exporter_sample_number: sellerRef.trim() || null,
          quality_name: shortQualityName(qualityDescription),
          quality_description: qualityDescription.trim(),
          bag_count: bagCount,
          awb_number: awb.trim() || null,
          courier_name: courierName || null,
          qc_in_house: qcInHouse,
          auto_detect_quality: false,
          status: !qcInHouse && recipientId ? 'sent_to_clients' : 'received',
          workflow_stage: 'received',
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.details ? `${body.error} — ${body.details}` : body.error || 'Failed to save sample')
      const sample = body.sample as { id: string; offer_number?: string | null }

      // Who it went to: tracked as a recipient (pending their reply). No email
      // is sent from here.
      if (recipientId) {
        const contact = contacts.find((c) => c.id === contactId)
        const recRes = await fetch(`/api/samples/${sample.id}/recipients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipients: [{ client_id: recipientId, contact_emails: contact?.email ? [contact.email] : [] }],
          }),
        })
        if (!recRes.ok) console.warn('[offer-sample-intake] recipient not saved', await recRes.text())
      }

      onSaved?.()
      setSaved({ id: sample.id, offer_number: sample.offer_number ?? null, qc_in_house: qcInHouse })
    } catch (err) {
      console.error('[offer-sample-intake] save failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to save sample')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div data-intake-narrow className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        <div>
          <div className="text-sm font-semibold">
            {sampleType === 'type' ? 'Type sample' : 'Stocklot sample'} saved
          </div>
          {saved.offer_number ? (
            <div className="mt-2 font-mono text-2xl font-semibold tracking-tight">{saved.offer_number}</div>
          ) : (
            <div className="mt-1 text-xs text-amber-500">
              Saved, but no TS- number came back — the numbering migration may not be applied yet.
            </div>
          )}
          <div className="mt-1 text-xs text-muted-foreground">Search for this number under Other Samples.</div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {saved.qc_in_house && (
            <button
              type="button"
              onClick={() => setPrintOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200 dark:hover:bg-emerald-400/20"
            >
              <QrCode className="h-4 w-4" /> Print QR label
            </button>
          )}
          <Link
            href={sampleOpenHref(saved.id)}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
          >
            View sample
          </Link>
          <button
            type="button"
            onClick={resetForNext}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
          >
            Log another
          </button>
        </div>
        <PrintLabelsDialog open={printOpen} onOpenChange={setPrintOpen} sampleIds={[saved.id]} />
      </div>
    )
  }

  return (
    <div data-intake-narrow className={`flex min-h-0 flex-col ${asDialog ? 'flex-auto' : ''}`}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[600px] space-y-3 pb-4">
          {header}

          <p className="text-[11px] text-muted-foreground">
            No contract needed — this is an offer. It gets the next TS- number when saved.
          </p>

          {/* Seller */}
          <div className="grid grid-cols-[1fr_180px] gap-3">
            <div>
              <FieldLabel>Seller *</FieldLabel>
              <SearchableSelect
                options={companyOptions}
                value={sellerId}
                onValueChange={setSellerId}
                placeholder="Who is selling this coffee?"
                searchPlaceholder="Search companies…"
                substringMatch
                className="h-8 text-[13px]"
              />
            </div>
            <div>
              <FieldLabel>Seller's ref / lot</FieldLabel>
              <input
                type="text"
                value={sellerRef}
                onChange={(e) => setSellerRef(e.target.value)}
                placeholder="Optional"
                className={inputClass}
              />
            </div>
          </div>

          {/* Origin */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel>Origin *</FieldLabel>
              <select
                value={origin}
                onChange={(e) => { setOrigin(e.target.value); setMicroOrigin('') }}
                className={inputClass}
              >
                {ORIGINS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Region</FieldLabel>
              <select
                value={microOrigin}
                onChange={(e) => setMicroOrigin(e.target.value)}
                disabled={microOptions.length === 0}
                className={`${inputClass} disabled:opacity-50`}
              >
                <option value="">—</option>
                {microOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Crop</FieldLabel>
              <input
                type="text"
                value={cropYear}
                onChange={(e) => setCropYear(e.target.value)}
                placeholder="25/26"
                className={inputClass}
              />
            </div>
          </div>

          {/* Quality — open text */}
          <div>
            <FieldLabel>Quality description *</FieldLabel>
            <textarea
              value={qualityDescription}
              onChange={(e) => setQualityDescription(e.target.value)}
              rows={4}
              placeholder={'e.g. NY 2/3 17/18 SC, fine cup, Cerrado, semi-washed\nAny cup notes, defects or remarks as you would write them in the offer'}
              className={`${inputClass} resize-y leading-relaxed`}
            />
            <div className="mt-1 text-[10px] text-muted-foreground">
              The first line is used as the short name in lists and labels.
            </div>
          </div>

          {/* Bags */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel>Bags offered</FieldLabel>
              <input
                type="number"
                min={0}
                value={bags}
                onChange={(e) => setBags(e.target.value)}
                placeholder="Optional"
                className={inputClass}
              />
            </div>
          </div>

          {/* Sent to */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Sent to</FieldLabel>
              <SearchableSelect
                options={companyOptions}
                value={recipientId}
                onValueChange={(v) => { setRecipientId(v); setContactId('') }}
                placeholder="Prospective buyer"
                searchPlaceholder="Search companies…"
                substringMatch
                className="h-8 text-[13px]"
              />
            </div>
            <div>
              <FieldLabel>Contact</FieldLabel>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                disabled={!recipientId}
                className={`${inputClass} disabled:opacity-50`}
              >
                <option value="">— Any contact —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || '(unnamed)'}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Courier */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Courier</FieldLabel>
              <select value={courierName} onChange={(e) => setCourierName(e.target.value)} className={inputClass}>
                <option value="">Hand-carry / other</option>
                {couriers.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>AWB / Tracking</FieldLabel>
              <input
                type="text"
                value={awb}
                onChange={(e) => setAwb(e.target.value)}
                placeholder="Optional"
                className={inputClass}
              />
            </div>
          </div>

          {/* Lab — only worth showing when there is a choice */}
          {labs.length > 1 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Laboratory</FieldLabel>
                <select value={labId} onChange={(e) => setLabId(e.target.value)} className={inputClass}>
                  {labs.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Cupping / grading here → QR label */}
          <label className="flex cursor-pointer items-start justify-between gap-3 rounded border border-input bg-background px-3 py-2.5">
            <div>
              <div className="text-[13px] font-medium text-foreground">We'll cup &amp; grade it here</div>
              <div className="text-[11px] text-muted-foreground">
                {qcInHouse
                  ? 'Goes into the lab flow. You can print the QR label right after saving.'
                  : 'Off by default — no QR label, and it stays out of the lab queue.'}
              </div>
            </div>
            <Switch checked={qcInHouse} onCheckedChange={setQcInHouse} aria-label="Cup and grade in house" />
          </label>

          {error && (
            <div className="flex items-center gap-2 text-[12px] text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="rounded-md border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-40 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200 dark:hover:bg-emerald-400/20"
        >
          {saving ? 'Saving…' : `Save ${typeLabel}`}
        </button>
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </span>
  )
}
