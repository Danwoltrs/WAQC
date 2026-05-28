import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { QC_CLIENT_SELECT, mapCompanyToClient } from '@/lib/qc-client-mapper'

/**
 * GET /api/clients/export
 * Export all clients to CSV
 */
export async function GET() {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch all QC clients (companies + qc_client_settings)
    const { data: rows, error } = await (supabase as any)
      .from('companies')
      .select(QC_CLIENT_SELECT)
      .eq('is_qc_client', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching clients:', error)
      return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
    }

    const clients = (rows || []).map(mapCompanyToClient).filter(Boolean) as Record<string, unknown>[]

    // CSV headers
    const headers = [
      'name',
      'company',
      'fantasy_name',
      'email',
      'phone',
      'address',
      'city',
      'state',
      'country',
      'is_qc_client',
      'is_active',
      'client_types',
      'pricing_model',
      'price_per_sample',
      'price_per_pound_cents',
      'currency',
      'payment_terms',
      'billing_basis',
      'fee_payer',
      'certificate_delivery_timing',
      'billing_notes',
      'has_origin_pricing',
      'qc_enabled'
    ]

    // Helper function to escape CSV values
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return ''

      // Convert arrays to comma-separated string
      if (Array.isArray(value)) {
        return `"${value.join(', ')}"`
      }

      // Convert booleans to Yes/No
      if (typeof value === 'boolean') {
        return value ? 'Yes' : 'No'
      }

      // Convert objects to JSON string
      if (typeof value === 'object') {
        return `"${JSON.stringify(value).replace(/"/g, '""')}"`
      }

      const stringValue = String(value)

      // Escape double quotes and wrap in quotes if contains comma, newline, or quotes
      if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
        return `"${stringValue.replace(/"/g, '""')}"`
      }

      return stringValue
    }

    // Build CSV content
    const csvRows = [
      headers.join(','),
      ...clients.map(client =>
        headers.map(header => escapeCSV(client[header])).join(',')
      )
    ]

    const csvContent = csvRows.join('\n')

    // Return as downloadable file
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="clients_export_${new Date().toISOString().split('T')[0]}.csv"`
      }
    })
  } catch (error) {
    console.error('Error in GET /api/clients/export:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
