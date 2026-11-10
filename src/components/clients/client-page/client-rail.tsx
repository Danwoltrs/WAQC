'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft, Calendar, Mail, Phone, Building2, Pencil, Settings, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { ClientSummaryResponse } from '@/lib/clients/client-summary'
import { approvalRate } from '@/lib/clients/client-summary'
import {
  pricingSummary, billingSummary, certificateNumberPreview, validitySummary, type QcSettingsLike,
} from '@/lib/clients/qc-settings-summary'

/**
 * The client page's left column. It takes the app menu's place while a
 * client is open; "Back to clients" is the way out.
 */
export function ClientRail({
  client, displayName, typeSummary, addressLines, summary, qc, onEdit, onConfigure,
}: {
  client: any
  displayName: string
  typeSummary: string
  addressLines: string[]
  summary: ClientSummaryResponse | null
  qc: QcSettingsLike | null
  onEdit: () => void
  onConfigure: () => void
}) {
  const counts = summary?.counts
  const rate = counts ? approvalRate(counts) : null
  const legal = client.fantasy_name && client.company && client.company !== client.fantasy_name ? client.company : null

  return (
    // pt-12 on phones clears MainLayout's floating menu button.
    <aside className="flex w-full flex-col border-b border-border bg-background pt-12 lg:h-full lg:w-[304px] lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:pt-0">
      <Section>
        <Button asChild variant="outline" size="sm" className="h-8 self-start rounded-[6px] text-[13px] gap-1.5">
          <Link href="/clients"><ArrowLeft className="h-3.5 w-3.5" />Back to clients</Link>
        </Button>
      </Section>

      <Section>
        <div className="flex items-center gap-3">
          {client.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={client.logo_url} alt="" className="h-12 w-12 shrink-0 rounded-[10px] border border-border bg-white object-contain p-1" />
          ) : (
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[10px] border border-border bg-muted text-[18px] font-semibold text-muted-foreground">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-semibold leading-tight tracking-[-0.02em]" title={displayName}>{displayName}</h1>
            {legal && <div className="truncate text-[12px] text-muted-foreground" title={legal}>{legal}</div>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {client.is_qc_client && <Pill tone="good">QC client</Pill>}
          <Pill tone={client.is_active ? 'good' : 'muted'}>{client.is_active ? 'Active' : 'Inactive'}</Pill>
        </div>
        <div className="space-y-1.5 text-[13px]">
          {addressLines.length > 0 && (
            <Line icon={<MapPin />}><span className="whitespace-pre-line">{addressLines.join('\n')}</span></Line>
          )}
          {client.email && <Line icon={<Mail />}><span className="truncate">{client.email}</span></Line>}
          {client.phone && <Line icon={<Phone />}>{client.phone}</Line>}
          {typeSummary && <Line icon={<Building2 />}>{typeSummary}</Line>}
          {client.created_at && <Line icon={<Calendar />}>Joined {format(new Date(client.created_at), 'MMM d, yyyy')}</Line>}
        </div>
        <Button variant="outline" size="sm" onClick={onEdit} className="h-8 self-start rounded-[6px] text-[13px] gap-1.5">
          <Pencil className="h-3.5 w-3.5" />Edit details
        </Button>
      </Section>

      <Section>
        {counts ? (
          <div className="grid grid-cols-2 gap-3">
            <Figure n={counts.total} label="Samples" />
            <Figure n={rate == null ? '–' : `${rate}%`} label="Approved" tone="good" />
            <Figure n={counts.rejected} label="Rejected" tone={counts.rejected > 0 ? 'bad' : undefined} />
            <Figure n={counts.certificates} label="Certificates" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        )}
      </Section>

      {client.is_qc_client && qc && (
        <Section>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold">QC services</h2>
            <Button variant="outline" size="sm" onClick={onConfigure} className="h-7 rounded-[6px] px-2.5 text-[12px] gap-1.5">
              <Settings className="h-3.5 w-3.5" />Configure
            </Button>
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-[12.5px]">
            <Row k="Pricing" v={pricingSummary(qc)} />
            <Row k="Billing" v={billingSummary(qc)} />
            <Row k="Certificate no." v={certificateNumberPreview(qc.certificatePattern) ?? '–'} mono />
            <Row k="5% approval" v={qc.toleranceAutoApprove ? 'On' : 'Off'} good={!!qc.toleranceAutoApprove} />
            <Row k="Share with all" v={qc.certificatesToAllParties ? 'On' : 'Off'} good={!!qc.certificatesToAllParties} />
            <Row k="Validity" v={validitySummary(qc)} />
          </dl>
        </Section>
      )}
    </aside>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 border-b border-border px-5 py-4 last:border-b-0">{children}</div>
}

function Pill({ children, tone }: { children: React.ReactNode; tone: 'good' | 'muted' }) {
  return (
    <span className={cn(
      'rounded-[4px] px-2 py-0.5 text-[12px] font-medium',
      tone === 'good'
        ? 'bg-[#e7f2ec] text-[#15663f] dark:bg-emerald-950/40 dark:text-emerald-300'
        : 'bg-muted text-muted-foreground',
    )}>
      {children}
    </span>
  )
}

function Line({ icon, children }: { icon: React.ReactElement; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-foreground/85">
      <span className="mt-[2px] shrink-0 text-muted-foreground [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

function Figure({ n, label, tone }: { n: number | string; label: string; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <div className={cn(
        'text-[20px] font-semibold leading-tight tabular-nums',
        tone === 'good' && 'text-[#15663f] dark:text-emerald-400',
        tone === 'bad' && 'text-red-600 dark:text-red-400',
      )}>{n}</div>
      <div className="text-[12px] text-muted-foreground">{label}</div>
    </div>
  )
}

function Row({ k, v, mono, good }: { k: string; v: string; mono?: boolean; good?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={cn(
        'min-w-0 truncate text-right',
        mono && 'font-mono text-[12px]',
        good && 'font-medium text-[#15663f] dark:text-emerald-400',
      )} title={v}>{v}</dd>
    </>
  )
}
