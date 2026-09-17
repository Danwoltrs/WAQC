// POST /api/reports/lab-activity/send { start_date, end_date, breakdown?, to? }
// Emails the digest now (internal staff). See lib/reports/lab-activity-routes.ts.
import { NextRequest } from 'next/server'
import { handleLabActivitySend } from '@/lib/reports/lab-activity-routes'

export async function POST(request: NextRequest) {
  return handleLabActivitySend(request)
}
