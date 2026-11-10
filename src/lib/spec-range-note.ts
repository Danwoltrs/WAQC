/**
 * The "(min x)" / "(max x)" note printed beside a value that falls outside a
 * template limit. Null when the value is missing or inside the limits (the
 * boundaries themselves are inside). A limit of 0 still counts.
 */
export function rangeNote(
  value: number | null,
  min: number | undefined,
  max: number | undefined,
  format: (n: number) => string,
): string | null {
  if (value === null || value === undefined) return null
  if (min !== undefined && value < min) return `(min ${format(min)})`
  if (max !== undefined && value > max) return `(max ${format(max)})`
  return null
}
