import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resolveLabSourceIds } from '@/lib/sample-group'

const PRINTABLE_STAGES = ['certified', 'rejected']

/**
 * POST /api/samples/tin-labels/mark-printed
 * Body: { sample_ids: string[] }
 *
 * Stamps tin_label_printed_at. Called when the operator presses Print, not when
 * the PDF is generated, so previewing a batch does not consume it.
 *
 * The certified/rejected gate is re-applied here rather than trusted from the
 * request body: a crafted call must not be able to mark arbitrary samples as
 * printed and hide them from the next batch.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { sample_ids } = body

    if (!sample_ids || !Array.isArray(sample_ids) || sample_ids.length === 0) {
      return NextResponse.json({ error: 'sample_ids array is required' }, { status: 400 })
    }

    // One tin per physical sample: a contract sibling's id stamps its lab unit.
    const labIds = [...new Set((await resolveLabSourceIds(supabase, sample_ids)).values())]

    const { data, error } = await (supabase as any)
      .from('samples')
      .update({ tin_label_printed_at: new Date().toISOString() })
      .in('id', labIds)
      .in('workflow_stage', PRINTABLE_STAGES)
      .is('deleted_at', null)
      .select('id')

    if (error) {
      console.error('Error marking tin labels printed:', error)
      return NextResponse.json({
        error: 'Failed to mark labels printed',
        details: error.message || String(error),
      }, { status: 500 })
    }

    return NextResponse.json({ marked: (data || []).length })
  } catch (error) {
    console.error('Error in POST /api/samples/tin-labels/mark-printed:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
