/**
 * POST /api/reports/pss/send — emails the PSS Report PDF via Graph.
 */
import { NextRequest } from 'next/server'
import { handleReportSend } from '@/lib/reports/report-routes'

const CONFIG = { buckets: ['pss' as const], filenameLabel: 'PSS', reportType: 'pss', subjectLabel: 'PSS Report' }

export async function POST(request: NextRequest) {
  return handleReportSend(request, CONFIG)
}
