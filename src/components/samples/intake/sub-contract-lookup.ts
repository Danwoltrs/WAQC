'use client'

import { useState } from 'react'
import { contractSellerDiffers, mapContractToSubContract } from '@/lib/contract-intake-mapping'
import type { ContractMatch } from './contract-number-input'
import type { SubContractFormData } from './types'

/**
 * A contract row's Wolthers number and its sys contract, shared by every
 * editor of a row (the review step's table, the add-sub-contract dialog).
 *
 * The typed number found its sys contract (picked, or typed exactly): fill
 * what sys already knows for this contract and link it. `updateContract`
 * writes field by field, which every host applies in order. Editing the
 * number afterwards drops the link: sys resolves contract_id before the
 * number, so a link left behind would file this contract on the old one.
 */
export function useSubContractLookup({
  contract,
  updateContract,
  sellerName,
  lotQuality,
  lockQcClient,
  onFilled,
}: {
  contract: SubContractFormData
  updateContract: (field: keyof SubContractFormData, value: string | boolean) => void
  /** The lot's seller, named when the linked contract says another one. */
  sellerName?: string
  /**
   * The lot's quality: its spec, and the quality text of the contract it was
   * linked to. Quality is shared by every contract of a lot, so a contract
   * whose own quality differs is flagged, never applied.
   */
  lotQuality?: { specId: string | null; contractText: string | null }
  lockQcClient?: boolean
  onFilled?: (patch: Partial<SubContractFormData>) => void
}) {
  const [contractSeller, setContractSeller] = useState<string | null>(null)
  const [contractQuality, setContractQuality] = useState<string | null>(null)

  const handleSelectContract = async (match: ContractMatch) => {
    try {
      const res = await fetch(`/api/contracts/${match.id}`)
      if (!res.ok) return
      const body = await res.json()
      const patch = mapContractToSubContract(body.contract, body.resolution, { keepQcClient: lockQcClient })
      for (const [field, value] of Object.entries(patch)) {
        updateContract(field as keyof SubContractFormData, value as string | boolean)
      }
      onFilled?.(patch)
      setContractSeller(contractSellerDiffers(body.contract, sellerName))
      setContractQuality(qualityDiffers(body, lotQuality))
    } catch {
      // A failed lookup leaves the typed number and every field as they are.
    }
  }

  const handleNumberChange = (value: string) => {
    updateContract('wolthers_contract_nr', value)
    if (contract.contract_id) updateContract('contract_id', '')
    setContractSeller(null)
    setContractQuality(null)
  }

  return { contractSeller, contractQuality, handleSelectContract, handleNumberChange }
}

/**
 * This contract's quality text when it differs from the lot's: a confident
 * spec match that is another spec, or (with no confident match) quality text
 * that differs from the lot's own contract. Null when they agree or when
 * there is nothing to compare.
 */
export function qualityDiffers(
  body: { contract?: { quality_description?: string | null }; resolution?: { quality_match?: { confidence: string; spec_id: string | null } | null } },
  lot: { specId: string | null; contractText: string | null } | undefined,
): string | null {
  const text = body.contract?.quality_description?.trim() || null
  if (!text || !lot) return null
  const match = body.resolution?.quality_match
  const spec = match?.confidence === 'high' ? match.spec_id : null
  if (spec && lot.specId) return spec !== lot.specId ? text : null
  const lotText = lot.contractText?.trim()
  if (!lotText) return null
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ')
  return norm(text) !== norm(lotText) ? text : null
}
