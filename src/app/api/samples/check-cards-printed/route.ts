import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/samples/check-cards-printed
 *
 * Checks if any samples have cupping cards printed.
 * Used by the dashboard to enable/disable the "Scan Cupping Cards" button.
 *
 * Returns:
 * - hasCardsPrinted: boolean - Whether any samples have cards_printed_at set
 * - count: number - Number of samples with printed cards
 */
export async function GET() {
  try {
    const supabase = await createClient()

    // Query samples table for any row where cards_printed_at IS NOT NULL
    const { data, error, count } = await supabase
      .from('samples')
      .select('id', { count: 'exact', head: false })
      .not('cards_printed_at', 'is', null)
      .limit(1) // We only need to know if at least one exists

    if (error) {
      console.error('Error checking for printed cards:', error)
      return NextResponse.json(
        { error: 'Failed to check printed cards status' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      hasCardsPrinted: (count ?? 0) > 0,
      count: count ?? 0
    })
  } catch (error) {
    console.error('Error in check-cards-printed endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
