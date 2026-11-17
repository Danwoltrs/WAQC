/**
 * True when a Supabase/PostgREST error says a column does not exist yet: 42703
 * from a select, PGRST204 ("Could not find the column ... in the schema cache")
 * from an insert or update payload. Used to fail soft before a migration lands.
 */
export function isMissingColumnError(error: unknown, column?: string): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; message?: unknown }
  if (e.code !== '42703' && e.code !== 'PGRST204') return false
  if (!column) return true
  return typeof e.message === 'string' ? e.message.includes(column) : true
}
