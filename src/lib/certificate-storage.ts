import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Certificate PDF caching is DISABLED (product decision 2026-06-19).
 *
 * Certificates are now always rendered on the fly from current sample data at
 * download / email time, and delivered via the end-of-day batch email. We no
 * longer persist PDFs to Supabase Storage, so:
 *   - there is no stale-PDF risk now that editors can edit certificates anytime;
 *   - the `certificates` storage bucket stops growing;
 *   - `pdf_url` is never written, so every read path regenerates fresh.
 *
 * The functions below are kept as no-ops so existing callers compile unchanged.
 */

/**
 * No-op: certificate PDFs are no longer saved to storage.
 * Returns null so callers treat it as "nothing cached".
 */
export async function uploadCertificatePdf(
  _supabase: SupabaseClient,
  _sampleId: string,
  _certificateId: string,
  _pdfBuffer: Buffer | Uint8Array,
  _contractId?: string
): Promise<string | null> {
  return null
}

/**
 * No-op: PDFs are always regenerated on the fly, never served from cache.
 * Returns null so callers fall through to fresh generation.
 */
export async function getCachedCertificatePdf(
  _supabase: SupabaseClient,
  _pdfUrl: string
): Promise<Buffer | null> {
  return null
}

/**
 * Invalidate (delete) all cached certificate PDFs for a sample.
 * Also clears pdf_url on all certificate records for that sample.
 */
export async function invalidateCertificatePdf(
  supabase: SupabaseClient,
  sampleId: string
): Promise<void> {
  try {
    // List all files in the sample's certificate folder
    const { data: files, error: listError } = await supabase.storage
      .from('certificates')
      .list(sampleId)

    if (listError) {
      console.error('[CertStorage] List failed:', listError.message)
      return
    }

    if (files && files.length > 0) {
      const paths = files.map((f) => `${sampleId}/${f.name}`)
      const { error: removeError } = await supabase.storage
        .from('certificates')
        .remove(paths)

      if (removeError) {
        console.error('[CertStorage] Remove failed:', removeError.message)
      }
    }

    // Clear pdf_url on all certificates for this sample
    const { error: updateError } = await supabase
      .from('certificates')
      .update({ pdf_url: null })
      .eq('sample_id', sampleId)

    if (updateError) {
      console.error('[CertStorage] Clear pdf_url failed:', updateError.message)
    }
  } catch (err) {
    console.error('[CertStorage] invalidateCertificatePdf error:', err)
  }
}
