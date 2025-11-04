import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Create admin client with service role key (bypasses RLS)
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

// Type definition for sample with all valid sample_type values
type SampleType = 'pss' | 'ss' | 'type' | 'specialty' | null

interface SampleData {
  id: string
  tracking_number: string
  workflow_stage: string | null
  sample_type: SampleType
}

/**
 * POST /api/samples/bulk/move-to-cupping
 * Move samples to analysis stage (green grading + cupping can be done simultaneously)
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

    console.log('Moving samples to analysis stage:', sample_ids)

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

          // Cast to our type that includes 'specialty'
          const sampleData = sample as SampleData

          const currentStage = sampleData.workflow_stage || 'received'
          console.log(`Sample ${sampleData.tracking_number}: current stage = ${currentStage}, type = ${sampleData.sample_type}`)

          // For PSS/SS/Type samples: received → analysis (green grading + cupping together)
          // For Specialty samples: received → (stay received until manually moved to roasting)
          if (sampleData.sample_type === 'specialty') {
            // Specialty samples stay at 'received' - roasting is done manually when ready
            console.log(`Sample ${sampleData.tracking_number} is specialty type - staying at received stage for manual roasting`)
            return { id, success: true, message: 'Specialty sample - roasting must be done manually' }
          }

          // For PSS/SS/Type samples, move directly to analysis
          if (currentStage === 'received') {
            console.log(`📝 Attempting to update sample ${sampleData.tracking_number} to analysis stage...`)

            // Use admin client to bypass RLS policies that might cause array comparison errors
            const { data: updateData, error: updateError } = await supabaseAdmin
              .from('samples')
              .update({
                workflow_stage: 'analysis',
                status: 'in_progress'
              })
              .eq('id', id)
              .select()

            if (updateError) {
              console.error(`❌ Failed to update sample ${sampleData.tracking_number} to analysis:`, updateError)
              console.error('Error details:', {
                code: updateError.code,
                message: updateError.message,
                details: updateError.details,
                hint: updateError.hint
              })
              return { id, success: false, error: updateError.message }
            }

            console.log(`✅ Sample ${sampleData.tracking_number} updated successfully:`, updateData)

            // Mark as ready for both green bean analysis and cupping
            const { error: assessmentError } = await supabaseAdmin
              .from('quality_assessments')
              .upsert({
                sample_id: id,
                green_bean_data: {
                  ready_for_grading: true
                },
                roast_data: {
                  ready_for_cupping: true
                },
                updated_at: new Date().toISOString(),
              }, {
                onConflict: 'sample_id',
              })

            if (assessmentError) {
              console.warn(`Failed to update quality assessment for ${sampleData.tracking_number}:`, assessmentError)
              // Don't fail the entire operation
            }

            console.log(`✅ Sample ${sampleData.tracking_number} moved to analysis stage`)
            return { id, success: true, final_stage: 'analysis' }
          } else if (currentStage === 'analysis') {
            console.log(`Sample ${sampleData.tracking_number} already at analysis stage`)
            return { id, success: true, message: 'Already at analysis stage' }
          } else {
            console.log(`Sample ${sampleData.tracking_number} at unexpected stage ${currentStage}`)
            return { id, success: false, error: `Sample at unexpected stage: ${currentStage}` }
          }
        } catch (error) {
          console.error(`Error processing sample ${id}:`, error)
          return { id, success: false, error: String(error) }
        }
      })
    )

    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    console.log(`Moved ${successCount}/${sample_ids.length} samples to analysis stage`)

    if (failureCount > 0) {
      const failures = results.filter(r => !r.success)
      return NextResponse.json({
        message: `Partially completed: ${successCount} succeeded, ${failureCount} failed`,
        results,
        failures,
      }, { status: 207 }) // 207 Multi-Status
    }

    return NextResponse.json({
      message: `Successfully moved ${successCount} sample${successCount !== 1 ? 's' : ''} to analysis stage`,
      results,
    })
  } catch (error) {
    console.error('Error in POST /api/samples/bulk/move-to-cupping:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
