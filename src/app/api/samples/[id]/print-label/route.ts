import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/samples/[id]/print-label
 * Generate label data for a sample (3cm height x A4 width pre-cut labels)
 * Label contains: Exporter, Quality, Certificate Nr, Date, QR Code
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

    // Await params (Next.js 15)
    const { id } = await params

    // Fetch sample with related data
    const { data: sample, error: sampleError } = await supabase
      .from('samples')
      .select(`
        *,
        client:clients(id, name, company),
        quality:client_qualities(id),
        certificate:certificates(certificate_number)
      `)
      .eq('id', id)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Generate QR code data (sample ID for scanning)
    const qrCodeData = JSON.stringify({
      sample_id: (sample as any).id,
      tracking_number: (sample as any).tracking_number,
      type: 'sample_label'
    })

    // Prepare label data
    const labelData = {
      exporter: (sample as any).supplier,
      quality: (sample as any).quality_spec_id ? `Quality ID: ${(sample as any).quality_spec_id}` : 'N/A',
      certificate_number: (sample as any).certificate?.[0]?.certificate_number || 'Pending',
      date: new Date((sample as any).created_at).toISOString().split('T')[0],
      qr_code_data: qrCodeData,
      tracking_number: (sample as any).tracking_number,
      origin: (sample as any).origin,
      sample_type: (sample as any).sample_type?.toUpperCase() || 'N/A'
    }

    return NextResponse.json({ label: labelData })
  } catch (error) {
    console.error('Error in GET /api/samples/[id]/print-label:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
