import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
      .select('laboratory_id, full_name')
      .eq('id', user.id)
      .single()

    if (!profile?.laboratory_id) {
      return NextResponse.json(
        { error: 'User laboratory not found' },
        { status: 404 }
      )
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '50')
    const entityType = searchParams.get('entity_type')

    // Build query
    let query = supabase
      .from('activity_feed')
      .select(`
        *,
        actor:profiles!activity_feed_actor_id_fkey(id, full_name)
      `)
      .eq('laboratory_id', profile.laboratory_id)
      .order('created_at', { ascending: false })
      .limit(limit)

    // Filter by entity type if specified
    if (entityType) {
      query = query.eq('entity_type', entityType)
    }

    const { data: activities, error } = await query

    if (error) {
      console.error('Error fetching activity feed:', error)
      return NextResponse.json(
        { error: 'Failed to fetch activity feed' },
        { status: 500 }
      )
    }

    return NextResponse.json({ activities })
  } catch (error) {
    console.error('Error in activity feed API:', error)
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

    // Get user's profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('laboratory_id')
      .eq('id', user.id)
      .single()

    const body = await request.json()
    const { action, entity_type, entity_id, entity_name, metadata } = body

    // Validate required fields
    if (!action || !entity_type) {
      return NextResponse.json(
        { error: 'Missing required fields: action, entity_type' },
        { status: 400 }
      )
    }

    // Create activity entry
    const { data: activity, error } = await supabase
      .from('activity_feed')
      .insert({
        user_id: user.id,
        laboratory_id: profile?.laboratory_id || null,
        actor_id: user.id,
        action,
        entity_type,
        entity_id: entity_id || null,
        entity_name: entity_name || null,
        metadata: metadata || {}
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating activity:', error)
      return NextResponse.json(
        { error: 'Failed to create activity' },
        { status: 500 }
      )
    }

    return NextResponse.json({ activity }, { status: 201 })
  } catch (error) {
    console.error('Error in activity feed POST API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
