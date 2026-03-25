import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Admin client to bypass RLS for session lookups
const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

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
  finalScore: number // Master cupper's score or rounded mean (to nearest increment)
  range: number // max - min (discrepancy amount)
  increment: number // The quality spec increment for this attribute
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

    // Find the active cupping session to know which cuppers are currently assigned
    // This prevents old scores from removed cuppers from causing false discrepancies
    let activeSessionCupperIds: string[] | null = null

    let masterCupperId: string | null = null

    if (sampleId) {
      const { data: activeSession } = await supabaseAdmin
        .from('cupping_sessions')
        .select('id, cupper_ids, master_cupper_id')
        .contains('sample_ids', [sampleId])
        .in('status', ['active', 'review', 'completed', 'finalized'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (activeSession?.cupper_ids) {
        activeSessionCupperIds = activeSession.cupper_ids as string[]
      }
      if (activeSession?.master_cupper_id) {
        masterCupperId = activeSession.master_cupper_id
      }
    }

    // Fetch quality spec increments per attribute for proper rounding
    const attributeIncrements: Record<string, number> = {}
    let defaultIncrement = 0.25
    if (sampleId) {
      const { data: sampleSpec } = await supabaseAdmin
        .from('samples')
        .select('quality_spec_id')
        .eq('id', sampleId)
        .single()

      if (sampleSpec?.quality_spec_id) {
        const { data: specData } = await supabaseAdmin
          .from('client_qualities')
          .select('custom_parameters, template:quality_templates(parameters)')
          .eq('id', sampleSpec.quality_spec_id)
          .single()

        if (specData) {
          const params = (specData as any).custom_parameters || (specData.template as any)?.parameters
          if (params?.cupping_attributes && Array.isArray(params.cupping_attributes)) {
            for (const attr of params.cupping_attributes) {
              if (attr.attribute && attr.scale?.type === 'numeric' && attr.scale?.increment) {
                attributeIncrements[attr.attribute] = attr.scale.increment
              }
            }
          }
        }
      }
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

    const { data: allScores, error: scoresError } = await query

    if (scoresError) {
      console.error('Error fetching cupping scores:', scoresError)
      return NextResponse.json(
        { error: 'Failed to fetch cupping scores', details: scoresError.message },
        { status: 500 }
      )
    }

    if (!allScores || allScores.length === 0) {
      return NextResponse.json(
        { error: 'No cupping scores found for this sample' },
        { status: 404 }
      )
    }

    // Filter scores to only include currently assigned cuppers
    // This prevents old scores from removed cuppers from causing false discrepancies
    // Keep scores with null cupper_id (OCR scores) as they are always relevant
    const scores = activeSessionCupperIds
      ? allScores.filter((s: any) =>
          s.cupper_id === null || activeSessionCupperIds!.includes(s.cupper_id)
        )
      : allScores

    if (scores.length === 0) {
      return NextResponse.json(
        { error: 'No cupping scores found for currently assigned cuppers' },
        { status: 404 }
      )
    }

    console.log(`Aggregating ${scores.length} cupping scores for sample ${sampleId || sessionId} (filtered from ${allScores.length} total)`)

    // Extract all unique attributes across all cuppers
    // Filter out boolean attributes (Clean Cup, Uniform Cup) - these are never scored numerically
    const BOOLEAN_ATTRIBUTES = ['clean cup', 'cleancup', 'clean_cup', 'uniform cup', 'uniformcup', 'uniform_cup', 'uniformity']
    const allAttributes = new Set<string>()
    scores.forEach((score: any) => {
      Object.keys(score.scores || {}).forEach((attr) => {
        if (!BOOLEAN_ATTRIBUTES.includes(attr.toLowerCase())) {
          allAttributes.add(attr)
        }
      })
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

      // Look up the quality spec increment for this attribute (case-insensitive)
      let increment = defaultIncrement
      const lowerAttr = attribute.toLowerCase()
      for (const [key, inc] of Object.entries(attributeIncrements)) {
        if (key.toLowerCase() === lowerAttr) {
          increment = inc
          break
        }
      }

      // If a master cupper is designated, use their score as the initial final score
      // The master cupper will confirm/adjust on the validation screen
      // Otherwise use the rounded mean as a starting point for the master cupper
      let finalScore: number
      if (masterCupperId) {
        const masterScore = scores.find((s: any) => s.cupper_id === masterCupperId)
        const masterScores = masterScore?.scores as Record<string, number> | undefined
        const masterValue = masterScores?.[attribute]
        finalScore = (masterValue !== undefined && masterValue !== null)
          ? roundToNearestIncrement(masterValue, increment)
          : roundToNearestIncrement(stats.mean, increment)
      } else {
        finalScore = roundToNearestIncrement(stats.mean, increment)
      }

      attributeStats[attribute] = {
        ...stats,
        values,
        hasDiscrepancy: outliers.length > 0,
        outliers,
        finalScore,
        range,
        increment,
      }

      if (outliers.length > 0) {
        discrepancyFlags.push(
          `${attribute}: Discrepancy of ${range.toFixed(2)} points exceeds 0.5 limit (Range: ${stats.min.toFixed(2)} - ${stats.max.toFixed(2)})`
        )
      }
    }

    // Calculate overall score
    // If master cupper is designated, use sum of their final scores
    // Otherwise use average of attribute means
    const overallFinalScores = Object.values(attributeStats).map((stats) => stats.finalScore)
    const overallMeans = Object.values(attributeStats).map((stats) => stats.mean)
    const overallStats = masterCupperId
      ? calculateStatistics(overallFinalScores)
      : calculateStatistics(overallMeans)

    // Aggregate defects and check for discrepancies
    const allTaints = new Set<string>()
    const allFaults = new Set<string>()
    const cupperDefects: Map<string, { taints: Set<string>; faults: Set<string> }> = new Map()

    // Track defect levels per cupper for level discrepancy detection
    // Structure: Map<defectName, Map<cupperName, level>>
    const taintLevels: Map<string, Map<string, number>> = new Map()
    const faultLevels: Map<string, Map<string, number>> = new Map()

    // Track cups_affected per cupper per defect for MAX consolidation (Task 2)
    // Structure: Map<defectName, Map<cupperName, cups_affected>>
    const taintCups: Map<string, Map<string, number>> = new Map()
    const faultCups: Map<string, Map<string, number>> = new Map()

    // Master cupper override: when a master cupper is designated, their defects are authoritative.
    // If the master cupper removed a taint/fault (i.e. it's not in their defects), it must NOT
    // appear in the final result — even if other cuppers reported it.
    let masterCupperDefectNames: { taints: Set<string>; faults: Set<string> } | null = null
    if (masterCupperId) {
      const masterScore = scores.find((s: any) => s.cupper_id === masterCupperId)
      if (masterScore) {
        masterCupperDefectNames = { taints: new Set(), faults: new Set() }
        const defects = (masterScore.defects || {}) as { taints?: any[]; faults?: any[] }
        if (Array.isArray(defects.taints)) {
          for (const t of defects.taints) {
            const name = typeof t === 'string' ? t : t?.name || t?.defect_name
            if (name && name !== '[object Object]' && name !== 'undefined') {
              masterCupperDefectNames.taints.add(name)
            }
          }
        }
        if (Array.isArray(defects.faults)) {
          for (const f of defects.faults) {
            const name = typeof f === 'string' ? f : f?.name || f?.defect_name
            if (name && name !== '[object Object]' && name !== 'undefined') {
              masterCupperDefectNames.faults.add(name)
            }
          }
        }
      }
    }

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

          let taintCupsAffected = 0

          if (typeof taint === 'string') {
            taintName = taint
          } else if (taint && typeof taint === 'object') {
            // It's an object - extract name property
            taintName = taint.name || taint.defect_name || String(taint)
            taintIntensity = taint.intensity || taint.level || 0
            taintCupsAffected = taint.cups_affected || 0
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

            // Track cups_affected per cupper (for MAX consolidation)
            if (taintCupsAffected > 0) {
              if (!taintCups.has(taintName)) {
                taintCups.set(taintName, new Map())
              }
              taintCups.get(taintName)!.set(cupperName, taintCupsAffected)
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
          let faultCupsAffected = 0

          if (typeof fault === 'string') {
            faultName = fault
          } else if (fault && typeof fault === 'object') {
            // It's an object - extract name property
            faultName = fault.name || fault.defect_name || String(fault)
            faultIntensity = fault.intensity || fault.level || 0
            faultCupsAffected = fault.cups_affected || 0
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

            // Track cups_affected per cupper (for MAX consolidation)
            if (faultCupsAffected > 0) {
              if (!faultCups.has(faultName)) {
                faultCups.set(faultName, new Map())
              }
              faultCups.get(faultName)!.set(cupperName, faultCupsAffected)
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

    // NOTE: No automatic defect filtering here — the aggregate API returns ALL defects
    // from all cuppers. The validation modal UI handles resolution mode (Master / All Cuppers)
    // and saves the final decision to the master cupper's cupping_scores.defects record.
    // Downstream consumers (certificate, compliance, finalize) read the master cupper's
    // defects as authoritative.

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

    // Build consolidated defect data using MAX logic (Task 2)
    // The number of defective cups = MAX cups reported by any single cupper for that defect
    const consolidatedDefects: Array<{
      name: string
      type: 'taint' | 'fault'
      consolidated_cups: number // MAX across cuppers
      consolidated_intensity: number // MAX across cuppers
      per_cupper: Record<string, { cups: number; intensity: number }>
    }> = []

    // Consolidate taints
    allTaints.forEach(taintName => {
      const perCupper: Record<string, { cups: number; intensity: number }> = {}
      const cupsMap = taintCups.get(taintName) || new Map()
      const levelsMap = taintLevels.get(taintName) || new Map()

      // Collect per-cupper data
      const allCupperNames = new Set([...cupsMap.keys(), ...levelsMap.keys()])
      // Also add cuppers who reported the defect but with no numeric data
      cupperDefects.forEach((defects, cupperName) => {
        if (defects.taints.has(taintName)) allCupperNames.add(cupperName)
      })

      allCupperNames.forEach(cupperName => {
        perCupper[cupperName] = {
          cups: cupsMap.get(cupperName) || 1, // Default: at least 1 cup if reported
          intensity: levelsMap.get(cupperName) || 0,
        }
      })

      const allCups = Object.values(perCupper).map(d => d.cups)
      const allIntensities = Object.values(perCupper).map(d => d.intensity).filter(i => i > 0)

      consolidatedDefects.push({
        name: taintName,
        type: 'taint',
        consolidated_cups: allCups.length > 0 ? Math.max(...allCups) : 1,
        consolidated_intensity: allIntensities.length > 0 ? Math.max(...allIntensities) : 0,
        per_cupper: perCupper,
      })
    })

    // Consolidate faults
    allFaults.forEach(faultName => {
      const perCupper: Record<string, { cups: number; intensity: number }> = {}
      const cupsMap = faultCups.get(faultName) || new Map()
      const levelsMap = faultLevels.get(faultName) || new Map()

      const allCupperNames = new Set([...cupsMap.keys(), ...levelsMap.keys()])
      cupperDefects.forEach((defects, cupperName) => {
        if (defects.faults.has(faultName)) allCupperNames.add(cupperName)
      })

      allCupperNames.forEach(cupperName => {
        perCupper[cupperName] = {
          cups: cupsMap.get(cupperName) || 1,
          intensity: levelsMap.get(cupperName) || 0,
        }
      })

      const allCups = Object.values(perCupper).map(d => d.cups)
      const allIntensities = Object.values(perCupper).map(d => d.intensity).filter(i => i > 0)

      consolidatedDefects.push({
        name: faultName,
        type: 'fault',
        consolidated_cups: allCups.length > 0 ? Math.max(...allCups) : 1,
        consolidated_intensity: allIntensities.length > 0 ? Math.max(...allIntensities) : 0,
        per_cupper: perCupper,
      })
    })

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

    // Only warn about single cupper if the session was intended for multiple cuppers
    // When only 1 cupper is assigned, this is intentional and should not show a warning
    const isSingleCupperSession = activeSessionCupperIds !== null && activeSessionCupperIds.length === 1
    if (scores.length < 2 && !isSingleCupperSession) {
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
          is_master_cupper: masterCupperId ? score.cupper_id === masterCupperId : false,
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
      consolidated_defects: consolidatedDefects,
      can_see_all_scores: canSeeAllScores,
      master_cupper_id: masterCupperId,
      // Master cupper's defect names for UI toggle (Master vs All Cuppers resolution)
      master_cupper_defect_names: masterCupperDefectNames
        ? {
            taints: Array.from(masterCupperDefectNames.taints),
            faults: Array.from(masterCupperDefectNames.faults),
          }
        : null,
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
