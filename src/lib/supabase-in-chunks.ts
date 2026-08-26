/**
 * A PostgREST `.in()` filter travels in the request URI. The Supabase edge
 * proxy rejects a request whose URI passes roughly 24 KB with a plain-text
 * `Bad Request` — no PostgREST JSON body, just a 400 the client reports as an
 * opaque error.
 *
 * `/api/cupping/my-samples` walks every active cupping session the user is on
 * and asks for the samples by id. Sessions are never closed, so that id list
 * only grows: at 629 sample ids (37 bytes each) plus the route's embedded
 * `select`, the URI crossed the limit and the samples query started failing.
 * Both the cupping and the grading screen read that route, so both went empty
 * on the same day, with nothing in the UI to say why.
 *
 * Split the list instead. 200 ids is ~7.4 KB of filter, which leaves ample room
 * for even the widest `select` this codebase writes.
 */

export const IN_CHUNK_SIZE = 200

export function chunkIds<T>(ids: T[], size: number = IN_CHUNK_SIZE): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size))
  }
  return chunks
}

/**
 * Run `query` once per chunk of `ids` and concatenate the rows.
 *
 * Mirrors a Supabase result shape so callers keep their existing
 * `const { data, error } = await ...` handling. The first failing chunk stops
 * the run and is returned as-is.
 */
export async function selectInChunks<Row>(
  ids: string[],
  query: (chunk: string[]) => Promise<{ data: Row[] | null; error: any }>,
  size: number = IN_CHUNK_SIZE
): Promise<{ data: Row[] | null; error: any }> {
  const rows: Row[] = []

  for (const chunk of chunkIds(ids, size)) {
    const { data, error } = await query(chunk)
    if (error) return { data: null, error }
    if (data) rows.push(...data)
  }

  return { data: rows, error: null }
}
