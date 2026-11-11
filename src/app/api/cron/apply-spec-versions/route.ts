// GET /api/cron/apply-spec-versions
// Daily at 06:00 Sao Paulo (vercel.json). Applies client spec versions whose
// date has come and retries spec-change emails that failed. Vercel Cron calls
// it with `Authorization: Bearer $CRON_SECRET`. See lib/quality-spec/apply-due.ts.
import { NextRequest } from 'next/server'
import { handleApplySpecVersionsCron } from '@/lib/quality-spec/apply-due'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  return handleApplySpecVersionsCron(request)
}
