// Row types and small pure helpers of the QC samples list
// (src/app/samples/qc/page.tsx) and its presentational pieces in this folder.

import type { GuestCupper } from '@/lib/cupping/roster'

// One contract sibling of a listed lab unit, as GET /api/samples emits
// `sub_contracts`. `id` is the sibling's OWN sample id: it opens, prints and
// deletes as a sample. Every field is the sibling's own — the buy side has no
// fallback to the lab unit, and the quantity is the contract's whole lot.
export interface SiblingRow {
  id: string; tracking_number: string; contract_ordinal: number | null
  importer_name: string | null; roaster_name: string | null; end_client_name: string | null; qc_client_name: string | null
  client_id: string | null; importer_is_qc_client: boolean | null
  buyer_contract_nr: string | null; wolthers_contract_nr: string | null; roaster_contract_nr: string | null
  end_client_contract_nr: string | null; qc_client_contract_nr: string | null; supplier_contract_nr: string | null; seller_contract_nr?: string | null
  ico_number: string | null; container_nr: string | null; exporter_sample_number: string | null
  bag_count: number | null; bag_weight_kg: number | null; bag_type: string | null; bags_quantity_mt: number | null
  equivalent_60kg_bags: number | null; container_count: number | null; shipment_month: string | null
  has_certificate: boolean; certificate_id: string | null; certificate_number: string | null
  status: string | null; workflow_stage: string | null
  deleted_at?: string | null; deleted_reason?: string | null; deleted_by_name?: string | null
}

export interface Sample {
  id: string
  tracking_number: string
  client_id?: string
  supplier?: string
  seller_name?: string
  seller_country?: string
  exporter_name?: string
  exporter_country?: string
  origin?: string
  importer_name?: string
  importer_country?: string
  roaster_name?: string
  roaster_country?: string
  end_client_name?: string
  end_client_country?: string
  qc_client_name?: string
  qc_client_country?: string
  importer_is_qc_client?: boolean
  same_seller_shipper?: boolean
  buyer?: string
  quality_name?: string
  sample_type?: 'pss' | 'ss' | 'type'
  status: string
  workflow_stage?: string
  cards_printed_at?: string | null
  storage_position?: string
  bags_quantity_mt?: number
  wolthers_contract_nr?: string
  seller_contract_nr?: string
  exporter_contract_nr?: string
  buyer_contract_nr?: string
  roaster_contract_nr?: string
  shipper_contract_nr?: string
  qc_client_contract_nr?: string
  end_client_contract_nr?: string
  supplier_contract_nr?: string
  ico_number?: string
  container_nr?: string
  exporter_sample_number?: string | null
  bag_count?: number
  bag_weight_kg?: number
  bag_type?: string
  shipment_month?: string
  laboratory_id?: string
  created_at: string
  quality_spec_id?: string
  // NULL = cupped and graded here (a lab unit). Top-level rows are always lab
  // units; the guards below still honour a sibling that arrives another way.
  lab_source_sample_id?: string | null
  contract_ordinal?: number | null
  container_count?: number | null
  // Deletion — present only on the admin "Show deleted" view
  deleted_at?: string | null
  deleted_reason?: string | null
  deleted_by_name?: string | null
  // Certificate info (flattened from API)
  certificate_id?: string | null
  certificate_number?: string | null
  certificate_status?: string | null
  certificate_created_at?: string | null
  // Relations that might be loaded for print dialog
  client?: {
    id: string
    company: string
  }
  laboratory?: {
    id: string
    name: string
    code: string
  }
  quality_spec?: {
    id: string
    template_id?: string
    custom_parameters?: any
    template?: {
      id: string
      name: string
      parameters?: any
    }
  }
  // Contract siblings of this lab unit (rendered as its child rows)
  contract_count?: number
  sub_contract_tracking_numbers?: string[]
  sub_contracts?: SiblingRow[]
}

// What the certificate preview and download need of a row; a lab unit and a
// contract sibling both satisfy it, each being a sample with its own certificate.
export type CertificateTarget = Pick<Sample, 'id' | 'tracking_number'> & { certificate_number?: string | null; buyer_contract_nr?: string | null }

// A cupper as the assignment endpoints return it.
export interface AssignedCupper {
  id: string
  full_name: string
  email: string
}

// One sample's entry in the page's per-sample cupper assignment map.
export interface SampleCupperAssignment {
  cuppers: AssignedCupper[]
  session_id: string
  guests?: GuestCupper[]
}

// Helper function to format sample type for display
export const formatSampleType = (type: string | undefined): string => {
  if (!type) return '-'
  const typeMap: Record<string, string> = {
    'pss': 'PSS',
    'ss': 'SS',
    'stocklot': 'Stocklot',
    'offer': 'Offer',
    'spot': 'Spot'
  }
  return typeMap[type] || type.toUpperCase()
}

// The table's header row pins directly below the filter bar. Its offset is
// measured rather than hard-coded, because the bar wraps to a second line on a
// narrow window. The background must be opaque or rows scroll through it, and
// the separator is an inset shadow because a collapsed-border bottom is dropped
// once a cell is sticky.
export const TABLE_HEAD_STICKY =
  'sticky z-[5] bg-muted shadow-[inset_0_-1px_0_hsl(var(--border))]'
/** The Created column: a 12 px calendar icon, a 6 px gap and a dd/mm/yyyy date
 *  at 12 px inside 24 px of padding need ~106 px; at 96 the date ran under the
 *  row's action buttons. */
export const CREATED_COLUMN_WIDTH = 112

export const TABLE_HEAD_CELL =
  `${TABLE_HEAD_STICKY} text-left py-2.5 px-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground`

// The select box and the QR box beside it: one box style and one cell
// alignment for both, header and rows. `block` takes the box off the text
// baseline, which moves with what is inside the box (a ticked box holds its
// check icon, an empty one nothing): inline, a ticked box rode a few px above
// an empty one. Same as the certificates list.
export const LIST_BOX = 'block h-3.5 w-3.5 rounded-[3px]'
export const LIST_BOX_CELL = 'py-2 align-middle'

// Used until the bar has been measured: pt-3 + a 36px control row + pb-3.
export const DEFAULT_HEADER_HEIGHT = 64

// "Wolthers" became "W&A REF" — same column key, just the chip label changed.
export const COLUMN_LABELS: Record<string, string> = {
  reference: 'Reference',
  wolthers: 'W&A REF',
  type: 'Type',
  quality: 'Quality',
  seller: 'Seller',
  shipper: 'Shipper',
  importer: 'Importer',
  roaster: 'Roaster',
  endClient: 'End Client',
  status: 'Status',
  origin: 'Origin',
  storage: 'Storage',
  created: 'Created',
}
