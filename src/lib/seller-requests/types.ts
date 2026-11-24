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
/**
 * Why the final client gets a sample: our pre-approval (Wolthers approved; the
 * sample is for their information) or for their approval (they have the final word).
 */
export type FinalClientPurpose = 'pre_approval' | 'final_approval'

/**
 * A second sample, to the final client (roaster / end client), recorded on sys
 * like the buyer's. `destination` is null while the tick waits for a pick:
 * Send and Finalize wait, and a save never stores it (`dropUnaddressed`).
 */
export interface FinalClientSample { destination: BuyerSampleDestination | null; purpose: FinalClientPurpose }

export interface SellerRequests {
  buyerSample: BuyerSampleDestination | null
  finalClientSample: FinalClientSample | null
  stuffing: boolean
  /** Ask for an additional sample to our lab. */
  additionalSample: boolean
  /** Ask for one shipment sample (SS) of each container. */
  ssPerContainer: boolean
  setBy: string | null
  setAt: string | null
}

/** No request ticked: what a sample starts with when nothing is stored. */
export const NO_REQUESTS: SellerRequests = {
  buyerSample: null, finalClientSample: null, stuffing: false,
  additionalSample: false, ssPerContainer: false, setBy: null, setAt: null,
}

/** A final-client tick still waiting for its address is not a request: drop it before saving or sending. */
export function dropUnaddressed(r: SellerRequests): SellerRequests {
  return r.finalClientSample && !r.finalClientSample.destination ? { ...r, finalClientSample: null } : r
}
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

const purposeSchema = z.enum(['pre_approval', 'final_approval'])

/** Validates the camelCase shape the composer / finalize POST. The three later
 *  ticks default to off, so a page loaded before they existed still posts. */
export const sellerRequestsInputSchema: z.ZodType<SellerRequests> = z.object({
  buyerSample: destinationSchema.nullable(),
  finalClientSample: z
    .object({ destination: destinationSchema.nullable(), purpose: purposeSchema })
    .nullable()
    .default(null),
  stuffing: z.boolean(),
  additionalSample: z.boolean().default(false),
  ssPerContainer: z.boolean().default(false),
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
// Rows stored before the final-client and lab-sample ticks read as those ticks off.
const dbSchema = z.object({
  buyer_sample: dbDestinationSchema.nullable(),
  final_client_sample: z
    .object({ destination: dbDestinationSchema.nullable(), purpose: purposeSchema })
    .nullable()
    .default(null),
  stuffing: z.boolean(),
  additional_sample: z.boolean().default(false),
  ss_per_container: z.boolean().default(false),
  set_by: z.string().nullable(),
  set_at: z.string().nullable(),
})

type DbDestination = z.infer<typeof dbDestinationSchema>

function destinationFromDb(b: DbDestination): BuyerSampleDestination {
  return {
    companyId: b.company_id, companyName: b.company_name, savedAddressId: b.saved_address_id,
    lines: b.lines, country: b.country, recipientName: b.recipient_name,
    attention: b.attention, phone: b.phone, instructions: b.instructions,
  }
}

function destinationToDb(b: BuyerSampleDestination): DbDestination {
  return {
    company_id: b.companyId, company_name: b.companyName, saved_address_id: b.savedAddressId,
    lines: b.lines, country: b.country, recipient_name: b.recipientName,
    attention: b.attention, phone: b.phone, instructions: b.instructions,
  }
}

/** samples.seller_requests (snake_case jsonb) to the camelCase shape; anything invalid is null. */
export function sellerRequestsFromDb(json: unknown): SellerRequests | null {
  const p = dbSchema.safeParse(json)
  if (!p.success) return null
  const d = p.data
  const f = d.final_client_sample
  return {
    buyerSample: d.buyer_sample && destinationFromDb(d.buyer_sample),
    finalClientSample: f && {
      destination: f.destination && destinationFromDb(f.destination),
      purpose: f.purpose,
    },
    stuffing: d.stuffing,
    additionalSample: d.additional_sample,
    ssPerContainer: d.ss_per_container,
    setBy: d.set_by,
    setAt: d.set_at,
  }
}

export function sellerRequestsToDb(r: SellerRequests): Record<string, unknown> {
  const f = r.finalClientSample
  return {
    buyer_sample: r.buyerSample && destinationToDb(r.buyerSample),
    final_client_sample: f && {
      destination: f.destination && destinationToDb(f.destination),
      purpose: f.purpose,
    },
    stuffing: r.stuffing,
    additional_sample: r.additionalSample,
    ss_per_container: r.ssPerContainer,
    set_by: r.setBy,
    set_at: r.setAt,
  }
}
