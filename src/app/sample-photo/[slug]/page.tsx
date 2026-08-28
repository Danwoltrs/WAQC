import { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { slugToTrackingNumber } from '@/lib/utils'
import { labSourceId } from '@/lib/sample-group'
import { SamplePhotoViewer } from './photo-viewer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

interface PageProps {
  params: Promise<{ slug: string }>
}

async function getSamplePhotoData(slug: string) {
  const trackingNumber = slugToTrackingNumber(slug)

  // Find sample
  const { data: sample } = await supabase
    .from('samples')
    .select(`
      id,
      lab_source_sample_id,
      tracking_number,
      workflow_stage,
      exporter_legacy,
      origin
    `)
    .eq('tracking_number', trackingNumber)
    .is('deleted_at', null)
    .maybeSingle()

  if (!sample) return null

  // Get certificate info
  const { data: certificate } = await supabase
    .from('certificates')
    .select('certificate_number')
    .eq('sample_id', sample.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Get photos from quality assessment. A contract sibling was never on the
  // bench — its photos are the lab unit's, so read through the pointer.
  const { data: assessment } = await supabase
    .from('quality_assessments')
    .select('defect_photos')
    .eq('sample_id', labSourceId(sample))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const photos: string[] = assessment?.defect_photos || []
  if (photos.length === 0) return null

  // Generate signed URLs for photos (1-hour expiry for viewing)
  const { data: lab } = await supabase
    .from('samples')
    .select('laboratory_id')
    .eq('id', sample.id)
    .single()

  const signedUrls: string[] = []
  for (const photoPath of photos) {
    const { data: signed } = await supabase
      .storage
      .from('defect-photos')
      .createSignedUrl(photoPath, 3600)
    if (signed?.signedUrl) {
      signedUrls.push(signed.signedUrl)
    }
  }

  if (signedUrls.length === 0) return null

  return {
    trackingNumber: sample.tracking_number,
    certificateNumber: certificate?.certificate_number || null,
    shipper: sample.exporter_legacy || null,
    origin: sample.origin || null,
    photoUrls: signedUrls,
    slug,
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const trackingNumber = slugToTrackingNumber(slug)
  return {
    title: `Sample Photo - ${trackingNumber} | Wolthers QC`,
    description: `View sample photo for ${trackingNumber}`,
  }
}

export default async function SamplePhotoPage({ params }: PageProps) {
  const { slug } = await params
  const data = await getSamplePhotoData(slug)

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-800 mb-2">No Photo Available</h1>
          <p className="text-gray-500">No sample photo has been uploaded for this sample.</p>
        </div>
      </div>
    )
  }

  return <SamplePhotoViewer data={data} />
}
