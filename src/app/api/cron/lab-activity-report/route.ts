// GET /api/cron/lab-activity-report
// The scheduled lab activity digest. Vercel Cron calls it on the schedule in
// vercel.json with `Authorization: Bearer $CRON_SECRET`; it reports on the
// previous complete period of LAB_ACTIVITY_REPORT_CADENCE and emails
// LAB_ACTIVITY_REPORT_TO. See lib/reports/lab-activity-routes.ts.
import { NextRequest } from 'next/server'
import { handleLabActivityCron } from '@/lib/reports/lab-activity-routes'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  return handleLabActivityCron(request)
}
