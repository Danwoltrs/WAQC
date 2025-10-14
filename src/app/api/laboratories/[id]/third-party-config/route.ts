import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/laboratories/[id]/third-party-config
 * Get 3rd party configuration for a laboratory
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

    const { id } = await params

    // Fetch 3rd party config
    const { data: config, error } = await supabase
      .from('laboratory_third_party_config')
      .select('*')
      .eq('laboratory_id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'No 3rd party configuration found' }, { status: 404 })
      }
      console.error('Error fetching 3rd party config:', error)
      return NextResponse.json({ error: 'Failed to fetch configuration' }, { status: 500 })
    }

    return NextResponse.json({ config })
  } catch (error) {
    console.error('Error in GET /api/laboratories/[id]/third-party-config:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/laboratories/[id]/third-party-config
 * Create or update 3rd party configuration for a laboratory
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

    const { id } = await params
    const body = await request.json()

    const {
      fee_per_sample,
      payment_schedule,
      billing_basis,
      currency,
      contact_name,
      contact_email,
      contract_start_date,
      contract_end_date,
      notes,
      is_active,
    } = body

    // Validate required fields
    if (!fee_per_sample || fee_per_sample <= 0) {
      return NextResponse.json({
        error: 'fee_per_sample is required and must be greater than 0'
      }, { status: 400 })
    }

    // Check if laboratory exists and is 3rd party
    const { data: lab, error: labError } = await supabase
      .from('laboratories')
      .select('id, type')
      .eq('id', id)
      .single()

    if (labError || !lab) {
      return NextResponse.json({ error: 'Laboratory not found' }, { status: 404 })
    }

    if (lab.type !== 'third_party') {
      return NextResponse.json({
        error: 'Only third_party laboratories can have this configuration'
      }, { status: 400 })
    }

    // Upsert 3rd party config
    const { data: config, error: upsertError } = await supabase
      .from('laboratory_third_party_config')
      .upsert({
        laboratory_id: id,
        fee_per_sample,
        payment_schedule: payment_schedule || 'net_30',
        billing_basis: billing_basis || 'approved_only',
        currency: currency || 'USD',
        contact_name,
        contact_email,
        contract_start_date,
        contract_end_date,
        notes,
        is_active: is_active !== undefined ? is_active : true,
      }, {
        onConflict: 'laboratory_id'
      })
      .select()
      .single()

    if (upsertError) {
      console.error('Error upserting 3rd party config:', upsertError)
      return NextResponse.json({
        error: 'Failed to save configuration',
        details: upsertError.message
      }, { status: 500 })
    }

    return NextResponse.json({ config })
  } catch (error) {
    console.error('Error in POST /api/laboratories/[id]/third-party-config:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/laboratories/[id]/third-party-config
 * Delete 3rd party configuration for a laboratory
 */
export async function DELETE(
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

    const { id } = await params

    // Check if there are outstanding invoices
    const { count: invoiceCount, error: invoiceError } = await supabase
      .from('laboratory_invoices')
      .select('*', { count: 'exact', head: true })
      .eq('laboratory_id', id)
      .neq('status', 'paid')

    if (invoiceError) {
      console.error('Error checking invoices:', invoiceError)
    }

    if (invoiceCount && invoiceCount > 0) {
      return NextResponse.json({
        error: 'Cannot delete configuration with outstanding invoices',
        outstanding_invoices: invoiceCount
      }, { status: 400 })
    }

    // Delete 3rd party config
    const { error: deleteError } = await supabase
      .from('laboratory_third_party_config')
      .delete()
      .eq('laboratory_id', id)

    if (deleteError) {
      console.error('Error deleting 3rd party config:', deleteError)
      return NextResponse.json({
        error: 'Failed to delete configuration',
        details: deleteError.message
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/laboratories/[id]/third-party-config:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
