import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * DELETE /api/clients/[id]/origin-pricing/[origin]
 * Delete origin-specific pricing for a client
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; origin: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, origin } = await params

    // Delete origin pricing
    const { error: deleteError } = await supabase
      .from('client_origin_pricing')
      .delete()
      .eq('client_id', id)
      .eq('origin', origin)

    if (deleteError) {
      console.error('Error deleting origin pricing:', deleteError)
      return NextResponse.json({
        error: 'Failed to delete origin pricing',
        details: deleteError.message
      }, { status: 500 })
    }

    // Check if client has any remaining origin pricing
    const { count, error: countError } = await supabase
      .from('client_origin_pricing')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', id)

    if (!countError && count === 0) {
      // No more origin pricing, update client flag
      await supabase
        .from('clients')
        .update({ has_origin_pricing: false })
        .eq('id', id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/clients/[id]/origin-pricing/[origin]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/clients/[id]/origin-pricing/[origin]
 * Update specific origin pricing
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; origin: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, origin } = await params
    const body = await request.json()

    // Prepare update data
    const updateData: any = {}
    const allowedFields = [
      'pricing_model',
      'price_per_sample',
      'price_per_pound_cents',
      'currency',
      'is_active',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Update origin pricing
    const { data: originPricing, error: updateError } = await supabase
      .from('client_origin_pricing')
      .update(updateData)
      .eq('client_id', id)
      .eq('origin', origin)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating origin pricing:', updateError)
      return NextResponse.json({
        error: 'Failed to update origin pricing',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({ origin_pricing: originPricing })
  } catch (error) {
    console.error('Error in PATCH /api/clients/[id]/origin-pricing/[origin]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
