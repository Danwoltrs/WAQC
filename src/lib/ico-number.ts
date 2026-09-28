/**
 * An ICO mark reads country / exporter / lot ("002/1234/0567"). The
 * containers of one contract usually share the country and exporter and
 * differ only in the lot, so a copied ICO is corrected by retyping its last
 * segment. These helpers find that segment for the ICO inputs, which put
 * the cursor on it when they take focus.
 */

const SEPARATOR = /[/\-.\s]/

/**
 * The range an ICO input selects on focus: the segment after the last
 * separator, so typing replaces the lot and keeps the rest. A value with no
 * separator is selected whole (typing replaces it); a value that ends in a
 * separator puts the caret at the end, ready for the lot.
 */
export function lastSegmentRange(value: string): { start: number; end: number } {
  let start = value.length
  while (start > 0 && !SEPARATOR.test(value[start - 1])) start--
  return { start: start === 0 ? 0 : start, end: value.length }
}
