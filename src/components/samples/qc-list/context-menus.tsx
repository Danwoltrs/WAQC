'use client'

import type { MouseEvent } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import { Plus, Eye, FileText, Download, Printer, Users, Trash2, Award, Edit } from 'lucide-react'
import { canReprintCuppingCards } from '@/lib/cupping/reprint'
import { sampleLabelText } from '@/lib/sample-reference'
import type { AssignedCupper, Sample, SampleCupperAssignment } from './types'

// What both right-click menus need to know about the current row selection.
interface SelectionMenuState {
  /** `selectedSamples.size`. */
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
  /** Whether the delete item is rendered. */
  canDelete: boolean
}

interface ExportAndPrintItemsProps {
  hasCertifiedSelected: boolean
  onExport: () => void
  onTinLabel: () => void
  onPrintBagSleeves: () => void
  /** How many certificates the selection holds (lab units and their contract rows). */
  certificateCount: number
  /** Why the selection's certificates cannot be printed; null when they can. */
  certificatePrintReason: string | null
  onPrintCertificates: () => void
}

// Export / Tin Label / Print Bag Sleeves / Print Certificates: the same items,
// acting on the current row selection, in the row menu and in the page-wide menu.
function ExportAndPrintItems({
  hasCertifiedSelected,
  onExport,
  onTinLabel,
  onPrintBagSleeves,
  certificateCount,
  certificatePrintReason,
  onPrintCertificates,
}: ExportAndPrintItemsProps) {
  return (
    <>
      <ContextMenuItem onClick={onExport}>
        <Download className="h-4 w-4 mr-2" />
        Export to Excel
      </ContextMenuItem>
      <ContextMenuItem
        onClick={onTinLabel}
        disabled={!hasCertifiedSelected}
        title={hasCertifiedSelected ? undefined : 'Tin labels carry the certificate number, issued at certification'}
      >
        <Printer className="h-4 w-4 mr-2" />
        Tin Label
      </ContextMenuItem>
      <ContextMenuItem onClick={onPrintBagSleeves}>
        <Printer className="h-4 w-4 mr-2" />
        Print Bag Sleeves
      </ContextMenuItem>
      <ContextMenuItem
        onClick={onPrintCertificates}
        disabled={!!certificatePrintReason}
        title={certificatePrintReason ?? undefined}
      >
        <Printer className="h-4 w-4 mr-2" />
        {certificatePrintReason ? 'Print Certificates' : `Print Certificates (${certificateCount})`}
      </ContextMenuItem>
    </>
  )
}

export interface RowContextMenuContentProps extends SelectionMenuState, ExportAndPrintItemsProps {
  /** The lab-unit row that was right-clicked. */
  sample: Sample
  /** This row's own entry in the page's cupper map (`sampleCupperMap[sample.id]`). */
  singleAssignment: SampleCupperAssignment | undefined
  onViewSample: () => void
  onEditSample: () => void
  /** SS rows only. Receives the click, which anchors the duplicate popover. */
  onDuplicate: (event: MouseEvent) => void
  /** Every row that is not an SS. */
  onAddContract: () => void
  onSelectAll: () => void
  onSelectAllUncertified: () => void
  /** The page picks bulk or single by the selection size. */
  onAssignCuppers: () => void
  /** The page picks bulk or single by the selection size. */
  onReprintCuppingCards: () => void
  onViewCertificate: () => void
  onDownloadCertificate: () => void
  /** The page picks bulk or single by the selection size. */
  onDelete: () => void
}

/** The right-click menu of a lab-unit row. */
export function RowContextMenuContent({
  sample,
  singleAssignment,
  selectedCount,
  hasCertifiedSelected,
  cuppersAssigned,
  selectedHaveCuppers,
  selectedCanReprint,
  assignedCuppers,
  canDelete,
  onViewSample,
  onEditSample,
  onDuplicate,
  onAddContract,
  onSelectAll,
  onSelectAllUncertified,
  onAssignCuppers,
  onReprintCuppingCards,
  onExport,
  onTinLabel,
  onPrintBagSleeves,
  certificateCount,
  certificatePrintReason,
  onPrintCertificates,
  onViewCertificate,
  onDownloadCertificate,
  onDelete,
}: RowContextMenuContentProps) {
  return (
    <ContextMenuContent className="w-56">
      <ContextMenuLabel>
        {selectedCount > 1
          ? `${selectedCount} samples selected`
          : sampleLabelText(sample)}
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onViewSample}>
        <Eye className="h-4 w-4 mr-2" />
        View Sample
      </ContextMenuItem>
      <ContextMenuItem onClick={onEditSample}>
        <Edit className="h-4 w-4 mr-2" />
        Edit Sample
      </ContextMenuItem>
      {sample.sample_type === 'ss' ? (
        <ContextMenuItem onClick={onDuplicate}>
          <Plus className="h-4 w-4 mr-2" />
          Duplicate Sample
        </ContextMenuItem>
      ) : (
        <ContextMenuItem onClick={onAddContract}>
          <Plus className="h-4 w-4 mr-2" />
          Add Contract
        </ContextMenuItem>
      )}
      <ContextMenuItem onClick={onSelectAll}>
        <Checkbox className="h-4 w-4 mr-2" checked={false} />
        Select All
      </ContextMenuItem>
      <ContextMenuItem onClick={onSelectAllUncertified}>
        <Checkbox className="h-4 w-4 mr-2" checked={false} />
        Select All Uncertified
      </ContextMenuItem>
      <ContextMenuSeparator />
      {(() => {
        // Use workflow_stage as primary indicator: 'received' = not yet assigned
        const sampleHasCuppers = sample.workflow_stage !== 'received' && sample.workflow_stage !== undefined
        const hasCuppers = selectedCount > 1 ? (cuppersAssigned || selectedHaveCuppers) : sampleHasCuppers
        const canReprint = selectedCount > 1 ? selectedCanReprint : canReprintCuppingCards(sample)
        const cupperNames = selectedCount > 1
          ? assignedCuppers.map(c => c.full_name?.split(' ')[0]).join(', ')
          : singleAssignment?.cuppers.map(c => c.full_name?.split(' ')[0]).join(', ')
        return (
          <>
            <ContextMenuItem
              onClick={onAssignCuppers}
              disabled={hasCertifiedSelected}
            >
              <Users className="h-4 w-4 mr-2" />
              {hasCuppers
                ? `Assigned Cuppers${cupperNames ? ` (${cupperNames})` : ''}`
                : 'Assign Cuppers'}
            </ContextMenuItem>
            {hasCertifiedSelected && (
              <div className="px-2 pb-1 text-xs text-destructive">
                Certified/rejected sample selected
              </div>
            )}
            {canReprint && (
              <ContextMenuItem
                onClick={onReprintCuppingCards}
              >
                <FileText className="h-4 w-4 mr-2" />
                Reprint Cupping Cards
              </ContextMenuItem>
            )}
          </>
        )
      })()}
      <ContextMenuSeparator />
      <ExportAndPrintItems
        hasCertifiedSelected={hasCertifiedSelected}
        onExport={onExport}
        onTinLabel={onTinLabel}
        onPrintBagSleeves={onPrintBagSleeves}
        certificateCount={certificateCount}
        certificatePrintReason={certificatePrintReason}
        onPrintCertificates={onPrintCertificates}
      />
      {sample.certificate_id && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onViewCertificate}>
            <Award className="h-4 w-4 mr-2" />
            View Certificate
          </ContextMenuItem>
          <ContextMenuItem onClick={onDownloadCertificate}>
            <Download className="h-4 w-4 mr-2" />
            Download Certificate
          </ContextMenuItem>
        </>
      )}
      {canDelete && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {selectedCount > 1 ? `Delete ${selectedCount} Samples` : 'Delete Sample'}
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  )
}

export interface PageContextMenuContentProps extends SelectionMenuState, ExportAndPrintItemsProps {
  onSelectAll: () => void
  onSelectAllUncertified: () => void
  onAssignCuppers: () => void
  onReprintCuppingCards: () => void
  onDelete: () => void
}

/** The right-click menu of the page outside any row; acts on the selection. */
export function PageContextMenuContent({
  selectedCount,
  hasCertifiedSelected,
  cuppersAssigned,
  selectedHaveCuppers,
  selectedCanReprint,
  assignedCuppers,
  canDelete,
  onSelectAll,
  onSelectAllUncertified,
  onAssignCuppers,
  onReprintCuppingCards,
  onExport,
  onTinLabel,
  onPrintBagSleeves,
  certificateCount,
  certificatePrintReason,
  onPrintCertificates,
  onDelete,
}: PageContextMenuContentProps) {
  return (
    <ContextMenuContent className="w-56">
      <ContextMenuLabel>
        {selectedCount > 0
          ? `${selectedCount} samples selected`
          : 'No samples selected'}
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onSelectAll}>
        <Checkbox className="h-4 w-4 mr-2" checked={false} />
        Select All
      </ContextMenuItem>
      <ContextMenuItem onClick={onSelectAllUncertified}>
        <Checkbox className="h-4 w-4 mr-2" checked={false} />
        Select All Uncertified
      </ContextMenuItem>
      {selectedCount > 0 && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onAssignCuppers} disabled={hasCertifiedSelected}>
            <Users className="h-4 w-4 mr-2" />
            {(cuppersAssigned || selectedHaveCuppers)
              ? `Assigned Cuppers${assignedCuppers.length > 0 ? ` (${assignedCuppers.map(c => c.full_name?.split(' ')[0]).join(', ')})` : ''}`
              : 'Assign Cuppers'}
          </ContextMenuItem>
          {hasCertifiedSelected && (
            <div className="px-2 pb-1 text-xs text-destructive">
              Certified/rejected sample selected
            </div>
          )}
          {(cuppersAssigned || selectedHaveCuppers || selectedCanReprint) && (
            <ContextMenuItem onClick={onReprintCuppingCards}>
              <FileText className="h-4 w-4 mr-2" />
              Reprint Cupping Cards
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ExportAndPrintItems
            hasCertifiedSelected={hasCertifiedSelected}
            onExport={onExport}
            onTinLabel={onTinLabel}
            onPrintBagSleeves={onPrintBagSleeves}
            certificateCount={certificateCount}
            certificatePrintReason={certificatePrintReason}
            onPrintCertificates={onPrintCertificates}
          />
          {canDelete && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete {selectedCount} Sample{selectedCount > 1 ? 's' : ''}
              </ContextMenuItem>
            </>
          )}
        </>
      )}
    </ContextMenuContent>
  )
}
