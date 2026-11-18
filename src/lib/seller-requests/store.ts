import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchGroup } from '@/lib/sample-group'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { defaultDestination } from './destinations'
import { enforceLocks, resolveRules, startingRequests, tickLocks } from './rules'
import {
  sellerRequestsFromDb, sellerRequestsToDb,
  type FinalWord, type FinalWordOverrides, type FinalWordSettings, type ResolvedRules,
  type SellerRequests, type StuffingRule, type TickLocks,
} from './types'

export interface SellerRequestState {
  sampleId: string
  contractNumber: string | null
  sampleType: string | null
  decision: string | null
  clientId: string | null
  clientName: string | null
  importerId: string | null
  roasterId: string | null
  rules: ResolvedRules
  locks: TickLocks
  requests: SellerRequests
}

const SETTINGS_COLUMNS = 'final_word, final_word_fixed, buyer_sample_address_id, stuffing_request'

type Row = Record<string, any>

function asFinalWord(v: unknown): FinalWord | null {
  return v === 'wolthers' || v === 'pre_approval' ? v : null
}
function asStuffing(v: unknown): StuffingRule | null {
  return v === 'off' || v === 'prechecked' || v === 'fixed_on' ? v : null
}

/**
 * One guarded select: only an undefined-column error (42703 / PGRST204, the
 * migration not applied yet) reads as no rows. Any other error throws, so a
 * transient failure can never read as "default rules" and unlock a fixed tick.
 */
async function guarded(q: PromiseLike<{ data: unknown; error: any }>): Promise<Row[]> {
  const { data, error } = await q
  if (error) {
    if (error.code === '42703' || error.code === 'PGRST204') return []
    throw error
  }
  return (data ?? []) as Row[]
}

/** May throw on a real DB failure; callers catch and fall back to "no ticks". */
export async function loadSellerRequestStates(
  admin: SupabaseClient<any>,
  sampleIds: string[],
): Promise<Map<string, SellerRequestState>> {
  const out = new Map<string, SellerRequestState>()
  const ids = [...new Set(sampleIds)]
  if (ids.length === 0) return out

  const { data: sampleRows, error: samplesError } = await admin
    .from('samples')
    .select('id, sample_type, status, client_id, quality_spec_id, importer_id, roaster_id, wolthers_contract_nr')
    .in('id', ids)
  if (samplesError) throw samplesError
  const samples = (sampleRows ?? []) as Row[]
  if (samples.length === 0) return out

  const storedRows = await guarded(admin.from('samples').select('id, seller_requests').in('id', ids))
  const stored = new Map(storedRows.map((r) => [r.id as string, sellerRequestsFromDb(r.seller_requests)]))

  const clientIds = [...new Set(samples.map((s) => s.client_id).filter(Boolean))] as string[]
  const qualityIds = [...new Set(samples.map((s) => s.quality_spec_id).filter(Boolean))] as string[]

  const companyRows = clientIds.length
    ? await guarded(admin.from('companies').select('id, name, fantasy_name').in('id', clientIds))
    : []
  const settingsRows = clientIds.length
    ? await guarded(admin.from('qc_client_settings').select(`company_id, ${SETTINGS_COLUMNS}`).in('company_id', clientIds))
    : []
  const qualityNameRows = qualityIds.length
    ? await guarded(admin.from('client_qualities').select('id, custom_name, template:quality_templates(name)').in('id', qualityIds))
    : []
  const qualityRuleRows = qualityIds.length
    ? await guarded(admin.from('client_qualities').select(`id, ${SETTINGS_COLUMNS}`).in('id', qualityIds))
    : []

  const company = new Map(companyRows.map((c) => [c.id as string, c]))
  const settings = new Map(settingsRows.map((r) => [r.company_id as string, r]))
  const qualityRules = new Map(qualityRuleRows.map((r) => [r.id as string, r]))
  const qualityName = new Map(qualityNameRows.map((q) => {
    const t = Array.isArray(q.template) ? q.template[0] : q.template
    return [q.id as string, (q.custom_name?.trim?.() || t?.name?.trim?.() || null) as string | null]
  }))

  for (const s of samples) {
    const st = s.client_id ? settings.get(s.client_id) : undefined
    const buyer: Partial<FinalWordSettings> | null = st
      ? {
          finalWord: asFinalWord(st.final_word) ?? undefined,
          fixed: typeof st.final_word_fixed === 'boolean' ? st.final_word_fixed : undefined,
          addressId: st.buyer_sample_address_id ?? null,
          stuffing: asStuffing(st.stuffing_request) ?? undefined,
        }
      : null
    const qr = s.quality_spec_id ? qualityRules.get(s.quality_spec_id) : undefined
    const quality: FinalWordOverrides | null = qr
      ? {
          finalWord: asFinalWord(qr.final_word),
          fixed: typeof qr.final_word_fixed === 'boolean' ? qr.final_word_fixed : null,
          addressId: qr.buyer_sample_address_id ?? null,
          stuffing: asStuffing(qr.stuffing_request),
        }
      : null

    const rules = resolveRules(buyer, quality)
    const clientName = s.client_id ? companyDisplayName(company.get(s.client_id) as never) : ''
    const locks = tickLocks(rules, {
      clientName,
      qualityName: s.quality_spec_id ? qualityName.get(s.quality_spec_id) ?? null : null,
    })
    const storedValue = stored.get(s.id) ?? null

    let destination = null
    if (s.client_id && (rules.finalWord === 'pre_approval' || storedValue?.buyerSample)) {
      destination = await defaultDestination(admin, { clientId: s.client_id, addressId: rules.addressId })
    }
    out.set(s.id, {
      sampleId: s.id,
      contractNumber: s.wolthers_contract_nr ?? null,
      sampleType: s.sample_type ?? null,
      decision: s.status ?? null,
      clientId: s.client_id ?? null,
      clientName: clientName || null,
      importerId: s.importer_id ?? null,
      roasterId: s.roaster_id ?? null,
      rules,
      locks,
      requests: startingRequests(rules, storedValue, destination),
    })
  }
  return out
}

/** Group members in fetchGroup order, PSS only. May throw on a real DB failure; callers catch and fall back to "no ticks". */
export async function loadGroupSellerRequestStates(
  admin: SupabaseClient<any>,
  sampleId: string,
): Promise<SellerRequestState[]> {
  const group = await fetchGroup(admin, sampleId)
  const pss = group.filter((m: Row) => m.sample_type === 'pss').map((m: Row) => m.id as string)
  const states = await loadSellerRequestStates(admin, pss)
  return pss.map((id) => states.get(id)).filter((s): s is SellerRequestState => !!s)
}

export async function saveSellerRequests(
  admin: SupabaseClient<any>,
  userId: string,
  entries: Record<string, SellerRequests>,
  opts: { allowedIds: Set<string> },
): Promise<{ saved: string[]; refused: Record<string, string[]> }> {
  const saved: string[] = []
  const refused: Record<string, string[]> = {}
  const ids = Object.keys(entries).filter((id) => opts.allowedIds.has(id))
  if (ids.length === 0) return { saved, refused }

  let states: Map<string, SellerRequestState>
  try {
    states = await loadSellerRequestStates(admin, ids)
  } catch (e) {
    console.error('[seller-requests] load for save failed', e)
    return { saved, refused }
  }
  const now = new Date().toISOString()
  for (const id of ids) {
    const state = states.get(id)
    if (!state) continue
    try {
      const { value, refused: r } = enforceLocks(state.rules, entries[id], state.requests)
      if (r.length) refused[id] = r
      const { error } = await admin
        .from('samples')
        .update({ seller_requests: sellerRequestsToDb({ ...value, setBy: userId, setAt: now }) })
        .eq('id', id)
      if (error) {
        console.error('[seller-requests] write failed', id, error)
        continue
      }
      saved.push(id)
    } catch (e) {
      console.error('[seller-requests] write failed', id, e)
    }
  }
  return { saved, refused }
}
