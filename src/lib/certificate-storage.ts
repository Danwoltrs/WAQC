import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Upload a certificate PDF to Supabase Storage and save the path in the certificate record.
 * Path format: {sampleId}/{certificateId}.pdf
 */
export async function uploadCertificatePdf(
  supabase: SupabaseClient,
  sampleId: string,
  certificateId: string,
  pdfBuffer: Buffer | Uint8Array,
  contractId?: string
): Promise<string | null> {
  try {
    const suffix = contractId ? `-${contractId}` : ''
    const storagePath = `${sampleId}/${certificateId}${suffix}.pdf`

    const { error: uploadError } = await supabase.storage
      .from('certificates')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('[CertStorage] Upload failed:', uploadError.message)
      return null
    }

    // Save the storage path in the certificate record
    const { error: updateError } = await supabase
      .from('certificates')
      .update({ pdf_url: storagePath })
      .eq('id', certificateId)

    if (updateError) {
      console.error('[CertStorage] Failed to save pdf_url:', updateError.message)
    }

    return storagePath
  } catch (err) {
    console.error('[CertStorage] uploadCertificatePdf error:', err)
    return null
  }
}

/**
 * Download a cached certificate PDF from Supabase Storage.
 * Returns the PDF as a Buffer, or null if not found.
 */
export async function getCachedCertificatePdf(
  supabase: SupabaseClient,
  pdfUrl: string
): Promise<Buffer | null> {
  try {
    const { data, error } = await supabase.storage
      .from('certificates')
      .download(pdfUrl)

    if (error || !data) {
      console.error('[CertStorage] Download failed:', error?.message)
      return null
    }

    const arrayBuffer = await data.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (err) {
    console.error('[CertStorage] getCachedCertificatePdf error:', err)
    return null
  }
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
