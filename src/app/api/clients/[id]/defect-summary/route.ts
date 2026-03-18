import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

interface DefectEntry {
  name: string
  count: number
}

interface DefectsData {
  primary?: number
  total_primary?: number
  secondary?: number
  total_secondary?: number
  total?: number
  counts?: Record<string, number>
  defect_list?: DefectEntry[]
}

interface CupDefects {
  taints?: Array<string | { name?: string; intensity?: number; cups_affected?: number }>
  faults?: Array<string | { name?: string; intensity?: number; cups_affected?: number }>
}

/**
 * GET /api/clients/[id]/defect-summary
 * Get aggregated defect data for a client's samples.
 * Optional query param: crop_year - filter by crop year (e.g. "25/26")
 * Returns top 3 grading defects and top cupping defects.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: clientId } = await params
    const { searchParams } = new URL(request.url)
    const cropYear = searchParams.get('crop_year')

    // Fetch quality assessments joined with samples for this client
    let query = supabase
      .from('quality_assessments')
      .select(`
        green_bean_data,
        sample:samples!inner(id, client_id, crop_year)
      `)
      .eq('sample.client_id', clientId)

    if (cropYear) {
      query = query.eq('sample.crop_year', cropYear)
    }

    const { data: assessments, error } = await query

    if (error) {
      console.error('Error fetching defect summary:', error)
      return NextResponse.json({ error: 'Failed to fetch defect summary' }, { status: 500 })
    }

    // Aggregate grading defects from green_bean_data
    const gradingDefectCounts = new Map<string, number>()

    for (const assessment of assessments || []) {
      const greenBean = assessment.green_bean_data as {
        defects?: DefectsData | DefectEntry[]
      } | null

      if (!greenBean?.defects) continue

      const defects = greenBean.defects

      if (Array.isArray(defects)) {
        // Array format: [{ name, count }]
        for (const d of defects) {
          if (d.name && d.count > 0) {
            gradingDefectCounts.set(d.name, (gradingDefectCounts.get(d.name) || 0) + d.count)
          }
        }
      } else if (typeof defects === 'object') {
        const d = defects as DefectsData
        // defect_list format
        if (d.defect_list) {
          for (const entry of d.defect_list) {
            if (entry.name && entry.count > 0) {
              gradingDefectCounts.set(entry.name, (gradingDefectCounts.get(entry.name) || 0) + entry.count)
            }
          }
        }
        // counts format: { "Quakers": 5, "Broken": 3, ... }
        else if (d.counts) {
          for (const [name, count] of Object.entries(d.counts)) {
            if (count > 0) {
              gradingDefectCounts.set(name, (gradingDefectCounts.get(name) || 0) + count)
            }
          }
        }
      }
    }

    // Sort grading defects by count descending, take top 3
    const gradingDefects = Array.from(gradingDefectCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)

    // Fetch cupping defects from cupping_scores joined with samples
    let cuppingQuery = supabase
      .from('cupping_scores')
      .select(`
        defects,
        cup_defects,
        sample:samples!inner(id, client_id, crop_year)
      `)
      .eq('sample.client_id', clientId)

    if (cropYear) {
      cuppingQuery = cuppingQuery.eq('sample.crop_year', cropYear)
    }

    const { data: cuppingScores, error: cuppingError } = await cuppingQuery

    if (cuppingError) {
      console.error('Error fetching cupping defects:', cuppingError)
      // Return grading defects even if cupping fails
      return NextResponse.json({
        grading_defects: gradingDefects,
        cupping_defects: [],
      })
    }

    // Aggregate cupping defects (taints and faults)
    const cuppingDefectCounts = new Map<string, number>()

    for (const score of cuppingScores || []) {
      // Check both defects and cup_defects fields
      const defectSources = [score.defects, score.cup_defects].filter(Boolean)

      for (const source of defectSources) {
        const cupDefects = source as CupDefects
        const allItems = [
          ...(cupDefects.taints || []),
          ...(cupDefects.faults || []),
        ]

        for (const item of allItems) {
          const name = typeof item === 'string' ? item : item.name
          if (name) {
            cuppingDefectCounts.set(name, (cuppingDefectCounts.get(name) || 0) + 1)
          }
        }
      }
    }

    // Sort cupping defects by count descending, take top 3
    const cuppingDefects = Array.from(cuppingDefectCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)

    return NextResponse.json({
      grading_defects: gradingDefects,
      cupping_defects: cuppingDefects,
    })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/defect-summary:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
