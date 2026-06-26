import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { normalizeCertifications } from '@/lib/contract-intake-mapping'

/**
 * GET /api/samples/[id]/contract-certifications
 * Resolve the sample's linked sys contract(s) by contract_number = wolthers_contract_nr
 * and return the UNION of their normalized certifications (contract_number is not unique).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sampleId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: sample, error: sErr } = await supabase
      .from('samples')
      .select('wolthers_contract_nr')
      .eq('id', sampleId)
      .single()
    if (sErr || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    const contractNumber = ((sample as any).wolthers_contract_nr || '').trim()
    if (!contractNumber) {
      return NextResponse.json({ certifications: [], contract_number: null, matched: false })
    }

    const { data: contracts, error: cErr } = await (supabase as any)
      .from('contracts')
      .select('certifications')
      .eq('contract_number', contractNumber)
    if (cErr) {
      console.error('[contract-certifications] query error:', cErr)
      return NextResponse.json({ error: 'Failed to load contract certifications' }, { status: 500 })
    }

    const union = new Set<string>()
    for (const row of contracts || []) {
      for (const cert of normalizeCertifications((row as any).certifications)) union.add(cert)
    }

    return NextResponse.json({
      certifications: [...union],
      contract_number: contractNumber,
      matched: (contracts || []).length > 0,
    })
  } catch (error: any) {
    console.error('Error in GET /api/samples/[id]/contract-certifications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
