// src/lib/portal/portal-invitations.ts
import { createHash, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isValidEmail as isStrictEmail } from '@/lib/html'
import { normalizeQcKeys, type QcKeySet } from './qc-keys'

/**
 * QC portal invitations (spec §6.5). The token is 32 random bytes; only its
 * SHA-256 is stored, so a database read never reveals a working link. One
 * pending invitation per company and email: a new one cancels the old one.
 */

export const INVITATION_TTL_DAYS = 7
const TABLE = 'portal_invitations'
const COLUMNS =
  'id, company_id, email, first_name, last_name, views, capabilities, is_company_admin, invited_by, invited_by_kind, status, expires_at, accepted_at, accepted_user_id, created_at'

export interface PortalInvitationRow {
  id: string
  company_id: string
  email: string
  first_name: string
  last_name: string
  views: string[]
  capabilities: string[]
  is_company_admin: boolean
  /** Null once the inviting account is deleted (ON DELETE SET NULL). */
  invited_by: string | null
  invited_by_kind: 'staff' | 'manager'
  status: 'pending' | 'accepted' | 'cancelled' | 'expired'
  expires_at: string
  accepted_at: string | null
  accepted_user_id: string | null
  created_at: string
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * "*" is a PostgREST like/ilike wildcard that backslash escaping cannot
 * neutralise, so an address containing one is never valid here.
 */
export function isValidEmail(email: string): boolean {
  return !email.includes('*') && isStrictEmail(email)
}

/**
 * For .ilike(): an email may contain "_", which LIKE reads as a wildcard.
 * Throws on "*" (see isValidEmail): validate the address before looking it up.
 */
export function escapeLike(value: string): string {
  if (value.includes('*')) throw new Error('escapeLike: "*" cannot be escaped for a PostgREST pattern')
  return value.replace(/[\\%_]/g, (m) => `\\${m}`)
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function createInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInvitationToken(token) }
}

export type InvitationState = 'usable' | 'expired' | 'used' | 'cancelled'

export function invitationState(row: Pick<PortalInvitationRow, 'status' | 'expires_at'>, now: Date): InvitationState {
  if (row.status === 'accepted') return 'used'
  if (row.status === 'cancelled') return 'cancelled'
  // Fails closed: an unparsable expires_at is NaN, and NaN > now is false.
  if (row.status === 'expired' || !(new Date(row.expires_at).getTime() > now.getTime())) return 'expired'
  return 'usable'
}

function expiresAt(now: Date): string {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 86_400_000).toISOString()
}

export interface InvitationSummary {
  id: string
  email: string
  firstName: string
  lastName: string
  keys: QcKeySet
  isCompanyAdmin: boolean
  invitedByKind: 'staff' | 'manager'
  expiresAt: string
  createdAt: string
}

export function toInvitationSummary(row: PortalInvitationRow): InvitationSummary {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    keys: normalizeQcKeys(row),
    isCompanyAdmin: row.is_company_admin,
    invitedByKind: row.invited_by_kind,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

/** Two concurrent creates for one company and email: the loser hit the one-pending index twice. */
export class InvitationConflictError extends Error {
  constructor() {
    super('A pending invitation for this company and email was created concurrently')
    this.name = 'InvitationConflictError'
  }
}

export async function createPortalInvitation(
  admin: SupabaseClient<any>,
  args: {
    companyId: string
    email: string
    firstName: string
    lastName: string
    keys: QcKeySet
    isCompanyAdmin: boolean
    invitedBy: string
    invitedByKind: 'staff' | 'manager'
    now?: Date
  },
): Promise<{ invitation: PortalInvitationRow; token: string }> {
  const now = args.now ?? new Date()
  const email = normalizeEmail(args.email)

  // At most two attempts: a 23505 means a concurrent create slipped in between our cancel and insert.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error: cancelError } = await admin
      .from(TABLE)
      .update({ status: 'cancelled' })
      .eq('company_id', args.companyId)
      .eq('email', email)
      .eq('status', 'pending')
    if (cancelError) throw cancelError

    const { token, tokenHash } = createInvitationToken()
    const { data, error } = await admin
      .from(TABLE)
      .insert({
        company_id: args.companyId,
        email,
        first_name: args.firstName.trim(),
        last_name: args.lastName.trim(),
        views: args.keys.views,
        capabilities: args.keys.capabilities,
        is_company_admin: args.isCompanyAdmin && args.invitedByKind === 'staff',
        invited_by: args.invitedBy,
        invited_by_kind: args.invitedByKind,
        token_hash: tokenHash,
        status: 'pending',
        expires_at: expiresAt(now),
      })
      .select(COLUMNS)
      .single()
    if (!error) return { invitation: data as PortalInvitationRow, token }
    if ((error as { code?: string }).code !== '23505') throw error
  }
  throw new InvitationConflictError()
}

export async function findInvitationByToken(admin: SupabaseClient<any>, token: string): Promise<PortalInvitationRow | null> {
  if (!token || token.length < 20) return null
  const { data, error } = await admin.from(TABLE).select(COLUMNS).eq('token_hash', hashInvitationToken(token)).maybeSingle()
  if (error) throw error
  return (data as PortalInvitationRow | null) ?? null
}

export async function findCompanyInvitation(
  admin: SupabaseClient<any>,
  args: { invitationId: string; companyId: string },
): Promise<PortalInvitationRow | null> {
  const { data, error } = await admin
    .from(TABLE)
    .select(COLUMNS)
    .eq('id', args.invitationId)
    .eq('company_id', args.companyId)
    .maybeSingle()
  if (error) throw error
  return (data as PortalInvitationRow | null) ?? null
}

export async function listPendingInvitations(
  admin: SupabaseClient<any>,
  companyId: string,
  now: Date = new Date(),
): Promise<PortalInvitationRow[]> {
  const { data, error } = await admin
    .from(TABLE)
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PortalInvitationRow[]
}

export async function cancelInvitation(
  admin: SupabaseClient<any>,
  args: { invitationId: string; companyId: string },
): Promise<PortalInvitationRow | null> {
  const { data, error } = await admin
    .from(TABLE)
    .update({ status: 'cancelled' })
    .eq('id', args.invitationId)
    .eq('company_id', args.companyId)
    .eq('status', 'pending')
    .select(COLUMNS)
    .maybeSingle()
  if (error) throw error
  return (data as PortalInvitationRow | null) ?? null
}

/**
 * A company admin who loses that status (or their access) must not leave
 * invitations they issued as a manager still usable. Company-scoped.
 */
export async function cancelManagerInvitationsBy(
  admin: SupabaseClient<any>,
  args: { companyId: string; invitedBy: string },
): Promise<void> {
  const { error } = await admin
    .from(TABLE)
    .update({ status: 'cancelled' })
    .eq('company_id', args.companyId)
    .eq('invited_by', args.invitedBy)
    .eq('invited_by_kind', 'manager')
    .eq('status', 'pending')
  if (error) throw error
}

export async function reissueInvitation(
  admin: SupabaseClient<any>,
  args: { invitationId: string; companyId: string; now?: Date },
): Promise<{ invitation: PortalInvitationRow; token: string } | null> {
  const { token, tokenHash } = createInvitationToken()
  const { data, error } = await admin
    .from(TABLE)
    .update({ token_hash: tokenHash, expires_at: expiresAt(args.now ?? new Date()) })
    .eq('id', args.invitationId)
    .eq('company_id', args.companyId)
    .eq('status', 'pending')
    .select(COLUMNS)
    .maybeSingle()
  if (error) throw error
  return data ? { invitation: data as PortalInvitationRow, token } : null
}

/** Flip pending → accepted before creating anything, so a second click finds nothing to claim. */
export async function claimInvitation(admin: SupabaseClient<any>, args: { invitationId: string; now?: Date }): Promise<boolean> {
  const now = args.now ?? new Date()
  const { data, error } = await admin
    .from(TABLE)
    .update({ status: 'accepted', accepted_at: now.toISOString() })
    .eq('id', args.invitationId)
    .eq('status', 'pending')
    .gt('expires_at', now.toISOString())
    .select('id')
  if (error) throw error
  return Array.isArray(data) && data.length === 1
}

/** Undo a claim when accepting failed half-way, so the link works again. */
export async function releaseInvitation(admin: SupabaseClient<any>, invitationId: string): Promise<void> {
  const { error } = await admin
    .from(TABLE)
    .update({ status: 'pending', accepted_at: null })
    .eq('id', invitationId)
    .eq('status', 'accepted')
    .is('accepted_user_id', null)
  // 23505: a newer pending invitation exists, so the claimed link is simply dead.
  if (error && (error as { code?: string }).code !== '23505') {
    console.error('[portal] could not release invitation', invitationId, error)
  }
}

export async function recordAcceptedUser(admin: SupabaseClient<any>, args: { invitationId: string; userId: string }): Promise<void> {
  const { data, error } = await admin
    .from(TABLE)
    .update({ accepted_user_id: args.userId })
    .eq('id', args.invitationId)
    .eq('status', 'accepted')
    .is('accepted_user_id', null)
    .select('id')
  if (error) throw error
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(`recordAcceptedUser: invitation ${args.invitationId} is not a claimed, unrecorded invitation`)
  }
}
