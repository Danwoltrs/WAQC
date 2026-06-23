// src/lib/portal/portal-samples.ts
import { trackingNumberToSlug } from '@/lib/utils'

export interface PortalSampleRow {
  id: string
  trackingNumber: string
  origin: string | null
  quality: string | null
  sampleType: string | null
  stage: string | null
  status: string | null
  certificateUrl: string | null
}

export function mapSampleRow(row: any): PortalSampleRow {
  const certified = row.workflow_stage === 'certified' || row.workflow_stage === 'rejected'
  return {
    id: row.id,
    trackingNumber: row.tracking_number,
    origin: row.origin ?? null,
    quality: row.quality_name ?? null,
    sampleType: row.sample_type ?? null,
    stage: row.workflow_stage ?? null,
    status: row.status ?? null,
    certificateUrl: certified && row.tracking_number ? `/api/portal/certificate/${trackingNumberToSlug(row.tracking_number)}/pdf` : null,
  }
}
