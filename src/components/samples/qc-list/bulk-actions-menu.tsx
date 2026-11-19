'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FileText, Download, Printer, QrCode, MoreVertical, Users, Trash2 } from 'lucide-react'
import type { AssignedCupper } from './types'

export interface BulkActionsMenuProps {
  /** `selectedSamples.size`; the page renders the menu only when it is > 0. */
  selectedCount: number
  /** A certified/rejected sample is selected: blocks Assign, enables Tin Label. */
  hasCertifiedSelected: boolean
  /** Cuppers were assigned to the selection in this session. */
  cuppersAssigned: boolean
  /** A selected sample has moved past 'received'. */
  selectedHaveCuppers: boolean
  /** A selected sample has cupping cards to reprint. */
  selectedCanReprint: boolean
  /** Shown by first name on the Assign item. */
  assignedCuppers: AssignedCupper[]
  /** Whether "Delete Selected" is rendered. */
  canDelete: boolean
  onAssignCuppers: () => void
  onReprintCuppingCards: () => void
  onPrintQrTable: () => void
  onExport: () => void
  onTinLabel: () => void
  onPrintBagSleeves: () => void
  onDelete: () => void
}

/** The header's "Actions (N)" dropdown for the current row selection. */
export function BulkActionsMenu({
  selectedCount,
  hasCertifiedSelected,
  cuppersAssigned,
  selectedHaveCuppers,
  selectedCanReprint,
  assignedCuppers,
  canDelete,
  onAssignCuppers,
  onReprintCuppingCards,
  onPrintQrTable,
  onExport,
  onTinLabel,
  onPrintBagSleeves,
  onDelete,
}: BulkActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <MoreVertical className="h-4 w-4 mr-2" />
          Actions ({selectedCount})
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Bulk Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Cupper Assignment - Priority Action */}
        <DropdownMenuItem onClick={onAssignCuppers} disabled={hasCertifiedSelected}>
          <Users className="h-4 w-4 mr-2" />
          {(cuppersAssigned || selectedHaveCuppers)
            ? `Assigned Cuppers${assignedCuppers.length > 0 ? ` (${assignedCuppers.map(c => c.full_name?.split(' ')[0]).join(', ')})` : ''}`
            : 'Assign Cuppers'}
        </DropdownMenuItem>
        {hasCertifiedSelected && (
          <div className="px-2 pb-1 text-xs text-destructive">
            Certified/rejected sample selected
          </div>
        )}

        {/* Print Actions - available once cards exist (or cuppers assigned) */}
        {(cuppersAssigned || selectedHaveCuppers || selectedCanReprint) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onReprintCuppingCards}>
              <FileText className="h-4 w-4 mr-2" />
              Reprint Cupping Cards
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPrintQrTable}>
              <QrCode className="h-4 w-4 mr-2" />
              Print QR Table (Thermal)
            </DropdownMenuItem>
          </>
        )}

        {/* Other Print Actions */}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onExport}>
          <Download className="h-4 w-4 mr-2" />
          Export to Excel
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onTinLabel}
          disabled={!hasCertifiedSelected}
          title={hasCertifiedSelected ? undefined : 'Tin labels carry the certificate number, issued at certification'}
        >
          <Printer className="h-4 w-4 mr-2" />
          Tin Label
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPrintBagSleeves}>
          <Printer className="h-4 w-4 mr-2" />
          Print Bag Sleeves (6 per A4)
        </DropdownMenuItem>

        {/* Admin Actions */}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
