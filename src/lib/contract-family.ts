/**
 * A sys contract's family: the contracts a physical sample registered against
 * one of them covers too.
 *
 * sys splits a contract into separate contracts through
 * contracts.parent_contract_id (migration 0552): a suffix family shares one
 * base number and differs by split_suffix (42089/26A, /26B, /26C), or a
 * sibling gets a fresh number (42861/26 under 42040/26). Split LEGS inside one
 * contract (contract_splits) are not contracts and are not part of this.
 */
export interface ContractFamilyRow {
  id: string
  contract_number: string
  split_suffix?: string | null
  status?: string | null
  parent_contract_id?: string | null
}

export type ContractFamilyRelation = 'child' | 'parent' | 'sibling'

export type ContractFamilyMember<T extends ContractFamilyRow = ContractFamilyRow> = T & {
  relation: ContractFamilyRelation
}

interface FamilyCompany {
  id: string
  fantasy_name: string | null
  name: string | null
}

/** What /api/contracts/[id] hands the intake for each family member. */
export interface ContractFamilyContract extends ContractFamilyRow {
  buyer_reference: string | null
  seller_reference: string | null
  volume_bags: number | null
  bag_type: string | null
  shipment_period_start: string | null
  buyer: FamilyCompany | null
  end_buyer: FamilyCompany | null
}

/** "42089/26B": the suffix prints AFTER the year (sys migration 0552). */
export function contractDisplayNumber(c: { contract_number: string; split_suffix?: string | null }): string {
  return `${c.contract_number}${c.split_suffix ?? ''}`
}

const isActive = (r: ContractFamilyRow) => (r.status ?? 'active') === 'active'

/**
 * The active members of `self`'s family, never `self`: its children, and when
 * it is itself a child, its parent and the other children. Parent first, then
 * by number.
 */
export function contractFamily<T extends ContractFamilyRow>(
  self: ContractFamilyRow,
  candidates: T[],
): ContractFamilyMember<T>[] {
  const members: ContractFamilyMember<T>[] = []
  for (const r of candidates) {
    if (r.id === self.id || !isActive(r)) continue
    if (r.parent_contract_id === self.id) members.push({ ...r, relation: 'child' })
    else if (self.parent_contract_id && r.id === self.parent_contract_id) members.push({ ...r, relation: 'parent' })
    else if (self.parent_contract_id && r.parent_contract_id === self.parent_contract_id) members.push({ ...r, relation: 'sibling' })
  }
  return members.sort((a, b) => {
    if (a.relation !== b.relation && (a.relation === 'parent' || b.relation === 'parent')) return a.relation === 'parent' ? -1 : 1
    return contractDisplayNumber(a).localeCompare(contractDisplayNumber(b), undefined, { numeric: true })
  })
}
