/**
 * Cupping Assignment Queries
 * Utilities for querying and counting pending cupping samples assigned to cuppers
 */

import { SupabaseClient } from '@supabase/supabase-js'

export interface PendingSampleCount {
  cupper_id: string
  pending_count: number
  sample_ids: string[]
}

/**
 * Get count of pending samples for a specific cupper
 * Samples are considered pending if:
 * 1. They are in 'analysis' workflow stage
 * 2. The cupper is assigned via cupping_sessions.cupper_ids
 * 3. The cupper has not yet submitted scores for the sample
 *
 * @param supabase - Supabase client instance
 * @param cupperId - Profile ID of the cupper
 * @returns Count of pending samples and their IDs
 */
export async function getPendingSamplesForCupper(
  supabase: SupabaseClient,
  cupperId: string
): Promise<PendingSampleCount> {
  try {
    // Step 1: Find all active cupping sessions where this cupper is assigned
    // Use .filter() with 'cs' for JSONB array contains (avoids incorrect format from .contains())
    const { data: sessions, error: sessionsError } = await supabase
      .from('cupping_sessions')
      .select('id, sample_ids, cupper_ids')
      .eq('status', 'active') // Only active sessions
      .filter('cupper_ids', 'cs', JSON.stringify([cupperId])) // Cupper is in the cupper_ids JSONB array

    if (sessionsError) {
      console.error('Error fetching cupping sessions:', sessionsError)
      return { cupper_id: cupperId, pending_count: 0, sample_ids: [] }
    }

    if (!sessions || sessions.length === 0) {
      return { cupper_id: cupperId, pending_count: 0, sample_ids: [] }
    }

    // Step 2: Extract all sample IDs from sessions
    const sessionSampleIds = sessions.flatMap(session =>
      (session.sample_ids as string[]) || []
    )

    if (sessionSampleIds.length === 0) {
      return { cupper_id: cupperId, pending_count: 0, sample_ids: [] }
    }

    // Step 3: Get all samples in 'analysis' stage from these sessions
    // Exclude soft-deleted samples
    const { data: samples, error: samplesError } = await supabase
      .from('samples')
      .select('id')
      .in('id', sessionSampleIds)
      .eq('workflow_stage', 'analysis')
      .is('deleted_at', null)

    if (samplesError) {
      console.error('Error fetching samples:', samplesError)
      return { cupper_id: cupperId, pending_count: 0, sample_ids: [] }
    }

    if (!samples || samples.length === 0) {
      return { cupper_id: cupperId, pending_count: 0, sample_ids: [] }
    }

    const analysisSampleIds = samples.map(s => s.id)

    // Step 4: Find samples where cupper has already submitted scores
    const { data: existingScores, error: scoresError } = await supabase
      .from('cupping_scores')
      .select('sample_id')
      .in('sample_id', analysisSampleIds)
      .eq('cupper_id', cupperId)

    if (scoresError) {
      console.error('Error fetching cupping scores:', scoresError)
      return { cupper_id: cupperId, pending_count: 0, sample_ids: [] }
    }

    // Get IDs of samples with existing scores
    const scoredSampleIds = new Set((existingScores || []).map(score => score.sample_id))

    // Step 5: Filter out samples that already have scores
    const pendingSampleIds = analysisSampleIds.filter(id => !scoredSampleIds.has(id))

    return {
      cupper_id: cupperId,
      pending_count: pendingSampleIds.length,
      sample_ids: pendingSampleIds
    }
  } catch (error) {
    console.error('Error in getPendingSamplesForCupper:', error)
    return { cupper_id: cupperId, pending_count: 0, sample_ids: [] }
  }
}

/**
 * Get pending sample counts for multiple cuppers
 * Useful for displaying badges for all cuppers in a lab
 *
 * @param supabase - Supabase client instance
 * @param cupperIds - Array of cupper profile IDs
 * @returns Array of pending counts per cupper
 */
export async function getPendingSamplesForCuppers(
  supabase: SupabaseClient,
  cupperIds: string[]
): Promise<PendingSampleCount[]> {
  const results = await Promise.all(
    cupperIds.map(cupperId => getPendingSamplesForCupper(supabase, cupperId))
  )

  return results.filter(result => result.pending_count > 0)
}

/**
 * Get total pending sample count across all cuppers in a laboratory
 * Useful for lab-wide metrics
 *
 * @param supabase - Supabase client instance
 * @param laboratoryId - Laboratory ID
 * @returns Total count of pending samples
 */
export async function getPendingSamplesForLaboratory(
  supabase: SupabaseClient,
  laboratoryId: string
): Promise<number> {
  try {
    // Get all active cupping sessions for this laboratory
    const { data: sessions, error: sessionsError } = await supabase
      .from('cupping_sessions')
      .select('sample_ids')
      .eq('laboratory_id', laboratoryId)
      .eq('status', 'active')

    if (sessionsError || !sessions) {
      return 0
    }

    // Extract unique sample IDs
    const sampleIds = Array.from(new Set(
      sessions.flatMap(session => (session.sample_ids as string[]) || [])
    ))

    if (sampleIds.length === 0) {
      return 0
    }

    // Count samples in 'analysis' stage (exclude soft-deleted)
    const { count, error: countError } = await supabase
      .from('samples')
      .select('id', { count: 'exact', head: true })
      .in('id', sampleIds)
      .eq('workflow_stage', 'analysis')
      .is('deleted_at', null)

    if (countError) {
      console.error('Error counting samples:', countError)
      return 0
    }

    return count || 0
  } catch (error) {
    console.error('Error in getPendingSamplesForLaboratory:', error)
    return 0
  }
}

/**
 * Get count of pending samples for grading assigned to a specific cupper.
 * Only counts samples where:
 * 1. The cupper is assigned via cupping_sessions.cupper_ids
 * 2. The session is active or review
 * 3. The sample is in 'analysis' or 'review' workflow stage
 * 4. The sample doesn't have completed green_bean_data
 *
 * @param supabase - Supabase client instance
 * @param cupperId - Profile ID of the cupper
 * @returns Count of pending grading samples for this cupper
 */
export async function getPendingGradingSamplesForCupper(
  supabase: SupabaseClient,
  cupperId: string
): Promise<number> {
  try {
    // Step 1: Find cupping sessions where this cupper is assigned
    const { data: sessions, error: sessionsError } = await supabase
      .from('cupping_sessions')
      .select('id, sample_ids')
      .in('status', ['active', 'review'])
      .filter('cupper_ids', 'cs', JSON.stringify([cupperId]))

    if (sessionsError || !sessions || sessions.length === 0) {
      return 0
    }

    // Step 2: Collect unique sample IDs
    const allSampleIds = Array.from(new Set(
      sessions.flatMap(s => (s.sample_ids as string[]) || [])
    ))

    if (allSampleIds.length === 0) {
      return 0
    }

    // Step 3: Get samples in analysis/review stage
    const { data: samples, error: samplesError } = await supabase
      .from('samples')
      .select('id')
      .in('id', allSampleIds)
      .in('workflow_stage', ['analysis', 'review'])
      .is('deleted_at', null)

    if (samplesError || !samples || samples.length === 0) {
      return 0
    }

    const sampleIds = samples.map(s => s.id)

    // Step 4: Find which have completed grading
    const { data: gradedSamples, error: gradedError } = await supabase
      .from('quality_assessments')
      .select('sample_id, green_bean_data')
      .in('sample_id', sampleIds)

    if (gradedError) {
      return sampleIds.length
    }

    const gradedSampleIds = new Set(
      (gradedSamples || [])
        .filter(qa => {
          const data = qa.green_bean_data as any
          return data && (
            data.defect_count !== undefined ||
            data.total_defects !== undefined ||
            data.screen_sizes !== undefined ||
            data.completed === true
          )
        })
        .map(qa => qa.sample_id)
    )

    return sampleIds.filter(id => !gradedSampleIds.has(id)).length
  } catch (error) {
    console.error('Error in getPendingGradingSamplesForCupper:', error)
    return 0
  }
}
