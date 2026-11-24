'use client'

import { outcomeLabel } from '@/lib/sample-verdict'
import type { ReactNode } from 'react'
import { isAwaitingGrading } from '@/lib/cupping/awaiting-grading'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { SampleReferenceCell } from '@/components/samples/sample-reference-cell'
import { ACTIONS_COLUMN_WIDTH } from './row-actions'
import {
  Eye, MapPin, Calendar, CheckCircle, XCircle, Clock, AlertCircle,
  ChevronDown, ChevronRight,
} from 'lucide-react'
import {
  formatSampleType,
  LIST_BOX,
  LIST_BOX_CELL,
  TABLE_HEAD_CELL,
  TABLE_HEAD_STICKY,
  CREATED_COLUMN_WIDTH,
  type Sample,
  type SiblingRow,
} from './types'

// Status as a single colored pill (Received / In progress / Approved /
// Rejected / Under review). The stage caption ("Certified", "Analysis", …)
// was removed at user request — Approved already implies Certified, so the
// extra line was noise.
// A type sample is measured, never approved or rejected: its pill reads
// In range / Out of range.
const renderStatusCell = (status: string, workflowStage?: string | null, sampleType?: string | null) => {
  const statusConfig: Record<string, { icon: any; label: string; className: string }> = {
    received: { icon: Clock, label: 'Received', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    in_progress: { icon: AlertCircle, label: 'In progress', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    // Cupping finalized, certificate waiting on green-bean grading (either
    // protocol): the lot sits on the grading table, not in a cupper's queue.
    awaiting_grading: { icon: Clock, label: 'Awaiting grading', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
    under_review: { icon: Eye, label: 'Under review', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
    approved: { icon: CheckCircle, label: 'Approved', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
    rejected: { icon: XCircle, label: 'Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  }
  const key = isAwaitingGrading({ status, workflow_stage: workflowStage }) ? 'awaiting_grading' : status
  const base = statusConfig[key] || { icon: AlertCircle, label: status, className: 'bg-muted text-muted-foreground' }
  const config = key === 'approved' || key === 'rejected'
    ? { ...base, label: outcomeLabel(sampleType, key === 'rejected') }
    : base
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${config.className}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
}

export interface SamplesTableHeadProps {
  /** The pinned filter bar's measured height: the sticky header row's `top`. */
  headerHeight: number
  columnVisibility: Record<string, boolean>
  /** Any row is selected: the QR column is shown. */
  anySelected: boolean
  /** Every listed row is selected. */
  allSelected: boolean
  onSelectAll: (checked: boolean) => void
}

/** The table's `<thead>`. */
export function SamplesTableHead({ headerHeight, columnVisibility, anySelected, allSelected, onSelectAll }: SamplesTableHeadProps) {
  return (
    <thead>
      <tr>
        <th className={`${TABLE_HEAD_STICKY} text-left py-2.5 px-3 align-middle`} style={{ width: 40, top: headerHeight }}>
          <Checkbox
            className={LIST_BOX}
            checked={allSelected}
            onCheckedChange={onSelectAll}
          />
        </th>
        {anySelected && (
          <th className={cn(TABLE_HEAD_CELL, 'px-1.5 align-middle')} style={{ width: 36, top: headerHeight }}>QR</th>
        )}
        {columnVisibility.reference && <th className={TABLE_HEAD_CELL} style={{ width: 180, top: headerHeight }}>Reference</th>}
        {columnVisibility.type && <th className={TABLE_HEAD_CELL} style={{ width: 56, top: headerHeight }}>Type</th>}
        {columnVisibility.wolthers && <th className={TABLE_HEAD_CELL} style={{ width: 104, top: headerHeight }}>W&amp;A REF</th>}
        {columnVisibility.quality && <th className={TABLE_HEAD_CELL} style={{ top: headerHeight }}>Quality</th>}
        {columnVisibility.seller && <th className={TABLE_HEAD_CELL} style={{ top: headerHeight }}>Seller</th>}
        {columnVisibility.shipper && <th className={TABLE_HEAD_CELL} style={{ top: headerHeight }}>Shipper</th>}
        {columnVisibility.importer && <th className={TABLE_HEAD_CELL} style={{ top: headerHeight }}>Importer</th>}
        {columnVisibility.roaster && <th className={TABLE_HEAD_CELL} style={{ top: headerHeight }}>Roaster</th>}
        {columnVisibility.endClient && <th className={TABLE_HEAD_CELL} style={{ top: headerHeight }}>End client</th>}
        {columnVisibility.status && <th className={TABLE_HEAD_CELL} style={{ width: 112, top: headerHeight }}>Status</th>}
        {columnVisibility.origin && <th className={TABLE_HEAD_CELL} style={{ width: 96, top: headerHeight }}>Origin</th>}
        {columnVisibility.storage && <th className={TABLE_HEAD_CELL} style={{ width: 96, top: headerHeight }}>Storage</th>}
        {columnVisibility.created && <th className={TABLE_HEAD_CELL} style={{ width: CREATED_COLUMN_WIDTH, top: headerHeight }}>Created</th>}
        <th className={`${TABLE_HEAD_STICKY} text-right py-2.5 pl-2 pr-3`} style={{ width: ACTIONS_COLUMN_WIDTH, top: headerHeight }}></th>
      </tr>
    </thead>
  )
}

export interface LabUnitRowCellsProps {
  sample: Sample
  columnVisibility: Record<string, boolean>
  /** Any row is selected: the QR column is shown. */
  anySelected: boolean
  /** This row is selected. */
  selected: boolean
  /** This row's "QR code on the bag sleeve" box is ticked. */
  qrSelected: boolean
  /** This row's contract siblings are shown. */
  expanded: boolean
  onSelect: (checked: boolean) => void
  onToggleQr: (checked: boolean) => void
  onToggleExpand: () => void
  /** The Reference cell was clicked. */
  onOpen: () => void
}

/**
 * Every cell of a lab-unit row except the last (the icon buttons, see
 * `SampleRowActions`). A fragment: the page keeps the `<tr>`, which is the
 * row's right-click trigger.
 */
export function LabUnitRowCells({
  sample,
  columnVisibility,
  anySelected,
  selected,
  qrSelected,
  expanded,
  onSelect,
  onToggleQr,
  onToggleExpand,
  onOpen,
}: LabUnitRowCellsProps) {
  return (
    <>
      <td className={`${LIST_BOX_CELL} px-3`}>
        <div className="flex flex-col items-start gap-0.5">
          <Checkbox
            className={LIST_BOX}
            checked={selected}
            onCheckedChange={(checked) => onSelect(checked as boolean)}
          />
          {(sample.contract_count ?? 0) > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleExpand()
              }}
              className="p-0.5 rounded hover:bg-accent transition-colors"
              title={expanded ? 'Collapse contracts' : `${sample.contract_count} more contract(s)`}
            >
              {expanded
                ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                : <ChevronRight className="h-3 w-3 text-muted-foreground" />
              }
            </button>
          )}
        </div>
      </td>
      {anySelected && (
        // Same box, cell alignment and column stack as the
        // select box: under it sits the contracts chevron,
        // so an invisible twin of that chevron sits under
        // the QR box and the two boxes stay level.
        <td className={`${LIST_BOX_CELL} px-1.5`}>
          {selected && (
            <div className="flex flex-col items-start gap-0.5">
              <Checkbox
                className={LIST_BOX}
                checked={qrSelected}
                onCheckedChange={(checked) => onToggleQr(checked as boolean)}
                aria-label="QR code on the bag sleeve"
              />
              {(sample.contract_count ?? 0) > 0 && <span aria-hidden className="block p-0.5"><span className="block h-3 w-3" /></span>}
            </div>
          )}
        </td>
      )}
      {columnVisibility.reference && (
        <td className="py-2 px-3 align-middle">
          {sample.deleted_at && (
            <span
              className="mb-0.5 inline-flex items-center rounded px-1 py-px text-[9px] font-sans font-semibold uppercase tracking-wider bg-red-500/15 text-red-700 dark:text-red-300"
              title={`Deleted ${new Date(sample.deleted_at).toLocaleString()}${sample.deleted_by_name ? ` by ${sample.deleted_by_name}` : ''}${sample.deleted_reason ? `: ${sample.deleted_reason}` : ''}`}
            >
              Deleted
            </span>
          )}
          <SampleReferenceCell sample={sample} onOpen={onOpen} />
        </td>
      )}
      {columnVisibility.type && (
        <td className="py-2 px-3 align-middle">
          {sample.sample_type ? (
            <span className="inline-flex items-center justify-center rounded-md bg-muted text-muted-foreground/90 font-mono font-semibold text-[11px] px-1.5 py-0.5">
              {formatSampleType(sample.sample_type)}
            </span>
          ) : null}
        </td>
      )}
      {columnVisibility.wolthers && (
        <td className="py-2 px-3 align-middle font-mono text-[12px] text-foreground/80">
          {sample.wolthers_contract_nr ? (
            <span className="truncate" title={sample.wolthers_contract_nr}>{sample.wolthers_contract_nr}</span>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </td>
      )}
      {columnVisibility.quality && (
        <td className="py-2 px-3 align-middle text-[13px] font-medium text-foreground">
          <div className="truncate" title={sample.quality_name || ''}>{sample.quality_name || ''}</div>
        </td>
      )}
      {columnVisibility.seller && (
        <td className="py-2 px-3 align-middle text-[13px] text-foreground">
          <div className="truncate font-medium" title={sample.seller_name || ''}>{sample.seller_name || ''}</div>
          {sample.seller_contract_nr && (
            <div className="truncate text-[11px] text-muted-foreground font-mono">{sample.seller_contract_nr}</div>
          )}
        </td>
      )}
      {columnVisibility.shipper && (
        <td className="py-2 px-3 align-middle text-[13px] text-foreground">
          <div className="truncate font-medium" title={sample.exporter_name || ''}>{sample.exporter_name || ''}</div>
          {sample.shipper_contract_nr && (
            <div className="truncate text-[11px] text-muted-foreground font-mono">{sample.shipper_contract_nr}</div>
          )}
        </td>
      )}
      {columnVisibility.importer && (() => {
        const importerName = sample.importer_name || (sample.importer_is_qc_client ? sample.qc_client_name : null) || ''
        const endClientName = sample.end_client_name || sample.qc_client_name || ''
        // When the End Client column is hidden but the end
        // client IS the importer, surface that contract nr
        // here so the info doesn't disappear from the table.
        const endClientSameAsImporter =
          !!importerName && !!endClientName &&
          importerName.trim().toLowerCase() === endClientName.trim().toLowerCase()
        const importerRef =
          sample.buyer_contract_nr ||
          (endClientSameAsImporter
            ? sample.end_client_contract_nr || sample.qc_client_contract_nr
            : null)
        return (
          <td className="py-2 px-3 align-middle text-[13px] text-foreground">
            <div className="truncate font-medium" title={importerName}>{importerName}</div>
            {importerRef && (
              <div className="truncate text-[11px] text-muted-foreground font-mono">{importerRef}</div>
            )}
          </td>
        )
      })()}
      {columnVisibility.roaster && (
        <td className="py-2 px-3 align-middle text-[13px] text-foreground">
          <div className="truncate font-medium" title={sample.roaster_name || ''}>{sample.roaster_name || ''}</div>
          {sample.roaster_contract_nr && (
            <div className="truncate text-[11px] text-muted-foreground font-mono">{sample.roaster_contract_nr}</div>
          )}
        </td>
      )}
      {columnVisibility.endClient && (() => {
        const endClientName = sample.end_client_name || sample.qc_client_name || ''
        const endClientRef = sample.end_client_contract_nr || sample.qc_client_contract_nr
        return (
          <td className="py-2 px-3 align-middle text-[13px] text-foreground">
            <div className="truncate font-medium" title={endClientName}>{endClientName}</div>
            {endClientRef && (
              <div className="truncate text-[11px] text-muted-foreground font-mono">{endClientRef}</div>
            )}
          </td>
        )
      })()}
      {columnVisibility.status && (
        <td className="py-2 px-3 align-middle">
          {renderStatusCell(sample.status, sample.workflow_stage, sample.sample_type)}
        </td>
      )}
      {columnVisibility.origin && (
        <td className="py-2 px-3 align-middle text-[13px] text-foreground/80">
          <div className="truncate" title={sample.origin || ''}>{sample.origin || ''}</div>
        </td>
      )}
      {columnVisibility.storage && (
        <td className="py-2 px-3 align-middle text-[13px] text-foreground/80">
          {sample.storage_position ? (
            <div className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{sample.storage_position}</span>
            </div>
          ) : null}
        </td>
      )}
      {columnVisibility.created && (
        <td className="py-2 px-3 align-middle text-[12px] text-muted-foreground">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <Calendar className="h-3 w-3 shrink-0 text-muted-foreground/70" />
            {new Date(sample.created_at).toLocaleDateString()}
          </div>
        </td>
      )}
    </>
  )
}

export interface ContractSiblingRowProps {
  /** The lab unit this contract belongs to: type, quality, seller, shipper, status, origin, storage and date are its. */
  sample: Sample
  /** The contract sibling itself. */
  sc: SiblingRow
  /** Last sibling of its lot: closes the tree line and carries the bottom border. */
  isLast: boolean
  columnVisibility: Record<string, boolean>
  /** Any row is selected: the QR column is shown. */
  anySelected: boolean
  /** The sibling's LAB UNIT is selected: the sibling's QR box is shown. */
  parentSelected: boolean
  /** This sibling's QR box is ticked. */
  qrSelected: boolean
  onToggleQr: (checked: boolean) => void
  /** The Reference cell was clicked. */
  onOpen: () => void
  /** The last cell (`SampleRowActions`). */
  children: ReactNode
}

/** One expanded contract-sibling row (same columns as the lab unit). */
export function ContractSiblingRow({
  sample,
  sc,
  isLast,
  columnVisibility,
  anySelected,
  parentSelected,
  qrSelected,
  onToggleQr,
  onOpen,
  children,
}: ContractSiblingRowProps) {
  return (
    <tr
      className={`group bg-muted/20 hover:bg-muted/60 transition-colors ${isLast ? 'border-b border-border' : ''}`}
    >
      {/* Tree connector in checkbox column - continuous
          vertical line down the group with a tick per row */}
      <td className="p-0 align-middle relative">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`absolute left-1/2 -translate-x-1/2 w-px bg-border ${isLast ? 'top-0 h-1/2' : 'inset-y-0'}`} />
          <div className="absolute left-1/2 top-1/2 -translate-y-1/2 h-px bg-border w-3" />
        </div>
      </td>
      {/* QR column */}
      {anySelected && (
        <td className={`${LIST_BOX_CELL} px-1.5`}>
          {parentSelected && (
            <Checkbox
              className={LIST_BOX}
              checked={qrSelected}
              onCheckedChange={(checked) => onToggleQr(checked as boolean)}
            />
          )}
        </td>
      )}
      {/* Reference: the contract's own certificate nr, else its own sample nr / ICO / container */}
      {columnVisibility.reference && (
        <td className="py-2 px-3 align-middle">
          <SampleReferenceCell sample={sc} child onOpen={onOpen} />
        </td>
      )}
      {columnVisibility.type && (
        <td className="py-2 px-3 align-middle">
          {sample.sample_type ? (
            <span className="inline-flex items-center justify-center rounded-md bg-muted/60 text-muted-foreground/70 font-mono font-semibold text-[10.5px] px-1.5 py-0.5">
              {formatSampleType(sample.sample_type)}
            </span>
          ) : null}
        </td>
      )}
      {columnVisibility.wolthers && (
        <td className="py-2 px-3 align-middle font-mono text-[12px] text-foreground/75">
          {sc.wolthers_contract_nr ? (
            <span className="truncate" title={sc.wolthers_contract_nr}>{sc.wolthers_contract_nr}</span>
          ) : (
            <span className="text-muted-foreground/40">—</span>
          )}
        </td>
      )}
      {columnVisibility.quality && (
        <td className="py-2 px-3 align-middle text-[12.5px] text-muted-foreground">
          <div className="truncate">{sample.quality_name || ''}</div>
        </td>
      )}
      {columnVisibility.seller && (
        <td className="py-2 px-3 align-middle text-[12.5px] text-muted-foreground">
          <div className="truncate">{sample.seller_name || ''}</div>
          {/* The contract's own seller ref, as its certificate prints it. */}
          {(sc.seller_contract_nr || sc.supplier_contract_nr) && (
            <div className="truncate text-[10.5px] font-mono">{sc.seller_contract_nr || sc.supplier_contract_nr}</div>
          )}
        </td>
      )}
      {columnVisibility.shipper && (
        <td className="py-2 px-3 align-middle text-[12.5px] text-muted-foreground">
          <div className="truncate">{sample.exporter_name || ''}</div>
        </td>
      )}
      {columnVisibility.importer && (() => {
        const scImporterName = sc.importer_name || ''
        const scEndClientName = sc.end_client_name || sc.qc_client_name || ''
        const sameAsImporter =
          !!scImporterName && !!scEndClientName &&
          scImporterName.trim().toLowerCase() === scEndClientName.trim().toLowerCase()
        const scImporterRef =
          sc.buyer_contract_nr ||
          (sameAsImporter
            ? sc.end_client_contract_nr || sc.qc_client_contract_nr
            : null)
        return (
          <td className="py-2 px-3 align-middle text-[12.5px] text-foreground/85">
            <div className="truncate">{scImporterName}</div>
            {scImporterRef && (
              <div className="truncate text-[10.5px] text-muted-foreground font-mono">{scImporterRef}</div>
            )}
          </td>
        )
      })()}
      {columnVisibility.roaster && (
        <td className="py-2 px-3 align-middle text-[12.5px] text-foreground/85">
          <div className="truncate">{sc.roaster_name || ''}</div>
          {sc.roaster_contract_nr && (
            <div className="truncate text-[10.5px] text-muted-foreground font-mono">{sc.roaster_contract_nr}</div>
          )}
        </td>
      )}
      {columnVisibility.endClient && (
        <td className="py-2 px-3 align-middle text-[12.5px] text-foreground/85">
          <div className="truncate">{sc.end_client_name || sc.qc_client_name || ''}</div>
          {(sc.end_client_contract_nr || sc.qc_client_contract_nr) && (
            <div className="truncate text-[10.5px] text-muted-foreground font-mono">{sc.end_client_contract_nr || sc.qc_client_contract_nr}</div>
          )}
        </td>
      )}
      {columnVisibility.status && (
        <td className="py-2 px-3 align-middle">
          {renderStatusCell(sample.status, sample.workflow_stage, sample.sample_type)}
        </td>
      )}
      {columnVisibility.origin && (
        <td className="py-2 px-3 align-middle text-[12.5px] text-muted-foreground">
          <div className="truncate">{sample.origin || ''}</div>
        </td>
      )}
      {columnVisibility.storage && (
        <td className="py-2 px-3 align-middle text-[12.5px] text-muted-foreground">
          <div className="truncate">{sample.storage_position || ''}</div>
        </td>
      )}
      {columnVisibility.created && (
        <td className="py-2 px-3 align-middle text-[12px] text-muted-foreground whitespace-nowrap">
          {new Date(sample.created_at).toLocaleDateString()}
        </td>
      )}
      {children}
    </tr>
  )
}
