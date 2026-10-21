'use client'

import { useEffect, useMemo, useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SampleDetailOverlay } from '@/components/certificates/cert-editor'
import { useSampleIntake } from '@/components/samples/sample-intake-provider'
import { Check, Clock, Minus, Plus, Search, Send, X } from 'lucide-react'
import { sampleLabelText } from '@/lib/sample-reference'

type RecipientStatus = 'pending' | 'approved' | 'rejected' | 'no_response'

interface OtherSample {
  id: string
  origin: string
  container_nr?: string | null
  ico_number?: string | null
  exporter_sample_number?: string | null
  certificate_id?: string | null
  certificate_number?: string | null
  sample_type: string | null
  quality_name: string | null
  /** Type / stocklot offers: TS-0042/26, shared running number. */
  offer_number?: string | null
  quality_description?: string | null
  seller_name: string | null
  importer_name: string | null
  end_client_name: string | null
  status: string
  workflow_stage: string | null
  bags_quantity_mt: number | null
  bag_count: number | null
  awb_number: string | null
  courier_name: string | null
  is_quick_look: boolean
  arrival_date: string | null
  created_at: string
  sample_recipients?: Array<{ id: string; status: RecipientStatus }>
}

// Type / stocklot offers lead with their TS- number. Otherwise the certificate
// number, else the lot's own identifier, else its AWB; never the SAN lab number.
const otherSampleReference = (s: OtherSample): string =>
  s.offer_number || sampleLabelText(s, s.awb_number ? `AWB ${s.awb_number}` : '—')

/** "ts42", "TS-0042", "0042/26", "42" — worth asking the server, not just the loaded page. */
const looksLikeOfferNumber = (q: string): boolean => /^(ts[-\s]?)?\d{1,4}(\/\d{0,2})?$/i.test(q.trim())

/** Normalises what was typed to the stored shape's searchable core ("ts42" → "0042"). */
function offerNumberQuery(q: string): string {
  const m = q.trim().match(/^(?:ts[-\s]?)?(\d{1,4})(\/\d{0,2})?$/i)
  if (!m) return q.trim()
  return `${m[1].padStart(4, '0')}${m[2] ?? ''}`
}

const SUB_TYPE_LABEL: Record<string, string> = {
  pss: 'PSS',
  ss: 'Shipment',
  stocklot: 'Stocklot',
  type: 'Type',
  specialty: 'Specialty',
}

function recipientSummary(rows: Array<{ status: RecipientStatus }> = []) {
  const counts: Record<RecipientStatus, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
    no_response: 0,
  }
  rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1 })
  return counts
}

export default function OtherSamplesPage() {
  const { openIntakeDialog } = useSampleIntake()
  const [samples, setSamples] = useState<OtherSample[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [subTypeFilter, setSubTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  // Offers found by number on the server (older than the loaded page).
  const [numberHits, setNumberHits] = useState<OtherSample[]>([])

  const loadSamples = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ sample_category: 'other', limit: '200' })
      if (subTypeFilter !== 'all') params.set('sample_type', subTypeFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const resp = await fetch(`/api/samples?${params.toString()}`)
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to load samples')
      setSamples(data.samples || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSamples()
  }, [subTypeFilter, statusFilter])

  // Typing a TS- number also asks the server, so a type or stocklot sample
  // sent months ago is found even when it is past the loaded 200.
  useEffect(() => {
    if (!looksLikeOfferNumber(search)) {
      setNumberHits([])
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          sample_category: 'other',
          offer_number: offerNumberQuery(search),
          limit: '50',
        })
        const resp = await fetch(`/api/samples?${params.toString()}`)
        const data = await resp.json()
        if (!cancelled && resp.ok) setNumberHits(data.samples || [])
      } catch {
        if (!cancelled) setNumberHits([])
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [search])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return samples
    const numberNeedle = looksLikeOfferNumber(search) ? offerNumberQuery(search).toLowerCase() : null
    const local = samples.filter(s =>
      (numberNeedle != null && (s.offer_number || '').toLowerCase().includes(numberNeedle)) ||
      otherSampleReference(s).toLowerCase().includes(needle) ||
      (s.quality_description || '').toLowerCase().includes(needle) ||
      (s.origin || '').toLowerCase().includes(needle) ||
      (s.quality_name || '').toLowerCase().includes(needle) ||
      (s.seller_name || '').toLowerCase().includes(needle) ||
      (s.awb_number || '').toLowerCase().includes(needle)
    )
    const seen = new Set(local.map(s => s.id))
    return [...local, ...numberHits.filter(s => !seen.has(s.id))]
  }, [samples, search, numberHits])

  const openSample = (id: string) => {
    setSelectedId(id)
    setModalOpen(true)
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Other Samples</h1>
            <p className="text-sm text-muted-foreground mt-1">
              PSS, Shipment, Stocklot, and Type Samples forwarded to clients for their approval.
            </p>
          </div>
          <Button onClick={openIntakeDialog}>
            <Plus className="h-4 w-4 mr-2" />
            New Sample
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search TS- number, reference, AWB, seller, quality..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={subTypeFilter} onValueChange={setSubTypeFilter}>
                <SelectTrigger><SelectValue placeholder="All sub-types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sub-types</SelectItem>
                  <SelectItem value="pss">PSS</SelectItem>
                  <SelectItem value="ss">Shipment Sample</SelectItem>
                  <SelectItem value="stocklot">Stocklot</SelectItem>
                  <SelectItem value="type">Type Sample</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="under_review">Under review</SelectItem>
                  <SelectItem value="sent_to_clients">Sent to clients</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Sub-type</th>
                    <th className="px-4 py-3 font-medium">Origin · Quality</th>
                    <th className="px-4 py-3 font-medium">Seller</th>
                    <th className="px-4 py-3 font-medium">Buyer</th>
                    <th className="px-4 py-3 font-medium">AWB</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Recipients</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                  )}
                  {!loading && error && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-destructive">{error}</td></tr>
                  )}
                  {!loading && !error && visible.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      No Other Samples yet. Use &ldquo;New Sample&rdquo; and pick the &ldquo;Other Sample&rdquo; toggle on step 1.
                    </td></tr>
                  )}
                  {!loading && !error && visible.map(s => {
                    const counts = recipientSummary(s.sample_recipients)
                    return (
                      <tr
                        key={s.id}
                        onClick={() => openSample(s.id)}
                        className="border-b border-border hover:bg-accent/40 cursor-pointer"
                      >
                        <td className={`px-4 py-3 font-medium ${s.offer_number ? 'font-mono' : ''}`}>
                          {otherSampleReference(s)}
                          {s.is_quick_look && (
                            <Badge variant="secondary" className="ml-2 text-[10px] font-normal">Quick look</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {s.sample_type ? (
                            <Badge variant="outline">{SUB_TYPE_LABEL[s.sample_type] || s.sample_type.toUpperCase()}</Badge>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div>{s.origin || '-'}</div>
                          <div
                            className="max-w-[280px] truncate text-xs text-muted-foreground"
                            title={s.quality_description || s.quality_name || undefined}
                          >
                            {s.quality_name || ''}
                          </div>
                        </td>
                        <td className="px-4 py-3">{s.seller_name || '-'}</td>
                        <td className="px-4 py-3">{s.end_client_name || s.importer_name || '-'}</td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {s.awb_number || '-'}
                          {s.courier_name && (
                            <div className="text-[10px] text-muted-foreground">{s.courier_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className="capitalize">{s.status.replace(/_/g, ' ')}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <Check className="h-3 w-3" />{counts.approved}
                            </span>
                            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                              <X className="h-3 w-3" />{counts.rejected}
                            </span>
                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <Clock className="h-3 w-3" />{counts.pending}
                            </span>
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Minus className="h-3 w-3" />{counts.no_response}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <SampleDetailOverlay
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open)
          if (!open) setSelectedId(null)
        }}
        sampleId={selectedId}
        onSampleUpdated={loadSamples}
        navigation={visible.map((s) => ({ id: s.id, label: [s.seller_name, s.origin].filter(Boolean).join(' · ') || 'Sample' }))}
      />
    </MainLayout>
  )
}
