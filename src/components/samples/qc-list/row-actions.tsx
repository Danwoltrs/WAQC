'use client'

import { Button } from '@/components/ui/button'
import { Eye, Download, Trash2, Loader2 } from 'lucide-react'

// The two rows differ only in size, the delete tooltip and whether the delete
// button shows a spinner while its request runs (the lab-unit row never did).
const VARIANTS = {
  labUnit: { button: 'h-7 w-7', icon: 'h-3.5 w-3.5', deleteTitle: 'Delete sample', deleteSpinner: false },
  sibling: { button: 'h-6 w-6', icon: 'h-3 w-3', deleteTitle: 'Delete contract', deleteSpinner: true },
} as const

export interface SampleRowActionsProps {
  /** `labUnit` = a top-level row, `sibling` = a contract row under its lot. */
  variant: keyof typeof VARIANTS
  /** Lab unit: `certificate_id` is set. Sibling: `has_certificate`. */
  hasCertificate: boolean
  /** Whether the delete button is rendered at all. */
  canDelete: boolean
  /** This row's certificate download is running. */
  downloading: boolean
  /** This row's delete request is running. */
  deleting: boolean
  onViewCertificate: () => void
  onViewSample: () => void
  onDownloadCertificate: () => void
  onDelete: () => void
}

/**
 * The last cell of a row in the QC samples list: view (the certificate once
 * there is one, else the sample), download certificate, delete.
 */
export function SampleRowActions({
  variant,
  hasCertificate,
  canDelete,
  downloading,
  deleting,
  onViewCertificate,
  onViewSample,
  onDownloadCertificate,
  onDelete,
}: SampleRowActionsProps) {
  const v = VARIANTS[variant]
  return (
    <td className="py-2 pl-6 pr-3 align-middle">
      <div className="flex items-center justify-end gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className={`${v.button} p-0 text-muted-foreground hover:text-foreground`}
          onClick={() => hasCertificate ? onViewCertificate() : onViewSample()}
          title={hasCertificate ? 'View certificate' : 'View sample'}
        >
          <Eye className={v.icon} />
        </Button>
        {hasCertificate && (
          <Button
            variant="ghost"
            size="sm"
            className={`${v.button} p-0 text-muted-foreground hover:text-foreground`}
            onClick={() => onDownloadCertificate()}
            disabled={downloading}
            title="Download certificate"
          >
            {downloading ? (
              <Loader2 className={`${v.icon} animate-spin`} />
            ) : (
              <Download className={v.icon} />
            )}
          </Button>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete()}
            disabled={deleting}
            className={`${v.button} p-0 text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-opacity`}
            title={v.deleteTitle}
          >
            {v.deleteSpinner && deleting ? (
              <Loader2 className={`${v.icon} animate-spin`} />
            ) : (
              <Trash2 className={v.icon} />
            )}
          </Button>
        )}
      </div>
    </td>
  )
}
