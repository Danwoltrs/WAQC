'use client'

// The contacts directory as one matrix grouped by company. Ported from sys
// `(dashboard)/contacts/directory-matrix.tsx` (its Mail lens: the company
// panel's Receives matrix for every company), restyled for QC: data table with
// square corners, 4 px chips, green ticks. Presentational: the page owns the
// data and every write.

import { Fragment } from 'react'
import { Check, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PURPOSE_GROUPS, departments, type PersonContact } from '@/lib/contacts/people'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import type { DirectoryCompany } from './types'

export interface DirectoryMatrixProps {
  companies: DirectoryCompany[]
  /** `${contactId}:${purpose}` of ticks being saved. */
  pending: Set<string>
  onOpenCompany: (companyId: string) => void
  onOpenContact: (companyId: string, contact: PersonContact) => void
  onAddContact: (company: DirectoryCompany) => void
  onTogglePurpose: (companyId: string, contact: PersonContact, purpose: string, on: boolean) => void
}

const ROLE_LABEL: Record<string, string> = { buyer: 'Buyer', seller: 'Seller' }

const COL_COUNT = 1 + PURPOSE_GROUPS.reduce((n, g) => n + g.purposes.length, 0)

export function DirectoryMatrix({
  companies, pending, onOpenCompany, onOpenContact, onAddContact, onTogglePurpose,
}: DirectoryMatrixProps) {
  return (
    <div className="overflow-x-auto border-y border-border bg-card">
      <table className="w-full border-separate border-spacing-0 text-[12px]">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            <th rowSpan={2} className="sticky left-0 z-20 min-w-[260px] border-b border-border bg-muted px-3 py-2 text-left font-medium">Contact</th>
            {PURPOSE_GROUPS.map((g) => (
              <th key={g.label} colSpan={g.purposes.length} className="border-l border-border px-2 pt-2 text-center font-medium">{g.label}</th>
            ))}
          </tr>
          <tr className="text-[12px] text-muted-foreground">
            {PURPOSE_GROUPS.flatMap((g) => g.purposes.map((p, i) => (
              <th
                key={p.value}
                title={p.label}
                className={cn(
                  'whitespace-nowrap border-b border-border px-2 pb-2 pt-1 text-center font-medium',
                  i === 0 && 'border-l border-border',
                  p.value === 'qc_certificates' && 'font-semibold text-foreground',
                )}
              >
                {p.short}
              </th>
            )))}
          </tr>
        </thead>
        <tbody>
          {companies.map((co) => {
            const label = companyDisplayName(co)
            const n = co.contacts.length
            return (
              <Fragment key={co.id}>
                <tr>
                  <td colSpan={COL_COUNT} className="border-b border-border bg-accent/40 p-0">
                    <div className="sticky left-0 inline-flex max-w-[calc(100vw-320px)] items-center gap-2 px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenCompany(co.id)}
                        className="truncate text-[12px] font-semibold text-foreground hover:text-primary hover:underline"
                      >
                        {label}
                      </button>
                      {(co.trading_roles ?? []).filter((r) => ROLE_LABEL[r]).map((r) => (
                        <span key={r} className="rounded-[4px] border border-border px-1.5 py-px text-[10px] text-muted-foreground">{ROLE_LABEL[r]}</span>
                      ))}
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {n === 0 ? 'no contacts' : `${n} ${n === 1 ? 'contact' : 'contacts'}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => onAddContact(co)}
                        className="ml-1 flex h-6 shrink-0 items-center gap-1 rounded-[6px] border border-border px-2 text-[11px] text-foreground/70 hover:bg-accent hover:text-foreground"
                      >
                        <Plus className="h-3 w-3" /> Add
                      </button>
                    </div>
                  </td>
                </tr>
                {co.contacts.map((c) => {
                  const purposes = c.routing_purposes ?? []
                  const depts = departments(c.role)
                  return (
                    <tr key={c.id} className="hover:bg-accent/20">
                      <td className="sticky left-0 z-[5] min-w-[260px] max-w-[260px] border-b border-border bg-card px-3 py-1.5 align-middle">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => onOpenContact(co.id, c)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenContact(co.id, c) }
                          }}
                          className="-mx-1.5 cursor-pointer rounded-[6px] px-1.5 py-0.5 hover:bg-accent/60"
                        >
                          <div className="flex items-center gap-1.5 text-[13px] text-foreground">
                            <span className="truncate" title={c.name}>{c.name || c.email}</span>
                            {c.is_group && <span className="shrink-0 rounded-[4px] bg-muted px-1.5 py-px text-[10px] text-muted-foreground">Group inbox</span>}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {[c.name ? c.email : null, depts.join(', ')].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </td>
                      {PURPOSE_GROUPS.flatMap((g) => g.purposes.map((p, i) => {
                        const on = purposes.includes(p.value)
                        const busy = [...pending].some((k) => k.startsWith(`${c.id}:`))
                        const blocked = !c.email
                        return (
                          <td key={p.value} className={cn('border-b border-border px-2 py-1.5 text-center align-middle', i === 0 && 'border-l border-border')}>
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              aria-label={`${c.name || c.email}: ${p.label}`}
                              aria-disabled={blocked || busy}
                              title={blocked ? 'Add an email address first' : p.label}
                              onClick={() => { if (!blocked && !busy) onTogglePurpose(co.id, c, p.value, !on) }}
                              className={cn(
                                'inline-grid h-4 w-4 place-items-center rounded-[3px] border transition-colors',
                                on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50',
                                blocked ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:border-foreground',
                                busy && 'opacity-60',
                              )}
                            >
                              {on && <Check className="h-3 w-3" strokeWidth={3} />}
                            </button>
                          </td>
                        )
                      }))}
                    </tr>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
