import type { BatchUnit } from './batch-send'

/** One QC client offered in the "Send unsent" client step. */
export interface QcClientOption {
  id: string
  name: string
  /** Certificates of this client that still owe a buyer or seller email. */
  certificates: number
}

/** Stands in for certificates whose sample names no QC client. */
export const NO_QC_CLIENT = 'none'
const NO_QC_CLIENT_NAME = 'No QC client'

/**
 * Pure: the QC clients behind a send queue, sorted by name. Counted per
 * certificate, not per email — a certificate still owed to both its buyer and
 * its seller counts once.
 */
export function summarizeQcClients(
  units: BatchUnit[],
  clientBySample: Map<string, string | null>,
  nameById: Map<string, string>,
): QcClientOption[] {
  const samplesByClient = new Map<string, Set<string>>()
  for (const unit of units) {
    for (const line of unit.samples) {
      const id = clientBySample.get(line.sampleId) ?? NO_QC_CLIENT
      const samples = samplesByClient.get(id) ?? new Set<string>()
      samples.add(line.sampleId)
      samplesByClient.set(id, samples)
    }
  }
  return [...samplesByClient]
    .map(([id, samples]) => ({
      id,
      name: id === NO_QC_CLIENT ? NO_QC_CLIENT_NAME : nameById.get(id) ?? id,
      certificates: samples.size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Pure: keep the items whose QC client was chosen (`NO_QC_CLIENT` chooses those without one). */
export function filterByQcClients<T>(
  items: T[],
  clientOf: (item: T) => string | null,
  chosen: ReadonlySet<string>,
): T[] {
  return items.filter((item) => chosen.has(clientOf(item) ?? NO_QC_CLIENT))
}
