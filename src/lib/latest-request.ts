/**
 * Only the newest of overlapping requests may land. A search box that fires a
 * request per query (and a page that loads its unfiltered list on mount)
 * otherwise shows whichever response arrives LAST: a slow unfiltered load or
 * a broader earlier query overwrites the results of the query in the box.
 *
 * `begin()` aborts the previous request and hands back a signal for the new
 * one plus `isLatest()`, which a response checks before touching state.
 */
export function latestRequestGate() {
  let seq = 0
  let controller: AbortController | null = null
  return {
    begin() {
      seq += 1
      const mine = seq
      controller?.abort()
      controller = new AbortController()
      return { signal: controller.signal, isLatest: () => mine === seq }
    },
  }
}

/** An aborted fetch rejects with this name; it is a superseded request, not a failure. */
export const isAbortError = (err: unknown) => (err as { name?: string } | null)?.name === 'AbortError'
