import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const BUCKET_NAME = 'defect-photos'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

/**
 * POST /api/samples/[id]/photos
 * Upload a defect photo for a sample
 * Expects multipart/form-data with 'file' field
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

    const { id: sampleId } = await params

    // Verify sample exists
    const { data: sample, error: sampleError } = await supabase
      .from('samples')
      .select('id, tracking_number, laboratory_id')
      .eq('id', sampleId)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Get the file from form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB.' },
        { status: 400 }
      )
    }

    // Generate unique filename
    const timestamp = Date.now()
    const extension = file.name.split('.').pop() || 'jpg'
    const filename = `${timestamp}_${Math.random().toString(36).substring(7)}.${extension}`
    const filePath = `${sample.laboratory_id}/${sampleId}/${filename}`

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload file', details: uploadError.message },
        { status: 500 }
      )
    }

    // Get the public URL (signed URL for private bucket)
    const { data: urlData } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, 60 * 60 * 24 * 365) // 1 year expiry

    const photoUrl = urlData?.signedUrl || filePath

    // Update quality_assessments to add the photo URL
    // First, get or create the quality assessment
    const { data: existingAssessment } = await supabase
      .from('quality_assessments')
      .select('id, defect_photos')
      .eq('sample_id', sampleId)
      .single()

    if (existingAssessment) {
      // Append to existing photos array
      const currentPhotos = existingAssessment.defect_photos || []
      const updatedPhotos = [...currentPhotos, filePath]

      const { error: updateError } = await supabase
        .from('quality_assessments')
        .update({ defect_photos: updatedPhotos })
        .eq('id', existingAssessment.id)

      if (updateError) {
        console.error('Failed to update assessment with photo:', updateError)
      }
    } else {
      // Create new assessment with the photo
      const { error: insertError } = await supabase
        .from('quality_assessments')
        .insert({
          sample_id: sampleId,
          assessor_id: user.id,
          defect_photos: [filePath]
        })

      if (insertError) {
        console.error('Failed to create assessment with photo:', insertError)
      }
    }

    return NextResponse.json({
      success: true,
      photo: {
        path: filePath,
        url: photoUrl,
        filename: filename
      }
    })
  } catch (error: any) {
    console.error('Error uploading photo:', error)
    return NextResponse.json(
      { error: 'Failed to upload photo', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/samples/[id]/photos
 * Get all defect photos for a sample
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

    const { id: sampleId } = await params

    // Get quality assessment with photos
    const { data: assessment, error: assessmentError } = await supabase
      .from('quality_assessments')
      .select('defect_photos')
      .eq('sample_id', sampleId)
      .single()

    if (assessmentError && assessmentError.code !== 'PGRST116') {
      console.error('Failed to fetch assessment:', assessmentError)
      return NextResponse.json(
        { error: 'Failed to fetch photos' },
        { status: 500 }
      )
    }

    const photoPaths = assessment?.defect_photos || []

    // Generate signed URLs for each photo
    const photos = await Promise.all(
      photoPaths.map(async (path: string) => {
        const { data: urlData } = await supabase.storage
          .from(BUCKET_NAME)
          .createSignedUrl(path, 60 * 60) // 1 hour expiry for viewing

        return {
          path,
          url: urlData?.signedUrl || null,
          filename: path.split('/').pop() || path
        }
      })
    )

    return NextResponse.json({ photos })
  } catch (error: any) {
    console.error('Error fetching photos:', error)
    return NextResponse.json(
      { error: 'Failed to fetch photos', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/samples/[id]/photos
 * Delete a defect photo
 * Query param: path (the storage path to delete)
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

    const { id: sampleId } = await params
    const { searchParams } = new URL(request.url)
    const photoPath = searchParams.get('path')

    if (!photoPath) {
      return NextResponse.json({ error: 'Photo path required' }, { status: 400 })
    }

    // Delete from storage
    const { error: deleteError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([photoPath])

    if (deleteError) {
      console.error('Failed to delete from storage:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete photo', details: deleteError.message },
        { status: 500 }
      )
    }

    // Remove from quality_assessments array
    const { data: assessment } = await supabase
      .from('quality_assessments')
      .select('id, defect_photos')
      .eq('sample_id', sampleId)
      .single()

    if (assessment) {
      const updatedPhotos = (assessment.defect_photos || []).filter(
        (p: string) => p !== photoPath
      )

      await supabase
        .from('quality_assessments')
        .update({ defect_photos: updatedPhotos })
        .eq('id', assessment.id)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting photo:', error)
    return NextResponse.json(
      { error: 'Failed to delete photo', details: error.message },
      { status: 500 }
    )
  }
}
