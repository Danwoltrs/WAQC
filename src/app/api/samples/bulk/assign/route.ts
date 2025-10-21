import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * POST /api/samples/bulk/assign
 * Assign selected samples to a cupper
 * Body: { sample_ids: string[], assigned_to: string }
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
    const { sample_ids, assigned_to } = body

    if (!sample_ids || !Array.isArray(sample_ids) || sample_ids.length === 0) {
      return NextResponse.json({ error: 'sample_ids array is required' }, { status: 400 })
    }

    if (!assigned_to) {
      return NextResponse.json({ error: 'assigned_to is required' }, { status: 400 })
    }

    // Verify that the assigned_to user exists
    const { data: assignedUser, error: userError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', assigned_to)
      .single()

    if (userError || !assignedUser) {
      return NextResponse.json({ error: 'Assigned user not found' }, { status: 404 })
    }

    // Update samples
    const { data: updatedSamples, error: updateError } = await supabase
      .from('samples')
      .update({ assigned_to })
      .in('id', sample_ids)
      .select()

    if (updateError) {
      console.error('Error assigning samples:', updateError)
      return NextResponse.json({ error: 'Failed to assign samples' }, { status: 500 })
    }

    // TODO: Create notifications for the assigned user
    // TODO: Log activity for each sample

    return NextResponse.json({
      message: `Successfully assigned ${updatedSamples.length} samples to ${assignedUser.full_name}`,
      samples: updatedSamples,
      assigned_to: {
        id: assignedUser.id,
        name: assignedUser.full_name
      }
    })
  } catch (error) {
    console.error('Error in POST /api/samples/bulk/assign:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
