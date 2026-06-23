export interface RollupRow {
  sample_type: string | null
  status: string | null
  workflow_stage: string | null
}

export interface StatusRollup {
  pssPending: number
  pssApproved: number
  pssRejected: number
  ssTotal: number
  certified: number
  total: number
}

export function buildStatusRollup(rows: RollupRow[]): StatusRollup {
  const r: StatusRollup = { pssPending: 0, pssApproved: 0, pssRejected: 0, ssTotal: 0, certified: 0, total: 0 }
  for (const row of rows) {
    r.total++
    if (row.sample_type === 'ss') r.ssTotal++
    if (row.sample_type === 'pss') {
      if (row.status === 'approved') r.pssApproved++
      else if (row.status === 'rejected') r.pssRejected++
      else r.pssPending++
    }
    if (row.workflow_stage === 'certified') r.certified++
  }
  return r
}
