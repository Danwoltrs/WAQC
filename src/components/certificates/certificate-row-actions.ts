import { Download, Pencil, RefreshCw } from 'lucide-react'
import type { RowAction } from '@/components/ui/row-actions'

export interface CertificateRowActionsInput {
  /** The master editor only (isSampleEditor); everyone else has no Edit. */
  canEdit: boolean
  onDownload: () => void
  /** Opens the full-screen certificate editor. */
  onEdit: () => void
  /** Opens the Override status dialog. */
  onOverride: () => void
}

/**
 * A certificate row's More menu and right-click menu: one array for both.
 * Open (the preview) is the row's own button, not in here.
 *
 * Edit and Override status open a modal, so they wait one tick: the menu has
 * to finish closing and hand focus back first, or the modal opens behind
 * Radix's focus return and pointer lock (ruling R6).
 */
export function certificateRowActions({ canEdit, onDownload, onEdit, onOverride }: CertificateRowActionsInput): RowAction[] {
  return [
    { id: 'download', label: 'Download PDF', icon: Download, onSelect: onDownload },
    { id: 'edit', label: 'Edit', icon: Pencil, hidden: !canEdit, onSelect: () => { setTimeout(onEdit, 0) } },
    { id: 'override', label: 'Override status', icon: RefreshCw, onSelect: () => { setTimeout(onOverride, 0) } },
  ]
}
