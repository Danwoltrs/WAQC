import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/finance/lab-invoices/[id]
 * Get a specific lab invoice
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

    const { data: invoice, error } = await supabase
      .from('lab_invoice_summary')
      .select('*')
      .eq('invoice_id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      }
      console.error('Error fetching invoice:', error)
      return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 })
    }

    return NextResponse.json({ invoice })
  } catch (error) {
    console.error('Error in GET /api/finance/lab-invoices/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/finance/lab-invoices/[id]
 * Update invoice status (e.g., mark as paid)
 */
export async function PATCH(
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

    // Prepare update data
    const updateData: any = {}
    const allowedFields = ['status', 'paid_date', 'notes']

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // If marking as paid, automatically set paid_date if not provided
    if (updateData.status === 'paid' && !updateData.paid_date) {
      updateData.paid_date = new Date().toISOString().split('T')[0]
    }

    // Update invoice
    const { data: invoice, error: updateError } = await supabase
      .from('laboratory_invoices')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating invoice:', updateError)
      return NextResponse.json({
        error: 'Failed to update invoice',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({ invoice })
  } catch (error) {
    console.error('Error in PATCH /api/finance/lab-invoices/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
