import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type LockReason = 'not_locked' | 'within_7_days' | 'locked_after_scan' | 'locked_after_7_days'

interface EditPermissionResponse {
  canEdit: boolean
  reason: LockReason
  lockExpiresAt: string | null
  message: string
}

/**
 * GET /api/cupping/check-edit-permission?sampleId=xxx
 *
 * Checks if a sample can be edited based on workflow state.
 *
 * Lock Rules:
 * 1. If locked = TRUE and scanned_at is set → Cannot edit (locked after scan)
 * 2. If certificate_generated_at is NULL → Can edit (no certificate yet)
 * 3. If certificate_generated_at + 7 days > now → Can edit (within 7-day window)
 * 4. If certificate_generated_at + 7 days <= now → Cannot edit (7 days expired)
 *
 * Query Parameters:
 * - sampleId: string (required) - The sample ID to check
 *
 * Returns:
 * - canEdit: boolean - Whether the sample can be edited
 * - reason: LockReason - Why it can or cannot be edited
 * - lockExpiresAt: string | null - When the 7-day lock will expire (ISO timestamp)
 * - message: string - Human-readable explanation
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

    // Fetch sample lock status and timestamps
    // Note: Using 'as any' because new fields aren't in generated types yet
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
      return NextResponse.json(
        { error: 'Sample not found' },
        { status: 404 }
      )
    }

    // Rule 1: If locked after scan
    if (sample.locked && sample.scanned_at) {
      const response: EditPermissionResponse = {
        canEdit: false,
        reason: 'locked_after_scan',
        lockExpiresAt: null,
        message: 'Sample is locked after OCR scan validation. Editing is no longer permitted.'
      }
      return NextResponse.json(response)
    }

    // Rule 2: No certificate yet
    if (!sample.certificate_generated_at) {
      const response: EditPermissionResponse = {
        canEdit: true,
        reason: 'not_locked',
        lockExpiresAt: null,
        message: 'Sample can be edited. No certificate has been generated yet.'
      }
      return NextResponse.json(response)
    }

    // Rule 3 & 4: Check 7-day window from certificate generation
    const certificateTime = new Date(sample.certificate_generated_at)
    const lockExpiry = new Date(certificateTime.getTime() + 7 * 24 * 60 * 60 * 1000) // +7 days
    const now = new Date()

    if (now < lockExpiry) {
      // Within 7-day window
      const response: EditPermissionResponse = {
        canEdit: true,
        reason: 'within_7_days',
        lockExpiresAt: lockExpiry.toISOString(),
        message: `Sample can be edited within 7 days of certificate generation. Lock expires at ${lockExpiry.toLocaleString()}.`
      }
      return NextResponse.json(response)
    } else {
      // 7 days expired
      const response: EditPermissionResponse = {
        canEdit: false,
        reason: 'locked_after_7_days',
        lockExpiresAt: lockExpiry.toISOString(),
        message: '7 days have elapsed since certificate generation. Sample is permanently locked.'
      }
      return NextResponse.json(response)
    }
  } catch (error) {
    console.error('Error in check-edit-permission endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
