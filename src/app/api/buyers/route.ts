import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/buyers
 * List all buyers with optional search
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')
    const country = searchParams.get('country')

    // Build query - cast to any to avoid deep instantiation issues with generated types
    const queryBuilder = (supabase as any)
      .from('buyers')
      .select('*')
      .order('name')

    let query = queryBuilder

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    if (country) {
      query = query.eq('country', country)
    }

    const { data: buyers, error } = await query

    if (error) {
      console.error('Error fetching buyers:', error)
      return NextResponse.json({ error: 'Failed to fetch buyers' }, { status: 500 })
    }

    return NextResponse.json({ buyers })
  } catch (error) {
    console.error('Error in GET /api/buyers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/buyers
 * Create a new buyer
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

    if (!body.name) {
      return NextResponse.json({ error: 'Buyer name is required' }, { status: 400 })
    }

    const { data: buyer, error } = await (supabase as any)
      .from('buyers')
      .insert({
        name: body.name,
        country: body.country || null,
        contact_email: body.contact_email || null,
        contact_phone: body.contact_phone || null,
        notes: body.notes || null
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating buyer:', error)
      return NextResponse.json({ error: 'Failed to create buyer' }, { status: 500 })
    }

    return NextResponse.json({ buyer }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/buyers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
