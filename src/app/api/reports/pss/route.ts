/**
 * GET /api/reports/pss?client_id=...&start_date=...&end_date=...
 * Streams the PSS Report PDF (PSS bucket of the unified engine).
 */
import { NextRequest } from 'next/server'
import { handleReportGet } from '@/lib/reports/report-routes'

const CONFIG = { buckets: ['pss' as const], filenameLabel: 'PSS', reportType: 'pss', subjectLabel: 'PSS Report' }

export async function GET(request: NextRequest) {
  return handleReportGet(request, CONFIG)
}
