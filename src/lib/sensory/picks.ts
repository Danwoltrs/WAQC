import { NODES } from '@/lib/cva/flavor-wheel-data'
import { CUPPER_PICK_CAP, type CupperSensory } from './types'

const WHEEL_KEYS: ReadonlySet<string> = new Set(NODES.map((n) => n.path.join('>')))

export function isWheelPath(path: unknown): path is string[] {
  return (
    Array.isArray(path) &&
    path.length >= 1 &&
    path.length <= 3 &&
    path.every((p) => typeof p === 'string') &&
    WHEEL_KEYS.has(path.join('>'))
  )
}

export function sanitizePicks(raw: unknown, cap: number): string[][] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[][] = []
  for (const p of raw) {
    if (!isWheelPath(p)) continue
    const key = p.join('>')
    if (seen.has(key)) continue
    seen.add(key)
    out.push([...p])
  }
  return out.slice(0, cap)
}

export function leafTerm(path: string[]): string {
  return path[path.length - 1]
}

export function parseCupperSensory(raw: unknown): CupperSensory | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  return {
    picks: sanitizePicks(r.picks, CUPPER_PICK_CAP),
    profile_id: typeof r.profile_id === 'string' && r.profile_id !== '' ? r.profile_id : null,
    profile_match: typeof r.profile_match === 'boolean' ? r.profile_match : null,
  }
}
