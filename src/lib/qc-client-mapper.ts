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
 */
export const QC_CLIENT_SELECT = `
  id, name, fantasy_name, email, phone,
  address, city, state, country, zip_code, vat_number,
  company_types, trading_roles, is_qc_client, is_active,
  legacy_client_id, logo_url, notes,
  created_at, updated_at,
  qc_settings:qc_client_settings(
    certificate_pattern, certificate_config,
    default_quality_specs, pricing_model, billing_basis, notification_emails,
    tracking_number_format, price_per_sample, price_per_pound_cents,
    currency, fee_payer, payment_terms, billing_notes,
    bag_weight_kg, has_origin_pricing, certificate_delivery_timing,
    sample_size_grams, moisture_standard, defect_photos,
    storage_layout, tax_region, report_branding_preference
  )
`.trim()

type CompanyRow = {
  id: string
  name: string
  fantasy_name: string | null
  email: string | null
  phone: string | null
  address: string | null
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

type QcSettings = {
  certificate_pattern?: unknown
  certificate_config?: unknown
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

  return {
    id: row.id,
    company_id: row.id,
    name: row.name,
    company: row.fantasy_name ?? row.name,
    fantasy_name: row.fantasy_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    state: row.state,
    country: row.country,
    zip_code: row.zip_code,
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
    default_quality_specs: settings.default_quality_specs ?? [],
    pricing_model: settings.pricing_model ?? 'per_sample',
    billing_basis: settings.billing_basis ?? 'approved_only',
    notification_emails: settings.notification_emails ?? [],
    tracking_number_format: settings.tracking_number_format ?? null,
    price_per_sample: settings.price_per_sample ?? null,
    price_per_pound_cents: settings.price_per_pound_cents ?? null,
    currency: settings.currency ?? 'USD',
    fee_payer: settings.fee_payer ?? 'client_pays',
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
 * Field sets — used by write paths to route each incoming field to the right table.
 */
export const COMPANY_FIELDS = new Set([
  'name', 'fantasy_name', 'email', 'phone',
  'address', 'city', 'state', 'country', 'zip_code', 'vat_number',
  'company_types', 'trading_roles', 'is_qc_client', 'is_active',
  'legacy_client_id', 'logo_url', 'notes',
])

export const QC_SETTINGS_FIELDS = new Set([
  'certificate_pattern', 'certificate_config',
  'default_quality_specs', 'pricing_model', 'billing_basis', 'notification_emails',
  'tracking_number_format', 'price_per_sample', 'price_per_pound_cents',
  'currency', 'fee_payer', 'payment_terms', 'billing_notes',
  'bag_weight_kg', 'has_origin_pricing', 'certificate_delivery_timing',
  'sample_size_grams', 'moisture_standard', 'defect_photos',
  'storage_layout', 'tax_region', 'report_branding_preference',
])

/**
 * Split an incoming "client" payload into (companies fields, qc_client_settings fields).
 * Legacy aliases handled:
 *   - body.company → fantasy_name (legacy clients.company column had no equivalent
 *     on companies; the modal showed fantasy_name as "Company name").
 *   - body.qc_enabled → is_qc_client (companies is the new home for this flag).
 *   - body.client_types → company_types (the legacy enum maps to companies.company_types[]).
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
      if (!('company_types' in body)) companyFields.company_types = value
      continue
    }
    if (key === 'id' || key === 'company_id') continue

    if (COMPANY_FIELDS.has(key)) {
      companyFields[key] = value
    } else if (QC_SETTINGS_FIELDS.has(key)) {
      settingsFields[key] = value
    }
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
