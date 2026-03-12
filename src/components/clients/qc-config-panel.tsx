'use client'

import { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Eye, FileText, ImageIcon, Upload, Loader2, X, Trash2, AlertCircle, Layers, Plus } from 'lucide-react'
import { CertificatePattern, DEFAULT_CERTIFICATE_PATTERN, generateCertificatePreview } from '@/types/certificate-pattern'
import { supabase } from '@/lib/supabase'

const FEE_PAYER_OPTIONS = [
  { value: 'exporter', label: 'Exporter' },
  { value: 'importer', label: 'Importer' },
  { value: 'roaster', label: 'Roaster' },
  { value: 'final_buyer', label: 'Final Importer' },
  { value: 'client_pays', label: 'Client Pays' },
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
  logoUrl: string | null
}

interface QcConfigPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: QcConfigData
  onSave: (data: QcConfigData) => void
  clientId?: string
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
  const [billingNotes, setBillingNotes] = useState(data.billingNotes)
  const [logoUrl, setLogoUrl] = useState(data.logoUrl)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

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

  const handleSave = () => {
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
      logoUrl,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] max-h-[85vh] overflow-y-auto p-5">
        <DialogHeader className="pb-3">
          <DialogTitle className="text-base">QC Services Configuration</DialogTitle>
          <DialogDescription className="text-xs">
            Certificate pattern, pricing, and billing settings
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_1px_280px] gap-4">
          {/* Left: Pricing & Billing */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pricing & Billing</h4>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Pricing Model</Label>
                <Select value={pricingModel} onValueChange={setPricingModel}>
                  <SelectTrigger className="h-8 text-xs rounded-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_pound">USD c/lb</SelectItem>
                    <SelectItem value="per_sample">Per Sample</SelectItem>
                    <SelectItem value="complimentary">Complimentary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Billing Basis</Label>
                <Select value={billingBasis} onValueChange={setBillingBasis}>
                  <SelectTrigger className="h-8 text-xs rounded-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved_only">Approved Only</SelectItem>
                    <SelectItem value="approved_and_rejected">Approved + Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {pricingModel !== 'complimentary' && (
              <div className="grid grid-cols-3 gap-2">
                {pricingModel === 'per_pound' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Price (¢/lb)</Label>
                    <Input
                      type="number" step="0.01" min="0.25"
                      value={pricePerPoundCents || ''}
                      onChange={(e) => setPricePerPoundCents(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="2.50"
                      className="h-8 text-xs rounded-none"
                    />
                  </div>
                )}
                {pricingModel === 'per_sample' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Price/Sample</Label>
                    <Input
                      type="number" step="0.01" min="0"
                      value={pricePerSample || ''}
                      onChange={(e) => setPricePerSample(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="50.00"
                      className="h-8 text-xs rounded-none"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="h-8 text-xs rounded-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="BRL">BRL</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Payment Terms</Label>
                  <Input
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    placeholder="Net 30"
                    className="h-8 text-xs rounded-none"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Who Pays the Fee</Label>
              <Select value={feePayer} onValueChange={setFeePayer}>
                <SelectTrigger className="h-8 text-xs rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEE_PAYER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Billing Notes</Label>
              <Textarea
                value={billingNotes}
                onChange={(e) => setBillingNotes(e.target.value)}
                placeholder="Special billing instructions"
                rows={2}
                className="text-xs rounded-none resize-none"
              />
            </div>

            {/* Company Logo */}
            <div className="pt-2 border-t space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <ImageIcon className="h-3 w-3" />
                Company Logo
              </div>
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
                  <div className="relative group">
                    <div className={`w-full h-20 border bg-muted/30 flex items-center justify-center overflow-hidden ${isDragging ? 'border-primary border-2' : ''}`}>
                      <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain p-1" />
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!logoUrl) return
                        setUploadingLogo(true)
                        try {
                          const filePath = logoUrl.split('/client-logos/').pop()
                          if (filePath) await supabase.storage.from('client-logos').remove([filePath])
                          setLogoUrl(null)
                        } catch (err) { console.error(err) }
                        finally { setUploadingLogo(false) }
                      }}
                      disabled={uploadingLogo}
                      className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div
                    className={`w-full h-20 border-2 border-dashed flex flex-col items-center justify-center gap-0.5 cursor-pointer ${isDragging ? 'border-primary bg-primary/10' : 'border-muted-foreground/25 hover:border-muted-foreground/50'}`}
                    onClick={() => document.getElementById('qc-logo-upload')?.click()}
                  >
                    {uploadingLogo ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/50" />
                    ) : (
                      <>
                        <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                        <span className="text-[10px] text-muted-foreground/60">Drop image here</span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <Button
                type="button" variant="outline" size="sm"
                disabled={uploadingLogo}
                onClick={() => document.getElementById('qc-logo-upload')?.click()}
                className="w-full h-6 text-[10px] rounded-none"
              >
                {uploadingLogo ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Upload className="h-3 w-3 mr-1" />{logoUrl ? 'Change' : 'Upload'}</>}
              </Button>
              <input
                id="qc-logo-upload" type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={async (e) => { const f = e.target.files?.[0]; if (f) await processLogoFile(f) }}
              />
              {logoError && <p className="text-[10px] text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{logoError}</p>}
              <p className="text-[10px] text-muted-foreground">PNG recommended, max 2MB</p>
            </div>
          </div>

          {/* Vertical Separator */}
          <div className="bg-border" />

          {/* Right: Certificate Pattern */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Certificate</h4>

            {/* Validity */}
            <div className="space-y-2 p-2 border bg-muted/30">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="qc_cert_validity"
                  checked={certValidityEnabled}
                  onCheckedChange={(c) => setCertValidityEnabled(c as boolean)}
                />
                <Label htmlFor="qc_cert_validity" className="text-xs font-normal cursor-pointer">
                  Certificate Validity Period
                </Label>
              </div>
              {certValidityEnabled && (
                <div className="pl-5 flex items-center gap-2">
                  <Input
                    type="number" min={1} max={24}
                    value={certValidityMonths}
                    onChange={(e) => setCertValidityMonths(parseInt(e.target.value) || 6)}
                    className="w-16 h-7 text-xs rounded-none"
                  />
                  <span className="text-xs text-muted-foreground">months</span>
                </div>
              )}
            </div>

            {/* Pattern Config */}
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <FileText className="h-3 w-3" />
              Certificate Pattern
            </div>

            <div className="space-y-2 p-2 border bg-muted/30">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="qc_quality_code"
                  checked={certificatePattern.has_quality_code}
                  onCheckedChange={(c) => setCertificatePattern({
                    ...certificatePattern,
                    has_quality_code: c as boolean,
                    origin_position: (c as boolean) && certificatePattern.has_origin_code && certificatePattern.quality_position === certificatePattern.origin_position
                      ? (certificatePattern.quality_position === 'prefix' ? 'suffix' : 'prefix')
                      : certificatePattern.origin_position
                  })}
                />
                <Label htmlFor="qc_quality_code" className="text-xs font-normal cursor-pointer">Include Quality Code</Label>
              </div>
              {certificatePattern.has_quality_code && (
                <div className="pl-5 flex gap-1">
                  {(['prefix', 'suffix'] as const).map(pos => (
                    <Button key={pos} type="button" size="sm"
                      variant={certificatePattern.quality_position === pos ? 'default' : 'outline'}
                      className="h-6 text-[10px] px-2 rounded-none"
                      onClick={() => setCertificatePattern({
                        ...certificatePattern, quality_position: pos,
                        origin_position: certificatePattern.has_origin_code ? (pos === 'prefix' ? 'suffix' : 'prefix') : certificatePattern.origin_position
                      })}
                    >{pos}</Button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 p-2 border bg-muted/30">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="qc_origin_code"
                  checked={certificatePattern.has_origin_code}
                  onCheckedChange={(c) => setCertificatePattern({
                    ...certificatePattern,
                    has_origin_code: c as boolean,
                    quality_position: (c as boolean) && certificatePattern.has_quality_code && certificatePattern.origin_position === certificatePattern.quality_position
                      ? (certificatePattern.origin_position === 'prefix' ? 'suffix' : 'prefix')
                      : certificatePattern.quality_position
                  })}
                />
                <Label htmlFor="qc_origin_code" className="text-xs font-normal cursor-pointer">Include Origin Code</Label>
              </div>
              {certificatePattern.has_origin_code && (
                <div className="pl-5 flex gap-1">
                  {(['prefix', 'suffix'] as const).map(pos => (
                    <Button key={pos} type="button" size="sm"
                      variant={certificatePattern.origin_position === pos ? 'default' : 'outline'}
                      className="h-6 text-[10px] px-2 rounded-none"
                      onClick={() => setCertificatePattern({
                        ...certificatePattern, origin_position: pos,
                        quality_position: certificatePattern.has_quality_code ? (pos === 'prefix' ? 'suffix' : 'prefix') : certificatePattern.quality_position
                      })}
                    >{pos}</Button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Starting Number</Label>
                <Input
                  type="number" min="1"
                  value={certificatePattern.starting_sequence}
                  onChange={(e) => setCertificatePattern({ ...certificatePattern, starting_sequence: parseInt(e.target.value) || 1 })}
                  className="h-7 text-xs rounded-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Padding (Digits)</Label>
                <Input
                  type="number" min="3" max="10"
                  value={certificatePattern.sequence_padding}
                  onChange={(e) => setCertificatePattern({ ...certificatePattern, sequence_padding: parseInt(e.target.value) || 6 })}
                  className="h-7 text-xs rounded-none"
                />
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-1 pt-2 border-t">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Eye className="h-3 w-3" />
                Preview
              </div>
              <div className="p-2 bg-primary/5 border font-mono text-sm">
                {generateCertificatePreview(
                  certificatePattern,
                  certificatePattern.has_quality_code ? 'AD' : undefined,
                  certificatePattern.has_origin_code ? 'BR' : undefined
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Example with quality &quot;AD&quot; and origin &quot;BR&quot;
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-3 border-t">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="rounded-none">
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave} className="rounded-none">
            Save QC Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
