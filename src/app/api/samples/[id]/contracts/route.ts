import { NextResponse } from 'next/server'

/**
 * /api/samples/[id]/contracts — retired 2026-08-28.
 *
 * A sub-contract is a `samples` row of its own now (one sample per contract,
 * see src/lib/sample-group.ts), so there is nothing here to list, create,
 * edit or delete. Kept as a 410 rather than deleted so a stale tab or an
 * old build gets a pointer instead of a 404 it would read as "no contracts".
 */
const gone = () =>
  NextResponse.json(
    { error: 'Sub-contracts are samples now. Use POST /api/samples/[id]/siblings or PATCH /api/samples/[sibling id].' },
    { status: 410 },
  )

export const GET = gone
export const POST = gone
export const PATCH = gone
export const DELETE = gone
