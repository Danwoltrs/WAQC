/**
 * Translates between the consolidated companies + qc_client_settings tables
 * and the legacy "client" shape that the rest of the codebase still expects.
 *
 * Post counterparty consolidation (2026-05-28):
 *   - companies = canonical entity (shared with sys.wolthers.com)
 *   - qc_client_settings = WAQC-only per-company config (cert pattern,
 *     pricing, billing, defaults), keyed on companies(id)
 *
 * Keeping the legacy "client" response shape intact lets us repoint reads/writes
 * one file at a time without forcing UI changes in the same commit.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The PostgREST select clause that pulls a company together with its
 * qc_client_settings row. Use as:
 *   supabase.from('companies').select(QC_CLIENT_SELECT)
 *
 * The embed uses the explicit FK constraint name so PostgREST doesn't get
 * confused by parallel relations through views like companies_with_legacy.
 */
export const QC_CLIENT_SELECT = `
  id, name, fantasy_name, email, phone,
  address, neighborhood, city, state, country, zip_code, vat_number,
  company_types, trading_roles, is_qc_client, is_active,
  legacy_client_id, logo_url, notes,
  created_at, updated_at,
  qc_settings:qc_client_settings!qc_client_settings_company_id_fkey(
    certificate_pattern, certificate_config,
    default_quality_specs, pricing_model, billing_basis, notification_emails,
    tracking_number_format, price_per_sample, price_per_pound_cents,
    currency, fee_payer, payment_terms, billing_notes,
    bag_weight_kg, has_origin_pricing, certificate_delivery_timing,
    sample_size_grams, moisture_standard, defect_photos,
    storage_layout, tax_region, report_branding_preference,
    address_override, certificate_validity_months, qc_fee_co_broker_company_id
  )
`.trim()

// NOTE: companies.vat_number is added by migration 20260529000001.
// If you redeploy WITHOUT applying that migration first, the SELECT above
// will 500 with: column companies.vat_number does not exist (42703).

type CompanyRow = {
  id: string
  name: string
  fantasy_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  country: string | null
  zip_code: string | null
  vat_number: string | null
  company_types: string[] | null
  trading_roles: string[] | null
  is_qc_client: boolean
  is_active: boolean
  legacy_client_id: number | null
  logo_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
  qc_settings: QcSettings | QcSettings[] | null
}

type AddressOverride = {
  street?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  zip_code?: string | null
}

type QcSettings = {
  certificate_pattern?: unknown
  certificate_config?: unknown
  certificate_validity_months?: number | null
  default_quality_specs?: string[] | null
  pricing_model?: string | null
  billing_basis?: string | null
  notification_emails?: string[] | null
  tracking_number_format?: unknown
  price_per_sample?: number | null
  price_per_pound_cents?: number | null
  currency?: string | null
  fee_payer?: string | null
  payment_terms?: string | null
  billing_notes?: string | null
  bag_weight_kg?: number | null
  has_origin_pricing?: boolean | null
  certificate_delivery_timing?: string | null
  sample_size_grams?: number | null
  moisture_standard?: string | null
  defect_photos?: string[] | null
  storage_layout?: unknown
  tax_region?: string | null
  report_branding_preference?: string | null
  address_override?: AddressOverride | null
  qc_fee_co_broker_company_id?: string | null
}

/**
 * Slugify a fantasy/company name into something URL-safe. Stable + deterministic
 * so we can round-trip /clients/{slug} URLs without persisting a slug column on
 * the shared companies table. Diacritics are stripped, non-alphanumerics collapse
 * to single dashes.
 */
export function slugifyName(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Map a row returned by `QC_CLIENT_SELECT` into the flat "client" shape that
 * existing UI / lib code consumes. Returns null for invalid input.
 */
export function mapCompanyToClient(row: CompanyRow | null | undefined): Record<string, unknown> | null {
  if (!row) return null

  const settings: QcSettings =
    Array.isArray(row.qc_settings) ? (row.qc_settings[0] ?? {}) :
    row.qc_settings ?? {}

  // Address override: when present in qc_client_settings, the QC view shows the
  // override values instead of the shared sys values. Sys values stay reachable
  // via sys_* for "Re-pull" affordance + audit.
  const override = settings.address_override ?? null
  const hasOverride = override !== null && typeof override === 'object'

  const effective_address = hasOverride ? override.street ?? row.address : row.address
  const effective_neighborhood = hasOverride ? override.neighborhood ?? row.neighborhood : row.neighborhood
  const effective_city = hasOverride ? override.city ?? row.city : row.city
  const effective_state = hasOverride ? override.state ?? row.state : row.state
  const effective_country = hasOverride ? override.country ?? row.country : row.country
  const effective_zip = hasOverride ? override.zip_code ?? row.zip_code : row.zip_code

  return {
    id: row.id,
    company_id: row.id,
    slug: slugifyName(row.fantasy_name) || slugifyName(row.name) || row.id,
    name: row.name,
    company: row.fantasy_name ?? row.name,
    fantasy_name: row.fantasy_name,
    email: row.email,
    phone: row.phone,
    // Effective address — what the rest of the app should consume.
    address: effective_address,
    neighborhood: effective_neighborhood,
    city: effective_city,
    state: effective_state,
    country: effective_country,
    zip_code: effective_zip,
    // Raw sys values + override descriptor, exposed for the edit screen.
    sys_address: row.address,
    sys_neighborhood: row.neighborhood,
    sys_city: row.city,
    sys_state: row.state,
    sys_country: row.country,
    sys_zip_code: row.zip_code,
    address_override: override,
    address_override_active: hasOverride,
    vat_number: row.vat_number,
    client_types: row.company_types ?? [],
    trading_roles: row.trading_roles ?? [],
    is_qc_client: row.is_qc_client,
    qc_enabled: row.is_qc_client,
    is_active: row.is_active,
    legacy_client_id: row.legacy_client_id,
    logo_url: row.logo_url,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    certificate_pattern: settings.certificate_pattern ?? null,
    certificate_config: settings.certificate_config ?? null,
    certificate_validity_months: settings.certificate_validity_months ?? null,
    default_quality_specs: settings.default_quality_specs ?? [],
    pricing_model: settings.pricing_model ?? 'per_sample',
    billing_basis: settings.billing_basis ?? 'approved_only',
    notification_emails: settings.notification_emails ?? [],
    tracking_number_format: settings.tracking_number_format ?? null,
    price_per_sample: settings.price_per_sample ?? null,
    price_per_pound_cents: settings.price_per_pound_cents ?? null,
    currency: settings.currency ?? 'USD',
    fee_payer: settings.fee_payer ?? 'client_pays',
    qc_fee_co_broker_company_id: settings.qc_fee_co_broker_company_id ?? null,
    payment_terms: settings.payment_terms ?? null,
    billing_notes: settings.billing_notes ?? null,
    bag_weight_kg: settings.bag_weight_kg ?? null,
    has_origin_pricing: settings.has_origin_pricing ?? false,
    certificate_delivery_timing: settings.certificate_delivery_timing ?? 'upon_approval',
    sample_size_grams: settings.sample_size_grams ?? 350,
    moisture_standard: settings.moisture_standard ?? 'coffee_industry',
    defect_photos: settings.defect_photos ?? [],
    storage_layout: settings.storage_layout ?? null,
    tax_region: settings.tax_region ?? null,
    report_branding_preference: settings.report_branding_preference ?? 'co_branded',
  }
}

/**
 * Resolve a slug to its underlying companies UUID. Slugs are computed
 * client-side from fantasy_name / name, so we approximate the lookup with an
 * `ilike` pattern then slugify each candidate to pick the exact match. Returns
 * null when nothing matches; when multiple match, QC clients win.
 *
 * Cost: one indexed ilike + an in-memory filter over <50 rows in practice.
 */
export async function resolveCompanyIdFromSlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<string | null> {
  const trimmed = slug.trim().toLowerCase()
  if (!trimmed) return null

  // Build a Postgres pattern that loosely matches the slug's letter run.
  // 'cape-horn' becomes '%cape%horn%' which catches 'Cape Horn' and 'Cape Horn Coffees'.
  const pattern = '%' + trimmed.replace(/-+/g, '%') + '%'

  const { data, error } = await (supabase as any)
    .from('companies')
    .select('id, name, fantasy_name, is_qc_client')
    .or(`fantasy_name.ilike.${pattern},name.ilike.${pattern}`)
    .limit(25)

  if (error || !data || data.length === 0) return null

  const exact = data.filter((row: any) => {
    const fs = slugifyName(row.fantasy_name)
    const ns = slugifyName(row.name)
    return fs === trimmed || ns === trimmed
  })

  if (exact.length === 0) return null
  if (exact.length === 1) return exact[0].id

  // Multiple exact slug matches — prefer the QC client.
  const qc = exact.find((row: any) => row.is_qc_client)
  return (qc ?? exact[0]).id
}

/**
 * Field sets — used by write paths to route each incoming field to the right table.
 */
export const COMPANY_FIELDS = new Set([
  'name', 'fantasy_name', 'email', 'phone',
  'address', 'neighborhood', 'city', 'state', 'country', 'zip_code', 'vat_number',
  'company_types', 'trading_roles', 'is_qc_client', 'is_active',
  'legacy_client_id', 'logo_url', 'notes',
])

export const QC_SETTINGS_FIELDS = new Set([
  'certificate_pattern', 'certificate_config', 'certificate_validity_months',
  'default_quality_specs', 'pricing_model', 'billing_basis', 'notification_emails',
  'tracking_number_format', 'price_per_sample', 'price_per_pound_cents',
  'currency', 'fee_payer', 'payment_terms', 'billing_notes',
  'bag_weight_kg', 'has_origin_pricing', 'certificate_delivery_timing',
  'sample_size_grams', 'moisture_standard', 'defect_photos',
  'storage_layout', 'tax_region', 'report_branding_preference',
  'address_override', 'qc_fee_co_broker_company_id',
])

/**
 * Translate legacy client_types enum values to the canonical post-consolidation
 * pair of (company_types[], trading_roles[]). Mirrors the mapping baked into
 * migration 20260528000002_backfill_clients_to_companies.sql.
 *
 * The Add Client modal still emits the old enum values (`importer_buyer`,
 * `end_client`, `roaster_final_buyer`, etc.); converting at the API boundary
 * means existing UI code keeps working without a flag-day rewrite.
 */
export function legacyClientTypeToCompanyTags(legacyTypes: string[]): {
  company_types: string[]
  trading_roles: string[]
} {
  const company_types = new Set<string>()
  const trading_roles = new Set<string>()

  for (const t of legacyTypes) {
    switch (t) {
      case 'producer':
        company_types.add('farm'); trading_roles.add('seller'); break
      case 'producer_exporter':
        company_types.add('farm'); company_types.add('exporter'); trading_roles.add('seller'); break
      case 'cooperative':
        company_types.add('coop'); trading_roles.add('seller'); break
      case 'exporter':
        company_types.add('exporter'); trading_roles.add('seller'); break
      case 'importer_buyer':
      case 'importer':
        company_types.add('trader'); trading_roles.add('buyer'); break
      case 'roaster':
        company_types.add('roaster'); break
      case 'final_buyer':
      case 'end_client':
        company_types.add('final_buyer'); break
      case 'roaster_final_buyer':
        company_types.add('roaster'); company_types.add('final_buyer'); break
      case 'service_provider':
        // No company_type / trading_role yet — left blank.
        break
      default:
        // Already a canonical value (farm, coop, trader, etc.) — pass through.
        company_types.add(t)
    }
  }

  return {
    company_types: Array.from(company_types),
    trading_roles: Array.from(trading_roles),
  }
}

/**
 * Merge two tag sets without dropping the existing values, returning a sorted
 * unique union. Used when upgrading an existing company with new role tags.
 */
export function mergeTagSets(existing: string[] | null | undefined, incoming: string[] | null | undefined): string[] {
  const merged = new Set<string>()
  for (const v of existing ?? []) if (typeof v === 'string' && v) merged.add(v)
  for (const v of incoming ?? []) if (typeof v === 'string' && v) merged.add(v)
  return Array.from(merged).sort()
}

/**
 * Escape `%` and `_` so a user-supplied string can be safely passed to ILIKE
 * without acting as wildcards. Pair with `.ilike(col, escapeIlike(value))` when
 * you want case-insensitive *exact* match. (Postgres' default LIKE escape char
 * is `\`, which is what supabase-js / PostgREST forwards.)
 */
export function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&')
}

/**
 * Split an incoming "client" payload into (companies fields, qc_client_settings fields).
 * Legacy aliases handled:
 *   - body.company → fantasy_name (legacy clients.company column had no equivalent
 *     on companies; the modal showed fantasy_name as "Company name").
 *   - body.qc_enabled → is_qc_client (companies is the new home for this flag).
 *   - body.client_types → company_types + trading_roles via legacyClientTypeToCompanyTags.
 *     The trading_roles produced by the mapping are *merged* into any trading_roles
 *     the caller already sent, so callers can still pass explicit roles.
 * Drops body.id and body.company_id (caller controls those separately).
 */
export function splitClientPayload(body: Record<string, unknown>): {
  companyFields: Record<string, unknown>
  settingsFields: Record<string, unknown>
} {
  const companyFields: Record<string, unknown> = {}
  const settingsFields: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue

    if (key === 'company') {
      if (!('fantasy_name' in body)) companyFields.fantasy_name = value
      continue
    }
    if (key === 'qc_enabled') {
      if (!('is_qc_client' in body)) companyFields.is_qc_client = value
      continue
    }
    if (key === 'client_types') {
      // Legacy enum values need translating to the (company_types, trading_roles)
      // pair on companies. Only assign when the caller hasn't explicitly sent
      // company_types or trading_roles already.
      const incoming = Array.isArray(value) ? value as string[] : []
      const { company_types, trading_roles } = legacyClientTypeToCompanyTags(incoming)
      if (!('company_types' in body)) {
        companyFields.company_types = company_types
      }
      if (!('trading_roles' in body) && trading_roles.length > 0) {
        companyFields.trading_roles = trading_roles
      }
      continue
    }
    if (key === 'id' || key === 'company_id') continue

    if (COMPANY_FIELDS.has(key)) {
      companyFields[key] = value
    } else if (QC_SETTINGS_FIELDS.has(key)) {
      settingsFields[key] = value
    }
  }

  // certificate_pattern (set by the QC services modal) and tracking_number_format
  // (read by generate_tracking_number(), see migration 20260528000007) carry the
  // exact same JSONB shape — { type, pattern, separator, starting_sequence,
  // sequence_padding, … }. The legacy split between them is a footgun: editing
  // starting_sequence in the modal wrote certificate_pattern only, which the RPC
  // never reads, so Blaser's "next sample" stayed at the backfilled 8900 even
  // after the user set 1000. Mirror writes here unless the caller is explicitly
  // passing tracking_number_format separately.
  if (
    settingsFields.certificate_pattern !== undefined &&
    !('tracking_number_format' in body)
  ) {
    settingsFields.tracking_number_format = settingsFields.certificate_pattern
  }

  return { companyFields, settingsFields }
}

/**
 * Re-fetch a company + qc_client_settings by company_id and return the
 * flattened "client" shape. Used by write paths to return the full updated row.
 */
export async function fetchClientById(
  supabase: SupabaseClient,
  companyId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await (supabase as any)
    .from('companies')
    .select(QC_CLIENT_SELECT)
    .eq('id', companyId)
    .single()

  if (error || !data) return null
  return mapCompanyToClient(data as CompanyRow)
}
