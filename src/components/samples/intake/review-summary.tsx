'use client'

import { Button } from '@/components/ui/button'
import { contractDisplayNumber } from '@/lib/contract-family'
import { pssOfficialRef, resolvePssSelection } from '@/lib/pss-picker-option'
import { cn } from '@/lib/utils'
import { contractQuantities, formatFormQuantity } from './quantity-model'
import type { Exporter, FormData, Laboratory } from './types'
import { CONTRACT_STEP, DETAILS_STEP } from './wizard'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SAMPLE_TYPES: Record<string, string> = { pss: 'PSS (pre-shipment)', ss: 'SS (shipment)', type: 'Type sample' }

/** The Step 2 sections an Edit link can land on (their `data-section` markers). */
export type DetailsSection = 'parties' | 'quality' | 'quantity'

type Row = { label: string; value: string | null; note?: string | null; keep?: boolean }

const withRef = (name: string, ref: string | null | undefined) => (ref?.trim() ? `${name} · ${ref.trim()}` : name)

function shipmentLabel(month: string): string | null {
  const [year, m] = (month || '').split('-')
  if (!year || !m) return null
  return `${MONTHS[Number(m) - 1] ?? m} ${year}`
}

/**
 * Everything that will be saved, grouped the way the steps ask for it, each
 * group with an Edit link back to where it is entered. Rows the user must
 * have looked at (sample ref, seller, shipper, quantity) show even when
 * blank; optional ones only when filled.
 */
export function ReviewSummary({
  formData,
  laboratories = [],
  approvedPSSSamples = [],
  exporters = [],
  onEdit,
}: {
  formData: FormData
  laboratories?: Laboratory[]
  approvedPSSSamples?: any[]
  exporters?: Exporter[]
  onEdit: (step: number, section?: DetailsSection) => void
}) {
  const f = formData
  const contract = f.selected_contract
  // The seller and shipper fields hold the legal name; people read the trade name.
  const tradeName = (legal: string) =>
    (exporters as Array<{ name?: string | null; fantasy_name?: string | null }>).find((e) => e.name === legal)?.fantasy_name ||
    (contract?.seller_legal_name === legal ? contract.seller_name : null) ||
    (contract?.shipper_legal_name === legal ? contract.shipper_name : null) ||
    legal
  const pss = f.linked_pss_sample_id ? resolvePssSelection(approvedPSSSamples, f.linked_pss_sample_id)?.sample : null
  const q = contractQuantities(f)
  const lab = laboratories.find((l) => l.id === f.laboratory_id)

  const groups: Array<{ title: string; step: number; section?: DetailsSection; rows: Row[] }> = [
    {
      title: 'Contract',
      step: CONTRACT_STEP,
      rows: [
        { label: 'Sample type', value: SAMPLE_TYPES[f.sample_type] ?? null, keep: true },
        {
          label: 'Linked contract',
          value: contract ? `#${contractDisplayNumber(contract)}` : 'None, entered by hand',
          note: contract ? [contract.seller_name, contract.buyer_name].filter(Boolean).join(' → ') : null,
          keep: true,
        },
        ...(f.sample_type === 'ss'
          ? [{ label: 'Linked PSS', value: pss ? `#${pssOfficialRef(pss) || pss.tracking_number}` : 'None', keep: true }]
          : []),
      ],
    },
    {
      title: 'References and parties',
      step: DETAILS_STEP,
      section: 'parties',
      rows: [
        { label: 'Sample ref.', value: f.exporter_sample_number || null, keep: true },
        { label: 'Seller', value: f.seller ? withRef(tradeName(f.seller), f.seller_contract_nr) : null, keep: true },
        {
          label: 'Shipper',
          value: f.same_seller_shipper
            ? (f.seller ? `${tradeName(f.seller)} (the seller)` : null)
            : (f.shipper ? withRef(tradeName(f.shipper), f.shipper_contract_nr) : null),
          keep: true,
        },
        { label: 'Wolthers contract', value: f.wolthers_contract_nr || null },
        {
          label: 'Importer',
          value: f.importer ? withRef(f.importer, f.importer_contract_nr) : null,
          note: f.importer && f.importer_is_qc_client ? 'Also the QC client' : null,
        },
        { label: 'QC client', value: !f.importer_is_qc_client && f.qc_client ? withRef(f.qc_client, f.qc_client_contract_nr) : null },
        { label: 'Supplier', value: f.supplier ? withRef(f.supplier, f.supplier_contract_nr) : null },
        { label: 'Roaster', value: f.roaster ? withRef(f.roaster, f.roaster_contract_nr) : null },
        { label: 'End client', value: f.end_client ? withRef(f.end_client, f.end_client_contract_nr) : null },
      ],
    },
    {
      title: 'Quality',
      step: DETAILS_STEP,
      section: 'quality',
      rows: [
        { label: 'Quality', value: f.quality_name || null, keep: true },
        { label: 'Laboratory', value: lab?.name ?? null },
        { label: 'Origin', value: f.origin ? [f.origin, f.micro_origin?.split(' | ').filter(Boolean).join(', ')].filter(Boolean).join(' · ') : null, keep: true },
        { label: 'Processing', value: f.processing_method || null },
        { label: 'Certifications', value: f.certifications?.length ? f.certifications.join(', ') : null },
        { label: 'Crop year', value: f.crop_year || null },
      ],
    },
    {
      title: 'Quantity and shipment',
      step: DETAILS_STEP,
      section: 'quantity',
      rows: [
        { label: 'Quantity', value: formatFormQuantity(f), keep: true },
        {
          label: '60 kg equivalent',
          value: q.equivalent_60kg_bags != null ? `${q.equivalent_60kg_bags} bags` : null,
          note: q.bags_quantity_mt != null ? `${Number(q.bags_quantity_mt.toFixed(3))} MT` : null,
        },
        { label: 'Shipment', value: shipmentLabel(f.shipment_month) },
        { label: 'ICO number', value: f.ico_number || null },
        { label: 'Container', value: f.container_nr || null },
      ],
    },
  ]

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title} className="overflow-hidden rounded-lg border bg-card">
          <header className="flex h-11 items-center justify-between gap-2 border-b bg-muted/60 pl-4 pr-2">
            <h4 className="text-sm font-semibold">{group.title}</h4>
            <Button
              type="button"
              variant="ghost"
              className="h-7 px-2.5 text-xs"
              onClick={() => onEdit(group.step, group.section)}
              aria-label={`Edit ${group.title.toLowerCase()}`}
            >
              Edit
            </Button>
          </header>
          <dl className="space-y-1.5 px-4 py-3 text-sm">
            {group.rows.filter((r) => r.keep || r.value).map((r) => (
              <div key={r.label} className="grid grid-cols-[8.5rem_1fr] gap-3" data-summary-row={r.label}>
                <dt className="text-xs leading-5 text-muted-foreground">{r.label}</dt>
                <dd className={cn('min-w-0 break-words', !r.value && 'text-muted-foreground')}>
                  {r.value ?? '—'}
                  {r.note && <span className="text-muted-foreground"> · {r.note}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
