// Copy of sys src/lib/internal-market/new-company.ts (isValidCnpj, isValidCpf,
// docVariants) and register.ts (digitsOf, formatDoc, pixKeyType), keep in step.
import type { PersonType, PixKeyType } from '@/types/company-register'

export const digitsOf = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

export const formatCnpj = (d: string) =>
  `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
export const formatCpf = (d: string) =>
  `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`

/** 11 digits as a CPF for F, 14 as a CNPJ for J; anything else as typed. */
export function formatDoc(personType: PersonType, raw: string): string {
  const d = digitsOf(raw)
  if (personType === 'F' && d.length === 11) return formatCpf(d)
  if (personType === 'J' && d.length === 14) return formatCnpj(d)
  return raw.trim()
}

const allSame = (d: string) => /^(\d)\1+$/.test(d)

/** Mod-11 check digit of `digits` under `weights` (CNPJ / CPF rule: remainder < 2 -> 0). */
function checkDigit(digits: string, weights: number[]): number {
  const sum = [...digits].reduce((acc, ch, i) => acc + Number(ch) * weights[i], 0)
  const r = sum % 11
  return r < 2 ? 0 : 11 - r
}

const CNPJ_W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const CNPJ_W2 = [6, ...CNPJ_W1]

export function isValidCnpj(raw: string): boolean {
  const d = digitsOf(raw)
  if (d.length !== 14 || allSame(d)) return false
  return checkDigit(d.slice(0, 12), CNPJ_W1) === Number(d[12]) && checkDigit(d.slice(0, 13), CNPJ_W2) === Number(d[13])
}

export function isValidCpf(raw: string): boolean {
  const d = digitsOf(raw)
  if (d.length !== 11 || allSame(d)) return false
  const w = (n: number) => Array.from({ length: n }, (_, i) => n + 1 - i)
  return checkDigit(d.slice(0, 9), w(9)) === Number(d[9]) && checkDigit(d.slice(0, 10), w(10)) === Number(d[10])
}

/** document_cnpj is stored formatted or as bare digits: match either. */
export function docVariants(doc: string | null | undefined): string[] {
  const d = digitsOf(doc)
  if (!d) return []
  const formatted = d.length === 14 ? formatCnpj(d) : d.length === 11 ? formatCpf(d) : (doc ?? '').trim()
  return formatted === d ? [d] : [formatted, d]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Best guess from the key's shape; the user may change it. A bare 11-digit
 *  key reads as a CPF (a mobile number is typed with +55 or a DDD in brackets). */
export function pixKeyType(raw: string): PixKeyType | null {
  const k = raw.trim()
  if (!k) return null
  if (k.includes('@')) return 'email'
  if (UUID_RE.test(k)) return 'random'
  if (k.startsWith('+') || k.includes('(')) return 'phone'
  if (!/^[\d.\-/\s]+$/.test(k)) return null
  const d = digitsOf(k)
  if (d.length === 14) return 'cnpj'
  if (d.length === 11) return 'cpf'
  if (d.length === 10 || d.length === 12 || d.length === 13) return 'phone'
  return null
}
