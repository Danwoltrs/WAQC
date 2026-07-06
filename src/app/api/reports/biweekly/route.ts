/**
 * GET /api/reports/biweekly?client_id=...&start_date=...&end_date=...
 * Streams the SS+PSS Report PDF (both buckets of the unified engine).
 * URL kept for backwards compatibility with saved links.
 */
import { NextRequest } from 'next/server'
import { handleReportGet } from '@/lib/reports/report-routes'

const CONFIG = { buckets: ['pss' as const, 'ss' as const], filenameLabel: 'SS-PSS', reportType: 'biweekly', subjectLabel: 'SS+PSS Report' }

export async function GET(request: NextRequest) {
  return handleReportGet(request, CONFIG)
}
