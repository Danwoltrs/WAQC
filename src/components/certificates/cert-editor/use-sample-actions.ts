'use client'

import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { trackingNumberToSlug } from '@/lib/utils'
import type { CertSample } from './use-cert-editor'

/** Plain-text tracking numbers pass through; legacy JSON tracking numbers unwrap to `.pattern`. */
function parseTrackingNumber(trackingNumber: string): string {
  try {
    if (trackingNumber.startsWith('{')) {
      const parsed = JSON.parse(trackingNumber)
      return parsed.pattern || trackingNumber
    }
    return trackingNumber
  } catch {
    return trackingNumber
  }
}

export function useSampleActions({
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
  const { toast } = useToast()

  // Certificate preview
  const [showCertificateModal, setShowCertificateModal] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  // Email
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState({ exporter: true, importer: true, roaster: true })
  // QR
  const [showQrModal, setShowQrModal] = useState(false)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)
  const [generatingQr, setGeneratingQr] = useState(false)
  // Misc action flags
  const [printingLabel, setPrintingLabel] = useState(false)
  const [downloadingCertificate, setDownloadingCertificate] = useState(false)
  const [generatingCertificate, setGeneratingCertificate] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [showApprovalSend, setShowApprovalSend] = useState(false)

  const handleShowQrCode = async () => {
    setShowQrModal(true)
    setGeneratingQr(true)
    try {
      const QRCode = await import('qrcode')
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
      const certUrl = `${baseUrl}/certificate/${trackingNumberToSlug(sample.tracking_number)}`
      const lines: string[] = [sample.tracking_number]

      const res = await fetch(`/api/samples/${sample.id}/quality-assessment`)
      if (res.ok) {
        const data = await res.json()
        const gb = data.assessment?.green_bean_data
        if (gb) {
          const defects = gb.defects
          const primary = defects?.total_primary ?? defects?.primary ?? null
          const secondary = defects?.total_secondary ?? defects?.secondary ?? null
          const total = defects?.total ?? (primary != null && secondary != null ? primary + secondary : null)
          if (total != null) {
            let defLine = `Def: ${total}`
            if (primary != null && secondary != null) defLine += ` (${primary}p|${secondary}s)`
            lines.push(defLine)
          }
          const screenSizes = gb.screen_sizes as Record<string, number> | undefined
          if (screenSizes) {
            const numbered: Array<{ num: number; pct: number }> = []
            let panPct = 0
            for (const [key, pct] of Object.entries(screenSizes)) {
              if (pct === 0) continue
              if (/^(pan|fundo|bottom)$/i.test(key)) panPct += pct
              else {
                const num = parseInt(key.replace(/\D/g, ''))
                if (!isNaN(num)) numbered.push({ num, pct })
              }
            }
            numbered.sort((a, b) => b.num - a.num)
            const groups: Array<{ label: string; pct: number }> = []
            let i = 0
            while (i < numbered.length) {
              let j = i
              let groupPct = numbered[i].pct
              while (j + 1 < numbered.length && numbered[j].num - numbered[j + 1].num === 1) {
                j++
                groupPct += numbered[j].pct
              }
              if (i === j) groups.push({ label: String(numbered[i].num), pct: groupPct })
              else if (j - i === 1) groups.push({ label: `${numbered[i].num}/${numbered[j].num}`, pct: groupPct })
              else groups.push({ label: `${numbered[j].num}-${numbered[i].num}`, pct: groupPct })
              i = j + 1
            }
            if (panPct > 0) groups.push({ label: 'Pan', pct: panPct })
            if (groups.length > 0) lines.push(groups.map((g) => `${g.label}:${Math.round(g.pct)}%`).join(' '))
          }
        }
      }
      lines.push(certUrl)
      const dataUrl = await QRCode.toDataURL(lines.join('\n'), { width: 256, margin: 2 })
      setQrCodeDataUrl(dataUrl)
    } catch (error) {
      console.error('Error generating QR code:', error)
      toast({ title: 'QR code failed', description: 'Could not generate the QR code.', variant: 'destructive' })
    } finally {
      setGeneratingQr(false)
    }
  }

  const handleDownloadQrCode = () => {
    if (!qrCodeDataUrl) return
    const a = document.createElement('a')
    a.href = qrCodeDataUrl
    a.download = `${parseTrackingNumber(sample.tracking_number)}-qr.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handlePrintLabel = async () => {
    try {
      setPrintingLabel(true)
      const response = await fetch('/api/samples/bulk/print-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: [sample.id] }),
      })
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to generate label')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const printWindow = window.open(url)
      if (printWindow) printWindow.onload = () => printWindow.print()
      setTimeout(() => window.URL.revokeObjectURL(url), 60000)
    } catch (error) {
      console.error('Error printing label:', error)
      toast({ title: 'Print failed', description: error instanceof Error ? error.message : 'Failed to print label', variant: 'destructive' })
    } finally {
      setPrintingLabel(false)
    }
  }

  const handleExport = () => {
    const exportData = {
      tracking_number: parseTrackingNumber(sample.tracking_number),
      origin: sample.origin,
      quality: sample.quality_name,
      processing_method: sample.processing_method,
      sample_type: sample.sample_type,
      status: sample.status,
      workflow_stage: sample.workflow_stage,
      bag_count: sample.bag_count,
      bag_type: sample.bag_type,
      bag_weight_kg: sample.bag_weight_kg,
      bags_quantity_mt: sample.bags_quantity_mt,
      equivalent_60kg_bags: sample.equivalent_60kg_bags,
      exporter: sample.exporter_name,
      importer: sample.importer_name,
      roaster: sample.roaster_name,
      wolthers_contract_nr: sample.wolthers_contract_nr,
      ico_number: sample.ico_number,
      container_nr: sample.container_nr,
      storage_position: sample.storage_position,
      created_at: sample.created_at,
      certificate_number: sample.certificate_number,
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${parseTrackingNumber(sample.tracking_number)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const handleDownloadCertificate = async () => {
    try {
      setDownloadingCertificate(true)
      const response = await fetch(`/api/samples/${sample.id}/certificate${contractId ? `?contract_id=${contractId}` : ''}`)
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to download certificate')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${parseTrackingNumber(sample.tracking_number)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading certificate:', error)
      toast({ title: 'Download failed', description: error instanceof Error ? error.message : 'Failed to download certificate', variant: 'destructive' })
    } finally {
      setDownloadingCertificate(false)
    }
  }

  const handleGenerateCertificate = async () => {
    try {
      setGeneratingCertificate(true)
      // Generation is mother-cert based — intentionally no contract_id (unlike view/download).
      const createRes = await fetch(`/api/samples/${sample.id}/certificate`, { method: 'POST' })
      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.details ? `${data.error}: ${data.details}` : data.error || 'Failed to create certificate')
      }
      await handleDownloadCertificate()
      reload()
      onSampleUpdated?.()
    } catch (error) {
      console.error('Error generating certificate:', error)
      toast({ title: 'Generate failed', description: error instanceof Error ? error.message : 'Failed to generate certificate', variant: 'destructive' })
    } finally {
      setGeneratingCertificate(false)
    }
  }

  const handleViewCertificate = async () => {
    setShowCertificateModal(true)
    setPreviewLoading(true)
    setPreviewPdfUrl(null)
    try {
      const response = await fetch(`/api/samples/${sample.id}/certificate${contractId ? `?contract_id=${contractId}` : ''}`)
      if (response.ok) {
        const blob = await response.blob()
        setPreviewPdfUrl(window.URL.createObjectURL(blob))
      } else {
        toast({ title: 'Preview failed', description: 'Could not load the certificate preview.', variant: 'destructive' })
      }
    } catch (error) {
      console.error('Error loading certificate preview:', error)
      toast({ title: 'Preview failed', description: 'Could not load the certificate preview.', variant: 'destructive' })
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleClosePreview = () => {
    if (previewPdfUrl) window.URL.revokeObjectURL(previewPdfUrl)
    setShowCertificateModal(false)
    setPreviewPdfUrl(null)
    setPreviewLoading(false)
  }

  const handleSendEmail = async () => {
    if (!emailRecipients.exporter && !emailRecipients.importer && !emailRecipients.roaster) {
      toast({ title: 'Select a recipient', description: 'Please select at least one recipient type', variant: 'destructive' })
      return
    }
    try {
      setSendingEmail(true)
      const certRes = await fetch(`/api/certificates?sample_id=${sample.id}`)
      const certData = await certRes.json()
      if (!certRes.ok || !certData.certificates?.length) {
        toast({ title: 'Certificate not found', variant: 'destructive' })
        return
      }
      const response = await fetch('/api/certificates/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateIds: [certData.certificates[0].id], recipients: emailRecipients }),
      })
      const data = await response.json()
      if (response.ok) {
        toast({ title: 'Email sent', description: `Sent to ${data.successful} recipient(s)` })
        setShowEmailDialog(false)
      } else {
        toast({ title: 'Send failed', description: data.error, variant: 'destructive' })
      }
    } catch (error) {
      console.error('Error sending email:', error)
      toast({ title: 'Send failed', variant: 'destructive' })
    } finally {
      setSendingEmail(false)
    }
  }

  const confirmDelete = async () => {
    setDeleteOpen(false)
    try {
      setDeleting(true)
      const response = await fetch(`/api/samples/${sample.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to delete sample')
      const data = await response.json()
      toast({ title: 'Sample deleted', description: data.message || 'Sample deleted successfully' })
      onClose()
      onSampleUpdated?.()
    } catch (error) {
      console.error('Error deleting sample:', error)
      toast({ title: 'Delete failed', description: error instanceof Error ? error.message : 'Failed to delete sample', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  return {
    // preview
    showCertificateModal, previewLoading, previewPdfUrl, handleViewCertificate, handleClosePreview,
    // email
    showEmailDialog, setShowEmailDialog, sendingEmail, emailRecipients, setEmailRecipients, handleSendEmail,
    // qr
    showQrModal, setShowQrModal, qrCodeDataUrl, generatingQr, handleShowQrCode, handleDownloadQrCode,
    // certificate
    downloadingCertificate, handleDownloadCertificate, generatingCertificate, handleGenerateCertificate,
    // print / export
    printingLabel, handlePrintLabel, handleExport,
    // delete
    deleteOpen, setDeleteOpen, deleting, confirmDelete,
    // approval send
    showApprovalSend, setShowApprovalSend,
    // helper
    parseTrackingNumber,
  }
}
