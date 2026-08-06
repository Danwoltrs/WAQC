'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  MoreHorizontal, QrCode, Printer, Download, Eye, Award, Mail, Trash2, Loader2,
} from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { ApprovalSendView } from '@/components/samples/approval-send-view'
import { PrintPreviewDialog } from '@/components/print/print-preview-dialog'
import type { CertSample } from './use-cert-editor'
import { useSampleActions } from './use-sample-actions'

export function SampleActionsMenu({
  sample,
  contractId,
  onSampleUpdated,
  reload,
  onClose,
}: {
  sample: CertSample
  contractId?: string | null
  onSampleUpdated?: () => void
  reload: () => void
  onClose: () => void
}) {
  const { profile } = useAuth()
  const a = useSampleActions({ sample, contractId, onSampleUpdated, reload, onClose })

  const hasCert = !!sample.certificate_id
  const canGenerate = !hasCert && ['certified', 'rejected', 'review'].includes(sample.workflow_stage || '')
  const canSendApproval = (sample.status === 'approved' || sample.status === 'rejected') && !!sample.wolthers_contract_nr
  const canDelete = profile?.is_global_admin === true || profile?.qc_role === 'global_admin'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8" title="Actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={a.handleShowQrCode}>
            <QrCode className="mr-2 h-4 w-4" /> QR Code
          </DropdownMenuItem>
          <DropdownMenuItem onClick={a.handlePrintLabel} disabled={a.printingLabel}>
            <Printer className="mr-2 h-4 w-4" /> Print Label
          </DropdownMenuItem>
          <DropdownMenuItem onClick={a.handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export
          </DropdownMenuItem>
          {hasCert ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={a.handleViewCertificate}>
                <Eye className="mr-2 h-4 w-4" /> View Certificate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={a.handleDownloadCertificate} disabled={a.downloadingCertificate}>
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </DropdownMenuItem>
            </>
          ) : null}
          {canGenerate ? (
            <DropdownMenuItem onClick={a.handleGenerateCertificate} disabled={a.generatingCertificate}>
              <Award className="mr-2 h-4 w-4" /> Generate Cert
            </DropdownMenuItem>
          ) : null}
          {canSendApproval ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => a.setShowApprovalSend(true)}>
                <Mail className="mr-2 h-4 w-4" /> Send approval email
              </DropdownMenuItem>
            </>
          ) : null}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => a.setDeleteOpen(true)} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Certificate preview */}
      <PrintPreviewDialog
        open={a.showCertificateModal}
        onOpenChange={(o) => { if (!o) a.handleClosePreview() }}
        title={`Certificate ${a.parseTrackingNumber(sample.tracking_number)}`}
        subtitle={[
          sample.origin ? `Origin: ${sample.origin}` : null,
          sample.quality_name ? `Quality: ${sample.quality_name}` : null,
        ].filter(Boolean).join('   ') || undefined}
        pdfUrl={a.previewPdfUrl}
        loading={a.previewLoading}
        saveFileName={`${a.parseTrackingNumber(sample.tracking_number)}.pdf`}
        onSave={a.handleDownloadCertificate}
        footerExtra={
          <Button variant="outline" onClick={() => a.setShowEmailDialog(true)}>
            <Mail className="mr-2 h-4 w-4" /> Send Email
          </Button>
        }
      />

      {/* Sample label preview */}
      <PrintPreviewDialog
        open={!!a.labelPdfUrl}
        onOpenChange={(o) => { if (!o) a.closeLabelPreview() }}
        title={`Sample label ${a.parseTrackingNumber(sample.tracking_number)}`}
        subtitle="One label, 4cm on A4 with cut guides."
        pdfUrl={a.labelPdfUrl}
        saveFileName={`${a.parseTrackingNumber(sample.tracking_number)}-label.pdf`}
      />

      {/* Email dialog */}
      <Dialog open={a.showEmailDialog} onOpenChange={a.setShowEmailDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Send Certificate via Email</DialogTitle>
            <DialogDescription>Send certificate to selected recipients.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {(['exporter', 'importer', 'roaster'] as const).map((role) => (
              <div key={role} className="flex items-center space-x-3">
                <Checkbox
                  id={`cert-email-${role}`}
                  checked={a.emailRecipients[role]}
                  onCheckedChange={(checked) => a.setEmailRecipients((prev) => ({ ...prev, [role]: !!checked }))}
                />
                <label htmlFor={`cert-email-${role}`} className="text-sm font-medium capitalize leading-none">{role}</label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => a.setShowEmailDialog(false)}>Cancel</Button>
            <Button onClick={a.handleSendEmail} disabled={a.sendingEmail}>
              {a.sendingEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />} Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR modal */}
      <Dialog open={a.showQrModal} onOpenChange={a.setShowQrModal}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> Sample QR Code</DialogTitle>
            <DialogDescription>{a.parseTrackingNumber(sample.tracking_number)}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center space-y-4 py-6">
            {a.generatingQr ? (
              <div className="flex h-64 w-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : a.qrCodeDataUrl ? (
              <img src={a.qrCodeDataUrl} alt="Sample QR Code" className="h-64 w-64 rounded-lg border" />
            ) : (
              <div className="flex h-64 w-64 items-center justify-center text-muted-foreground">Failed to generate QR code</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={a.handleDownloadQrCode} disabled={!a.qrCodeDataUrl}>
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
            <Button variant="default" onClick={() => a.setShowQrModal(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={a.deleteOpen} onOpenChange={a.setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sample</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete sample{' '}
              <span className="font-medium text-foreground">{a.parseTrackingNumber(sample.tracking_number)}</span>?
              This permanently removes the sample, its quality assessments, certificates and activity logs. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={a.confirmDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approval send */}
      <ApprovalSendView sampleId={sample.id} open={a.showApprovalSend} onClose={() => a.setShowApprovalSend(false)} />
    </>
  )
}
