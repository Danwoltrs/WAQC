import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * POST /api/samples/[id]/quality-assessment
 * Create or update quality assessment for a sample
 * Body: { green_bean_data?: object, roast_data?: object }
 */
export async function POST(
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

    const { id: sampleId } = await params
    const body = await request.json()
    const { green_bean_data, roast_data } = body

    // Verify sample exists
    const { data: sample, error: sampleError } = await supabase
      .from('samples')
      .select('id, tracking_number')
      .eq('id', sampleId)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Check if quality assessment already exists
    const { data: existingAssessment } = await supabase
      .from('quality_assessments')
      .select('id, green_bean_data, roast_data')
      .eq('sample_id', sampleId)
      .single()

    if (existingAssessment) {
      // Update existing assessment - merge data
      const updatedData: any = {
        updated_at: new Date().toISOString(),
      }

      if (green_bean_data) {
        // Merge with existing green_bean_data
        updatedData.green_bean_data = {
          ...(existingAssessment.green_bean_data as object || {}),
          ...green_bean_data,
        }
      }

      if (roast_data) {
        // Merge with existing roast_data
        updatedData.roast_data = {
          ...(existingAssessment.roast_data as object || {}),
          ...roast_data,
        }
      }

      const { error: updateError } = await supabase
        .from('quality_assessments')
        .update(updatedData)
        .eq('id', existingAssessment.id)

      if (updateError) {
        console.error('Failed to update quality assessment:', updateError)
        return NextResponse.json(
          { error: 'Failed to update quality assessment' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Quality assessment updated successfully',
        assessment_id: existingAssessment.id,
      })
    } else {
      // Create new assessment
      const { data: newAssessment, error: insertError } = await supabase
        .from('quality_assessments')
        .insert({
          sample_id: sampleId,
          assessor_id: user.id,
          green_bean_data: green_bean_data || null,
          roast_data: roast_data || null,
        })
        .select('id')
        .single()

      if (insertError || !newAssessment) {
        console.error('Failed to create quality assessment:', insertError)
        return NextResponse.json(
          { error: 'Failed to create quality assessment' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Quality assessment created successfully',
        assessment_id: newAssessment.id,
      })
    }
  } catch (error: any) {
    console.error('Error managing quality assessment:', error)
    return NextResponse.json(
      {
        error: 'Failed to manage quality assessment',
        details: error.message || String(error),
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/samples/[id]/quality-assessment
 * Get quality assessment for a sample
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

    const { id: sampleId } = await params

    // Fetch quality assessment
    const { data: assessment, error: assessmentError } = await supabase
      .from('quality_assessments')
      .select('*')
      .eq('sample_id', sampleId)
      .single()

    if (assessmentError && assessmentError.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is okay
      console.error('Failed to fetch quality assessment:', assessmentError)
      return NextResponse.json(
        { error: 'Failed to fetch quality assessment' },
        { status: 500 }
      )
    }

    if (!assessment) {
      return NextResponse.json(
        { assessment: null, message: 'No quality assessment found' },
        { status: 200 }
      )
    }

    return NextResponse.json({ assessment })
  } catch (error: any) {
    console.error('Error fetching quality assessment:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch quality assessment',
        details: error.message || String(error),
      },
      { status: 500 }
    )
  }
}
