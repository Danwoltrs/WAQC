// src/components/samples/intake/contract-link-badge.tsx
'use client'

import { useState } from 'react'
import { X, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { SelectedContract } from './types'

interface Props {
  contract: SelectedContract
  onUnlink: () => void
}

export function ContractLinkBadge({ contract, onUnlink }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  const summary = [
    contract.seller_name,
    contract.buyer_name,
  ].filter(Boolean).join(' → ')

  const detail = [
    contract.crop,
    contract.volume_bags != null ? `${contract.volume_bags} bags` : null,
    contract.bag_type,
  ].filter(Boolean).join(' · ')

  return (
    <div className="rounded-2xl p-3 bg-[#556b2f]/10 border border-[#556b2f]/30 flex items-start justify-between gap-3 mb-4">
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="flex-1 min-w-0 text-left">
            <div className="text-sm font-semibold flex items-center gap-2">
              Linked to contract #{contract.contract_number}
              <Info className="h-3 w-3 opacity-60" />
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {summary}
              {detail ? ` · ${detail}` : ''}
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 text-xs space-y-1">
          <div><span className="text-muted-foreground">Number:</span> #{contract.contract_number}</div>
          {contract.seller_name && <div><span className="text-muted-foreground">Seller:</span> {contract.seller_name}</div>}
          {contract.buyer_name && <div><span className="text-muted-foreground">Buyer:</span> {contract.buyer_name}</div>}
          {contract.shipper_name && <div><span className="text-muted-foreground">Shipper:</span> {contract.shipper_name}</div>}
          {contract.end_buyer_name && <div><span className="text-muted-foreground">End buyer:</span> {contract.end_buyer_name}</div>}
          {contract.quality_description && <div><span className="text-muted-foreground">Quality:</span> {contract.quality_description}</div>}
          {contract.crop && <div><span className="text-muted-foreground">Crop:</span> {contract.crop}</div>}
          {contract.volume_bags != null && <div><span className="text-muted-foreground">Volume:</span> {contract.volume_bags} bags</div>}
          {contract.bag_type && <div><span className="text-muted-foreground">Bag type:</span> {contract.bag_type}</div>}
          {contract.shipment_period_start && <div><span className="text-muted-foreground">Shipment start:</span> {contract.shipment_period_start}</div>}
        </PopoverContent>
      </Popover>

      {!confirmOpen ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          className="flex-shrink-0"
          aria-label="Remove contract link"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button type="button" variant="destructive" size="sm" onClick={() => { setConfirmOpen(false); onUnlink() }}>
            Unlink
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
