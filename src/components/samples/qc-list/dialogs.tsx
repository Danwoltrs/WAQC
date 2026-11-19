'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { FileText, Download, Loader2 } from 'lucide-react'
import type { CertificateTarget } from './types'

export interface CertificatePreviewDialogProps {
  /** The row whose certificate is previewed; null = closed. */
  previewSample: CertificateTarget | null
  /** The certificate PDF's URL, shown in an iframe. */
  previewPdfUrl: string | null
  /** Cert number of the SPECIFIC certificate being previewed. */
  previewCertNumber: string | null
  /** The sample whose download is running, if any. */
  downloadingSampleId: string | null
  onDownload: (sample: CertificateTarget) => void
  onClose: () => void
}

/** Certificate Preview Modal */
export function CertificatePreviewDialog({
  previewSample,
  previewPdfUrl,
  previewCertNumber,
  downloadingSampleId,
  onDownload,
  onClose,
}: CertificatePreviewDialogProps) {
  return (
    <Dialog open={!!previewSample} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[1100px] max-h-[95vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Certificate {previewCertNumber || previewSample?.certificate_number || ''}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-[75vh] bg-muted rounded-lg overflow-hidden">
          {previewPdfUrl ? (
            <iframe
              src={previewPdfUrl}
              className="w-full h-[75vh] border-0"
              title="Certificate Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-[75vh] text-muted-foreground">
              Unable to load certificate preview
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          {previewSample && (
            <Button
              variant="outline"
              onClick={() => onDownload(previewSample)}
              disabled={downloadingSampleId === previewSample.id}
            >
              {downloadingSampleId === previewSample.id ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download
            </Button>
          )}
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// The three delete confirmations share the optional reason, typed in the
// dialog; it travels with the DELETE.
interface DeleteDialogBaseProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  deleteReason: string
  onDeleteReasonChange: (value: string) => void
  onConfirm: () => void
}

export interface DeleteSampleDialogProps extends DeleteDialogBaseProps {
  /** The label of the sample about to be deleted (never the lab number). */
  sampleLabel: string
}

/** Delete Sample Confirmation */
export function DeleteSampleDialog({ open, onOpenChange, deleteReason, onDeleteReasonChange, onConfirm, sampleLabel }: DeleteSampleDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete sample</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete sample{' '}
            <span className="font-medium text-foreground">
              {sampleLabel}
            </span>
            ? It leaves every list and queue but is kept, with any certificate it holds, on the audit trail.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          value={deleteReason}
          onChange={(e) => onDeleteReasonChange(e.target.value)}
          placeholder="Reason (optional) — kept with the audit record"
          rows={2}
          className="text-sm"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} variant="destructive">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export interface BulkDeleteSamplesDialogProps extends DeleteDialogBaseProps {
  /** `selectedSamples.size`. */
  selectedCount: number
}

/** Bulk Delete Samples Confirmation */
export function BulkDeleteSamplesDialog({ open, onOpenChange, deleteReason, onDeleteReasonChange, onConfirm, selectedCount }: BulkDeleteSamplesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {selectedCount} sample(s)</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete{' '}
            <span className="font-medium text-foreground">{selectedCount}</span> sample(s)?
            Each leaves every list and queue but is kept, with any certificate it holds, on the audit trail.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          value={deleteReason}
          onChange={(e) => onDeleteReasonChange(e.target.value)}
          placeholder="Reason (optional) — kept with the audit record"
          rows={2}
          className="text-sm"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} variant="destructive">
            Delete {selectedCount}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export interface DeleteContractDialogProps extends DeleteDialogBaseProps {
  /** The label of the contract sibling about to be deleted (never the lab number). */
  contractLabel: string
}

/** Delete contract (sibling) confirmation */
export function DeleteContractDialog({ open, onOpenChange, deleteReason, onDeleteReasonChange, onConfirm, contractLabel }: DeleteContractDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete contract</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete contract{' '}
            <span className="font-medium text-foreground">{contractLabel}</span>?
            The lab unit and its other contracts are kept. A certified contract cannot be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          value={deleteReason}
          onChange={(e) => onDeleteReasonChange(e.target.value)}
          placeholder="Reason (optional) — kept with the audit record"
          rows={2}
          className="text-sm"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} variant="destructive">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
