'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Eye, ImageIcon, Loader2, X, AlertCircle,
  Check, Plus, FlaskConical, Trash2,
} from 'lucide-react'
import {
  CertificatePattern,
  generateCertificatePreview,
} from '@/types/certificate-pattern'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const FEE_PAYER_OPTIONS = [
  { value: 'exporter', label: 'Exporter' },
  { value: 'importer', label: 'Importer' },
  { value: 'roaster', label: 'Roaster' },
  { value: 'final_buyer', label: 'Final Importer' },
  { value: 'client_pays', label: 'Client pays' },
]

export interface QcConfigData {
  certificatePattern: CertificatePattern
  certificateValidityEnabled: boolean
  certificateValidityMonths: number
  pricingModel: string
  pricePerSample?: number
  pricePerPoundCents?: number
  currency: string
  billingBasis: string
  paymentTerms: string
  feePayer: string
  billingNotes: string
  qcFeeCoBrokerCompanyId: string | null
  logoUrl: string | null
}

interface QcConfigPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: QcConfigData
  onSave: (data: QcConfigData) => void
  clientId?: string
}

interface LabRow {
  id?: string
  laboratory_id: string
  laboratory_name: string
  starting_sequence: number
  notes?: string | null
}

interface Laboratory {
  id: string
  name: string
  location?: string | null
}

export function QcConfigPanel({ open, onOpenChange, data, onSave, clientId }: QcConfigPanelProps) {
  const [certificatePattern, setCertificatePattern] = useState<CertificatePattern>(data.certificatePattern)
  const [certValidityEnabled, setCertValidityEnabled] = useState(data.certificateValidityEnabled)
  const [certValidityMonths, setCertValidityMonths] = useState(data.certificateValidityMonths)
  const [pricingModel, setPricingModel] = useState(data.pricingModel)
  const [pricePerSample, setPricePerSample] = useState(data.pricePerSample)
  const [pricePerPoundCents, setPricePerPoundCents] = useState(data.pricePerPoundCents)
  const [currency, setCurrency] = useState(data.currency)
  const [billingBasis, setBillingBasis] = useState(data.billingBasis)
  const [paymentTerms, setPaymentTerms] = useState(data.paymentTerms)
  const [feePayer, setFeePayer] = useState(data.feePayer)
  const [qcFeeCoBrokerCompanyId, setQcFeeCoBrokerCompanyId] =
    useState<string | null>(data.qcFeeCoBrokerCompanyId)
  const [coBrokers, setCoBrokers] = useState<{ id: string; name: string }[]>([])
  const [billingNotes, setBillingNotes] = useState(data.billingNotes)
  const [logoUrl, setLogoUrl] = useState(data.logoUrl)
  const [hasOriginPricing, setHasOriginPricing] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Lab sequences
  const [labs, setLabs] = useState<Laboratory[]>([])
  const [labRows, setLabRows] = useState<LabRow[]>([])
  // IDs of lab-config rows as loaded from the DB, so handleSave can DELETE the
  // ones the user removed (upsert alone never deletes — that left stale per-lab
  // overrides like Dunkin's mistaken sequence in place).
  const [initialLabConfigIds, setInitialLabConfigIds] = useState<string[]>([])
  const [labLoading, setLabLoading] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [addingLabId, setAddingLabId] = useState<string | null>(null)

  // Reset all local state from props whenever the modal opens with new data
  useEffect(() => {
    if (!open) return
    setCertificatePattern(data.certificatePattern)
    setCertValidityEnabled(data.certificateValidityEnabled)
    setCertValidityMonths(data.certificateValidityMonths)
    setPricingModel(data.pricingModel)
    setPricePerSample(data.pricePerSample)
    setPricePerPoundCents(data.pricePerPoundCents)
    setCurrency(data.currency)
    setBillingBasis(data.billingBasis)
    setPaymentTerms(data.paymentTerms)
    setFeePayer(data.feePayer)
    setQcFeeCoBrokerCompanyId(data.qcFeeCoBrokerCompanyId)
    setBillingNotes(data.billingNotes)
    setLogoUrl(data.logoUrl)
    setLogoError(null)
  }, [open, data])

  // Load the co-broker pick list whenever the dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/clients/co-brokers')
      .then((r) => (r.ok ? r.json() : { coBrokers: [] }))
      .then((j) => { if (!cancelled) setCoBrokers(j.coBrokers ?? []) })
      .catch(() => { if (!cancelled) setCoBrokers([]) })
    return () => { cancelled = true }
  }, [open])

  // Fetch labs + existing lab configs on open
  useEffect(() => {
    if (!open || !clientId) return
    setLabLoading(true)
    Promise.all([
      fetch('/api/laboratories').then(r => r.ok ? r.json() : { laboratories: [] }),
      fetch(`/api/clients/${clientId}/lab-configs`).then(r => r.ok ? r.json() : { configs: [] }),
    ])
      .then(([labsRes, configsRes]) => {
        const allLabs: Laboratory[] = labsRes.laboratories || []
        setLabs(allLabs)
        const configs = (configsRes.configs || []).map((c: any) => ({
          id: c.id,
          laboratory_id: c.laboratory_id,
          laboratory_name: c.laboratories?.name || allLabs.find(l => l.id === c.laboratory_id)?.name || 'Lab',
          starting_sequence: c.starting_sequence,
          notes: c.notes,
        }))
        setLabRows(configs)
        setInitialLabConfigIds(configs.map((c: LabRow) => c.id).filter(Boolean) as string[])
      })
      .catch(err => console.error('Error loading lab data:', err))
      .finally(() => setLabLoading(false))
  }, [open, clientId])

  const processLogoFile = async (file: File) => {
    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
    if (!validTypes.includes(file.type)) {
      setLogoError('Please upload a PNG, JPEG, WebP, or SVG image')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('Logo must be smaller than 2MB')
      return
    }
    setUploadingLogo(true)
    setLogoError(null)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${clientId || 'new'}-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('client-logos')
        .upload(fileName, file, { cacheControl: '3600', upsert: false })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('client-logos').getPublicUrl(fileName)
      if (urlData?.publicUrl) {
        if (logoUrl) {
          const oldPath = logoUrl.split('/client-logos/').pop()
          if (oldPath) await supabase.storage.from('client-logos').remove([oldPath])
        }
        setLogoUrl(urlData.publicUrl)
      }
    } catch (err) {
      console.error('Logo upload error:', err)
      setLogoError('Failed to upload logo. Please try again.')
    } finally {
      setUploadingLogo(false)
    }
  }

  const availableLabsToAdd = useMemo(() => {
    const used = new Set(labRows.map(r => r.laboratory_id))
    return labs.filter(l => !used.has(l.id))
  }, [labs, labRows])

  function addLabRow() {
    if (!addingLabId) return
    const lab = labs.find(l => l.id === addingLabId)
    if (!lab) return
    setLabRows((prev) => [
      ...prev,
      {
        laboratory_id: lab.id,
        laboratory_name: lab.name,
        starting_sequence: 1,
        notes: null,
      },
    ])
    setAddingLabId(null)
  }

  function updateLabRow(idx: number, patch: Partial<LabRow>) {
    setLabRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function removeLabRow(idx: number) {
    setLabRows((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (qcFeeCoBrokerCompanyId && billingBasis === 'all_samples') return
    setSavingAll(true)
    try {
      // 1) Save client-level QC config through the existing onSave handler
      onSave({
        certificatePattern,
        certificateValidityEnabled: certValidityEnabled,
        certificateValidityMonths: certValidityMonths,
        pricingModel,
        pricePerSample,
        pricePerPoundCents,
        currency,
        billingBasis,
        paymentTerms,
        feePayer,
        billingNotes,
        qcFeeCoBrokerCompanyId,
        logoUrl,
      })

      // 2) Persist lab sequence rows. The endpoint upserts on (client_id, laboratory_id).
      if (clientId) {
        // Delete rows the user removed: any originally-loaded config id no
        // longer present in labRows. Without this, upsert alone leaves the
        // stale override in the DB (the Dunkin per-lab sequence bug).
        const remainingIds = new Set(
          labRows.map((r) => r.id).filter(Boolean) as string[],
        )
        const removedIds = initialLabConfigIds.filter((id) => !remainingIds.has(id))

        await Promise.all([
          ...removedIds.map((configId) =>
            fetch(
              `/api/clients/${clientId}/lab-configs?config_id=${encodeURIComponent(configId)}`,
              { method: 'DELETE' },
            ),
          ),
          ...labRows.map((row) =>
            fetch(`/api/clients/${clientId}/lab-configs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                laboratory_id: row.laboratory_id,
                starting_sequence: row.starting_sequence,
                notes: row.notes ?? null,
              }),
            }),
          ),
        ])
      }
    } catch (err) {
      console.error('Error saving QC configuration:', err)
    } finally {
      setSavingAll(false)
      onOpenChange(false)
    }
  }

  const isComplimentary = pricingModel === 'complimentary'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // The trailing selector hides shadcn's default absolute-positioned close
        // button so we can render our own inline with the title (matches mockup).
        className="sm:max-w-[920px] max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-2xl gap-0 border-border [&>button[type='button'].absolute]:hidden"
      >
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between gap-4 px-7 py-3 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold tracking-[-0.01em] leading-tight">
              QC Services Configuration
            </h2>
            <p className="text-[13px] text-muted-foreground mt-1">
              Certificate pattern, pricing &amp; billing settings
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="-mr-1 -mt-0.5 h-8 w-8 rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
          {/* LEFT — Pricing & billing */}
          <div className="px-7 py-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FieldShell label="Pricing model">
                <Select value={pricingModel} onValueChange={setPricingModel}>
                  <SelectTrigger className="h-[38px] text-[13px] rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_sample">Per sample</SelectItem>
                    <SelectItem value="per_pound">Per pound (¢/lb)</SelectItem>
                    <SelectItem value="flat_fee">Flat fee</SelectItem>
                    <SelectItem value="complimentary">Complimentary</SelectItem>
                  </SelectContent>
                </Select>
              </FieldShell>
              <FieldShell label="Billing basis">
                <Select value={billingBasis} onValueChange={setBillingBasis}>
                  <SelectTrigger className="h-[38px] text-[13px] rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved_only">Approved only</SelectItem>
                    <SelectItem value="approved_and_rejected">All samples</SelectItem>
                  </SelectContent>
                </Select>
              </FieldShell>
            </div>

            {!isComplimentary && (
              <div className="grid grid-cols-2 gap-3">
                {pricingModel === 'per_pound' ? (
                  <FieldShell label="Price (¢/lb)">
                    <Input
                      type="number" step="0.01" min="0.25"
                      value={pricePerPoundCents ?? ''}
                      onChange={(e) => setPricePerPoundCents(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="2.50"
                      className="h-[38px] text-[13px] rounded-lg"
                    />
                  </FieldShell>
                ) : (
                  <FieldShell label="Price / sample">
                    <Input
                      type="number" step="0.01" min="0"
                      value={pricePerSample ?? ''}
                      onChange={(e) => setPricePerSample(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="50.00"
                      className="h-[38px] text-[13px] rounded-lg"
                    />
                  </FieldShell>
                )}
                <FieldShell label="Currency">
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="h-[38px] text-[13px] rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="BRL">BRL</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldShell>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FieldShell label="Payment terms">
                <Input
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  placeholder="Net 30"
                  className="h-[38px] text-[13px] rounded-lg"
                />
              </FieldShell>
              <FieldShell label="Who pays the fee">
                <Select value={feePayer} onValueChange={setFeePayer}>
                  <SelectTrigger className="h-[38px] text-[13px] rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEE_PAYER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
            </div>

            <FieldShell label="Deduct QC fees from co-broker">
              <Select
                value={qcFeeCoBrokerCompanyId ?? 'none'}
                onValueChange={(v) => setQcFeeCoBrokerCompanyId(v === 'none' ? null : v)}
              >
                <SelectTrigger className="h-[38px] text-[13px] rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Bill this client normally</SelectItem>
                  {coBrokers.map((cb) => (
                    <SelectItem key={cb.id} value={cb.id}>{cb.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldShell>
            {qcFeeCoBrokerCompanyId && billingBasis === 'all_samples' && (
              <p className="text-[12px] text-red-600">
                WAQC does not bill on the “all samples” basis — its billing summary
                ignores it. Pairing it with a co-broker offset would deduct fees that
                are never invoiced anywhere. Choose another billing basis.
              </p>
            )}
            {qcFeeCoBrokerCompanyId && (
              <p className="text-[12px] text-muted-foreground">
                This client is never invoiced for QC. Every billable sample fee is
                deducted from that co-broker’s payable instead.
              </p>
            )}

            <FieldShell label="Billing notes">
              <Textarea
                value={billingNotes}
                onChange={(e) => setBillingNotes(e.target.value)}
                placeholder="Special billing instructions"
                rows={2}
                className="text-[13px] rounded-lg resize-none min-h-[74px]"
              />
            </FieldShell>

            <SwitchRow
              title="Multi-origin pricing"
              description="Configure origin-specific pricing tiers"
              checked={hasOriginPricing}
              onChange={setHasOriginPricing}
              accent="green"
            />

            <div className="pt-2">
              <SectionLabel icon={<ImageIcon className="h-3 w-3" />} className="mt-2">Company logo</SectionLabel>

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
                onDrop={async (e) => {
                  e.preventDefault(); setIsDragging(false)
                  const file = e.dataTransfer.files?.[0]
                  if (file) await processLogoFile(file)
                }}
              >
                {logoUrl ? (
                  <div className="relative group rounded-[10px] border border-border bg-muted/30 h-[88px] flex items-center justify-center overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain p-2" />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!logoUrl) return
                        setUploadingLogo(true)
                        try {
                          const filePath = logoUrl.split('/client-logos/').pop()
                          if (filePath) await supabase.storage.from('client-logos').remove([filePath])
                          setLogoUrl(null)
                        } catch (err) {
                          console.error(err)
                        } finally {
                          setUploadingLogo(false)
                        }
                      }}
                      disabled={uploadingLogo}
                      className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => document.getElementById('qc-logo-upload')?.click()}
                    className={cn(
                      'w-full rounded-[10px] border border-dashed flex flex-col items-center justify-center gap-1 px-4 py-5 text-[12.5px] text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors',
                      isDragging ? 'border-[#15663f] bg-[#15663f]/5 text-[#15663f]' : 'border-border',
                    )}
                  >
                    {uploadingLogo ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                        <span>
                          Drop image here, or{' '}
                          <span className="text-[#15663f] font-medium">browse</span>
                        </span>
                        <span className="text-[11px] text-muted-foreground/60">
                          PNG recommended · max 2MB
                        </span>
                      </>
                    )}
                  </button>
                )}
                <input
                  id="qc-logo-upload" type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={async (e) => { const f = e.target.files?.[0]; if (f) await processLogoFile(f) }}
                />
                {logoError && (
                  <p className="text-[11px] text-destructive flex items-center gap-1 mt-2">
                    <AlertCircle className="h-3 w-3" />
                    {logoError}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT — Certificate pattern */}
          <div className="px-7 py-6 space-y-4">

            <p className="text-[12px] text-muted-foreground -mt-2">
              Include in the certificate number:
            </p>

            <div className="grid grid-cols-2 gap-2">
              <ToggleChip
                title="Quality code"
                hint="e.g. AD"
                active={certificatePattern.has_quality_code}
                onToggle={(next) =>
                  setCertificatePattern({
                    ...certificatePattern,
                    has_quality_code: next,
                    quality_position: next ? 'prefix' : certificatePattern.quality_position,
                    origin_position: next && certificatePattern.has_origin_code
                      ? 'suffix'
                      : certificatePattern.origin_position,
                  })
                }
              />
              <ToggleChip
                title="Origin code"
                hint="e.g. BR"
                active={certificatePattern.has_origin_code}
                onToggle={(next) =>
                  setCertificatePattern({
                    ...certificatePattern,
                    has_origin_code: next,
                    origin_position: next ? 'suffix' : certificatePattern.origin_position,
                    quality_position: next && certificatePattern.has_quality_code
                      ? 'prefix'
                      : certificatePattern.quality_position,
                  })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FieldShell label="Starting number">
                <Input
                  type="number" min="1"
                  value={certificatePattern.starting_sequence}
                  onChange={(e) => setCertificatePattern({
                    ...certificatePattern,
                    starting_sequence: parseInt(e.target.value) || 1,
                  })}
                  className="h-[38px] text-[13px] rounded-lg"
                />
              </FieldShell>
              <FieldShell label="Padding (digits)">
                <Input
                  type="number" min="1" max="10"
                  value={certificatePattern.sequence_padding}
                  onChange={(e) => setCertificatePattern({
                    ...certificatePattern,
                    sequence_padding: Math.max(1, Math.min(10, parseInt(e.target.value) || 6)),
                  })}
                  className="h-[38px] text-[13px] rounded-lg"
                />
              </FieldShell>
            </div>

            <CertPreview pattern={certificatePattern} />

            <SwitchRow
              title="Certificate validity period"
              description="Print an expiry window on issued certificates"
              checked={certValidityEnabled}
              onChange={setCertValidityEnabled}
              accent="green"
            >
              {certValidityEnabled && (
                <div className="flex items-center gap-2 pt-2">
                  <Input
                    type="number" min={1} max={36}
                    value={certValidityMonths}
                    onChange={(e) => setCertValidityMonths(parseInt(e.target.value) || 6)}
                    className="w-20 h-[32px] text-[13px] rounded-lg"
                  />
                  <span className="text-[12px] text-muted-foreground">months</span>
                </div>
              )}
            </SwitchRow>

            <div className="pt-2">
              <SectionLabel icon={<FlaskConical className="h-3 w-3" />} className="mt-2">Lab sequences</SectionLabel>
              <p className="text-[12px] text-muted-foreground mb-1">
                Per-lab starting numbers. Overrides the global start for that lab.
              </p>

              {labLoading ? (
                <div className="py-4 text-[12px] text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading labs…
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {labRows.map((row, idx) => (
                    <div key={row.laboratory_id} className="flex items-center gap-3 py-2.5">
                      <span className="flex-1 text-[13px] font-medium">{row.laboratory_name}</span>
                      <Input
                        value={String(row.starting_sequence).padStart(certificatePattern.sequence_padding, '0')}
                        onChange={(e) => {
                          const n = parseInt(e.target.value.replace(/\D/g, '') || '0', 10)
                          updateLabRow(idx, { starting_sequence: Number.isFinite(n) ? n : 0 })
                        }}
                        className="w-[96px] h-[32px] text-[13px] font-mono text-right rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removeLabRow(idx)}
                        className="h-7 w-7 rounded-md inline-flex items-center justify-center text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10"
                        title="Remove lab sequence"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {availableLabsToAdd.length > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  <Select value={addingLabId || ''} onValueChange={(v) => setAddingLabId(v)}>
                    <SelectTrigger className="h-[32px] text-[13px] rounded-lg flex-1">
                      <SelectValue placeholder="Select a lab…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLabsToAdd.map((lab) => (
                        <SelectItem key={lab.id} value={lab.id}>{lab.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!addingLabId}
                    onClick={addLabRow}
                    className={cn(
                      'h-[32px] rounded-lg gap-1 text-[12.5px] transition-colors',
                      'text-[#15663f] border-[#15663f]/30 hover:bg-[#15663f]/5',
                      'dark:text-emerald-300 dark:border-emerald-500/40 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200',
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add lab sequence
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2.5 px-7 py-3 border-t border-border bg-muted/30">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={savingAll}
            className="h-9 rounded-[9px] text-[13px] font-medium"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={savingAll}
            className="h-9 rounded-[9px] text-[13px] font-medium"
          >
            {savingAll ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              'Save configuration'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SectionLabel({
  icon, children, className,
}: {
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground/70 mb-3',
        className,
      )}
    >
      {icon}
      {children}
    </p>
  )
}

function FieldShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] text-muted-foreground font-normal">{label}</Label>
      {children}
    </div>
  )
}

function ToggleChip({
  title, hint, active, onToggle,
}: {
  title: string
  hint: string
  active: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!active)}
      className={cn(
        'rounded-[9px] border px-3 py-2.5 text-left transition-colors',
        active
          ? 'border-[#15663f] bg-[#15663f]/5 dark:bg-emerald-950/30'
          : 'border-border bg-card hover:bg-muted/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium">{title}</span>
        <span
          className={cn(
            'h-4 w-4 rounded-[5px] border flex items-center justify-center transition-colors',
            active
              ? 'bg-[#15663f] border-[#15663f] text-white'
              : 'border-border bg-card',
          )}
        >
          {active && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground/70 mt-0.5">{hint}</div>
    </button>
  )
}

function SwitchRow({
  title, description, checked, onChange, accent, children,
}: {
  title: string
  description?: string
  checked: boolean
  onChange: (next: boolean) => void
  accent?: 'green'
  children?: React.ReactNode
}) {
  return (
    <div className="border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium">{title}</div>
          {description && (
            <div className="text-[11.5px] text-muted-foreground mt-0.5">{description}</div>
          )}
        </div>
        <Switch
          checked={checked}
          onCheckedChange={onChange}
          className={cn(
            'h-5 w-9',
            accent === 'green' && 'data-[state=checked]:bg-[#15663f]',
          )}
        />
      </div>
      {children}
    </div>
  )
}

function CertPreview({ pattern }: { pattern: CertificatePattern }) {
  const preview = useMemo(
    () => generateCertificatePreview(
      pattern,
      pattern.has_quality_code ? 'AD' : undefined,
      pattern.has_origin_code ? 'BR' : undefined,
    ),
    [pattern],
  )

  // Color-code: quality amber, origin green, number ink, separators muted.
  const segments = useMemo(() => {
    const sep = pattern.separator
    // Split off the year portion ("/YY" or "/YYYY")
    const slashIdx = preview.lastIndexOf('/')
    const main = slashIdx >= 0 ? preview.slice(0, slashIdx) : preview
    const year = slashIdx >= 0 ? preview.slice(slashIdx) : ''
    const parts = main.split(sep)

    const numIdx = parts.findIndex(p => /^\d+$/.test(p))
    return parts.map((part, i) => {
      let kind: 'q' | 'o' | 'n' | 'sep' = 'n'
      if (i === numIdx) kind = 'n'
      else if (pattern.has_quality_code && i < numIdx && pattern.quality_position === 'prefix') kind = 'q'
      else if (pattern.has_origin_code && i > numIdx && pattern.origin_position === 'suffix') kind = 'o'
      else if (pattern.has_origin_code && i < numIdx && pattern.origin_position === 'prefix') kind = 'o'
      else if (pattern.has_quality_code && i > numIdx && pattern.quality_position === 'suffix') kind = 'q'
      return { kind, text: part }
    }).reduce<{ kind: 'q' | 'o' | 'n' | 'sep' | 'year'; text: string }[]>((acc, segment, i) => {
      if (i > 0) acc.push({ kind: 'sep', text: sep })
      acc.push(segment)
      return acc
    }, []).concat(year ? [{ kind: 'year', text: year }] : [])
  }, [preview, pattern])

  const caption = useMemo(() => {
    const parts: string[] = []
    if (pattern.has_quality_code) parts.push('quality "AD"')
    if (pattern.has_origin_code) parts.push('origin "BR"')
    return parts.length > 0 ? `Example with ${parts.join(' and ')}` : 'Sequential number with year suffix'
  }, [pattern])

  return (
    <div className="rounded-[10px] border border-border bg-muted/30 px-4 py-4">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 mb-2">
        <Eye className="h-3 w-3" />
        Live preview
      </div>
      <div className="font-mono text-[21px] font-semibold tracking-[0.04em] text-center">
        {segments.map((s, i) => (
          <span
            key={i}
            className={cn(
              s.kind === 'q' && 'text-[#b06a14] dark:text-amber-300',
              s.kind === 'o' && 'text-[#15663f] dark:text-emerald-400',
              s.kind === 'n' && 'text-foreground',
              (s.kind === 'sep' || s.kind === 'year') && 'text-muted-foreground/60',
            )}
          >
            {s.text}
          </span>
        ))}
      </div>
      <div className="text-[11.5px] text-muted-foreground/70 mt-2 text-center">{caption}</div>
    </div>
  )
}
