import type { SupabaseClient } from '@supabase/supabase-js'
import { QC_CERTIFICATES_PURPOSE } from '@/lib/approval-notification/resolve-panels'
import { addQcCertTag, removeQcCertTag, QC_CONTACT_COLUMNS, type QcContactRecord } from './tags'

/** Input for adding/saving a QC-certificate recipient. */
export interface QcContactInput {
  email: string
  name?: string | null
  nickname?: string | null
  isGroup: boolean
  phone?: string | null
  whatsapp?: string | null
  preferredLanguage?: string | null
}

/** Fields the tab can edit on an existing contact (all optional; only provided keys are written). */
export interface QcContactFields {
  name?: string
  nickname?: string | null
  email?: string
  phone?: string | null
  whatsapp?: string | null
  preferredLanguage?: string | null
  isGroup?: boolean
}

export type QcUpsertPlan =
  | { kind: 'insert'; values: Record<string, unknown> }
  | { kind: 'update'; id: string; values: Record<string, unknown> }

const localPart = (email: string): string => email.split('@')[0] || email
const isBlank = (v: string | null | undefined): boolean => !v || !v.trim()

/**
 * Decide the write for "make this email a QC-cert recipient for the company". Pure — no DB.
 * `existing` is the current row matched by (company_id, lower(email)), or null.
 *  - insert: brand-new contact tagged qc_certificates.
 *  - update: union the tag, reactivate, fill ONLY blank fields (never clobber sys data,
 *    never flip an existing person/group kind).
 */
export function planQcUpsert(
  existing: QcContactRecord | null,
  companyId: string,
  input: QcContactInput,
  actorId: string | null,
): QcUpsertPlan {
  const email = input.email.trim()
  if (!existing) {
    return {
      kind: 'insert',
      values: {
        company_id: companyId,
        email,
        name: (input.name && input.name.trim()) || localPart(email),
        nickname: input.nickname?.trim() || null,
        phone: input.phone?.trim() || null,
        whatsapp: input.whatsapp?.trim() || null,
        preferred_language: input.preferredLanguage || 'en',
        is_group: input.isGroup,
        is_active: true,
        routing_purposes: [QC_CERTIFICATES_PURPOSE],
        created_by: actorId,
      },
    }
  }
  const values: Record<string, unknown> = {
    routing_purposes: addQcCertTag(existing.routing_purposes),
    is_active: true,
  }
  if (isBlank(existing.name) && input.name && input.name.trim()) values.name = input.name.trim()
  if (isBlank(existing.nickname) && input.nickname && input.nickname.trim()) values.nickname = input.nickname.trim()
  if (isBlank(existing.phone) && input.phone && input.phone.trim()) values.phone = input.phone.trim()
  if (isBlank(existing.whatsapp) && input.whatsapp && input.whatsapp.trim()) values.whatsapp = input.whatsapp.trim()
  if (isBlank(existing.preferred_language) && input.preferredLanguage) values.preferred_language = input.preferredLanguage
  return { kind: 'update', id: existing.id, values }
}

/** Find a company's contact by case-insensitive email (matches the (company_id, lower(email)) index). */
export async function findContactByEmail(
  db: SupabaseClient,
  companyId: string,
  email: string,
): Promise<QcContactRecord | null> {
  const { data, error } = await db
    .from('contacts')
    .select(QC_CONTACT_COLUMNS)
    .eq('company_id', companyId)
    .ilike('email', email.trim())
    .maybeSingle()
  if (error) throw error
  return (data as QcContactRecord) ?? null
}

/** Add/save a QC-cert recipient for the company (insert or tag-union update). Returns the row. */
export async function upsertQcRecipient(
  db: SupabaseClient,
  companyId: string,
  input: QcContactInput,
  actorId: string | null,
): Promise<QcContactRecord> {
  const existing = await findContactByEmail(db, companyId, input.email)
  const plan = planQcUpsert(existing, companyId, input, actorId)
  if (plan.kind === 'insert') {
    const { data, error } = await db.from('contacts').insert(plan.values).select(QC_CONTACT_COLUMNS).single()
    if (error) throw mapContactError(error)
    return data as QcContactRecord
  }
  const { data, error } = await db.from('contacts').update(plan.values).eq('id', plan.id).select(QC_CONTACT_COLUMNS).single()
  if (error) throw mapContactError(error)
  return data as QcContactRecord
}

/** Toggle the QC-cert tag on a contact. on=false removes ONLY that tag (never deletes the row). */
export async function setQcCertTag(db: SupabaseClient, contactId: string, on: boolean): Promise<void> {
  const { data, error } = await db.from('contacts').select('routing_purposes').eq('id', contactId).single()
  if (error) throw error
  const current = (data as { routing_purposes: string[] | null }).routing_purposes
  const next = on ? addQcCertTag(current) : removeQcCertTag(current)
  const { error: upErr } = await db.from('contacts').update({ routing_purposes: next }).eq('id', contactId)
  if (upErr) throw upErr
}

/** Edit core fields on a contact (tab). Maps the unique-email violation to a friendly Error. */
export async function updateQcContactFields(
  db: SupabaseClient,
  contactId: string,
  fields: QcContactFields,
): Promise<QcContactRecord> {
  const values: Record<string, unknown> = {}
  if (fields.name !== undefined) values.name = fields.name.trim()
  if (fields.nickname !== undefined) values.nickname = fields.nickname?.trim() || null
  if (fields.email !== undefined) values.email = fields.email.trim()
  if (fields.phone !== undefined) values.phone = fields.phone?.trim() || null
  if (fields.whatsapp !== undefined) values.whatsapp = fields.whatsapp?.trim() || null
  if (fields.preferredLanguage !== undefined) values.preferred_language = fields.preferredLanguage
  if (fields.isGroup !== undefined) values.is_group = fields.isGroup
  const { data, error } = await db.from('contacts').update(values).eq('id', contactId).select(QC_CONTACT_COLUMNS).single()
  if (error) throw mapContactError(error)
  return data as QcContactRecord
}

/** Translate the (company_id, lower(email)) unique violation into a user-facing message. */
function mapContactError(error: unknown): Error {
  if ((error as { code?: string })?.code === '23505') {
    return new Error('That email already exists for this company.')
  }
  return error instanceof Error ? error : new Error('Database error')
}
