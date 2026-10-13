import { describe, it, expect, vi, afterEach } from 'vitest'
import { CLIPBOARD_KEY, readClipboard, writeClipboard } from './clipboard'
import type { Clip } from './editor-state'

const clip: Clip = {
  version: 1,
  rooms: [],
  items: [{ id: 'i1', kind: 'bench', label: null, x: 0, y: 0, w: 100, d: 50, rot: 0, locked: false, group_id: null }],
  shelves: [{
    shelf_letter: 'A', rows: 1, columns: 2, samples_per_position: 42, x_cm: 200, y_cm: 0,
    width_cm: 100, depth_cm: 40, rot: 0, access_side: 'front', group_id: null,
  }],
  groups: [],
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('clipboard', () => {
  it('round-trips through localStorage, so another lab can paste it', () => {
    writeClipboard(clip)
    expect(JSON.parse(localStorage.getItem(CLIPBOARD_KEY) ?? 'null')).toEqual(clip)
    expect(readClipboard()).toEqual(clip)
  })

  it('ignores a stored value that is not a clip', () => {
    writeClipboard(clip)
    localStorage.setItem(CLIPBOARD_KEY, '{"version":2}')
    expect(readClipboard()).toBeNull()
  })

  it('keeps working in memory when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    writeClipboard(clip)
    expect(readClipboard()).toEqual(clip)
  })
})
