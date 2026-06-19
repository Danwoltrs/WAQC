import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import {
  computeContentLock,
  isSampleEditor,
  type LockReason,
} from '@/lib/sample-edit-permissions'

interface EditPermissionResponse {
  /** User is a master cupper or global admin (the only sample editors). */
  isEditor: boolean
  /** Editor AND quality content is not locked (pre-cert or within 7 days). */
  canEditContent: boolean
  /** Editor — commercial / logistics fields are editable at any time. */
  canEditCounterparties: boolean
  /** Back-compat alias for canEditContent (older UI consumers). */
  canEdit: boolean
  reason: LockReason
  lockExpiresAt: string | null
  message: string
}

/**
 * GET /api/cupping/check-edit-permission?sampleId=xxx
 *
 * Returns the current user's edit permissions for a sample.
 *
 * Role gate: only master cuppers / global admins can edit anything.
 * Content lock: quality (lock-sensitive) fields are editable before a
 * certificate exists and within 7 days of certificate generation; commercial /
 * logistics fields are editable at any time by an editor.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sampleId = searchParams.get('sampleId')

    if (!sampleId) {
      return NextResponse.json(
        { error: 'sampleId query parameter is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Editor role
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_master_cupper, is_global_admin, qc_role')
      .eq('id', user.id)
      .single()
    const isEditor = isSampleEditor(profile)

    // Fetch sample lock status and timestamps
    const { data: sample, error } = await (supabase as any)
      .from('samples')
      .select('id, locked, scanned_at, certificate_generated_at')
      .eq('id', sampleId)
      .single()

    if (error) {
      console.error('Error fetching sample lock status:', error)
      return NextResponse.json(
        { error: 'Failed to check edit permission' },
        { status: 500 }
      )
    }

    if (!sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    const lock = computeContentLock(sample)
    // Editors bypass the content lock entirely — they may edit quality content
    // at any time (product decision 2026-06-19). The lock state is still
    // reported for informational messaging.
    const canEditContent = isEditor
    const canEditCounterparties = isEditor

    const response: EditPermissionResponse = {
      isEditor,
      canEditContent,
      canEditCounterparties,
      canEdit: canEditContent,
      reason: lock.reason,
      lockExpiresAt: lock.lockExpiresAt,
      message: !isEditor
        ? 'Only master cuppers and global admins can edit samples.'
        : 'You can edit all fields, including quality data.',
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error('Error in check-edit-permission endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
