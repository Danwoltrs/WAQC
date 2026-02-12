import { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { slugToTrackingNumber, trackingNumberToSlug } from '@/lib/utils'
import { redirect } from 'next/navigation'
import { CertificatePageClient } from './certificate-page-client'

// Use service role for server-side data fetching
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

interface PageProps {
  params: Promise<{ slug: string }>
}

async function getCertificateInfo(slug: string) {
  const trackingNumber = slugToTrackingNumber(slug)

  // Find sample
  let sample: any = null
  const { data: directMatch } = await supabase
    .from('samples')
    .select(`
      id,
      tracking_number,
      origin,
      workflow_stage,
      status,
      quality_spec:client_qualities(custom_name, quality_code, template:quality_templates(name_en))
    `)
    .eq('tracking_number', trackingNumber)
    .is('deleted_at', null)
    .maybeSingle()

  if (directMatch) {
    sample = directMatch
  } else {
    const { data: fallback } = await supabase
      .from('samples')
      .select(`
        id,
        tracking_number,
        origin,
        workflow_stage,
        status,
        quality_spec:client_qualities(custom_name, quality_code, template:quality_templates(name_en))
      `)
      .ilike('tracking_number', trackingNumber)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    sample = fallback
  }

  if (!sample) return null

  const isCertified = sample.workflow_stage === 'certified' || sample.workflow_stage === 'rejected'
  if (!isCertified) return { sample, certified: false }

  // Get certificate
  const { data: certificate } = await supabase
    .from('certificates')
    .select('id, certificate_number, status, is_rejected, created_at, pdf_url')
    .eq('sample_id', sample.id)
    .is('sample_contract_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Get quality assessment
  const { data: assessment } = await supabase
    .from('quality_assessments')
    .select('green_bean_data')
    .eq('sample_id', sample.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const greenBean = assessment?.green_bean_data as any
  const screenSizes = greenBean?.screen_sizes || null
  const defects = greenBean?.defects
  const totalDefects = defects
    ? (defects.total_primary || 0) + (defects.total_secondary || 0)
    : null

  const qualitySpec = sample.quality_spec as any
  const qualityName = qualitySpec?.custom_name || qualitySpec?.template?.name_en || null

  return {
    sample,
    certified: true,
    certificate,
    qualityName,
    screenSizes,
    totalDefects,
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const info = await getCertificateInfo(slug)

  if (!info || !info.certified) {
    return {
      title: 'Certificate - Wolthers Coffee QC',
      description: 'Coffee quality certificate',
    }
  }

  const status = info.certificate?.is_rejected ? 'REJECTED' : 'APPROVED'
  const trackingNumber = info.sample.tracking_number

  return {
    title: `Certificate: ${trackingNumber} - ${status}`,
    description: `Quality certificate for ${trackingNumber}. Origin: ${info.sample.origin || 'N/A'}. ${info.qualityName ? `Quality: ${info.qualityName}.` : ''} Total defects: ${info.totalDefects ?? 'N/A'}.`,
    openGraph: {
      title: `Certificate: ${trackingNumber} - ${status}`,
      description: `Quality certificate for ${trackingNumber}. Status: ${status}.`,
      type: 'website',
    },
  }
}

export default async function CertificatePage({ params }: PageProps) {
  const { slug } = await params
  const info = await getCertificateInfo(slug)

  // If sample not found, show 404
  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F9FA] dark:bg-[#2A2A2A]">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">Certificate Not Found</h1>
          <p className="text-muted-foreground">The requested certificate could not be found.</p>
        </div>
      </div>
    )
  }

  // If not certified, redirect to authenticated sample page
  if (!info.certified) {
    redirect(`/samples/${trackingNumberToSlug(info.sample.tracking_number)}`)
  }

  const status = info.certificate?.is_rejected ? 'REJECTED' : 'APPROVED'
  const pdfUrl = `/api/certificate/${slug}/pdf`

  return (
    <CertificatePageClient
      trackingNumber={info.sample.tracking_number}
      status={status}
      approvalDate={info.certificate?.created_at || null}
      origin={info.sample.origin || 'N/A'}
      qualityName={info.qualityName}
      screenSizes={info.screenSizes}
      totalDefects={info.totalDefects}
      pdfUrl={pdfUrl}
    />
  )
}
