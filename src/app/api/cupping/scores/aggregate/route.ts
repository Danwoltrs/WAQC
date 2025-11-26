import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

interface CupperScore {
  id: string
  cupper_id: string | null
  cupper_name?: string
  scores: Record<string, number>
  defects: any
  created_at: string
}

interface AttributeStats {
  mean: number
  median: number
  stdDev: number
  min: number
  max: number
  values: number[]
  hasDiscrepancy: boolean
  outliers: string[] // Cupper IDs who are outliers
  finalScore: number // Rounded average score (to nearest 0.25)
  range: number // max - min (discrepancy amount)
}

interface AggregatedScores {
  sample_id: string
  sample_tracking_number: string
  total_cuppers: number
  attributes: Record<string, AttributeStats>
  overall_score: {
    mean: number
    median: number
    stdDev: number
  }
  defects: {
    taints: string[]
    faults: string[]
  }
  hasDiscrepancies: boolean
  discrepancy_flags: string[]
}

/**
 * GET /api/cupping/scores/aggregate?sample_id=xxx
 * Aggregate cupping scores from multiple cuppers and detect discrepancies
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sampleId = searchParams.get('sample_id')
    const sessionId = searchParams.get('session_id')

    if (!sampleId && !sessionId) {
      return NextResponse.json(
        { error: 'sample_id or session_id parameter is required' },
        { status: 400 }
      )
    }

    // Build query
    let query = supabase
      .from('cupping_scores')
      .select(`
        id,
        cupper_id,
        scores,
        defects,
        created_at,
        sample:samples!cupping_scores_sample_id_fkey(
          id,
          tracking_number
        ),
        cupper:profiles!cupping_scores_cupper_id_fkey(
          id,
          full_name
        )
      `)

    if (sampleId) {
      query = query.eq('sample_id', sampleId)
    } else if (sessionId) {
      query = query.eq('session_id', sessionId)
    }

    const { data: scores, error: scoresError } = await query

    if (scoresError) {
      console.error('Error fetching cupping scores:', scoresError)
      return NextResponse.json(
        { error: 'Failed to fetch cupping scores', details: scoresError.message },
        { status: 500 }
      )
    }

    if (!scores || scores.length === 0) {
      return NextResponse.json(
        { error: 'No cupping scores found for this sample' },
        { status: 404 }
      )
    }

    console.log(`Aggregating ${scores.length} cupping scores for sample ${sampleId || sessionId}`)

    // Extract all unique attributes across all cuppers
    const allAttributes = new Set<string>()
    scores.forEach((score: any) => {
      Object.keys(score.scores || {}).forEach((attr) => allAttributes.add(attr))
    })

    // Calculate statistics for each attribute
    const attributeStats: Record<string, AttributeStats> = {}
    const discrepancyFlags: string[] = []

    for (const attribute of allAttributes) {
      const values: number[] = []
      const cupperValues: Map<string, number> = new Map()

      scores.forEach((score: any) => {
        const value = score.scores?.[attribute]
        if (value !== undefined && value !== null) {
          values.push(value)
          cupperValues.set(
            score.cupper?.full_name || score.cupper_id || 'Unknown',
            value
          )
        }
      })

      if (values.length === 0) continue

      const stats = calculateStatistics(values)
      const outliers = detectOutliers(cupperValues, stats)
      const range = stats.max - stats.min

      // Round mean to nearest 0.25 increment (standard cupping increment)
      const finalScore = roundToNearestIncrement(stats.mean, 0.25)

      attributeStats[attribute] = {
        ...stats,
        values,
        hasDiscrepancy: outliers.length > 0,
        outliers,
        finalScore,
        range,
      }

      if (outliers.length > 0) {
        discrepancyFlags.push(
          `${attribute}: Discrepancy of ${range.toFixed(2)} points exceeds 0.5 limit (Range: ${stats.min.toFixed(2)} - ${stats.max.toFixed(2)})`
        )
      }
    }

    // Calculate overall score (average of all attribute means)
    const overallMeans = Object.values(attributeStats).map((stats) => stats.mean)
    const overallStats = calculateStatistics(overallMeans)

    // Aggregate defects and check for discrepancies
    const allTaints = new Set<string>()
    const allFaults = new Set<string>()
    const cupperDefects: Map<string, { taints: Set<string>; faults: Set<string> }> = new Map()

    scores.forEach((score: any) => {
      const cupperName = score.cupper?.full_name || score.cupper_id || 'Unknown'
      const defects = score.defects || {}

      // Track defects per cupper
      if (!cupperDefects.has(cupperName)) {
        cupperDefects.set(cupperName, { taints: new Set(), faults: new Set() })
      }
      const cupperDefectSet = cupperDefects.get(cupperName)!

      if (defects.taints) {
        defects.taints.forEach((taint: string) => {
          allTaints.add(taint)
          cupperDefectSet.taints.add(taint)
        })
      }
      if (defects.faults) {
        defects.faults.forEach((fault: string) => {
          allFaults.add(fault)
          cupperDefectSet.faults.add(fault)
        })
      }
    })

    // Check for defect discrepancies (when cuppers disagree on defects)
    if (cupperDefects.size > 1) {
      // Check if all cuppers identified the same defects
      const allCupperTaints = Array.from(cupperDefects.values()).map(d => d.taints)
      const allCupperFaults = Array.from(cupperDefects.values()).map(d => d.faults)

      // Check taint discrepancies
      allTaints.forEach((taint) => {
        const cuppersWithTaint = Array.from(cupperDefects.entries())
          .filter(([_, defects]) => defects.taints.has(taint))
          .map(([cupper, _]) => cupper)

        if (cuppersWithTaint.length > 0 && cuppersWithTaint.length < cupperDefects.size) {
          discrepancyFlags.push(
            `Defect (Taint) "${taint}": Only identified by ${cuppersWithTaint.join(', ')} (${cuppersWithTaint.length}/${cupperDefects.size} cuppers)`
          )
        }
      })

      // Check fault discrepancies
      allFaults.forEach((fault) => {
        const cuppersWithFault = Array.from(cupperDefects.entries())
          .filter(([_, defects]) => defects.faults.has(fault))
          .map(([cupper, _]) => cupper)

        if (cuppersWithFault.length > 0 && cuppersWithFault.length < cupperDefects.size) {
          discrepancyFlags.push(
            `Defect (Fault) "${fault}": Only identified by ${cuppersWithFault.join(', ')} (${cuppersWithFault.length}/${cupperDefects.size} cuppers)`
          )
        }
      })
    }

    // Build aggregated result
    const aggregated: AggregatedScores = {
      sample_id: sampleId || scores[0].sample?.id || '',
      sample_tracking_number: scores[0].sample?.tracking_number || 'Unknown',
      total_cuppers: scores.length,
      attributes: attributeStats,
      overall_score: overallStats,
      defects: {
        taints: Array.from(allTaints),
        faults: Array.from(allFaults),
      },
      hasDiscrepancies: discrepancyFlags.length > 0,
      discrepancy_flags: discrepancyFlags,
    }

    // Check for minimum cupper requirement (at least 2 cuppers)
    if (scores.length < 2) {
      aggregated.discrepancy_flags.push(
        'Warning: Only 1 cupper scored this sample. Minimum 2 cuppers recommended.'
      )
    }

    return NextResponse.json({
      success: true,
      aggregated,
      individual_scores: scores.map((score: any) => ({
        cupper_id: score.cupper_id,
        cupper_name: score.cupper?.full_name || 'Unknown',
        scores: score.scores,
        defects: score.defects,
        created_at: score.created_at,
      })),
    })
  } catch (error: any) {
    console.error('Error aggregating cupping scores:', error)
    return NextResponse.json(
      {
        error: 'Failed to aggregate cupping scores',
        details: error.message || String(error),
      },
      { status: 500 }
    )
  }
}

/**
 * Calculate statistical measures for a set of values
 */
function calculateStatistics(values: number[]): {
  mean: number
  median: number
  stdDev: number
  min: number
  max: number
} {
  if (values.length === 0) {
    return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 }
  }

  // Calculate mean
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length

  // Calculate median
  const sorted = [...values].sort((a, b) => a - b)
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)]

  // Calculate standard deviation
  const variance =
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
  const stdDev = Math.sqrt(variance)

  // Min and max
  const min = Math.min(...values)
  const max = Math.max(...values)

  return { mean, median, stdDev, min, max }
}

/**
 * Detect inter-cupper discrepancies using 0.5 point threshold
 * If the difference between any two cuppers exceeds 0.5 points, flag as discrepancy
 */
function detectOutliers(
  cupperValues: Map<string, number>,
  stats: { mean: number; stdDev: number; min: number; max: number }
): string[] {
  const outliers: string[] = []

  // Calculate the range (max - min) between cuppers
  const range = stats.max - stats.min

  // REQUIREMENT: Maximum 0.5 point difference allowed between any two cuppers
  const MAX_ALLOWED_DISCREPANCY = 0.5

  if (range > MAX_ALLOWED_DISCREPANCY) {
    // Flag ALL cuppers when discrepancy exceeds threshold
    // This forces cuppers to discuss and reach consensus
    cupperValues.forEach((value, cupper) => {
      outliers.push(cupper)
    })
  }

  return outliers
}

/**
 * Round a number to the nearest increment
 * @param value - The value to round
 * @param increment - The rounding increment (e.g., 0.25 for quarter points)
 * @returns Rounded value
 */
function roundToNearestIncrement(value: number, increment: number): number {
  return Math.round(value / increment) * increment
}
