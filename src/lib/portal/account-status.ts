// src/lib/portal/account-status.ts
/**
 * sys user_profiles.status decides whether WAQC may give QC access to an
 * existing external account (spec §6.1, §6.4):
 *   active           → yes
 *   disabled         → no: switched off; only Wolthers switches an account
 *                      back on (sys), and doing it here would also revive
 *                      the person's sys access everywhere
 *   invited          → no: a pending sys invitation. sys activates the
 *                      account itself at the first sign-in (invited →
 *                      active) and applies its staged sys grants then; the
 *                      QC gate needs an active account anyway, so QC access
 *                      is added after that sign-in (ruling R4)
 *   pending / no row → an invitation; accepting it makes the account active
 */

export const SWITCHED_OFF = 'This account is switched off. Wolthers must switch the account back on first.'
export const PENDING_SYS_INVITATION =
  'This person has a pending Wolthers portal invitation. Add QC access after their first sign-in.'

export function accountStatusRefusal(status: string | null | undefined): string | null {
  if (status === 'disabled') return SWITCHED_OFF
  if (status === 'invited') return PENDING_SYS_INVITATION
  return null
}
