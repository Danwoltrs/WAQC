'use client'

import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { formatQuantityLine } from '@/lib/bag-quantity'
import type { SampleGroupMember } from './use-cert-editor'

/**
 * Every contract a physical sample covers, one row per `samples` member of
 * the group (lab unit first, then contract order). Each row owns its own
 * references, quantity and certificate, so the overlay opens a row on that
 * member's own id rather than showing one set of references for all of them
 * — the crossed-references problem the one-sample-per-contract change exists
 * to remove.
 */
export function ContractsSection({
  group,
  currentSampleId,
  onOpen,
  onAddContract,
}: {
  group: SampleGroupMember[]
  currentSampleId: string
  onOpen: (sampleId: string) => void
  onAddContract: () => void
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">
          Contracts in this sample
          <span className="ml-2 text-xs font-normal text-muted-foreground">{group.length}</span>
        </h3>
        <Button variant="outline" size="sm" onClick={onAddContract}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add contract
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {group.map((m, i) => (
          <ContractRow
            key={m.id}
            member={m}
            ordinal={m.contract_ordinal ?? i + 1}
            current={m.id === currentSampleId}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  )
}

function ContractRow({
  member,
  ordinal,
  current,
  onOpen,
}: {
  member: SampleGroupMember
  ordinal: number
  current: boolean
  onOpen: (sampleId: string) => void
}) {
  const number = member.certificate_number || member.tracking_number || '—'
  const refs = [member.buyer_contract_nr, member.wolthers_contract_nr, member.exporter_sample_number].filter(Boolean)
  const quantity = formatQuantityLine(member)
  const pill = statusPill(member.status)
  return (
    <li>
      <button
        type="button"
        aria-label={`Contract #${ordinal}: ${number}`}
        aria-current={current ? 'true' : undefined}
        onClick={current ? undefined : () => onOpen(member.id)}
        className={[
          'grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-2 py-2 text-left transition-colors sm:grid-cols-[2.5rem_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto]',
          current ? 'cursor-default rounded-lg bg-muted/60' : 'cursor-pointer rounded-lg hover:bg-muted/40',
        ].join(' ')}
      >
        <span className="text-xs font-medium text-muted-foreground">#{ordinal}</span>
        <span className="truncate font-mono text-sm font-medium text-foreground">{number}</span>
        <span className="col-span-3 truncate text-xs text-muted-foreground sm:col-span-1">
          {refs.length ? refs.join(' · ') : '—'}
        </span>
        <span className="col-span-3 truncate text-xs text-muted-foreground sm:col-span-1">
          {quantity ?? '—'}
        </span>
        <span className={`justify-self-end rounded-full px-2 py-0.5 text-[11px] font-medium ${pill.className}`}>
          {pill.label}
        </span>
      </button>
    </li>
  )
}

function statusPill(status: string | null): { label: string; className: string } {
  const s = (status || '').toLowerCase()
  const map: Record<string, { label: string; className: string }> = {
    approved: { label: 'Approved', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    certified: { label: 'Approved', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    in_progress: { label: 'In Progress', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    pending: { label: 'Pending', className: 'bg-muted text-muted-foreground' },
  }
  return map[s] || { label: status || 'Unknown', className: 'bg-muted text-muted-foreground' }
}
