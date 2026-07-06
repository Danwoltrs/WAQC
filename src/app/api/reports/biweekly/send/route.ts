/**
 * POST /api/reports/biweekly/send — emails the SS+PSS Report PDF via Graph.
 */
import { NextRequest } from 'next/server'
import { handleReportSend } from '@/lib/reports/report-routes'

const CONFIG = { buckets: ['pss' as const, 'ss' as const], filenameLabel: 'SS-PSS', reportType: 'biweekly', subjectLabel: 'SS+PSS Report' }

export async function POST(request: NextRequest) {
  return handleReportSend(request, CONFIG)
}
