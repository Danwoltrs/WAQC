import { isUUID, slugToTrackingNumber } from '@/lib/utils'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve sample UUID from either UUID or tracking number slug
 * Returns the UUID if successful, null if not found
 */
export async function resolveSampleId(
  supabase: SupabaseClient,
  idOrSlug: string
): Promise<{ id: string | null; error?: string }> {
  if (isUUID(idOrSlug)) {
    return { id: idOrSlug }
  }

  // Convert slug to tracking number and look up
  const trackingNumber = slugToTrackingNumber(idOrSlug)
  const { data, error } = await supabase
    .from('samples')
    .select('id')
    .eq('tracking_number', trackingNumber)
    .single()

  if (error || !data) {
    return { id: null, error: 'Sample not found' }
  }

  return { id: data.id }
}
