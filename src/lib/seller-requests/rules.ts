import type {
  BuyerSampleDestination, FinalWordOverrides, FinalWordSettings, ResolvedRules,
  SellerRequests, TickLocks,
} from './types'

/** Quality overrides win per field over the buyer's setting, which wins over the default. */
export function resolveRules(buyer: Partial<FinalWordSettings> | null, quality: FinalWordOverrides | null): ResolvedRules {
  const finalWordFrom = quality?.finalWord != null ? 'quality' : buyer?.finalWord != null ? 'buyer' : 'default'
  const stuffingFrom = quality?.stuffing != null ? 'quality' : buyer?.stuffing != null ? 'buyer' : 'default'
  return {
    finalWord: quality?.finalWord ?? buyer?.finalWord ?? 'wolthers',
    fixed: finalWordFrom === 'quality' ? (quality?.fixed ?? false) : (buyer?.fixed ?? false),
    addressId: quality?.addressId ?? buyer?.addressId ?? null,
    stuffing: quality?.stuffing ?? buyer?.stuffing ?? 'off',
    finalWordFrom,
    stuffingFrom,
  }
}

export function tickLocks(rules: ResolvedRules, names: { clientName: string; qualityName: string | null }): TickLocks {
  const label = (from: 'quality' | 'buyer' | 'default') =>
    from === 'quality' && names.qualityName ? `${names.clientName} · ${names.qualityName}` : names.clientName
  // Pre-approval points the buyer sample on, fixed or not; Wolthers points it off.
  const on = rules.finalWord === 'pre_approval'
  const buyerSample = rules.fixed
    ? {
        locked: true,
        on,
        reason: rules.finalWord === 'wolthers'
          ? `${label(rules.finalWordFrom)}: Wolthers has the final word`
          : `${label(rules.finalWordFrom)}: pre-approval, sample to ${names.clientName}`,
      }
    : { locked: false, on, reason: null }
  const stuffing = rules.stuffing === 'fixed_on'
    ? { locked: true, on: true, reason: `${label(rules.stuffingFrom)}: stuffing request always on` }
    : { locked: false, on: false, reason: null }
  return { buyerSample, stuffing }
}

export function startingRequests(
  rules: ResolvedRules,
  stored: SellerRequests | null,
  defaultDestination: BuyerSampleDestination | null,
): SellerRequests {
  let buyerSample: BuyerSampleDestination | null
  if (rules.finalWord === 'wolthers') {
    buyerSample = rules.fixed ? null : stored?.buyerSample ?? null
  } else if (rules.fixed) {
    buyerSample = stored?.buyerSample ?? defaultDestination
  } else {
    buyerSample = stored ? stored.buyerSample : defaultDestination
  }
  const stuffing = rules.stuffing === 'fixed_on' ? true : stored ? stored.stuffing : rules.stuffing === 'prechecked'
  // The final-client sample and the two lab samples have no rules: as stored, else off.
  return {
    buyerSample,
    finalClientSample: stored?.finalClientSample ?? null,
    stuffing,
    additionalSample: stored?.additionalSample ?? false,
    ssPerContainer: stored?.ssPerContainer ?? false,
    setBy: stored?.setBy ?? null,
    setAt: stored?.setAt ?? null,
  }
}

/**
 * Server-side: put locked ticks back where the rules say and report which were refused.
 * `current` must be the `startingRequests(...)` output for this sample, so that under a
 * fixed pre_approval it carries the default destination to restore.
 */
export function enforceLocks(
  rules: ResolvedRules,
  incoming: SellerRequests,
  current: SellerRequests,
): { value: SellerRequests; refused: Array<'buyerSample' | 'stuffing'> } {
  const refused: Array<'buyerSample' | 'stuffing'> = []
  const value: SellerRequests = { ...incoming }
  if (rules.fixed) {
    if (rules.finalWord === 'wolthers' && incoming.buyerSample) {
      value.buyerSample = null
      refused.push('buyerSample')
    } else if (rules.finalWord === 'pre_approval' && !incoming.buyerSample) {
      value.buyerSample = current.buyerSample
      refused.push('buyerSample')
    }
  }
  if (rules.stuffing === 'fixed_on' && !incoming.stuffing) {
    value.stuffing = true
    refused.push('stuffing')
  }
  return { value, refused }
}
