/** A finite number from a loosely typed JSON value (a number, or a numeric string); anything else is undefined. */
export function finiteNumber(x: unknown): number | undefined {
  if (x === null || x === undefined || x === '') return undefined
  if (typeof x === 'object') return undefined
  const n = Number(x)
  return Number.isFinite(n) ? n : undefined
}
