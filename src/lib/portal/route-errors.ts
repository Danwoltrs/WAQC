import { NextResponse } from 'next/server'

/** A thrown helper answers a parseable JSON 500 instead of an empty error page. */
export function serverError(error: unknown): NextResponse {
  console.error('[portal] route failed:', error)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}
