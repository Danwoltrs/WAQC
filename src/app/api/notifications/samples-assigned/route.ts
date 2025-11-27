import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { notifications } from '@/lib/notifications'

/**
 * POST /api/notifications/samples-assigned
 * Send notifications to assigned cuppers
 * Body: { cupper_ids: string[], sample_ids: string[], session_id?: string }
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
    const { cupper_ids, sample_ids, session_id } = body

    if (!cupper_ids || !Array.isArray(cupper_ids) || cupper_ids.length === 0) {
      return NextResponse.json({ error: 'cupper_ids array is required' }, { status: 400 })
    }

    if (!sample_ids || !Array.isArray(sample_ids) || sample_ids.length === 0) {
      return NextResponse.json({ error: 'sample_ids array is required' }, { status: 400 })
    }

    console.log(`Sending notifications to ${cupper_ids.length} cupper(s) for ${sample_ids.length} sample(s)`)

    // Send notification to each assigned cupper
    const results = await Promise.all(
      cupper_ids.map(cupperId =>
        notifications.samplesAssigned(cupperId, sample_ids.length, sample_ids, session_id)
      )
    )

    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    console.log(`Sent ${successCount}/${cupper_ids.length} notifications successfully`)

    if (failureCount > 0) {
      return NextResponse.json({
        message: `Partially successful: ${successCount} sent, ${failureCount} failed`,
        sent: successCount,
        failed: failureCount
      }, { status: 207 })
    }

    return NextResponse.json({
      message: `Successfully sent ${successCount} notification${successCount !== 1 ? 's' : ''}`,
      sent: successCount
    })
  } catch (error) {
    console.error('Error in POST /api/notifications/samples-assigned:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
