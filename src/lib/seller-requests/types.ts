import { z } from 'zod/v4'

export type Lang = 'en' | 'pt'
export type FinalWord = 'wolthers' | 'pre_approval'
export type StuffingRule = 'off' | 'prechecked' | 'fixed_on'

export interface FinalWordSettings { finalWord: FinalWord; fixed: boolean; addressId: string | null; stuffing: StuffingRule }
export interface FinalWordOverrides { finalWord: FinalWord | null; fixed: boolean | null; addressId: string | null; stuffing: StuffingRule | null }
export interface ResolvedRules extends FinalWordSettings { finalWordFrom: 'quality' | 'buyer' | 'default'; stuffingFrom: 'quality' | 'buyer' | 'default' }

export interface BuyerSampleDestination {
  companyId: string | null
  companyName: string
  savedAddressId: string | null
  lines: string[]
  country: string | null
  recipientName: string | null
  attention: string | null
  phone: string | null
  instructions: string | null
}
export interface SellerRequests { buyerSample: BuyerSampleDestination | null; stuffing: boolean; setBy: string | null; setAt: string | null }
/**
 * A tick's lock under the final-word rules. `on` is the way the rule points:
 * a locked box is held at `on`; an unlocked buyer sample with `on` is a
 * pre-approval, so it starts ticked when nothing is stored. Stuffing is `on`
 * only when fixed on.
 */
export interface TickLock { locked: boolean; on: boolean; reason: string | null }
export interface TickLocks { buyerSample: TickLock; stuffing: TickLock }

const destinationSchema = z.object({
  companyId: z.string().nullable(),
  companyName: z.string(),
  savedAddressId: z.string().nullable(),
  lines: z.array(z.string()),
  country: z.string().nullable(),
  recipientName: z.string().nullable(),
  attention: z.string().nullable(),
  phone: z.string().nullable(),
  instructions: z.string().nullable(),
})

/** Validates the camelCase shape the composer / finalize POST. */
export const sellerRequestsInputSchema: z.ZodType<SellerRequests> = z.object({
  buyerSample: destinationSchema.nullable(),
  stuffing: z.boolean(),
  setBy: z.string().nullable(),
  setAt: z.string().nullable(),
})

const dbDestinationSchema = z.object({
  company_id: z.string().nullable(),
  company_name: z.string(),
  saved_address_id: z.string().nullable(),
  lines: z.array(z.string()),
  country: z.string().nullable(),
  recipient_name: z.string().nullable(),
  attention: z.string().nullable(),
  phone: z.string().nullable(),
  instructions: z.string().nullable(),
})
const dbSchema = z.object({
  buyer_sample: dbDestinationSchema.nullable(),
  stuffing: z.boolean(),
  set_by: z.string().nullable(),
  set_at: z.string().nullable(),
})

/** samples.seller_requests (snake_case jsonb) to the camelCase shape; anything invalid is null. */
export function sellerRequestsFromDb(json: unknown): SellerRequests | null {
  const p = dbSchema.safeParse(json)
  if (!p.success) return null
  const d = p.data
  const b = d.buyer_sample
  return {
    buyerSample: b && {
      companyId: b.company_id, companyName: b.company_name, savedAddressId: b.saved_address_id,
      lines: b.lines, country: b.country, recipientName: b.recipient_name,
      attention: b.attention, phone: b.phone, instructions: b.instructions,
    },
    stuffing: d.stuffing, setBy: d.set_by, setAt: d.set_at,
  }
}

export function sellerRequestsToDb(r: SellerRequests): Record<string, unknown> {
  const b = r.buyerSample
  return {
    buyer_sample: b && {
      company_id: b.companyId, company_name: b.companyName, saved_address_id: b.savedAddressId,
      lines: b.lines, country: b.country, recipient_name: b.recipientName,
      attention: b.attention, phone: b.phone, instructions: b.instructions,
    },
    stuffing: r.stuffing, set_by: r.setBy, set_at: r.setAt,
  }
}
