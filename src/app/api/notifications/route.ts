import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's profile to determine laboratory
    const { data: profile } = await supabase
      .from('profiles')
      .select('laboratory_id')
      .eq('id', user.id)
      .single()

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '50')
    const unreadOnly = searchParams.get('unread') === 'true'

    // Build query - use type assertion to bypass TypeScript issues
    let query: any = supabase
      .from('notifications' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    // Filter by user or laboratory
    if (profile?.laboratory_id) {
      query = query.or(`user_id.eq.${user.id},laboratory_id.eq.${profile.laboratory_id}`)
    } else {
      query = query.eq('user_id', user.id)
    }

    // Filter by read status
    if (unreadOnly) {
      query = query.eq('read', false)
    }

    const { data: notifications, error } = await query

    if (error) {
      console.error('Error fetching notifications:', error)
      return NextResponse.json(
        { error: 'Failed to fetch notifications' },
        { status: 500 }
      )
    }

    // Filter out sample assignment notifications where all samples have been deleted
    // Get all sample IDs referenced in sample_assignment notifications
    const sampleAssignmentNotifs = (notifications || []).filter(
      (n: any) => n.metadata?.type === 'sample_assignment' && n.metadata?.sample_ids?.length > 0
    )

    if (sampleAssignmentNotifs.length > 0) {
      // Collect all sample IDs from these notifications
      const allSampleIds = new Set<string>()
      sampleAssignmentNotifs.forEach((n: any) => {
        (n.metadata.sample_ids as string[]).forEach((id: string) => allSampleIds.add(id))
      })

      // Check which samples still exist (not deleted)
      const { data: existingSamples } = await supabase
        .from('samples')
        .select('id')
        .in('id', Array.from(allSampleIds))
        .is('deleted_at', null)

      const existingSampleIds = new Set((existingSamples || []).map((s: any) => s.id))

      // Filter notifications: exclude sample_assignment notifications where ALL samples are deleted
      const filteredNotifications = (notifications || []).filter((n: any) => {
        if (n.metadata?.type === 'sample_assignment' && n.metadata?.sample_ids?.length > 0) {
          // Check if at least one sample still exists
          const hasExistingSample = (n.metadata.sample_ids as string[]).some(
            (id: string) => existingSampleIds.has(id)
          )
          return hasExistingSample
        }
        return true
      })

      return NextResponse.json({ notifications: filteredNotifications })
    }

    return NextResponse.json({ notifications })
  } catch (error) {
    console.error('Error in notifications API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { type, title, message, link, metadata, user_id, laboratory_id } = body

    // Validate required fields
    if (!type || !title || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: type, title, message' },
        { status: 400 }
      )
    }

    // Validate type
    if (!['info', 'warning', 'success', 'error'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid notification type' },
        { status: 400 }
      )
    }

    // Create notification
    const { data: notification, error } = await supabase
      .from('notifications' as any)
      .insert({
        user_id: user_id || null,
        laboratory_id: laboratory_id || null,
        type,
        title,
        message,
        link: link || null,
        metadata: metadata || {}
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating notification:', error)
      return NextResponse.json(
        { error: 'Failed to create notification' },
        { status: 500 }
      )
    }

    return NextResponse.json({ notification }, { status: 201 })
  } catch (error) {
    console.error('Error in notifications POST API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { notification_ids, read } = body

    if (!notification_ids || !Array.isArray(notification_ids)) {
      return NextResponse.json(
        { error: 'notification_ids must be an array' },
        { status: 400 }
      )
    }

    // Get user profile for laboratory_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('laboratory_id')
      .eq('id', user.id)
      .single()

    // Update notifications - handle both user-specific and lab-wide notifications
    // Notifications can be user_id=current_user OR (user_id=null AND laboratory_id=user's lab)
    const { data: notifications, error } = await supabase
      .from('notifications' as any)
      .update({ read: read !== undefined ? read : true })
      .in('id', notification_ids)
      .or(`user_id.eq.${user.id},and(user_id.is.null,laboratory_id.eq.${profile?.laboratory_id || '00000000-0000-0000-0000-000000000000'})`)
      .select()

    if (error) {
      console.error('Error updating notifications:', error)
      return NextResponse.json(
        { error: 'Failed to update notifications' },
        { status: 500 }
      )
    }

    return NextResponse.json({ notifications })
  } catch (error) {
    console.error('Error in notifications PATCH API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
