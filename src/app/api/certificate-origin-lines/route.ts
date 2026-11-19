import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { loadLabScope } from '@/lib/auth/lab-scope'
import { isInternalStaff } from '@/lib/auth/sample-access'
import { cleanNextNumber, cleanOriginCode, cleanOriginName } from '@/lib/origin-certificate-numbers'

const COLUMNS = 'origin, code, next_number, counter_year, resets_yearly, padding, is_active'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * GET /api/certificate-origin-lines
 * The certificate number line of each origin. `available` is false when the
 * lines could not be read (the numbering migration is not applied).
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await isInternalStaff(supabase as any, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await (supabase as any)
      .from('origin_certificate_sequences')
      .select(COLUMNS)
      .order('origin', { ascending: true })
    if (error) {
      console.error('[certificate-origin-lines] list failed:', error)
      return NextResponse.json({ lines: [], available: false })
    }
    const scope = await loadLabScope(supabase as any, user.id)
    return NextResponse.json({ lines: data ?? [], available: true, can_edit: scope.isGlobal })
  } catch (error) {
    console.error('Error in GET /api/certificate-origin-lines:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Only a global admin changes how certificates are numbered. */
async function requireGlobalAdmin(): Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const scope = await loadLabScope(supabase as any, user.id)
  if (!scope.isGlobal) {
    return NextResponse.json({ error: 'Only a global admin can change certificate numbering' }, { status: 403 })
  }
  return { userId: user.id }
}

/**
 * POST /api/certificate-origin-lines
 * Body: { origin: string, code: string, next_number?: number }
 * Give an origin its own line. From then on its certificates are numbered there.
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await requireGlobalAdmin()
    if (gate instanceof NextResponse) return gate

    const body = await request.json().catch(() => null)
    const origin = cleanOriginName(body?.origin)
    const code = cleanOriginCode(body?.code)
    const nextNumber = body?.next_number === undefined ? 1 : cleanNextNumber(body.next_number)
    if (!origin) return NextResponse.json({ error: 'Name the origin' }, { status: 400 })
    if (!code) return NextResponse.json({ error: 'The code is one to six letters' }, { status: 400 })
    if (nextNumber === null) return NextResponse.json({ error: 'The next number is a whole number from 1 up' }, { status: 400 })

    const { data, error } = await (admin() as any)
      .from('origin_certificate_sequences')
      .insert({ origin, code, next_number: nextNumber, updated_by: gate.userId })
      .select(COLUMNS)
      .single()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'That origin or that code already has a line' }, { status: 409 })
      }
      console.error('[certificate-origin-lines] insert failed:', error)
      return NextResponse.json({ error: 'Could not add the origin' }, { status: 500 })
    }
    return NextResponse.json({ line: data }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/certificate-origin-lines:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/certificate-origin-lines
 * Body: { origin: string, code?: string, next_number?: number, resets_yearly?: boolean, is_active?: boolean }
 * Change one line. Setting `next_number` is how a line is made to continue an
 * older numbering; a number already on a certificate is stepped over when the
 * line reaches it, so a number can never be issued twice.
 */
export async function PATCH(request: NextRequest) {
  try {
    const gate = await requireGlobalAdmin()
    if (gate instanceof NextResponse) return gate

    const body = await request.json().catch(() => null)
    const origin = cleanOriginName(body?.origin)
    if (!origin) return NextResponse.json({ error: 'Name the origin' }, { status: 400 })

    const patch: Record<string, unknown> = {}
    if (body?.code !== undefined) {
      const code = cleanOriginCode(body.code)
      if (!code) return NextResponse.json({ error: 'The code is one to six letters' }, { status: 400 })
      patch.code = code
    }
    if (body?.next_number !== undefined) {
      const nextNumber = cleanNextNumber(body.next_number)
      if (nextNumber === null) return NextResponse.json({ error: 'The next number is a whole number from 1 up' }, { status: 400 })
      patch.next_number = nextNumber
      // The number typed is this year's: a line that restarts must not reset it on its first use.
      patch.counter_year = new Date().getFullYear()
    }
    if (typeof body?.resets_yearly === 'boolean') patch.resets_yearly = body.resets_yearly
    if (typeof body?.is_active === 'boolean') patch.is_active = body.is_active
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })

    const { data, error } = await (admin() as any)
      .from('origin_certificate_sequences')
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: gate.userId })
      .eq('origin', origin)
      .select(COLUMNS)
      .maybeSingle()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Another origin already uses that code' }, { status: 409 })
      console.error('[certificate-origin-lines] update failed:', error)
      return NextResponse.json({ error: 'Could not change the line' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'That origin has no line' }, { status: 404 })
    return NextResponse.json({ line: data })
  } catch (error) {
    console.error('Error in PATCH /api/certificate-origin-lines:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
