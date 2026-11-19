/**
 * Pre-certificates.
 *
 * A laboratory with the "pre-certificate check" on (every laboratory but the HQ
 * one) issues an approved lot's certificate ON STANDBY: the number is assigned,
 * the results are locked, and the certificate waits for its container. Adding
 * the container makes it final, with who did it and when.
 *
 *   - approved, and approved with comments: a pre-certificate on standby;
 *   - rejected: the ordinary rejection certificate, at once;
 *   - a type sample: no verdict and no container, so never a pre-certificate;
 *   - a lot that already names its container: nothing to wait for, final at once.
 *
 * In the database a waiting pre-certificate is a certificates row with
 * `standby_at` set, `finalized_at` empty and status 'draft' (so it is in no
 * list of issued certificates and in no results email until it is final).
 */
import { carriesVerdict } from './sample-verdict'

export interface StandbyInput {
  /** `laboratories.pre_cert_check` of the lot's laboratory. */
  labPreCertCheck: boolean | null | undefined
  isRejected: boolean
  sampleType: string | null | undefined
  containerNr: string | null | undefined
}

/** Does this lot's certificate start on standby? */
export function startsOnStandby({ labPreCertCheck, isRejected, sampleType, containerNr }: StandbyInput): boolean {
  if (labPreCertCheck !== true) return false
  if (isRejected) return false
  if (!carriesVerdict(sampleType)) return false
  return !cleanContainerNumber(containerNr)
}

export interface PreCertificateState {
  status?: string | null
  standby_at?: string | null
  finalized_at?: string | null
}

/** Waiting for its container. */
export function isOnStandby(cert: PreCertificateState | null | undefined): boolean {
  return !!cert && !!cert.standby_at && !cert.finalized_at
}

/** Was (or still is) a pre-certificate: its results are locked either way. */
export function isPreCertificate(cert: PreCertificateState | null | undefined): boolean {
  return !!cert && !!cert.standby_at
}

/** Whole days a pre-certificate has waited (0 on the day it was issued). */
export function daysWaiting(standbyAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!standbyAt) return null
  const since = new Date(standbyAt).getTime()
  if (Number.isNaN(since)) return null
  return Math.max(0, Math.floor((now.getTime() - since) / 86_400_000))
}

/**
 * A container number as typed: trimmed, upper-case, inner spaces and dashes
 * dropped ("msku 123456-7" → "MSKU1234567"). Null when nothing usable is left.
 */
export function cleanContainerNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const clean = value.toUpperCase().replace(/[\s-]+/g, '')
  return clean.length >= 4 && clean.length <= 20 && /^[A-Z0-9]+$/.test(clean) ? clean : null
}

export const PRE_CERTIFICATE_LOCK_MESSAGE =
  'A pre-certificate was issued for this lot: its results are locked.'

export const ICO_REQUIRED_MESSAGE =
  'This laboratory works with pre-certificates: the ICO number is required at intake.'

/** Is the ICO number required to register this sample? Type samples have none. */
export function icoRequiredAtIntake(input: { labPreCertCheck: boolean | null | undefined; sampleType: string | null | undefined; sampleCategory?: string | null }): boolean {
  if (input.labPreCertCheck !== true) return false
  if (String(input.sampleCategory ?? 'qc').toLowerCase() !== 'qc') return false
  return carriesVerdict(input.sampleType)
}

/**
 * A certificate row with status 'draft' is a pre-certificate on standby:
 * nothing else writes a draft. For readers that load the status and not the
 * standby date (the PDF, the public page, the lists).
 */
export const STANDBY_STATUS = 'draft'

export function isStandbyStatus(status: string | null | undefined): boolean {
  return status === STANDBY_STATUS
}
