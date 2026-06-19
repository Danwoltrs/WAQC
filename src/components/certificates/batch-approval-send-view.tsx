'use client'

import { useEffect, useState } from 'react'
import { RecipientPanel } from '@/components/samples/approval/recipient-panel'
import type { BatchUnit } from '@/lib/approval-notification/batch-send'

interface Props {
  open: boolean
  /** Date-range mode (the "Send unsent certificates" toolbar button). */
  range?: { from: string; to: string }
  /** Explicit-selection mode (the "Send to buyer / seller" bulk buttons): send
   *  the chosen samples to one side regardless of date or prior-send status. */
  selection?: { sampleIds: string[]; side: 'buyer' | 'seller' }
  onClose: () => void
  onSent?: () => void
}

interface QueueResponse {
  units: BatchUnit[]
  skipped: { noContract: number; noRecipients: number }
}

interface UnitResult {
  companyId: string
  side: string
  ok: boolean
  failed: number
}

export function BatchApprovalSendView({ open, range, selection, onClose, onSent }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [units, setUnits] = useState<BatchUnit[]>([])
  const [skipped, setSkipped] = useState<{ noContract: number; noRecipients: number }>({ noContract: 0, noRecipients: 0 })
  const [index, setIndex] = useState(0)
  const [sending, setSending] = useState(false)
  const [sendingAll, setSendingAll] = useState(false)
  const [includeSignature, setIncludeSignature] = useState(true)
  const [results, setResults] = useState<UnitResult[]>([])
  const [anySent, setAnySent] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setUnits([])
    setIndex(0)
    setResults([])
    setAnySent(false)
    const qs = new URLSearchParams()
    if (selection) {
      qs.set('sampleIds', selection.sampleIds.join(','))
      qs.set('side', selection.side)
    } else if (range) {
      if (range.from) qs.set('from', range.from)
      if (range.to) qs.set('to', range.to)
    }
    fetch(`/api/certificates/batch-send/queue?${qs.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed to load queue')
        return (await r.json()) as QueueResponse
      })
      .then((data) => {
        setUnits(data.units)
        setSkipped(data.skipped)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, range?.from, range?.to, selection?.side, (selection?.sampleIds ?? []).join(',')])

  if (!open) return null

  const buyerCount = units.filter((u) => u.side === 'buyer').length
  const sellerCount = units.length - buyerCount
  const current = units[index]
  const done = index >= units.length

  const patchCurrent = (next: { to?: string[]; cc?: string[]; body?: string }) =>
    setUnits((prev) => prev.map((u, i) => (i === index ? { ...u, ...next } : u)))

  async function postUnit(unit: BatchUnit): Promise<{ ok: boolean; failed: number; error?: string }> {
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
        sampleIds: unit.samples.map((s) => s.sampleId),
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

  const headerLabel = () => {
    if (!current) return ''
    if (current.side === 'buyer') return `Buyer ${index + 1} of ${buyerCount}`
    return `Seller ${index - buyerCount + 1} of ${sellerCount}`
  }
  const showSellerDivider = !!current && current.side === 'seller' && index === buyerCount && buyerCount > 0

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-white dark:bg-[#2A2A2A]">
      <div className="flex h-12 items-center justify-between border-b border-black/10 px-4 dark:border-white/15">
        <h2 className="text-sm font-semibold">Send unsent certificates</h2>
        <button onClick={onClose} className="text-sm opacity-60 hover:opacity-100">Close</button>
      </div>

      {loading ? (
        <p className="p-6 text-sm opacity-60">Loading queue…</p>
      ) : error && units.length === 0 ? (
        <div className="p-6">
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={onClose} className="mt-4 rounded-lg border border-black/10 px-4 py-2 text-sm dark:border-white/15">Close</button>
        </div>
      ) : units.length === 0 ? (
        <div className="p-6">
          <p className="text-sm opacity-70">No unsent certificates in this range.</p>
          {(skipped.noContract > 0 || skipped.noRecipients > 0) && (
            <p className="mt-2 text-xs opacity-50">
              Skipped: {skipped.noContract} without a contract, {skipped.noRecipients} without a recipient.
            </p>
          )}
          <button onClick={onClose} className="mt-4 rounded-lg border border-black/10 px-4 py-2 text-sm dark:border-white/15">Close</button>
        </div>
      ) : done ? (
        <div className="p-6">
          <p className="text-sm font-semibold">Done.</p>
          <p className="mt-2 text-sm opacity-70">
            Sent {results.filter((r) => r.ok).length} of {units.length} email{units.length === 1 ? '' : 's'}.
            {results.some((r) => !r.ok) && ` ${results.filter((r) => !r.ok).length} failed.`}
            {results.some((r) => r.failed > 0) && ` Some individual certificates could not be delivered.`}
          </p>
          <button onClick={finish} className="mt-4 rounded-lg bg-[#556b2f] px-4 py-2 text-sm text-white">Close</button>
        </div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 p-4">
          {showSellerDivider && (
            <div className="rounded-lg bg-black/5 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide dark:bg-white/10">
              Now sending to SELLERS
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-60">{headerLabel()}</div>
            <div className="text-xs opacity-50">{results.length} sent · {units.length - index} remaining</div>
          </div>

          <RecipientPanel
            title={`${current.companyName} (${current.side})`}
            to={current.to}
            cc={current.cc}
            body={current.body}
            onChange={(next) => patchCurrent({ to: next.to, cc: next.cc, body: next.body })}
          />

          {current.to.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No QC-certificate recipients are configured for {current.companyName}. Add a contact with the
              &ldquo;QC certificates&rdquo; send-flag in sys.wolthers.com, or enter a recipient above.
            </p>
          )}

          {current.summaryHtml && (
            <div className="rounded-[16px] border border-black/10 p-4 dark:border-white/15">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">
                Quality summary{current.noAttachments ? ' — no certificates attached' : ''}
              </div>
              <div
                className="overflow-auto rounded-lg bg-white p-3 text-sm text-black"
                dangerouslySetInnerHTML={{ __html: current.summaryHtml }}
              />
            </div>
          )}

          {!current.noAttachments && (
            <div className="rounded-[16px] border border-black/10 p-4 dark:border-white/15">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">
                {current.samples.length} certificate{current.samples.length === 1 ? '' : 's'} attached
              </div>
              <ul className="space-y-1 text-sm">
                {current.samples.map((s) => (
                  <li key={s.sampleId} className="flex items-center gap-2">
                    <span className={s.decision === 'rejected' ? 'text-red-500' : 'text-[#556b2f]'}>
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
            <input type="checkbox" checked={includeSignature} onChange={(e) => setIncludeSignature(e.target.checked)} />
            Include HTML signature
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center justify-between">
            <button
              onClick={skipCurrent}
              disabled={sending || sendingAll}
              className="rounded-lg border border-black/10 px-4 py-2 text-sm disabled:opacity-50 dark:border-white/15"
            >
              Skip
            </button>
            <div className="flex gap-2">
              <button
                onClick={sendAllRemaining}
                disabled={sending || sendingAll}
                className="rounded-lg border border-[#556b2f] px-4 py-2 text-sm text-[#556b2f] disabled:opacity-50"
              >
                {sendingAll ? 'Sending…' : 'Send all remaining without review'}
              </button>
              <button
                onClick={sendCurrent}
                disabled={sending || sendingAll || current.to.length === 0}
                className="rounded-lg bg-[#556b2f] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}