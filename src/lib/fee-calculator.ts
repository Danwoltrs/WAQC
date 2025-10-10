/**
 * Fee Calculator Utility
 * Calculates sample fees based on client pricing model and lot size
 */

import { Database } from './supabase'

type Client = Database['public']['Tables']['clients']['Row']
type Sample = Database['public']['Tables']['samples']['Row']

export interface FeeCalculation {
  fee: number
  currency: string
  breakdown: {
    pricingModel: 'per_sample' | 'per_pound'
    totalPounds?: number
    pricePerPound?: number
    pricePerSample?: number
    lotSize?: string
  }
}

const MT_TO_LBS = 2204.62
const KG_TO_LBS = 2.20462

/**
 * Calculate fee for a sample based on client pricing model
 */
export function calculateSampleFee(
  client: Pick<Client, 'pricing_model' | 'price_per_sample' | 'price_per_pound_cents' | 'currency'>,
  sample: Pick<Sample, 'bags_quantity_mt' | 'bag_count' | 'bag_weight_kg'>
): FeeCalculation | null {

  // Default currency
  const currency = client.currency || 'USD'

  // Per sample pricing (flat fee)
  if (client.pricing_model === 'per_sample') {
    if (!client.price_per_sample) return null

    return {
      fee: client.price_per_sample,
      currency,
      breakdown: {
        pricingModel: 'per_sample',
        pricePerSample: client.price_per_sample
      }
    }
  }

  // Per pound pricing (based on lot size)
  if (client.pricing_model === 'per_pound') {
    if (!client.price_per_pound_cents) return null

    let totalPounds = 0
    let lotSize = ''

    // Priority 1: Use bags_quantity_mt (most accurate)
    if (sample.bags_quantity_mt) {
      totalPounds = sample.bags_quantity_mt * MT_TO_LBS
      lotSize = `${sample.bags_quantity_mt} M/T`
    }
    // Priority 2: Calculate from bag_count × bag_weight_kg
    else if (sample.bag_count && sample.bag_weight_kg) {
      const totalKg = sample.bag_count * sample.bag_weight_kg
      totalPounds = totalKg * KG_TO_LBS
      lotSize = `${sample.bag_count} bags × ${sample.bag_weight_kg}kg`
    }
    else {
      // No lot size data available
      return null
    }

    // Calculate fee (minimum 0.25¢/lb)
    const centsPerPound = Math.max(client.price_per_pound_cents, 0.25)
    const fee = totalPounds * (centsPerPound / 100)

    return {
      fee: parseFloat(fee.toFixed(2)),
      currency,
      breakdown: {
        pricingModel: 'per_pound',
        totalPounds: parseFloat(totalPounds.toFixed(2)),
        pricePerPound: centsPerPound,
        lotSize
      }
    }
  }

  return null
}

/**
 * Format fee for display
 */
export function formatFee(fee: number | null | undefined, currency: string = 'USD'): string {
  if (fee === null || fee === undefined) return 'N/A'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(fee)
}

/**
 * Format price per pound for display
 */
export function formatPricePerPound(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return 'N/A'
  return `${cents}¢/lb`
}

/**
 * Convert metric tons to pounds
 */
export function convertMTToPounds(mt: number): number {
  return mt * MT_TO_LBS
}

/**
 * Convert bags to pounds
 */
export function convertBagsToPounds(bagCount: number, bagWeightKg: number): number {
  return (bagCount * bagWeightKg) * KG_TO_LBS
}

/**
 * Get common bag weights for origin
 */
export function getCommonBagWeights(origin?: string): number[] {
  const defaults = [30, 59, 60, 70, 1000]

  if (!origin) return defaults

  const originLower = origin.toLowerCase()

  // Colombia & Peru: 70kg, 30kg
  if (originLower.includes('colombia') || originLower.includes('peru')) {
    return [70, 30, 60, 1000]
  }

  // Brazil: 30, 59, 60
  if (originLower.includes('brazil')) {
    return [60, 59, 30, 1000]
  }

  return defaults
}

/**
 * Validate pricing model data
 */
export function validatePricingData(data: {
  pricing_model: 'per_sample' | 'per_pound'
  price_per_sample?: number
  price_per_pound_cents?: number
}): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (data.pricing_model === 'per_sample') {
    if (!data.price_per_sample || data.price_per_sample <= 0) {
      errors.push('Price per sample must be greater than 0')
    }
  }

  if (data.pricing_model === 'per_pound') {
    if (!data.price_per_pound_cents || data.price_per_pound_cents < 0.25) {
      errors.push('Price per pound must be at least 0.25¢')
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}
