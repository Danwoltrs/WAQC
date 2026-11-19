'use client'

import { outcomeLabel } from '@/lib/sample-verdict'
import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { RecipientPanel } from '@/components/samples/approval/recipient-panel'
import { RecipientCaptureForm } from '@/components/samples/approval/recipient-capture'
import type { RecipientMeta } from '@/components/samples/approval/recipient-chips'
import { SaveContactPrompt } from '@/components/reports/save-contact-prompt'
import { QcClientStep } from '@/components/certificates/qc-client-step'
import { RequestsCard, requestMembers, requestSamples } from '@/components/seller-requests/requests-card'
import { Button } from '@/components/ui/button'
import { CommitBar } from '@/components/ui/commit-bar'
import { attachedSampleIds, composerPosition, partyLabel, type BatchUnit } from '@/lib/approval-notification/batch-send'
import { audienceOf, type PartyOption } from '@/lib/approval-notification/certificate-parties'
import { PartyStep } from '@/components/certificates/party-step'
// The pure renderers only: quality-summary.ts pulls server code.
import { buildQualityCoverNote, buildQualitySummaryHtml } from '@/lib/approval-notification/quality-summary-render'
import type { CertificateParty } from '@/lib/approval-notification/types'
import { literalDraftText } from '@/lib/email/draft-markup'
import { initialPending, missingDestination } from '@/lib/seller-requests/tick-state'
import type { Lang, SellerRequests } from '@/lib/seller-requests/types'
import type { QcClientOption } from '@/lib/approval-notification/qc-client-filter'
import { addressesToOffer } from '@/lib/qc-contacts/save-offer'
import type { QcContactRecord } from '@/lib/qc-contacts/tags'
import { SendHistoryCard } from '@/components/certificates/send-history-card'

// The cover note is edited WYSIWYG. TipTap needs the DOM and is only worth
// fetching when a composer opens, so it stays out of the certificates page
// and cert-editor bundles (sys loads its request body editor the same way).
const RichBodyEditor = dynamic(
  () => import('@/components/email/rich-body-editor').then((m) => m.RichBodyEditor),
  {
    ssr: false,
    loading: () => <div className="min-h-[356px] w-full flex-1 rounded border border-border bg-background" aria-busy="true" />,
  },
)

interface Props {
  open: boolean
  /** Date-range mode ("Send unsent"): choose the QC clients, then walk their
   *  emails and after them the sellers'. */
  range?: { from: string; to: string }
  /** The chosen period, for the header ("Last 7 days"). */
  periodLabel?: string
  /** Explicit-selection mode. With `parties` (chosen in the Send dropdown) the
   *  view opens straight on the first email; without them it first asks which
   *  of the certificates' parties to email. */
  selection?: { sampleIds: string[]; parties?: CertificateParty[]; includeSent: boolean }
  onClose: () => void
  onSent?: () => void
}

/** Per company, its saved QC-certificate contacts keyed by lower-cased email. */
type SavedContacts = Record<string, Record<string, RecipientMeta>>

interface QueueResponse {
  units: BatchUnit[]
  skipped: { noParties: number; noRecipients: number }
  savedContacts?: SavedContacts
}

interface UnitResult {
  companyId: string
  side: string
  ok: boolean
  failed: number
}

const emailKey = (email: string) => email.trim().toLowerCase()

/** The seller-request ticks the queue started every seller email with, by sample id. */
function queueRequests(units: BatchUnit[]): Record<string, SellerRequests> {
  const out: Record<string, SellerRequests> = {}
  for (const u of units) {
    if (u.side !== 'seller') continue
    for (const s of requestSamples(u.samples)) out[s.sampleId] = s.sellerRequest!.requests
  }
  return out
}

/** Buyer samples that start ticked with no address (an unfixed pre-approval with none on file). */
function queuePending(units: BatchUnit[]): Set<string> {
  return initialPending(units.filter((u) => u.side === 'seller').flatMap((u) => requestMembers(u.samples)))
}

const LANGUAGES: Array<{ value: Lang; label: string }> = [
  { value: 'en', label: 'EN' },
  { value: 'pt', label: 'BR' },
]

export function BatchApprovalSendView({ open, range, periodLabel, selection, onClose, onSent }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Range mode opens on the QC client step; `clients` stays null until it loads.
  const [choosingClients, setChoosingClients] = useState(false)
  const [clients, setClients] = useState<QcClientOption[] | null>(null)
  // A selection without parties opens on the party step; null until it loads.
  const [choosingParties, setChoosingParties] = useState(false)
  const [partyOptions, setPartyOptions] = useState<PartyOption[] | null>(null)
  const [units, setUnits] = useState<BatchUnit[]>([])
  const [skipped, setSkipped] = useState<{ noParties: number; noRecipients: number }>({ noParties: 0, noRecipients: 0 })
  const [savedContacts, setSavedContacts] = useState<SavedContacts>({})
  // Addresses on the current email offered for saving; the first one is showing.
  const [saveQueue, setSaveQueue] = useState<string[]>([])
  // Per company, the addresses the sender chose to use for this send only.
  const [declined, setDeclined] = useState<Record<string, Set<string>>>({})
  const [index, setIndex] = useState(0)
  const [sending, setSending] = useState(false)
  const [sendingAll, setSendingAll] = useState(false)
  const [includeSignature, setIncludeSignature] = useState(true)
  const [results, setResults] = useState<UnitResult[]>([])
  const [anySent, setAnySent] = useState(false)
  // Seller emails: the Requests card's ticks by sample id, saved on Send (not on
  // Skip), and the buyer samples ticked with no destination picked yet.
  const [requests, setRequests] = useState<Record<string, SellerRequests>>({})
  const [pendingBuyer, setPendingBuyer] = useState<Set<string>>(() => new Set())
  // Unit indexes whose cover was edited by hand: a language switch then leaves
  // the cover as typed (sys's bodyDirtyRef rule).
  const coverDirtyRef = useRef<Set<number>>(new Set())

  // Latest-request guard: a response for an earlier selection, range or a closed
  // view must never replace the emails now showing (it decides who is emailed).
  const reqRef = useRef(0)
  useEffect(() => {
    return () => {
      reqRef.current++
    }
  }, [])

  const loadQueue = (params: URLSearchParams) => {
    const id = ++reqRef.current
    setLoading(true)
    setError(null)
    fetch(`/api/certificates/batch-send/queue?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed to load queue')
        return (await r.json()) as QueueResponse
      })
      .then((data) => {
        if (id !== reqRef.current) return
        setUnits(data.units)
        setSkipped(data.skipped)
        setSavedContacts(data.savedContacts ?? {})
        setRequests(queueRequests(data.units))
        setPendingBuyer(queuePending(data.units))
        coverDirtyRef.current = new Set()
      })
      .catch((e) => {
        if (id === reqRef.current) setError(e.message)
      })
      .finally(() => {
        if (id === reqRef.current) setLoading(false)
      })
  }

  const selectionParams = (sel: NonNullable<Props['selection']>, parties: CertificateParty[]) => {
    const qs = new URLSearchParams({ sampleIds: sel.sampleIds.join(','), parties: parties.join(',') })
    if (sel.includeSent) qs.set('includeSent', '1')
    return qs
  }

  const rangeParams = (extra: Record<string, string>) => {
    const qs = new URLSearchParams(extra)
    if (range?.from) qs.set('from', range.from)
    if (range?.to) qs.set('to', range.to)
    return qs
  }

  useEffect(() => {
    if (!open) {
      reqRef.current++
      return
    }
    setError(null)
    setUnits([])
    setIndex(0)
    setResults([])
    setAnySent(false)
    setSaveQueue([])
    setDeclined({})
    setClients(null)
    setChoosingParties(false)
    setPartyOptions(null)
    setRequests({})
    setPendingBuyer(new Set())
    coverDirtyRef.current = new Set()
    if (selection?.parties) {
      // The parties were chosen up front: load the queue and start on the first email.
      setChoosingClients(false)
      loadQueue(selectionParams(selection, selection.parties))
      return
    }
    if (selection) {
      // No parties yet: ask which of the selection's parties to email.
      setChoosingClients(false)
      setChoosingParties(true)
      setLoading(true)
      const id = ++reqRef.current
      fetch(`/api/certificates/batch-send/queue?view=parties&sampleIds=${encodeURIComponent(selection.sampleIds.join(','))}`)
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.json()).error || 'Failed to load the parties')
          return (await r.json()) as { parties: PartyOption[] }
        })
        .then((data) => {
          if (id === reqRef.current) setPartyOptions(Array.isArray(data.parties) ? data.parties : [])
        })
        .catch((e) => {
          if (id === reqRef.current) setError(e.message)
        })
        .finally(() => {
          if (id === reqRef.current) setLoading(false)
        })
      return
    }
    // Range mode: first ask which QC clients have something left to send.
    setChoosingClients(true)
    setLoading(true)
    const id = ++reqRef.current
    fetch(`/api/certificates/batch-send/queue?${rangeParams({ view: 'clients' }).toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed to load QC clients')
        return (await r.json()) as { clients: QcClientOption[] }
      })
      .then((data) => {
        if (id === reqRef.current) setClients(data.clients)
      })
      .catch((e) => {
        if (id === reqRef.current) setError(e.message)
      })
      .finally(() => {
        if (id === reqRef.current) setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    range?.from,
    range?.to,
    (selection?.sampleIds ?? []).join(','),
    selection?.parties ? selection.parties.join(',') : null,
    selection?.includeSent,
  ])

  // Each email starts without save offers left over from the previous one.
  useEffect(() => {
    setSaveQueue([])
  }, [index])

  if (!open) return null

  const current = units[index]
  const done = index >= units.length

  const continueWithClients = (clientIds: string[], parties: CertificateParty[]) => {
    setChoosingClients(false)
    loadQueue(rangeParams({ clientIds: clientIds.join(','), parties: parties.join(',') }))
  }

  const continueWithParties = (parties: CertificateParty[]) => {
    if (!selection) return
    setChoosingParties(false)
    loadQueue(selectionParams(selection, parties))
  }

  const patchCurrent = (next: Partial<BatchUnit>) =>
    setUnits((prev) => prev.map((u, i) => (i === index ? { ...u, ...next } : u)))

  /** This email's seller requests: the card's values, else what the queue started with. */
  const unitRequests = (unit: BatchUnit): Record<string, SellerRequests> => {
    const out: Record<string, SellerRequests> = {}
    if (unit.side !== 'seller') return out
    for (const s of requestSamples(unit.samples)) out[s.sampleId] = requests[s.sampleId] ?? s.sellerRequest!.requests
    return out
  }

  /** A seller email with a ticked buyer sample and no address: it waits for a pick. */
  const unitMissingDestination = (unit: BatchUnit): boolean =>
    unit.side === 'seller' && missingDestination(requestMembers(unit.samples), unitRequests(unit), pendingBuyer)

  /** EN/BR: the preview follows; the cover is rebuilt until it is edited by hand. */
  const switchLanguage = (lang: Lang) => {
    if (!current || current.language === lang) return
    if (coverDirtyRef.current.has(index)) {
      patchCurrent({ language: lang })
      return
    }
    const attached = attachedSampleIds(current).length > 0
    patchCurrent({ language: lang, body: literalDraftText(buildQualityCoverNote(current.greeting, attached, lang)) })
  }

  const editCover = (markup: string) => {
    coverDirtyRef.current.add(index)
    patchCurrent({ body: markup })
  }

  const enqueueSave = (email: string) =>
    setSaveQueue((q) => (q.some((x) => emailKey(x) === emailKey(email)) ? q : [...q, email]))

  /** Change the current email's recipients, offering to save any address just added. */
  const updateRecipients = (next: { to: string[]; cc: string[]; body: string }) => {
    if (!current) return
    const offers = addressesToOffer({
      before: [...current.to, ...current.cc],
      after: [...next.to, ...next.cc],
      saved: new Set(Object.keys(savedContacts[current.companyId] ?? {})),
      declined: declined[current.companyId] ?? new Set(),
    })
    offers.forEach(enqueueSave)
    // An address taken off the email is no longer worth asking about.
    const onEmail = new Set([...next.to, ...next.cc].map(emailKey))
    setSaveQueue((q) => q.filter((e) => onEmail.has(emailKey(e))))
    patchCurrent({ to: next.to, cc: next.cc, body: next.body })
  }

  const pendingSave = saveQueue[0] ?? null

  const handleSaved = (email: string, contact: QcContactRecord) => {
    if (!current) return
    const companyId = current.companyId
    setSavedContacts((prev) => ({
      ...prev,
      [companyId]: {
        ...(prev[companyId] ?? {}),
        [emailKey(email)]: {
          name: (contact.name ?? '').trim() || null,
          isGroup: !!contact.is_group,
          contactId: contact.id,
        },
      },
    }))
    setSaveQueue((q) => q.slice(1))
  }

  const handleSkip = (email: string) => {
    if (!current) return
    const companyId = current.companyId
    setDeclined((prev) => ({ ...prev, [companyId]: new Set(prev[companyId] ?? []).add(emailKey(email)) }))
    setSaveQueue((q) => q.slice(1))
  }

  async function postUnit(unit: BatchUnit): Promise<{ ok: boolean; failed: number; error?: string }> {
    // The composer checkbox overrides every certificate; unset, each carries its own default.
    const attached = new Set(attachedSampleIds(unit))
    const res = await fetch('/api/certificates/batch-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        side: unit.side,
        companyId: unit.companyId,
        to: unit.to,
        cc: unit.cc,
        subject: unit.subject,
        bodyText: unit.body,
        // One entry per certificate = per sample (a contract sibling is its own sample).
        certificates: unit.samples.map((s) => ({ sampleId: s.sampleId, attach: attached.has(s.sampleId) })),
        includeSignature,
        language: unit.language,
        // Seller emails: the ticks of this email's approved PSS, saved on send.
        sellerRequests: unitRequests(unit),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) return { ok: false, failed: unit.samples.length, error: data.error || 'Send failed' }
    const failed = (data.results ?? []).filter((r: { ok: boolean }) => !r.ok).length
    return { ok: true, failed }
  }

  async function sendCurrent() {
    if (!current) return
    setSending(true)
    setError(null)
    try {
      const r = await postUnit(current)
      if (!r.ok) {
        setError(`${current.companyName}: ${r.error}`)
        return
      }
      setResults((prev) => [...prev, { companyId: current.companyId, side: current.side, ok: true, failed: r.failed }])
      setAnySent(true)
      setIndex((i) => i + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  function skipCurrent() {
    setIndex((i) => i + 1)
    setError(null)
  }

  async function sendAllRemaining() {
    setSendingAll(true)
    setError(null)
    const collected: UnitResult[] = []
    for (let i = index; i < units.length; i++) {
      const unit = units[i]
      setIndex(i)
      if (unit.to.length === 0 || unitMissingDestination(unit)) {
        // Can't send a unit with no recipient, or one whose buyer sample has no
        // address (the request would be lost); leave it for manual review.
        collected.push({ companyId: unit.companyId, side: unit.side, ok: false, failed: unit.samples.length })
        setResults((prev) => [...prev, collected[collected.length - 1]])
        continue
      }
      try {
        const r = await postUnit(unit)
        collected.push({ companyId: unit.companyId, side: unit.side, ok: r.ok, failed: r.failed })
        if (r.ok) setAnySent(true)
      } catch {
        collected.push({ companyId: unit.companyId, side: unit.side, ok: false, failed: unit.samples.length })
      }
      setResults((prev) => [...prev, collected[collected.length - 1]])
    }
    setIndex(units.length)
    setSendingAll(false)
  }

  function finish() {
    if (anySent) onSent?.()
    onClose()
  }

  const position = current ? composerPosition(units, index) : null
  const attachedIds = current ? attachedSampleIds(current) : []
  const attachedLines = current ? current.samples.filter((s) => attachedIds.includes(s.sampleId)) : []
  const title = selection
    ? 'Send certificates'
    : `Send unsent certificates${periodLabel ? ` · ${periodLabel}` : ''}`
  // The preview re-renders on every tick, destination or language change, the
  // way the send builds the table.
  const previewHtml = current?.summaryGroups
    ? buildQualitySummaryHtml(current.summaryGroups, {
        audience: audienceOf(current.side),
        sellerComment: current.side === 'seller',
        language: current.language,
        ...(current.side === 'seller' ? { requests: unitRequests(current) } : {}),
      })
    : current?.summaryHtml
  // A ticked buyer sample with no address (picked-then-waiting, or held on by a
  // fixed pre-approval with none on file) holds Send and Send all.
  const sellerMissing = !!current && unitMissingDestination(current)
  const busy = sending || sendingAll

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#2A2A2A]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 px-4 dark:border-white/15">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>

      {loading ? (
        <p className="p-6 text-sm opacity-60">
          {choosingClients ? 'Loading QC clients…' : choosingParties ? 'Loading parties…' : 'Loading queue…'}
        </p>
      ) : error && (choosingClients || choosingParties || units.length === 0) ? (
        <div className="p-6">
          <p className="text-sm text-red-500">{error}</p>
          <Button variant="outline" className="mt-4" onClick={onClose}>Close</Button>
        </div>
      ) : choosingClients ? (
        clients && clients.length > 0 ? (
          <div className="flex-1 overflow-auto">
            <QcClientStep clients={clients} onContinue={continueWithClients} />
          </div>
        ) : (
          <div className="p-6">
            <p className="text-sm opacity-70">No unsent certificates in this period.</p>
            <Button variant="outline" className="mt-4" onClick={onClose}>Close</Button>
          </div>
        )
      ) : choosingParties ? (
        partyOptions && partyOptions.length > 0 ? (
          <div className="flex-1 overflow-auto">
            <PartyStep options={partyOptions} onContinue={continueWithParties} />
          </div>
        ) : (
          <div className="p-6">
            <p className="text-sm opacity-70">No one to send this to.</p>
            <Button variant="outline" className="mt-4" onClick={onClose}>Close</Button>
          </div>
        )
      ) : units.length === 0 ? (
        <div className="p-6">
          <p className="text-sm opacity-70">
            {selection ? 'No unsent certificates in this selection.' : 'No unsent certificates in this range.'}
          </p>
          {(skipped.noParties > 0 || skipped.noRecipients > 0) && (
            <p className="mt-2 text-xs opacity-50">
              Skipped: {skipped.noParties} without a party, {skipped.noRecipients} without a recipient.
            </p>
          )}
          <Button variant="outline" className="mt-4" onClick={onClose}>Close</Button>
        </div>
      ) : done ? (
        <div className="p-6">
          <p className="text-sm font-semibold">Done.</p>
          <p className="mt-2 text-sm opacity-70">
            Sent {results.filter((r) => r.ok).length} of {units.length} email{units.length === 1 ? '' : 's'}.
            {results.some((r) => !r.ok) && ` ${results.filter((r) => !r.ok).length} failed.`}
            {results.some((r) => r.failed > 0) && ` Some individual certificates could not be delivered.`}
          </p>
          <Button className="mt-4" onClick={finish}>Close</Button>
        </div>
      ) : (
        <>
          {/* Scrollable body: email on the left, quality summary on the right. */}
          <div className="flex-1 overflow-auto">
            <div className="mx-auto max-w-7xl p-4">
              {position?.divider && (
                <div className="mb-4 rounded-lg bg-black/5 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide dark:bg-white/10">
                  {position.divider}
                </div>
              )}
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-60">{position?.label}</div>
                <div className="text-xs opacity-50">{results.length} sent · {units.length - index} remaining</div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {/* Left: the email */}
                <div className="space-y-4 lg:col-span-1">
                  {/* The subject names the shipper / client / contract (the
                      format buyers file by), so the sender sees it and can
                      correct it before Send. */}
                  <div className="rounded-[16px] border border-black/10 p-4 dark:border-white/15">
                    <label
                      htmlFor="batch-email-subject"
                      className="mb-2 block text-xs font-semibold uppercase tracking-wide opacity-60"
                    >
                      Subject
                    </label>
                    <input
                      id="batch-email-subject"
                      type="text"
                      className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/15"
                      value={current.subject}
                      onChange={(e) => patchCurrent({ subject: e.target.value })}
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] opacity-60">Language</span>
                    <div
                      role="radiogroup"
                      aria-label="Email language"
                      title="Rewrites the cover note unless you have edited it"
                      className="inline-flex overflow-hidden rounded-[4px] border border-black/10 dark:border-white/15"
                    >
                      {LANGUAGES.map((l) => (
                        <button
                          key={l.value}
                          type="button"
                          role="radio"
                          aria-checked={current.language === l.value}
                          onClick={() => switchLanguage(l.value)}
                          disabled={busy}
                          className={`px-2 py-0.5 font-mono text-[10.5px] transition-colors disabled:opacity-50 ${
                            current.language === l.value
                              ? 'bg-primary text-primary-foreground'
                              : 'opacity-60 hover:bg-black/5 dark:hover:bg-white/10'
                          }`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <RecipientPanel
                    title={`${current.companyName} (${partyLabel(current.side).toLowerCase()}${current.qcClientName ? `, for ${current.qcClientName}` : ''})`}
                    to={current.to}
                    cc={current.cc}
                    body={current.body}
                    meta={savedContacts[current.companyId] ?? {}}
                    onSaveRequest={enqueueSave}
                    onChange={updateRecipients}
                    hideBody
                  />

                  {current.to.length === 0 && (
                    <RecipientCaptureForm
                      companyId={current.companyId}
                      companyName={current.companyName}
                      offerSave={false}
                      onAdd={(email) => updateRecipients({ to: [...current.to, email], cc: current.cc, body: current.body })}
                    />
                  )}

                  {/* Anything added that isn't saved for this company: keep it
                      for next time as a person or a group inbox, or use it for
                      this send only. Never blocks Send. */}
                  {pendingSave && (
                    <SaveContactPrompt
                      key={`${current.companyId}:${emailKey(pendingSave)}`}
                      context="certificate"
                      companyId={current.companyId}
                      companyName={current.companyName}
                      email={pendingSave}
                      onSaved={(contact) => handleSaved(pendingSave, contact)}
                      onSkip={() => handleSkip(pendingSave)}
                    />
                  )}

                  <SendHistoryCard history={current.history} total={current.samples.length} />

                  {/* The cover note as draft markup; the table below it is not editable.
                      Inert while sending: what goes out is what was there at Send. */}
                  <div
                    inert={busy}
                    className={`rounded-[10px] border border-black/10 p-4 dark:border-white/15${busy ? ' opacity-60' : ''}`}
                  >
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">Cover note</div>
                    <RichBodyEditor key={index} value={current.body} onChange={editCover} ariaLabel="Cover note" />
                  </div>

                  {attachedLines.length > 0 && (
                    <div className="rounded-[16px] border border-black/10 p-4 dark:border-white/15">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">
                        {attachedLines.length === current.samples.length
                          ? `${attachedLines.length} certificate${attachedLines.length === 1 ? '' : 's'} attached`
                          : `${attachedLines.length} of ${current.samples.length} certificates attached`}
                      </div>
                      <ul className="space-y-1 text-sm">
                        {attachedLines.map((s) => (
                          // One certificate per sample, so the sample id is unique within a unit.
                          <li key={s.sampleId} className="flex items-center gap-2">
                            <span className={s.decision === 'rejected' ? 'text-red-500' : 'text-green-600'}>
                              {outcomeLabel(s.sampleType, s.decision === 'rejected')}
                            </span>
                            <span className="opacity-80">
                              {[s.containerNr && `Container ${s.containerNr}`, s.certNumber && `Cert ${s.certNumber}`, s.contractNumber && `Contract ${s.contractNumber}`]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {current.side === 'seller' && (
                    <RequestsCard
                      samples={current.samples}
                      value={unitRequests(current)}
                      onChange={(next) => setRequests((prev) => ({ ...prev, ...next }))}
                      pending={pendingBuyer}
                      onPendingChange={setPendingBuyer}
                      disabled={busy}
                    />
                  )}

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={attachedIds.length > 0}
                      onChange={(e) => patchCurrent({ attachCertificates: e.target.checked })}
                    />
                    Attach certificates
                    {current.side !== 'buyer' && (
                      <span className="text-xs opacity-50">(normally only the client receives them)</span>
                    )}
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={includeSignature} onChange={(e) => setIncludeSignature(e.target.checked)} />
                    Include HTML signature
                  </label>
                </div>

                {/* Right: the quality summary */}
                <div className="lg:col-span-2">
                  {previewHtml && (
                    <section
                      aria-label="Email preview"
                      className="rounded-[16px] border border-black/10 p-4 dark:border-white/15"
                    >
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">
                        Quality summary{attachedIds.length > 0 ? '' : ' — no certificates attached'}
                      </div>
                      <div
                        className="overflow-auto rounded-lg bg-white p-3 text-sm text-black"
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                      />
                    </section>
                  )}
                </div>
              </div>

              {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
            </div>
          </div>

          {/* Pinned footer: Skip / Send always visible without scrolling. */}
          <CommitBar
            className="px-4 sm:px-4"
            start={
              <Button variant="outline" onClick={skipCurrent} disabled={busy}>
                Skip
              </Button>
            }
          >
            {sellerMissing && (
              <span className="self-center text-xs text-red-500">Pick where the sample goes</span>
            )}
            <Button variant="outline" onClick={sendAllRemaining} disabled={busy || sellerMissing}>
              {sendingAll ? 'Sending…' : 'Send all remaining without review'}
            </Button>
            <Button onClick={sendCurrent} disabled={busy || current.to.length === 0 || sellerMissing}>
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </CommitBar>
        </>
      )}
    </div>
  )
}
