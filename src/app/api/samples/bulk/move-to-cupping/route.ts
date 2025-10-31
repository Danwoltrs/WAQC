import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * POST /api/samples/bulk/move-to-cupping
 * Move samples to cupping stage, handling all necessary workflow transitions
 * Body: { sample_ids: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { sample_ids } = body

    if (!sample_ids || !Array.isArray(sample_ids) || sample_ids.length === 0) {
      return NextResponse.json({ error: 'sample_ids array is required' }, { status: 400 })
    }

    console.log('Moving samples to cupping stage:', sample_ids)

    // Process each sample
    const results = await Promise.all(
      sample_ids.map(async (id) => {
        try {
          // Get current sample state
          const { data: sample, error: fetchError } = await supabase
            .from('samples')
            .select('id, tracking_number, workflow_stage, sample_type')
            .eq('id', id)
            .single()

          if (fetchError || !sample) {
            return { id, success: false, error: 'Sample not found' }
          }

          const currentStage = sample.workflow_stage || 'received'
          console.log(`Sample ${sample.tracking_number}: current stage = ${currentStage}`)

          // Define the workflow stages in order (green analysis is tracked separately)
          const stageOrder = ['received', 'roasting', 'cupping']
          const currentIndex = stageOrder.indexOf(currentStage)
          const targetIndex = stageOrder.indexOf('cupping')

          // If already at cupping or beyond, no need to update
          if (currentIndex >= targetIndex) {
            console.log(`Sample ${sample.tracking_number} already at or past cupping stage`)
            return { id, success: true, message: 'Already at cupping stage' }
          }

          // Progress through stages sequentially to avoid validation errors
          // For PSS/SS/Type samples: received → roasting → cupping
          // For calibration: received → cupping (can skip roasting if already roasted separately)
          let nextStage = currentStage

          for (let i = currentIndex + 1; i <= targetIndex; i++) {
            nextStage = stageOrder[i]

            console.log(`Updating ${sample.tracking_number}: ${stageOrder[i - 1]} → ${nextStage}`)

            const { error: updateError } = await supabase
              .from('samples')
              .update({ workflow_stage: nextStage })
              .eq('id', id)

            if (updateError) {
              console.error(`Failed to update to ${nextStage}:`, updateError)
              return { id, success: false, error: updateError.message }
            }
          }

          // Update status to in_progress
          await supabase
            .from('samples')
            .update({ status: 'in_progress' })
            .eq('id', id)

          // For PSS/SS/Type samples, mark as roasted
          if (sample.sample_type === 'pss' || sample.sample_type === 'ss' || sample.sample_type === 'type') {
            // Create or update quality assessment with roast data
            const { error: assessmentError } = await supabase
              .from('quality_assessments')
              .upsert({
                sample_id: id,
                roast_data: {
                  roasted: true,
                  roasted_at: new Date().toISOString(),
                  ready_for_cupping: true,
                  auto_roasted: true, // Flag to indicate this was auto-set
                },
                updated_at: new Date().toISOString(),
              }, {
                onConflict: 'sample_id',
              })

            if (assessmentError) {
              console.warn(`Failed to update quality assessment for ${sample.tracking_number}:`, assessmentError)
              // Don't fail the entire operation
            }
          }

          console.log(`✅ Sample ${sample.tracking_number} moved to cupping stage`)
          return { id, success: true, final_stage: 'cupping' }
        } catch (error) {
          console.error(`Error processing sample ${id}:`, error)
          return { id, success: false, error: String(error) }
        }
      })
    )

    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    console.log(`Moved ${successCount}/${sample_ids.length} samples to cupping stage`)

    if (failureCount > 0) {
      const failures = results.filter(r => !r.success)
      return NextResponse.json({
        message: `Partially completed: ${successCount} succeeded, ${failureCount} failed`,
        results,
        failures,
      }, { status: 207 }) // 207 Multi-Status
    }

    return NextResponse.json({
      message: `Successfully moved ${successCount} sample${successCount !== 1 ? 's' : ''} to cupping stage`,
      results,
    })
  } catch (error) {
    console.error('Error in POST /api/samples/bulk/move-to-cupping:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
