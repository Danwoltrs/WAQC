import { cache } from 'react'
import { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { resolveSampleIdForSlug } from '@/lib/certificate-slug'
import { labSourceId } from '@/lib/sample-group'
import { sampleLabelText, shownCertificateNumber } from '@/lib/sample-reference'
import { SamplePhotoViewer } from './photo-viewer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ buyer?: string | string[] }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The slug names the sample three ways:
 *   - its certificate number (`?buyer=` breaks a tie between two clients'
 *     identical numbers) — what certificate PDFs carry now;
 *   - its sample id — a lot with no real certificate number;
 *   - the legacy SAN- lab number — every certificate PDF sent before the
 *     switch. resolveSampleIdForSlug tries the certificate number first and
 *     falls back to it, so those QR codes keep working.
 * Whatever the slug was, the page only ever SHOWS the certificate number or
 * the lot's own identifier — never the lab number.
 */
async function resolveSampleId(slug: string, buyerSlug: string | null): Promise<string | null> {
  if (UUID_RE.test(slug)) {
    const { data } = await supabase
      .from('samples')
      .select('id')
      .eq('id', slug)
      .is('deleted_at', null)
      .maybeSingle()
    return data?.id ?? null
  }
  return resolveSampleIdForSlug(supabase, slug, buyerSlug)
}

const getSamplePhotoData = cache(async (slug: string, buyerSlug: string | null) => {
  const sampleId = await resolveSampleId(slug, buyerSlug)
  if (!sampleId) return null

  const { data: sample } = await supabase
    .from('samples')
    .select(`
      id,
      lab_source_sample_id,
      container_nr,
      ico_number,
      exporter_sample_number,
      exporter_legacy,
      origin
    `)
    .eq('id', sampleId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!sample) return null

  // Get certificate info
  const { data: certificate } = await supabase
    .from('certificates')
    .select('id, certificate_number')
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

  const certificateNumber = certificate?.id ? shownCertificateNumber(certificate.certificate_number) : null
  // The certificate number once issued, else the lot's own tagged identifier.
  const label = sampleLabelText({
    container_nr: sample.container_nr,
    ico_number: sample.ico_number,
    exporter_sample_number: sample.exporter_sample_number,
    certificate_id: certificate?.id ?? null,
    certificate_number: certificate?.certificate_number ?? null,
  })
  // The lot's identifier when the headline is the certificate number.
  const lotReference = certificateNumber
    ? sampleLabelText({
        container_nr: sample.container_nr,
        ico_number: sample.ico_number,
        exporter_sample_number: sample.exporter_sample_number,
      }, '')
    : ''

  return {
    label,
    certificateNumber,
    lotReference: lotReference || null,
    shipper: sample.exporter_legacy || null,
    origin: sample.origin || null,
    photoUrls: signedUrls,
  }
})

function buyerParam(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value
  return v?.trim() || null
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const buyer = buyerParam((await searchParams).buyer)
  const data = await getSamplePhotoData(slug, buyer)
  if (!data) {
    return { title: 'Sample Photo | Wolthers QC', description: 'Sample photo' }
  }
  return {
    title: `Sample Photo - ${data.label} | Wolthers QC`,
    description: `View sample photo for ${data.label}`,
  }
}

export default async function SamplePhotoPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const buyer = buyerParam((await searchParams).buyer)
  const data = await getSamplePhotoData(slug, buyer)

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
