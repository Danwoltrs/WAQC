'use client'

import { useEffect, useRef, useState } from 'react'
import { RecipientPanel } from '@/components/samples/approval/recipient-panel'
import { RecipientCaptureForm } from '@/components/samples/approval/recipient-capture'
import type { RecipientMeta } from '@/components/samples/approval/recipient-chips'
import { SaveContactPrompt } from '@/components/reports/save-contact-prompt'
import { QcClientStep } from '@/components/certificates/qc-client-step'
import { Button } from '@/components/ui/button'
import { CommitBar } from '@/components/ui/commit-bar'
import { attachedSampleIds, composerPosition, partyLabel, type BatchUnit } from '@/lib/approval-notification/batch-send'
import type { CertificateParty } from '@/lib/approval-notification/types'
import type { QcClientOption } from '@/lib/approval-notification/qc-client-filter'
import { addressesToOffer } from '@/lib/qc-contacts/save-offer'
import type { QcContactRecord } from '@/lib/qc-contacts/tags'

interface Props {
  open: boolean
  /** Date-range mode ("Send unsent"): choose the QC clients, then walk their
   *  emails and after them the sellers'. */
  range?: { from: string; to: string }
  /** The chosen period, for the header ("Last 7 days"). */
  periodLabel?: string
  /** Explicit-selection mode: the parties are already chosen (Send dropdown), so
   *  the view opens straight on the first email for the chosen certificates. */
  selection?: { sampleIds: string[]; parties: CertificateParty[]; includeSent: boolean }
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

export function BatchApprovalSendView({ open, range, periodLabel, selection, onClose, onSent }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Range mode opens on the QC client step; `clients` stays null until it loads.
  const [choosingClients, setChoosingClients] = useState(false)
  const [clients, setClients] = useState<QcClientOption[] | null>(null)
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
      })
      .catch((e) => {
        if (id === reqRef.current) setError(e.message)
      })
      .finally(() => {
        if (id === reqRef.current) setLoading(false)
      })
  }

  const selectionParams = (sel: NonNullable<Props['selection']>) => {
    const qs = new URLSearchParams({ sampleIds: sel.sampleIds.join(','), parties: sel.parties.join(',') })
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
    if (selection) {
      // The parties were chosen up front: load the queue and start on the first email.
      setChoosingClients(false)
      loadQueue(selectionParams(selection))
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
    (selection?.parties ?? []).join(','),
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

  const patchCurrent = (next: Partial<BatchUnit>) =>
    setUnits((prev) => prev.map((u, i) => (i === index ? { ...u, ...next } : u)))

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
      if (unit.to.length === 0) {
        // Can't send a unit with no recipient; leave it for manual capture.
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#2A2A2A]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 px-4 dark:border-white/15">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>

      {loading ? (
        <p className="p-6 text-sm opacity-60">{choosingClients ? 'Loading QC clients…' : 'Loading queue…'}</p>
      ) : error && (choosingClients || units.length === 0) ? (
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

                  <RecipientPanel
                    title={`${current.companyName} (${partyLabel(current.side).toLowerCase()}${current.qcClientName ? `, for ${current.qcClientName}` : ''})`}
                    to={current.to}
                    cc={current.cc}
                    body={current.body}
                    meta={savedContacts[current.companyId] ?? {}}
                    onSaveRequest={enqueueSave}
                    onChange={updateRecipients}
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
                              {s.decision === 'rejected' ? 'Rejected' : 'Approved'}
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
                  {current.summaryHtml && (
                    <div className="rounded-[16px] border border-black/10 p-4 dark:border-white/15">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">
                        Quality summary{attachedIds.length > 0 ? '' : ' — no certificates attached'}
                      </div>
                      <div
                        className="overflow-auto rounded-lg bg-white p-3 text-sm text-black"
                        dangerouslySetInnerHTML={{ __html: current.summaryHtml }}
                      />
                    </div>
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
              <Button variant="outline" onClick={skipCurrent} disabled={sending || sendingAll}>
                Skip
              </Button>
            }
          >
            <Button variant="outline" onClick={sendAllRemaining} disabled={sending || sendingAll}>
              {sendingAll ? 'Sending…' : 'Send all remaining without review'}
            </Button>
            <Button onClick={sendCurrent} disabled={sending || sendingAll || current.to.length === 0}>
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </CommitBar>
        </>
      )}
    </div>
  )
}
