/**
 * GET /api/reports/weekly-ss?client_id=...&start_date=...&end_date=...
 * Streams the SS Report PDF (SS bucket of the unified performance engine).
 * URL kept for backwards compatibility with saved links.
 */
import { NextRequest } from 'next/server'
import { handleReportGet } from '@/lib/reports/report-routes'

const CONFIG = { buckets: ['ss' as const], filenameLabel: 'SS', reportType: 'weekly_ss', subjectLabel: 'SS Report' }

export async function GET(request: NextRequest) {
  return handleReportGet(request, CONFIG)
}
