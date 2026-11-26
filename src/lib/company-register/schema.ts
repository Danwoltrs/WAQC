// Copy of sys src/lib/internal-market/register-schema.ts (titularInputSchema,
// bankAccountInputSchema, parseRegisterPatch) and schema.ts (parseWith), keep
// in step. Messages are in English; only the Brazilian document labels (CPF,
// CNPJ, IE, PIX) stay Portuguese.
import { z } from 'zod'
import { ACCOUNT_TYPES, PIX_KEY_TYPES } from '@/types/company-register'
import { formatDoc, isValidCnpj, isValidCpf, pixKeyType } from './docs'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const opt = (max: number) =>
  z
    .string()
    .max(max, `At most ${max} characters`)
    .nullish()
    .transform((v) => {
      const t = (v ?? '').trim()
      return t === '' ? null : t
    })

const uf = z
  .string()
  .nullish()
  .transform((v) => {
    const t = (v ?? '').trim().toUpperCase()
    return t === '' ? null : t
  })
  .refine((v) => v === null || /^[A-Z]{2}$/.test(v), 'State must be 2 letters')

export const titularInputSchema = z
  .object({
    person_type: z.enum(['F', 'J'], { errorMap: () => ({ message: 'Choose CPF or CNPJ' }) }),
    name: z
      .string({ required_error: 'Enter the name' })
      .max(300, 'At most 300 characters')
      .transform((v) => v.trim())
      .refine((v) => v !== '', 'Enter the name'),
    cpf_cnpj: opt(30),
    rg: opt(30),
    ie_ipr: opt(40),
    farm_line: opt(300),
    address: opt(300),
    zip: opt(20),
    city: opt(120),
    state: uf,
    notes: opt(2000),
  })
  .superRefine((v, ctx) => {
    if (!v.cpf_cnpj) return
    if (v.person_type === 'F' && !isValidCpf(v.cpf_cnpj)) {
      ctx.addIssue({ code: 'custom', path: ['cpf_cnpj'], message: 'Invalid CPF: check the numbers' })
    }
    if (v.person_type === 'J' && !isValidCnpj(v.cpf_cnpj)) {
      ctx.addIssue({ code: 'custom', path: ['cpf_cnpj'], message: 'Invalid CNPJ: check the numbers' })
    }
  })
  .transform((v) => ({ ...v, cpf_cnpj: v.cpf_cnpj ? formatDoc(v.person_type, v.cpf_cnpj) : null }))

const isBrazil = (c: string | null | undefined) => {
  const t = (c ?? '').trim().toLowerCase()
  return t === '' || t === 'br' || t === 'brazil' || t === 'brasil'
}

/** Country as the companies table stores it; blank (legacy rows) reads as Brazil. */
export const isBrazilCountry = isBrazil

/**
 * The bank-account input for a company in `country`. The country comes from the
 * company row on the server, never from the request body. Outside Brazil there
 * is no corrente/poupanca type and no PIX (both are Brazilian): they are
 * cleared, so such an account needs an account number.
 */
export function bankAccountSchemaFor(country: string | null | undefined) {
  const br = isBrazil(country)
  return z
    .object({
      titular_id: z.string().regex(UUID_RE, 'Invalid holder').nullish().transform((v) => v ?? null),
      bank_name: opt(100),
      /** Bank code in Brazil; SWIFT / ABA elsewhere. */
      routing_code: opt(11),
      branch: opt(50),
      account_number: opt(50),
      account_type: z.enum(ACCOUNT_TYPES).nullish().transform((v) => v ?? null),
      pix_key: opt(100),
      pix_key_type: z.enum(PIX_KEY_TYPES).nullish().transform((v) => v ?? null),
      label: opt(100),
      is_primary: z.boolean().default(false),
    })
    .transform((v, ctx) => {
      const out = br
        ? { ...v, pix_key_type: v.pix_key ? (v.pix_key_type ?? pixKeyType(v.pix_key)) : null }
        : { ...v, account_type: null, pix_key: null, pix_key_type: null }
      if (!out.account_number && !out.pix_key) {
        ctx.addIssue({
          code: 'custom',
          path: ['account_number'],
          message: br ? 'Enter the account number or the PIX key' : 'Enter the account number',
        })
        return z.NEVER
      }
      return out
    })
}

/** Brazilian rules (the default); the routes use bankAccountSchemaFor(company country). */
export const bankAccountInputSchema = bankAccountSchemaFor(null)

export type TitularInput = z.output<typeof titularInputSchema>
export type BankAccountInput = z.output<typeof bankAccountInputSchema>

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors: Record<string, string> }

/** safeParse, first message per dotted path. */
export function parseWith<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): ParseResult<T> {
  const r = schema.safeParse(body)
  if (r.success) return { ok: true, data: r.data }
  const fieldErrors: Record<string, string> = {}
  for (const issue of r.error.issues) {
    const key = issue.path.map(String).join('.') || '_'
    if (!fieldErrors[key]) fieldErrors[key] = issue.message
  }
  return { ok: false, error: r.error.issues[0]?.message ?? 'Invalid data', fieldErrors }
}

export type RegisterPatch<T> =
  | { kind: 'active'; is_active: boolean }
  | { kind: 'primary' }
  | { kind: 'full'; data: T }
  | { kind: 'invalid'; error: string; fieldErrors: Record<string, string> }

/** PATCH body: `{ is_active }` alone toggles, `{ is_primary: true }` alone
 *  swaps the primary, anything else is the whole row. */
export function parseRegisterPatch<T>(body: unknown, full: z.ZodType<T, z.ZodTypeDef, unknown>): RegisterPatch<T> {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const keys = Object.keys(body)
    const b = body as Record<string, unknown>
    if (keys.length === 1 && typeof b.is_active === 'boolean') return { kind: 'active', is_active: b.is_active }
    if (keys.length === 1 && b.is_primary === true) return { kind: 'primary' }
  }
  const r = parseWith(full, body)
  return r.ok ? { kind: 'full', data: r.data } : { kind: 'invalid', error: r.error, fieldErrors: r.fieldErrors }
}
