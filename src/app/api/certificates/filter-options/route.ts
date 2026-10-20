import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { foldFilterOptions, type FilterOptionRow } from '@/lib/certificate-list-query'

/**
 * GET /api/certificates/filter-options
 * Every client and quality that has a live certificate, for the list filters.
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // The generated Database types predate this function (migration 20261019000000).
  const { data, error } = (await (supabase.rpc as unknown as (
    fn: string,
  ) => PromiseLike<{ data: FilterOptionRow[] | null; error: { message: string } | null }>).call(
    supabase,
    'certificate_list_filter_options',
  ))
  if (error) {
    // The database's message stays in the log; the client gets a generic one.
    console.error('certificate_list_filter_options failed:', error)
    return NextResponse.json({ error: 'Failed to load filter options' }, { status: 500 })
  }

  return NextResponse.json(foldFilterOptions(data ?? []))
}
