import { describe, it, expect } from 'vitest'
import { selectAllPages } from './supabase-paged'

/** A table of `n` rows behind a server that caps every answer at `cap`. */
const capped = (n: number, cap: number) => {
  const all = Array.from({ length: n }, (_, i) => i)
  const calls: Array<[number, number]> = []
  const page = async (from: number, to: number) => {
    calls.push([from, to])
    return { data: all.slice(from, Math.min(to + 1, from + cap)), error: null }
  }
  return { page, calls }
}

describe('selectAllPages', () => {
  it('reads past the 1000-row cap', async () => {
    const { page } = capped(2037, 1000)
    const { data } = await selectAllPages(page)
    expect(data).toHaveLength(2037)
    expect(data![2036]).toBe(2036)
  })

  it('stops after a short page', async () => {
    const { page, calls } = capped(1000, 1000)
    await selectAllPages(page)
    expect(calls).toEqual([[0, 999], [1000, 1999]])
  })

  it('returns the first error and no rows', async () => {
    const { data, error } = await selectAllPages(async () => ({ data: null, error: { message: 'boom' } }))
    expect(data).toBeNull()
    expect(error).toEqual({ message: 'boom' })
  })
})
