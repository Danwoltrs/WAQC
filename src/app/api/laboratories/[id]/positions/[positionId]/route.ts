import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@/lib/supabase'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; positionId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins and lab directors can assign positions
    if (session.user.role !== 'admin' && session.user.role !== 'lab_director') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const params = await context.params
    const { id: laboratoryId, positionId } = params
    const body = await request.json()
    const { client_id, allow_client_view } = body

    const supabase = createClient()

    // Update the position assignment
    const { data, error } = await supabase
      .from('storage_positions')
      .update({
        client_id: client_id || null,
        allow_client_view: allow_client_view || false
      })
      .eq('id', positionId)
      .select()
      .single()

    if (error) {
      console.error('Error updating position assignment:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ position: data })
  } catch (error) {
    console.error('Error in PATCH /api/laboratories/[id]/positions/[positionId]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
