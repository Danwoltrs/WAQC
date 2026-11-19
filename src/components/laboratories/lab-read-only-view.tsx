'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Eye, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { sampleShortName, shownCertificateNumber } from '@/lib/sample-reference'
import { outcomeLabel } from '@/lib/sample-verdict'
import { sampleTypeTag } from '@/lib/certificate-list'
import { companyDisplayName } from '@/lib/contract-intake-mapping'

/**
 * Another laboratory's samples and certificates, for looking only.
 *
 * HQ opens this from the eye on the Laboratories page. Nothing here writes: the
 * page has no action that changes a row, and the server refuses a laboratory
 * the caller may not read by answering with the caller's own (`lab_view`), in
 * which case this says so instead of showing someone else's rows.
 */

const PAGE = 50

type Tab = 'samples' | 'certificates'

interface LabView { laboratory_id: string | null; read_only: boolean }

interface SampleRow {
  id: string
  created_at: string
  sample_type: string | null
  status: string | null
  origin: string | null
  quality_name: string | null
  qc_client_name: string | null
  exporter_name: string | null
  certificate_number: string | null
  container_nr: string | null
  ico_number: string | null
  exporter_sample_number: string | null
  wolthers_contract_nr: string | null
  buyer_contract_nr: string | null
}

interface CertificateRow {
  id: string
  certificate_number: string | null
  created_at: string
  status: string
  is_rejected: boolean | null
  sample_id: string | null
  sample: {
    sample_type: string | null
    origin: string | null
    quality_name: string | null
    wolthers_contract_nr: string | null
    buyer_contract_nr: string | null
    client: Parameters<typeof companyDisplayName>[0]
  } | null
}

const day = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** What a sample is called here: its certificate number, else its own number or contract. Never the lab number. */
export function sampleLabel(s: SampleRow): string {
  return (
    shownCertificateNumber(s.certificate_number) ??
    sampleShortName(s) ??
    s.wolthers_contract_nr ??
    s.buyer_contract_nr ??
    'No reference yet'
  )
}

const STATUS_LABEL: Record<string, string> = {
  received: 'Received',
  in_progress: 'In progress',
  under_review: 'Under review',
}

export function sampleStatusLabel(s: Pick<SampleRow, 'status' | 'sample_type'>): string {
  if (s.status === 'approved' || s.status === 'rejected') return outcomeLabel(s.sample_type, s.status === 'rejected')
  return STATUS_LABEL[s.status ?? ''] ?? '—'
}

export function LabReadOnlyView({ labId }: { labId: string }) {
  const [labName, setLabName] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('samples')
  const [samples, setSamples] = useState<SampleRow[]>([])
  const [certificates, setCertificates] = useState<CertificateRow[]>([])
  const [total, setTotal] = useState<Record<Tab, number>>({ samples: 0, certificates: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // The server answered with a different laboratory: the caller may not read this one.
  const [refused, setRefused] = useState(false)

  useEffect(() => {
    fetch(`/api/laboratories/${labId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLabName(d?.laboratory?.name ?? null))
      .catch(() => setLabName(null))
  }, [labId])

  const load = useCallback(async (which: Tab, offset: number) => {
    setLoading(true)
    setError(null)
    try {
      const qs = `laboratory_id=${encodeURIComponent(labId)}&limit=${PAGE}&offset=${offset}`
      const res = await fetch(which === 'samples' ? `/api/samples?${qs}` : `/api/certificates?${qs}`)
      if (!res.ok) throw new Error('Could not load this laboratory')
      const data = await res.json()
      const view: LabView | undefined = data.lab_view
      if (!view || view.laboratory_id !== labId) {
        setRefused(true)
        return
      }
      if (which === 'samples') {
        setSamples((prev) => (offset === 0 ? data.samples : [...prev, ...data.samples]))
        setTotal((t) => ({ ...t, samples: data.pagination?.total ?? 0 }))
      } else {
        setCertificates((prev) => (offset === 0 ? data.certificates : [...prev, ...data.certificates]))
        setTotal((t) => ({ ...t, certificates: data.total ?? 0 }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this laboratory')
    } finally {
      setLoading(false)
    }
  }, [labId])

  useEffect(() => { void load(tab, 0) }, [tab, load])

  if (refused) {
    return (
      <div className="rounded-[10px] border border-border p-6 text-sm">
        <p className="font-semibold">You cannot view this laboratory.</p>
        <p className="mt-1 text-muted-foreground">Only the head office laboratory can look at the other laboratories.</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/laboratories"><ArrowLeft className="mr-2 h-4 w-4" />Laboratories</Link>
        </Button>
      </div>
    )
  }

  const shown = tab === 'samples' ? samples.length : certificates.length
  const name = labName ?? 'this laboratory'

  return (
    <div className="space-y-4">
      <div
        role="status"
        className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[#b07946]/50 bg-[#efe4d4]/40 px-4 py-3 text-sm dark:bg-[#b07946]/10"
      >
        <Eye className="h-4 w-4 shrink-0" />
        <span>
          <span className="font-semibold">Viewing {name}: read only.</span>{' '}
          <span className="opacity-70">Nothing can be changed from here.</span>
        </span>
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <Link href="/laboratories"><ArrowLeft className="mr-2 h-4 w-4" />Back to my laboratory</Link>
        </Button>
      </div>

      <Segmented<Tab>
        aria-label="What to list"
        value={tab}
        onValueChange={setTab}
        options={[
          { value: 'samples', label: 'Samples' },
          { value: 'certificates', label: 'Certificates' },
        ]}
      />

      {error && <p className="text-sm text-[#ef4444]">{error}</p>}

      <div className="overflow-x-auto">
        {tab === 'samples' ? (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Received</th>
                <th className="px-3 py-2 font-medium">Sample</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Shipper</th>
                <th className="px-3 py-2 font-medium">Quality</th>
                <th className="px-3 py-2 font-medium">Origin</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="px-3 py-2 whitespace-nowrap">{day(s.created_at)}</td>
                  <td className="px-3 py-2 font-medium">{sampleLabel(s)}</td>
                  <td className="px-3 py-2">{sampleTypeTag(s.sample_type) ?? '—'}</td>
                  <td className="px-3 py-2">{s.qc_client_name ?? '—'}</td>
                  <td className="px-3 py-2">{s.exporter_name ?? '—'}</td>
                  <td className="px-3 py-2">{s.quality_name ?? '—'}</td>
                  <td className="px-3 py-2">{s.origin ?? '—'}</td>
                  <td className="px-3 py-2">{sampleStatusLabel(s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Issued</th>
                <th className="px-3 py-2 font-medium">Certificate</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Quality</th>
                <th className="px-3 py-2 font-medium">Contract</th>
                <th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {certificates.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="px-3 py-2 whitespace-nowrap">{day(c.created_at)}</td>
                  <td className="px-3 py-2 font-medium">{shownCertificateNumber(c.certificate_number) ?? '—'}</td>
                  <td className="px-3 py-2">{sampleTypeTag(c.sample?.sample_type) ?? '—'}</td>
                  <td className="px-3 py-2">{companyDisplayName(c.sample?.client) || '—'}</td>
                  <td className="px-3 py-2">{c.sample?.quality_name ?? '—'}</td>
                  <td className="px-3 py-2">{c.sample?.wolthers_contract_nr ?? c.sample?.buyer_contract_nr ?? '—'}</td>
                  <td className={`px-3 py-2 ${c.status === 'issued' && c.is_rejected ? 'text-[#ef4444]' : ''}`}>
                    {c.status === 'issued' ? outcomeLabel(c.sample?.sample_type, c.is_rejected === true) : c.status}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {c.sample_id && (
                      <a
                        href={`/api/samples/${c.sample_id}/certificate`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open certificate ${shownCertificateNumber(c.certificate_number) ?? ''}`}
                        className="inline-flex items-center text-muted-foreground hover:text-foreground"
                      >
                        <FileText className="h-4 w-4" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && shown === 0 && !error && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {name} has no {tab} yet.
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{loading ? 'Loading…' : `${shown} of ${total[tab]}`}</span>
        {!loading && shown < total[tab] && (
          <Button variant="outline" size="sm" onClick={() => void load(tab, shown)}>Show more</Button>
        )}
      </div>
    </div>
  )
}
