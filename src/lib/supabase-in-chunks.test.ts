import { describe, it, expect } from 'vitest'
import { chunkIds, selectInChunks, IN_CHUNK_SIZE } from './supabase-in-chunks'

describe('chunkIds', () => {
  it('returns one chunk when the list fits', () => {
    expect(chunkIds(['a', 'b'], 10)).toEqual([['a', 'b']])
  })

  it('splits a long list into fixed-size chunks', () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`)
    const chunks = chunkIds(ids, 100)
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50])
    expect(chunks.flat()).toEqual(ids)
  })

  it('returns no chunks for an empty list, so no query is issued', () => {
    expect(chunkIds([], 100)).toEqual([])
  })
})

describe('selectInChunks', () => {
  it('concatenates the rows of every chunk', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`)
    const seen: string[][] = []

    const { data, error } = await selectInChunks(ids, async (chunk) => {
      seen.push(chunk)
      return { data: chunk.map((id) => ({ id })), error: null }
    }, 100)

    expect(error).toBeNull()
    expect(seen.map((c) => c.length)).toEqual([100, 100, 50])
    expect(data?.map((r) => r.id)).toEqual(ids)
  })

  it('never issues a query for an empty list', async () => {
    let calls = 0
    const { data, error } = await selectInChunks<{ id: string }>([], async () => {
      calls++
      return { data: [], error: null }
    })
    expect(calls).toBe(0)
    expect(data).toEqual([])
    expect(error).toBeNull()
  })

  it('surfaces the first error and stops', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`)
    let calls = 0

    const { data, error } = await selectInChunks(ids, async () => {
      calls++
      return calls === 2
        ? { data: null, error: { message: 'boom' } }
        : { data: [{ id: 'x' }], error: null }
    }, 100)

    expect(error).toEqual({ message: 'boom' })
    expect(data).toBeNull()
    expect(calls).toBe(2)
  })

  it('keeps each chunk small enough that the request URI stays under the proxy limit', () => {
    // A uuid plus its comma costs 37 bytes in the `id=in.(...)` list. The
    // Supabase edge proxy answers a plain-text `Bad Request` once the URI
    // passes roughly 24 KB, which is what broke /api/cupping/my-samples.
    expect(IN_CHUNK_SIZE * 37).toBeLessThan(16_000)
  })
})
