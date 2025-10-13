import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * POST /api/samples/[id]/assign-storage
 * Assign a sample to a storage position
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

    // Await params (Next.js 15)
    const { id } = await params

    const body = await request.json()
    const { storage_position_id } = body

    if (!storage_position_id) {
      return NextResponse.json({
        error: 'storage_position_id is required'
      }, { status: 400 })
    }

    // Verify sample exists
    const { data: sample, error: sampleError } = await supabase
      .from('samples')
      .select('id, laboratory_id, storage_position')
      .eq('id', id)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Get storage position details
    const { data: storagePosition, error: positionError } = await supabase
      .from('storage_positions')
      .select('id, position_code, laboratory_id, current_count, capacity_per_position, current_samples, is_available, column_number, row_number')
      .eq('id', storage_position_id)
      .single()

    if (positionError || !storagePosition) {
      return NextResponse.json({ error: 'Storage position not found' }, { status: 404 })
    }

    // Verify laboratory match
    if ((storagePosition as any).laboratory_id !== (sample as any).laboratory_id) {
      return NextResponse.json({
        error: 'Storage position must be in the same laboratory as the sample'
      }, { status: 400 })
    }

    // Check if position has capacity
    if (!(storagePosition as any).is_available || (storagePosition as any).current_count >= (storagePosition as any).capacity_per_position) {
      return NextResponse.json({
        error: 'Storage position is at full capacity',
        details: {
          current: (storagePosition as any).current_count,
          capacity: (storagePosition as any).capacity_per_position
        }
      }, { status: 400 })
    }

    // If sample is already in a storage position, remove it first
    if ((sample as any).storage_position) {
      const { data: oldPosition } = await supabase
        .from('storage_positions')
        .select('id, current_samples')
        .eq('position_code', (sample as any).storage_position)
        .eq('laboratory_id', (sample as any).laboratory_id)
        .single()

      if (oldPosition) {
        const updatedSamples = ((oldPosition as any).current_samples || []).filter((sid: string) => sid !== id)
        await supabase
          .from('storage_positions')
          .update({
            current_samples: updatedSamples,
            current_count: updatedSamples.length
          })
          .eq('id', (oldPosition as any).id)
      }
    }

    // Add sample to new storage position
    const updatedSamples = [...((storagePosition as any).current_samples || []), id]
    const { error: updatePositionError } = await supabase
      .from('storage_positions')
      .update({
        current_samples: updatedSamples,
        current_count: updatedSamples.length
      })
      .eq('id', storage_position_id)

    if (updatePositionError) {
      console.error('Error updating storage position:', updatePositionError)
      return NextResponse.json({ error: 'Failed to update storage position' }, { status: 500 })
    }

    // Update sample with new storage position
    const { data: updatedSample, error: updateSampleError } = await supabase
      .from('samples')
      .update({ storage_position: (storagePosition as any).position_code })
      .eq('id', id)
      .select()
      .single()

    if (updateSampleError) {
      console.error('Error updating sample:', updateSampleError)
      return NextResponse.json({ error: 'Failed to update sample' }, { status: 500 })
    }

    return NextResponse.json({
      sample: updatedSample,
      storage_position: {
        id: (storagePosition as any).id,
        position_code: (storagePosition as any).position_code,
        current_count: updatedSamples.length,
        capacity: (storagePosition as any).capacity_per_position
      }
    })
  } catch (error) {
    console.error('Error in POST /api/samples/[id]/assign-storage:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
