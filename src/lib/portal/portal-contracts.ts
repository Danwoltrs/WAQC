// src/lib/portal/portal-contracts.ts
export interface PortalContractRow {
  contractNumber: string
  sampleCount: number
  approved: number
  rejected: number
  pending: number
  origins: string[]
}

export function groupSamplesByContract(rows: any[]): PortalContractRow[] {
  const map = new Map<string, PortalContractRow>()
  for (const row of rows) {
    const key = row.wolthers_contract_nr || 'Unassigned'
    let entry = map.get(key)
    if (!entry) {
      entry = { contractNumber: key, sampleCount: 0, approved: 0, rejected: 0, pending: 0, origins: [] }
      map.set(key, entry)
    }
    entry.sampleCount++
    if (row.status === 'approved') entry.approved++
    else if (row.status === 'rejected') entry.rejected++
    else entry.pending++
    if (row.origin && !entry.origins.includes(row.origin)) entry.origins.push(row.origin)
  }
  return Array.from(map.values()).sort((a, b) => a.contractNumber.localeCompare(b.contractNumber))
}
