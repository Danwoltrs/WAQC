'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertCircle, Database, Loader2, Search, Settings2 } from 'lucide-react'
import { DEFAULT_CERTIFICATE_PATTERN } from '@/types/certificate-pattern'
import { QcConfigPanel, QcConfigData } from './qc-config-panel'

/** All roles that can trigger this modal */
export type AddClientRole =
  | 'exporter'
  | 'importer'
  | 'roaster'
  | 'end_client'
  | 'qc_client'
  | 'producer'
  | 'cooperative'

interface AddClientModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-checked role when opened from a party dropdown */
  defaultRole?: AddClientRole
  /** Called after successful save with the new client's name and ID */
  onSuccess: (clientName: string, entityId?: string) => void
}

const CLIENT_TYPE_OPTIONS = [
  { value: 'producer', label: 'Producer' },
  { value: 'cooperative', label: 'Cooperative' },
  { value: 'exporter', label: 'Exporter' },
  { value: 'importer_buyer', label: 'Importer' },
  { value: 'roaster', label: 'Roaster' },
  { value: 'final_buyer', label: 'Final Importer' },
  { value: 'end_client', label: 'End Client' },
]

/** Maps AddClientRole prop to client_types DB values */
const ROLE_TO_CLIENT_TYPE: Record<string, string> = {
  exporter: 'exporter',
  importer: 'importer_buyer',
  roaster: 'roaster',
  end_client: 'end_client',
  qc_client: '', // QC client is a boolean flag, not a role
  producer: 'producer',
  cooperative: 'cooperative',
}

const COUNTRY_OPTIONS = [
  'Brazil', 'Colombia', 'Costa Rica', 'El Salvador', 'Ethiopia',
  'Germany', 'Guatemala', 'Honduras', 'Japan', 'Kenya',
  'Mexico', 'Netherlands', 'Nicaragua', 'Peru',
  'United Kingdom', 'United States',
]

export function AddClientModal({ open, onOpenChange, defaultRole, onSuccess }: AddClientModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form fields
  const [company, setCompany] = useState('')
  const [fantasyName, setFantasyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [vatNumber, setVatNumber] = useState('')
  const [country, setCountry] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<string[]>(() => {
    if (!defaultRole) return []
    const mapped = ROLE_TO_CLIENT_TYPE[defaultRole]
    return mapped ? [mapped] : []
  })
  const [isQcClient, setIsQcClient] = useState(defaultRole === 'qc_client')

  // Sync selectedRoles and isQcClient when defaultRole changes (modal stays mounted)
  useEffect(() => {
    if (!defaultRole) {
      setSelectedRoles([])
      setIsQcClient(false)
      return
    }
    const mapped = ROLE_TO_CLIENT_TYPE[defaultRole]
    setSelectedRoles(mapped ? [mapped] : [])
    setIsQcClient(defaultRole === 'qc_client')
  }, [defaultRole])

  // Legacy import
  const [showLegacySearch, setShowLegacySearch] = useState(false)
  const [legacyQuery, setLegacyQuery] = useState('')
  const [legacyResults, setLegacyResults] = useState<any[]>([])
  const [legacySearching, setLegacySearching] = useState(false)

  const searchLegacy = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setLegacyResults([])
      return
    }
    setLegacySearching(true)
    try {
      const res = await fetch(`/api/clients/search?q=${encodeURIComponent(query)}&limit=10`)
      const data = await res.json()
      if (res.ok) setLegacyResults(data.results || [])
    } catch { /* ignore */ }
    finally { setLegacySearching(false) }
  }, [])

  useEffect(() => {
    if (!showLegacySearch) return
    const timer = setTimeout(() => searchLegacy(legacyQuery), 300)
    return () => clearTimeout(timer)
  }, [legacyQuery, showLegacySearch, searchLegacy])

  const handleImportLegacy = (result: any) => {
    setCompany(result.name || '')
    setFantasyName(result.fantasy_name || '')
    setEmail(result.email || '')
    setPhone(result.phone || '')
    setCountry(result.country || '')
    setShowLegacySearch(false)
    setLegacyQuery('')
    setLegacyResults([])
  }

  // QC Config panel
  const [showQcConfig, setShowQcConfig] = useState(false)
  const [qcConfig, setQcConfig] = useState<QcConfigData>({
    certificatePattern: DEFAULT_CERTIFICATE_PATTERN,
    certificateValidityEnabled: false,
    certificateValidityMonths: 6,
    pricingModel: 'per_pound',
    pricePerPoundCents: undefined,
    pricePerSample: undefined,
    currency: 'USD',
    billingBasis: 'approved_only',
    paymentTerms: '',
    feePayer: 'client_pays',
    billingNotes: '',
    logoUrl: null,
  })

  const resetForm = () => {
    setCompany('')
    setFantasyName('')
    setContactName('')
    setEmail('')
    setPhone('')
    setVatNumber('')
    setCountry('')
    setSelectedRoles(() => {
      if (!defaultRole) return []
      const mapped = ROLE_TO_CLIENT_TYPE[defaultRole]
      return mapped ? [mapped] : []
    })
    setIsQcClient(defaultRole === 'qc_client')
    setError(null)
    setShowLegacySearch(false)
    setLegacyQuery('')
    setLegacyResults([])
    setQcConfig({
      certificatePattern: DEFAULT_CERTIFICATE_PATTERN,
      certificateValidityEnabled: false,
      certificateValidityMonths: 6,
      pricingModel: 'per_pound',
      pricePerPoundCents: undefined,
      pricePerSample: undefined,
      currency: 'USD',
      billingBasis: 'approved_only',
      paymentTerms: '',
      feePayer: 'client_pays',
      billingNotes: '',
      logoUrl: null,
    })
  }

  const handleSubmit = async () => {
    if (!company.trim()) {
      setError('Company name is required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Always create in the clients table — this is the unified approach
      const payload: Record<string, any> = {
        name: contactName || company,
        company: company,
        fantasy_name: fantasyName || company,
        email: email || null,
        phone: phone || null,
        country: country && country !== '__none__' ? country : null,
        vat_number: vatNumber || null,
        client_types: selectedRoles,
        is_qc_client: isQcClient,
      }

      // Add QC config fields if QC client
      if (isQcClient) {
        payload.pricing_model = qcConfig.pricingModel
        payload.price_per_sample = qcConfig.pricePerSample || null
        payload.price_per_pound_cents = qcConfig.pricePerPoundCents || null
        payload.currency = qcConfig.currency
        payload.billing_basis = qcConfig.billingBasis
        payload.payment_terms = qcConfig.paymentTerms || null
        payload.fee_payer = qcConfig.feePayer
        payload.billing_notes = qcConfig.billingNotes || null
        payload.certificate_pattern = qcConfig.certificatePattern
        payload.logo_url = qcConfig.logoUrl
        payload.certificate_validity_enabled = qcConfig.certificateValidityEnabled
        payload.certificate_validity_months = qcConfig.certificateValidityMonths
      }

      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to create client')
      }

      // Also create in the legacy party table if relevant role
      // This ensures backwards compatibility with code that queries exporters/importers/roasters tables
      if (selectedRoles.includes('exporter') || defaultRole === 'exporter') {
        try {
          await fetch('/api/exporters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: company,
              country: country && country !== '__none__' ? country : null,
              contact_email: email || null,
              contact_phone: phone || null,
              notes: fantasyName ? `Brand name: ${fantasyName}` : null,
            }),
          })
        } catch { /* ignore - party table is supplementary */ }
      }
      if (selectedRoles.includes('importer_buyer') || defaultRole === 'importer') {
        try {
          await fetch('/api/importers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: company,
              country: country && country !== '__none__' ? country : null,
              contact_email: email || null,
              contact_phone: phone || null,
            }),
          })
        } catch { /* ignore */ }
      }
      if (selectedRoles.includes('roaster') || defaultRole === 'roaster') {
        try {
          await fetch('/api/roasters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: company,
              country: country && country !== '__none__' ? country : null,
              contact_email: email || null,
              contact_phone: phone || null,
              notes: fantasyName ? `Brand name: ${fantasyName}` : null,
            }),
          })
        } catch { /* ignore */ }
      }

      const name = data.client?.fantasy_name || data.client?.company || company
      resetForm()
      onSuccess(name, data.client?.id)
      onOpenChange(false)
    } catch (err: any) {
      console.error('Error creating client:', err)
      setError(err.message || 'Failed to create client')
    } finally {
      setLoading(false)
    }
  }

  const toggleRole = (roleValue: string) => {
    setSelectedRoles(prev =>
      prev.includes(roleValue)
        ? prev.filter(r => r !== roleValue)
        : [...prev, roleValue]
    )
  }

  const roleLabel = defaultRole
    ? {
        exporter: 'Seller/Exporter',
        importer: 'Importer',
        roaster: 'Roaster',
        end_client: 'End Client',
        qc_client: 'QC Client',
        producer: 'Producer',
        cooperative: 'Cooperative',
      }[defaultRole] || 'Client'
    : 'Client'

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) resetForm()
      }}>
        <DialogContent className="sm:max-w-[560px] p-4 gap-3">
          <DialogHeader className="pb-1">
            <DialogTitle className="text-base">Add New {roleLabel}</DialogTitle>
            <DialogDescription className="text-xs">
              Create a new {roleLabel.toLowerCase()} in the system
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {error && (
              <div className="flex items-center gap-2 p-2 text-xs text-destructive bg-destructive/10 border border-destructive/20">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}

            {/* Legacy Import */}
            <div>
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowLegacySearch(!showLegacySearch)}
              >
                <Database className="h-3 w-3" />
                Import from legacy database
              </button>
              {showLegacySearch && (
                <div className="mt-1.5 space-y-1.5">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={legacyQuery}
                      onChange={(e) => setLegacyQuery(e.target.value)}
                      placeholder="Search by name, company..."
                      className="h-7 text-xs pl-7 rounded-none"
                      autoFocus
                    />
                  </div>
                  {legacySearching && (
                    <p className="text-xs text-muted-foreground px-1">Searching...</p>
                  )}
                  {legacyResults.length > 0 && (
                    <div className="border max-h-[140px] overflow-y-auto">
                      {legacyResults.map((r: any) => (
                        <button
                          key={r.id}
                          type="button"
                          className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent flex items-center justify-between gap-2"
                          onClick={() => handleImportLegacy(r)}
                        >
                          <div className="min-w-0">
                            <span className="font-medium truncate block">{r.name}</span>
                            {r.country && (
                              <span className="text-muted-foreground">{r.country}</span>
                            )}
                          </div>
                          {r.can_import && (
                            <span className="text-[10px] text-blue-600 dark:text-blue-400 shrink-0">Legacy</span>
                          )}
                          {r.is_qc_client && (
                            <span className="text-[10px] text-green-600 dark:text-green-400 shrink-0">QC Client</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {!legacySearching && legacyQuery.length >= 2 && legacyResults.length === 0 && (
                    <p className="text-xs text-muted-foreground px-1">No results found</p>
                  )}
                </div>
              )}
            </div>

            {/* Row 1: Company + Fantasy Name */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Company Name *</Label>
                <Input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="ABC Coffee Trading"
                  className="h-8 text-sm rounded-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fantasy/Brand Name</Label>
                <Input
                  value={fantasyName}
                  onChange={(e) => setFantasyName(e.target.value)}
                  placeholder="ABC Coffee (optional)"
                  className="h-8 text-sm rounded-none"
                />
              </div>
            </div>

            {/* Row 2: Contact + Email */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Contact Name</Label>
                <Input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="John Doe (optional)"
                  className="h-8 text-sm rounded-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@company.com"
                  className="h-8 text-sm rounded-none"
                />
              </div>
            </div>

            {/* Row 3: Phone + VAT + Country */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 234 567 8900"
                  className="h-8 text-sm rounded-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">VAT/CNPJ</Label>
                <Input
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  placeholder="12.345.678/0001-90"
                  className="h-8 text-sm rounded-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Country</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger className="h-8 text-sm rounded-none">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No country</SelectItem>
                    {COUNTRY_OPTIONS.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t" />

            {/* Roles + QC Client */}
            <div className="grid grid-cols-[1fr_1fr] gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Client Roles</Label>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {CLIENT_TYPE_OPTIONS.map((type) => (
                    <div key={type.value} className="flex items-center space-x-1.5">
                      <Checkbox
                        id={`modal_role_${type.value}`}
                        checked={selectedRoles.includes(type.value)}
                        onCheckedChange={() => toggleRole(type.value)}
                        className="h-3.5 w-3.5"
                      />
                      <Label htmlFor={`modal_role_${type.value}`} className="font-normal cursor-pointer text-xs">
                        {type.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Quality Control Client</Label>
                <div className="flex items-center space-x-2 h-8 px-2 border">
                  <Checkbox
                    id="modal_is_qc_client"
                    checked={isQcClient}
                    onCheckedChange={(c) => setIsQcClient(c as boolean)}
                    className="h-3.5 w-3.5"
                  />
                  <Label htmlFor="modal_is_qc_client" className="font-normal cursor-pointer text-xs">
                    Hired us for QC services
                  </Label>
                </div>
                {isQcClient && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowQcConfig(true)}
                    className="w-full h-7 text-xs rounded-none"
                  >
                    <Settings2 className="h-3 w-3 mr-1.5" />
                    Configure QC Services
                  </Button>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2 border-t gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="rounded-none"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={loading || !company.trim()}
              className="rounded-none"
            >
              {loading ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creating...</>
              ) : (
                `Create ${roleLabel}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QC Config Secondary Panel */}
      <QcConfigPanel
        open={showQcConfig}
        onOpenChange={setShowQcConfig}
        data={qcConfig}
        onSave={setQcConfig}
      />
    </>
  )
}
