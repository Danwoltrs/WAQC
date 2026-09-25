/**
 * Which green-grading defects are PRIMARY (SCA classification).
 *
 * One list, read by the certificate (to split its defect table) and by the
 * annual report (to split its defect findings), so the two can never classify
 * the same bean differently. Matching is a case-insensitive substring test, as
 * the certificate has always done: "Fungus Damaged" is primary.
 *
 * Severe Broca is SECONDARY (weight 0.2), not primary.
 */
export const PRIMARY_DEFECTS: readonly string[] = [
  'Full Black', 'Full Sour', 'Pod/Cherry', 'Large Husk',
  'Stone/Stick', 'Foreign Material',
  'Dried Cherry', 'Fungus Damage', 'Severe Insect Damage', 'Foreign Matter',
]

export function isPrimaryDefect(name: string): boolean {
  const n = name.toLowerCase()
  return PRIMARY_DEFECTS.some(pd => n.includes(pd.toLowerCase()))
}
