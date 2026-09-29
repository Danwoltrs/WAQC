/**
 * PostgREST answers any read with at most 1000 rows and says nothing about the
 * rest: no error, no flag. A year of certificates passed 1000 in September
 * 2026, and the weekly report quietly lost the newest ones (the read was
 * ordered oldest first). Page through with `.range()` until a short page.
 *
 * `page(from, to)` must build a FRESH query each call (a Supabase builder is
 * consumed once awaited) with a stable order, so pages neither overlap nor
 * skip rows.
 */

export const PAGE_SIZE = 1000

export async function selectAllPages<Row>(
  page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: any }>,
  size: number = PAGE_SIZE,
): Promise<{ data: Row[] | null; error: any }> {
  const rows: Row[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) return { data: null, error }
    const got = data ?? []
    rows.push(...got)
    if (got.length < size) break
  }
  return { data: rows, error: null }
}
