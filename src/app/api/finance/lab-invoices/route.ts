import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/finance/lab-invoices
 * Get all lab invoices with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const laboratoryId = searchParams.get('laboratory_id')
    const status = searchParams.get('status')
    const overdue = searchParams.get('overdue')

    let query = supabase
      .from('lab_invoice_summary')
      .select('*')
      .order('due_date', { ascending: false })

    if (laboratoryId) {
      query = query.eq('laboratory_id', laboratoryId)
    }

    if (status) {
      query = query.eq('status', status)
    }

    if (overdue === 'true') {
      query = query.eq('payment_status', 'Overdue')
    }

    const { data: invoices, error } = await query

    if (error) {
      console.error('Error fetching lab invoices:', error)
      return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
    }

    return NextResponse.json({ invoices })
  } catch (error) {
    console.error('Error in GET /api/finance/lab-invoices:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/finance/lab-invoices
 * Generate a new invoice for a laboratory for a specific period
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
    const { laboratory_id, period_start, period_end } = body

    // Validate required fields
    if (!laboratory_id || !period_start || !period_end) {
      return NextResponse.json({
        error: 'Missing required fields: laboratory_id, period_start, and period_end are required'
      }, { status: 400 })
    }

    // Get lab config
    const { data: labConfig, error: configError } = await supabase
      .from('laboratory_third_party_config')
      .select('fee_per_sample, billing_basis, is_active')
      .eq('laboratory_id', laboratory_id)
      .single()

    if (configError || !labConfig || !labConfig.is_active) {
      return NextResponse.json({ error: 'Laboratory configuration not found or inactive' }, { status: 404 })
    }

    // Get samples for the period
    let samplesQuery = supabase
      .from('samples')
      .select('id, status, calculated_lab_fee')
      .eq('laboratory_id', laboratory_id)
      .gte('created_at', period_start)
      .lte('created_at', period_end)

    const { data: samples, error: samplesError } = await samplesQuery

    if (samplesError) {
      console.error('Error fetching samples:', samplesError)
      return NextResponse.json({ error: 'Failed to fetch samples' }, { status: 500 })
    }

    // Calculate counts based on billing basis
    const sampleCount = samples?.length || 0
    const approvedCount = samples?.filter(s => s.status === 'approved').length || 0
    const rejectedCount = samples?.filter(s => s.status === 'rejected').length || 0

    // Calculate total based on billing basis
    let totalAmount = 0
    if (labConfig.billing_basis === 'all_samples') {
      totalAmount = sampleCount * labConfig.fee_per_sample
    } else if (labConfig.billing_basis === 'approved_only') {
      totalAmount = approvedCount * labConfig.fee_per_sample
    } else if (labConfig.billing_basis === 'approved_and_rejected') {
      totalAmount = (approvedCount + rejectedCount) * labConfig.fee_per_sample
    }

    // Generate invoice number
    const { data: invoiceNumberResult, error: invoiceNumError } = await supabase
      .rpc('generate_lab_invoice_number', {
        lab_id: laboratory_id,
        period_end_date: period_end
      })

    if (invoiceNumError) {
      console.error('Error generating invoice number:', invoiceNumError)
      return NextResponse.json({ error: 'Failed to generate invoice number' }, { status: 500 })
    }

    // Calculate due date
    const { data: dueDateResult, error: dueDateError } = await supabase
      .rpc('calculate_invoice_due_date', {
        lab_id: laboratory_id,
        invoice_date: new Date().toISOString().split('T')[0]
      })

    if (dueDateError) {
      console.error('Error calculating due date:', dueDateError)
      return NextResponse.json({ error: 'Failed to calculate due date' }, { status: 500 })
    }

    // Create invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('laboratory_invoices')
      .insert({
        laboratory_id,
        invoice_number: invoiceNumberResult,
        period_start,
        period_end,
        sample_count: sampleCount,
        approved_count: approvedCount,
        rejected_count: rejectedCount,
        total_amount: totalAmount,
        due_date: dueDateResult,
        status: 'pending',
      })
      .select()
      .single()

    if (invoiceError) {
      console.error('Error creating invoice:', invoiceError)
      return NextResponse.json({
        error: 'Failed to create invoice',
        details: invoiceError.message
      }, { status: 500 })
    }

    return NextResponse.json({ invoice })
  } catch (error) {
    console.error('Error in POST /api/finance/lab-invoices:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
