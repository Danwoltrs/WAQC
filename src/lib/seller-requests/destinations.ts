import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod/v4'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import type { BuyerSampleDestination } from './types'

// Sample destinations live on sys's own `company_addresses` rows (kind 'sample').
// The schema and the save plan below are ported verbatim from sys
// src/lib/requests/saved-destinations.ts so both apps validate alike.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (v: string): boolean => UUID_RE.test(v)

export const SAVED_DESTINATION_COLUMNS =
  'id, company_id, kind, label, recipient_name, attention, phone, lines, country, instructions, ' +
  'destination_company_id, is_active, updated_at, updated_by, created_by'

const text = (max: number, name: string) =>
  z
    .string()
    .trim()
    .max(max, `${name}: at most ${max.toLocaleString('en-US')} characters`)
    .nullable()
    .transform((v) => v || null)

const FIELDS = {
  label: text(120, 'Label'),
  recipient_name: text(200, 'Recipient name'),
  attention: text(200, 'Attention'),
  phone: text(80, 'Phone'),
  lines: z
    .string({ error: 'Address is required' })
    .trim()
    .min(1, 'Address is required')
    .max(600, 'Address: at most 600 characters'),
  country: text(80, 'Country'),
  instructions: text(2000, 'Instructions'),
  destination_company_id: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === '' || isUuid(v), 'Linked company must be a company id')
    .nullable()
    .transform((v) => v || null),
}

const orNull = <T>(s: z.ZodType<T | null, unknown>) => s.optional().transform((v): T | null => v ?? null)

const savedDestinationInputSchema = z.object({
  label: orNull(FIELDS.label),
  recipient_name: orNull(FIELDS.recipient_name),
  attention: orNull(FIELDS.attention),
  phone: orNull(FIELDS.phone),
  lines: FIELDS.lines,
  country: orNull(FIELDS.country),
  instructions: orNull(FIELDS.instructions),
  destination_company_id: orNull(FIELDS.destination_company_id),
})

const requiredLabel = z
  .string({ error: 'Label is required' })
  .trim()
  .min(1, 'Label is required')
  .max(120, 'Label: at most 120 characters')

export const staffDestinationInputSchema = savedDestinationInputSchema.extend({ label: requiredLabel })

export const MAX_SAVED_SAMPLE_ADDRESSES = 50

export function sameAddressKey(lines: string): string {
  return lines
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
}

export type SampleAddressSavePlan<T> =
  | { action: 'repeat'; row: T }
  | { action: 'full'; error: string }
  | { action: 'insert' }

export function planSampleAddressSave<T extends { kind?: string; lines: string; is_active?: boolean | null }>(
  onFile: T[],
  lines: string,
): SampleAddressSavePlan<T> {
  const key = sameAddressKey(lines)
  const repeat = onFile.find((a) => a.is_active !== false && sameAddressKey(a.lines) === key)
  if (repeat) return { action: 'repeat', row: repeat }
  if (onFile.filter((a) => a.kind === undefined || a.kind === 'sample').length >= MAX_SAVED_SAMPLE_ADDRESSES) {
    return {
      action: 'full',
      error: `This company already has ${MAX_SAVED_SAMPLE_ADDRESSES} saved sample addresses — choose one of them instead.`,
    }
  }
  return { action: 'insert' }
}

// ── New (WAQC) ───────────────────────────────────────────────────────────────

export interface DestinationOption {
  key: string
  section: 'saved' | 'company' | 'importer' | 'roaster'
  sectionTitle: string
  destination: BuyerSampleDestination
}

type Co = {
  id: string
  name: string | null
  fantasy_name: string | null
  group_id?: string | null
  street?: string | null
  street_number?: string | null
  neighbourhood?: string | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
  country?: string | null
}

export interface SampleAddressRow {
  id: string
  company_id: string
  kind: string
  label: string | null
  recipient_name: string | null
  attention: string | null
  phone: string | null
  lines: string
  country: string | null
  instructions: string | null
  destination_company_id: string | null
  is_active: boolean | null
  is_default?: boolean | null
  updated_at: string | null
}

const SELECT_ROW = `${SAVED_DESTINATION_COLUMNS}, is_default`
const CO_COLUMNS =
  'id, name, fantasy_name, group_id, street, street_number, neighbourhood, city, state, zip_code, country'

function splitLines(lines: string): string[] {
  return lines.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
}

/** A saved row as the destination the email prints. */
export function rowToDestination(row: SampleAddressRow, ownerName: string): BuyerSampleDestination {
  return {
    // Always the OWNING company, so it names the same company as companyName.
    companyId: row.company_id,
    companyName: ownerName,
    savedAddressId: row.id,
    lines: splitLines(row.lines),
    country: row.country,
    recipientName: row.recipient_name,
    attention: row.attention,
    phone: row.phone,
    instructions: row.instructions,
  }
}

export function companyAddressDestination(co: {
  id: string
  name: string
  fantasy_name: string | null
  street: string | null
  street_number: string | null
  neighbourhood: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  country: string | null
}): BuyerSampleDestination | null {
  const has = (v: string | null) => !!v?.trim()
  if (!has(co.street) && !has(co.city)) return null
  const join = (...p: Array<string | null>) => p.map((x) => x?.trim() ?? '').filter(Boolean).join(' ')
  const lines = [join(co.street, co.street_number), join(co.neighbourhood), join(co.zip_code, co.city, co.state)].filter(Boolean)
  return {
    companyId: co.id,
    companyName: companyDisplayName(co as never),
    savedAddressId: null,
    lines,
    country: co.country?.trim() || null,
    recipientName: null,
    attention: null,
    phone: null,
    instructions: null,
  }
}

/** The company plus its ACTIVE group sisters, with every name. A failed read narrows to the company alone. */
async function groupCompanies(admin: SupabaseClient<any>, clientId: string): Promise<{ self: Co | null; all: Co[] }> {
  const { data: own, error } = await admin.from('companies').select(CO_COLUMNS).in('id', [clientId])
  if (error) console.error('[seller-requests/destinations] company read failed:', error.message)
  const self = ((own ?? []) as Co[]).find((c) => c.id === clientId) ?? null
  if (!self?.group_id) return { self, all: self ? [self] : [] }
  const { data: members, error: mErr } = await admin
    .from('companies')
    .select(CO_COLUMNS)
    .eq('group_id', self.group_id)
    .eq('is_active', true)
    .order('name')
  if (mErr) {
    console.error('[seller-requests/destinations] group read failed:', mErr.message)
    return { self, all: [self] }
  }
  const sisters = ((members ?? []) as Co[]).filter((m) => m.id !== clientId)
  return { self, all: [self, ...sisters] }
}

async function loadSavedRows(admin: SupabaseClient<any>, companyIds: string[]): Promise<SampleAddressRow[]> {
  if (companyIds.length === 0) return []
  const { data, error } = await admin
    .from('company_addresses')
    .select(SELECT_ROW)
    .eq('kind', 'sample')
    .eq('is_active', true)
    .in('company_id', companyIds)
    .order('label')
    .order('created_at')
  if (error) throw new Error(`company_addresses: ${error.message}`)
  return (data ?? []) as unknown as SampleAddressRow[]
}

export async function listDestinationOptions(
  admin: SupabaseClient<any>,
  args: { clientId: string; importerId?: string | null; roasterId?: string | null },
): Promise<DestinationOption[]> {
  const { self, all } = await groupCompanies(admin, args.clientId)
  const clientName = companyDisplayName(self as never)
  const nameOf = new Map(all.map((c) => [c.id, companyDisplayName(c as never)]))
  const options: DestinationOption[] = []

  const rows = await loadSavedRows(admin, all.map((c) => c.id))
  for (const r of rows) {
    options.push({
      key: `saved:${r.id}`,
      section: 'saved',
      sectionTitle: `Saved for ${clientName}`,
      destination: rowToDestination(r, nameOf.get(r.company_id) ?? clientName),
    })
  }

  const own = self ? companyAddressDestination({ ...self, name: self.name ?? '' } as never) : null
  if (self && own) {
    options.push({ key: `company:${self.id}`, section: 'company', sectionTitle: `${clientName} company address`, destination: own })
  }

  const extras: Array<['importer' | 'roaster', string | null | undefined, string]> = [
    ['importer', args.importerId, 'Importer'],
    ['roaster', args.roasterId, 'Roaster'],
  ]
  for (const [section, id, label] of extras) {
    if (!id) continue
    const { data } = await admin.from('companies').select(CO_COLUMNS).in('id', [id])
    const co = ((data ?? []) as Co[]).find((c) => c.id === id)
    if (!co) continue
    const dest = companyAddressDestination({ ...co, name: co.name ?? '' } as never)
    if (!dest) continue
    options.push({ key: `${section}:${co.id}`, section, sectionTitle: `${label} · ${companyDisplayName(co as never)}`, destination: dest })
  }
  return options
}

/**
 * Spec §4 steps 1-5: the setting's address (found group-wide: a quality or
 * buyer setting may name a sister's saved address), then the CLIENT'S OWN
 * is_default, then its own newest active, then its company address. A
 * sister's address is never picked by steps 3-4: on automatic sends nobody
 * looks, and the email + sys request would name the sister. Sisters still
 * show in the picker (listDestinationOptions).
 */
export async function defaultDestination(
  admin: SupabaseClient<any>,
  args: { clientId: string; addressId: string | null },
): Promise<BuyerSampleDestination | null> {
  const { self, all } = await groupCompanies(admin, args.clientId)
  const nameOf = new Map(all.map((c) => [c.id, companyDisplayName(c as never)]))
  const rows = await loadSavedRows(admin, all.map((c) => c.id))
  const dest = (r: SampleAddressRow) => rowToDestination(r, nameOf.get(r.company_id) ?? companyDisplayName(self as never))

  if (args.addressId) {
    const hit = rows.find((r) => r.id === args.addressId)
    if (hit) return dest(hit)
  }
  const own = rows.filter((r) => r.company_id === args.clientId)
  const flagged = own.find((r) => r.is_default === true)
  if (flagged) return dest(flagged)
  const newest = [...own].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))[0]
  if (newest) return dest(newest)
  return self ? companyAddressDestination({ ...self, name: self.name ?? '' } as never) : null
}
