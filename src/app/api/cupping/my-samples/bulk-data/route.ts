import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * POST /api/cupping/my-samples/bulk-data
 * Fetch quality assessments, cupping scores, and defect photos for multiple samples in one call.
 * Body: { sample_ids: string[] }
 *
 * Returns:
 * - assessments: Record<sample_id, quality_assessment>
 * - cupping_scores: Record<sample_id, cupping_score>
 * - defect_photos: Record<sample_id, {path, url, filename}[]> (with signed URLs)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { sample_ids } = body

    if (!sample_ids || !Array.isArray(sample_ids) || sample_ids.length === 0) {
      return NextResponse.json(
        { error: 'sample_ids must be a non-empty array' },
        { status: 400 }
      )
    }

    // Fetch all three data types in parallel
    const [assessmentsResult, scoresResult] = await Promise.all([
      // Quality assessments for all samples
      supabase
        .from('quality_assessments')
        .select('sample_id, green_bean_data, roast_data, cupping_comments, grading_comments, clean_cup, uniform_cup, defect_photos')
        .in('sample_id', sample_ids),

      // Cupping scores for current user only (privacy)
      supabaseAdmin
        .from('cupping_scores')
        .select('sample_id, scores, defects, cupper_id')
        .eq('cupper_id', user.id)
        .in('sample_id', sample_ids),
    ])

    // Build lookup maps
    const assessments: Record<string, any> = {}
    if (assessmentsResult.data) {
      for (const a of assessmentsResult.data) {
        if (a.sample_id) assessments[a.sample_id] = a
      }
    }

    const cupping_scores: Record<string, any> = {}
    if (scoresResult.data) {
      for (const s of scoresResult.data) {
        if (s.sample_id) cupping_scores[s.sample_id] = s
      }
    }

    // Generate signed URLs for defect photos from assessments
    const defect_photos: Record<string, Array<{ path: string; url: string | null; filename: string }>> = {}
    const photoPromises: Promise<void>[] = []

    for (const [sampleId, assessment] of Object.entries(assessments)) {
      const photos = (assessment as any).defect_photos
      if (photos && Array.isArray(photos) && photos.length > 0) {
        photoPromises.push(
          Promise.all(
            photos.map(async (path: string) => {
              const { data: urlData } = await supabase.storage
                .from('defect-photos')
                .createSignedUrl(path, 60 * 60)
              return {
                path,
                url: urlData?.signedUrl || null,
                filename: path.split('/').pop() || path
              }
            })
          ).then(resolved => {
            defect_photos[sampleId] = resolved
          })
        )
      }
    }

    await Promise.all(photoPromises)

    return NextResponse.json({
      assessments,
      cupping_scores,
      defect_photos,
    })
  } catch (error: any) {
    console.error('Error in POST /api/cupping/my-samples/bulk-data:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message || String(error) },
      { status: 500 }
    )
  }
}
