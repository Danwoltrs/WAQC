// GET /api/reports/lab-activity?start_date&end_date&breakdown
// The per-lab activity digest as JSON (internal staff). See lib/reports/lab-activity-routes.ts.
import { NextRequest } from 'next/server'
import { handleLabActivityGet } from '@/lib/reports/lab-activity-routes'

export async function GET(request: NextRequest) {
  return handleLabActivityGet(request)
}
