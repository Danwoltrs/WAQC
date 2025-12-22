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

interface DefectWithLevel {
  name: string
  level: number
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

interface DefectLevelStats {
  defectName: string
  type: 'taint' | 'fault'
  levels: Map<string, number> // cupper name -> level
  hasDiscrepancy: boolean
  range: number
  outliers: string[]
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
  defect_levels: DefectLevelStats[]
  hasDiscrepancies: boolean
  discrepancy_flags: string[]
}

/**
 * GET /api/cupping/scores/aggregate?sample_id=xxx
 * Aggregate cupping scores from multiple cuppers and detect discrepancies
 *
 * PRIVACY: Individual cupper scores with names are only shown to:
 * - Global admins, master cuppers, lab admins
 * - OR during validation phase (all cuppers have completed)
 * Regular cuppers see anonymized scores until validation phase
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile for permission check
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('id, is_master_cupper, is_global_admin, is_q_grader, qc_role')
      .eq('id', user.id)
      .single()

    const isAdmin = profile?.is_global_admin === true
    const isMasterCupper = profile?.is_master_cupper === true
    const isLabAdmin = ['lab_admin', 'lab_manager'].includes(profile?.qc_role)
    const canSeeAllScores = isAdmin || isMasterCupper || isLabAdmin

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

    // Track defect levels per cupper for level discrepancy detection
    // Structure: Map<defectName, Map<cupperName, level>>
    const taintLevels: Map<string, Map<string, number>> = new Map()
    const faultLevels: Map<string, Map<string, number>> = new Map()

    scores.forEach((score: any) => {
      const cupperName = score.cupper?.full_name || score.cupper_id || 'Unknown'
      const defects = score.defects || {}

      // Track defects per cupper
      if (!cupperDefects.has(cupperName)) {
        cupperDefects.set(cupperName, { taints: new Set(), faults: new Set() })
      }
      const cupperDefectSet = cupperDefects.get(cupperName)!

      // Handle taints (both simple string array and object array with name/intensity)
      if (defects.taints && Array.isArray(defects.taints)) {
        defects.taints.forEach((taint: any) => {
          // Extract name whether it's a string or object - be very defensive
          let taintName: string
          let taintIntensity = 0

          if (typeof taint === 'string') {
            taintName = taint
          } else if (taint && typeof taint === 'object') {
            // It's an object - extract name property
            taintName = taint.name || taint.defect_name || String(taint)
            taintIntensity = taint.intensity || taint.level || 0
          } else {
            // Fallback - convert to string
            taintName = String(taint)
          }

          // Only add valid names (skip [object Object])
          if (taintName && taintName !== '[object Object]' && taintName !== 'undefined') {
            allTaints.add(taintName)
            cupperDefectSet.taints.add(taintName)

            // Track intensity/level per cupper if available
            if (taintIntensity > 0) {
              if (!taintLevels.has(taintName)) {
                taintLevels.set(taintName, new Map())
              }
              taintLevels.get(taintName)!.set(cupperName, taintIntensity)
            }
          }
        })
      }

      // Handle taints with levels (legacy format: { name: 'woody', level: 3 })
      if (defects.taints_with_levels && Array.isArray(defects.taints_with_levels)) {
        defects.taints_with_levels.forEach((taint: DefectWithLevel) => {
          const defectName = taint.name
          allTaints.add(defectName)
          cupperDefectSet.taints.add(defectName)

          // Track level per cupper
          if (!taintLevels.has(defectName)) {
            taintLevels.set(defectName, new Map())
          }
          taintLevels.get(defectName)!.set(cupperName, taint.level || 0)
        })
      }

      // Handle faults (both simple string array and object array with name/intensity)
      if (defects.faults && Array.isArray(defects.faults)) {
        defects.faults.forEach((fault: any) => {
          // Extract name whether it's a string or object - be very defensive
          let faultName: string
          let faultIntensity = 0

          if (typeof fault === 'string') {
            faultName = fault
          } else if (fault && typeof fault === 'object') {
            // It's an object - extract name property
            faultName = fault.name || fault.defect_name || String(fault)
            faultIntensity = fault.intensity || fault.level || 0
          } else {
            // Fallback - convert to string
            faultName = String(fault)
          }

          // Only add valid names (skip [object Object])
          if (faultName && faultName !== '[object Object]' && faultName !== 'undefined') {
            allFaults.add(faultName)
            cupperDefectSet.faults.add(faultName)

            // Track intensity/level per cupper if available
            if (faultIntensity > 0) {
              if (!faultLevels.has(faultName)) {
                faultLevels.set(faultName, new Map())
              }
              faultLevels.get(faultName)!.set(cupperName, faultIntensity)
            }
          }
        })
      }

      // Handle faults with levels (legacy format)
      if (defects.faults_with_levels && Array.isArray(defects.faults_with_levels)) {
        defects.faults_with_levels.forEach((fault: DefectWithLevel) => {
          const defectName = fault.name
          allFaults.add(defectName)
          cupperDefectSet.faults.add(defectName)

          // Track level per cupper
          if (!faultLevels.has(defectName)) {
            faultLevels.set(defectName, new Map())
          }
          faultLevels.get(defectName)!.set(cupperName, fault.level || 0)
        })
      }
    })

    // Check for defect level discrepancies (0.5 threshold same as attributes)
    const defectLevelStats: DefectLevelStats[] = []
    const MAX_LEVEL_DISCREPANCY = 0.5

    // Check taint level discrepancies
    taintLevels.forEach((cupperLevelsMap, defectName) => {
      if (cupperLevelsMap.size > 1) {
        const levels = Array.from(cupperLevelsMap.values())
        const minLevel = Math.min(...levels)
        const maxLevel = Math.max(...levels)
        const range = maxLevel - minLevel

        const hasDiscrepancy = range > MAX_LEVEL_DISCREPANCY
        const outliers = hasDiscrepancy ? Array.from(cupperLevelsMap.keys()) : []

        defectLevelStats.push({
          defectName,
          type: 'taint',
          levels: cupperLevelsMap,
          hasDiscrepancy,
          range,
          outliers
        })

        if (hasDiscrepancy) {
          const levelDetails = Array.from(cupperLevelsMap.entries())
            .map(([cupper, level]) => `${cupper}: ${level}`)
            .join(', ')
          discrepancyFlags.push(
            `Defect Level (Taint) "${defectName}": Discrepancy of ${range.toFixed(1)} exceeds 0.5 limit (${levelDetails})`
          )
        }
      }
    })

    // Check fault level discrepancies
    faultLevels.forEach((cupperLevelsMap, defectName) => {
      if (cupperLevelsMap.size > 1) {
        const levels = Array.from(cupperLevelsMap.values())
        const minLevel = Math.min(...levels)
        const maxLevel = Math.max(...levels)
        const range = maxLevel - minLevel

        const hasDiscrepancy = range > MAX_LEVEL_DISCREPANCY
        const outliers = hasDiscrepancy ? Array.from(cupperLevelsMap.keys()) : []

        defectLevelStats.push({
          defectName,
          type: 'fault',
          levels: cupperLevelsMap,
          hasDiscrepancy,
          range,
          outliers
        })

        if (hasDiscrepancy) {
          const levelDetails = Array.from(cupperLevelsMap.entries())
            .map(([cupper, level]) => `${cupper}: ${level}`)
            .join(', ')
          discrepancyFlags.push(
            `Defect Level (Fault) "${defectName}": Discrepancy of ${range.toFixed(1)} exceeds 0.5 limit (${levelDetails})`
          )
        }
      }
    })

    // Check for defect presence discrepancies (when cuppers disagree on defects)
    if (cupperDefects.size > 1) {
      // Check taint discrepancies
      allTaints.forEach((taintName) => {
        const cuppersWithTaint = Array.from(cupperDefects.entries())
          .filter(([_, defects]) => defects.taints.has(taintName))
          .map(([cupper, _]) => cupper)

        if (cuppersWithTaint.length > 0 && cuppersWithTaint.length < cupperDefects.size) {
          // Include intensity levels if available
          const levelInfo = taintLevels.has(taintName)
            ? ` - Intensity: ${Array.from(taintLevels.get(taintName)!.entries())
                .map(([c, l]) => `${c}: ${l}`)
                .join(', ')}`
            : ''
          discrepancyFlags.push(
            `Defect (Taint) "${taintName}": Only identified by ${cuppersWithTaint.join(', ')} (${cuppersWithTaint.length}/${cupperDefects.size} cuppers)${levelInfo}`
          )
        }
      })

      // Check fault discrepancies
      allFaults.forEach((faultName) => {
        const cuppersWithFault = Array.from(cupperDefects.entries())
          .filter(([_, defects]) => defects.faults.has(faultName))
          .map(([cupper, _]) => cupper)

        if (cuppersWithFault.length > 0 && cuppersWithFault.length < cupperDefects.size) {
          // Include intensity levels if available
          const levelInfo = faultLevels.has(faultName)
            ? ` - Intensity: ${Array.from(faultLevels.get(faultName)!.entries())
                .map(([c, l]) => `${c}: ${l}`)
                .join(', ')}`
            : ''
          discrepancyFlags.push(
            `Defect (Fault) "${faultName}": Only identified by ${cuppersWithFault.join(', ')} (${cuppersWithFault.length}/${cupperDefects.size} cuppers)${levelInfo}`
          )
        }
      })
    }

    // Build aggregated result
    // Convert Map to serializable object for defect_levels
    const serializableDefectLevelStats = defectLevelStats.map(stat => ({
      ...stat,
      levels: Object.fromEntries(stat.levels) // Convert Map to object
    }))

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
      defect_levels: serializableDefectLevelStats as any,
      hasDiscrepancies: discrepancyFlags.length > 0,
      discrepancy_flags: discrepancyFlags,
    }

    // Check for minimum cupper requirement (at least 2 cuppers)
    if (scores.length < 2) {
      aggregated.discrepancy_flags.push(
        'Warning: Only 1 cupper scored this sample. Minimum 2 cuppers recommended.'
      )
    }

    // PRIVACY: Only show individual cupper names/IDs if user has permission
    // Regular cuppers can only see their own score details and anonymized others
    const individualScores = scores.map((score: any, index: number) => {
      const isOwnScore = score.cupper_id === user.id

      if (canSeeAllScores || isOwnScore) {
        // Show full details for admins/master cuppers or own score
        return {
          score_id: score.id,
          cupper_id: score.cupper_id,
          cupper_name: score.cupper?.full_name || 'Unknown',
          scores: score.scores,
          defects: score.defects,
          created_at: score.created_at,
          is_own_score: isOwnScore,
        }
      } else {
        // Anonymize other cuppers' scores for regular users
        return {
          score_id: score.id, // Still include for editing (will be permission-checked in PATCH)
          cupper_id: null, // Hide cupper ID
          cupper_name: `Cupper ${index + 1}`, // Anonymize name
          scores: score.scores, // Still show scores for comparison (this is needed for validation)
          defects: score.defects,
          created_at: score.created_at,
          is_own_score: false,
        }
      }
    })

    return NextResponse.json({
      success: true,
      aggregated,
      individual_scores: individualScores,
      can_see_all_scores: canSeeAllScores,
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
