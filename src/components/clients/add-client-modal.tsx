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
import { toast } from 'sonner'
import { DEFAULT_CERTIFICATE_PATTERN } from '@/types/certificate-pattern'
import { QcConfigPanel, QcConfigData } from './qc-config-panel'
import { buildQcClientCreatePayload } from '@/lib/qc-client-mapper'
import { isBrazilCountry } from '@/lib/company-register/schema'
import type { QcClientType } from '@/lib/company-register/roles'
import {
  BrazilDocumentRow, CompanyDocumentsFields, PendingRegister,
  documentsPayload, emptyDocuments, emptyRegister, registerPayload,
  type CompanyDocuments, type PendingRegisterValue,
} from './add-client-register'

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

// Typed by the server's allowlist (roles.ts): an option it would refuse does not compile.
const CLIENT_TYPE_OPTIONS: { value: QcClientType; label: string }[] = [
  { value: 'producer', label: 'Producer' },
  { value: 'cooperative', label: 'Cooperative' },
  { value: 'exporter', label: 'Exporter' },
  { value: 'importer_buyer', label: 'Importer' },
  { value: 'roaster', label: 'Roaster' },
  { value: 'final_buyer', label: 'Final Importer' },
  { value: 'end_client', label: 'End Client' },
]

/** Maps AddClientRole prop to client_types DB values */
const ROLE_TO_CLIENT_TYPE: Record<AddClientRole, QcClientType | ''> = {
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
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState('')
  const [documents, setDocuments] = useState<CompanyDocuments>(emptyDocuments)
  const [register, setRegister] = useState<PendingRegisterValue>(emptyRegister)
  const [registerEditing, setRegisterEditing] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const countryValue = country && country !== '__none__' ? country : null
  // A blank country reads as Brazil, as on the companies table.
  const brazil = isBrazilCountry(countryValue)
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
    qcFeeCoBrokerCompanyId: null,
    toleranceAutoApprove: false,
    certificatesToAllParties: false,
    finalWord: 'wolthers',
    finalWordFixed: false,
    buyerSampleAddressId: null,
    stuffingRequest: 'off',
    logoUrl: null,
  })

  const resetForm = () => {
    setCompany('')
    setFantasyName('')
    setEmail('')
    setPhone('')
    setCountry('')
    setDocuments(emptyDocuments())
    setRegister(emptyRegister())
    setRegisterEditing(false)
    setFieldErrors({})
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
      qcFeeCoBrokerCompanyId: null,
      toleranceAutoApprove: false,
      certificatesToAllParties: false,
      finalWord: 'wolthers',
      finalWordFixed: false,
      buyerSampleAddressId: null,
      stuffingRequest: 'off',
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
    setFieldErrors({})

    try {
      // The role the modal was opened for is always tagged: the party picker
      // that opened it lists companies by that tag. (This replaces the old
      // posts to /api/exporters, /api/importers and /api/roasters, which only
      // added these same tags.)
      const roleTypes = new Set(selectedRoles)
      const openedFor = defaultRole ? ROLE_TO_CLIENT_TYPE[defaultRole] : ''
      if (openedFor) roleTypes.add(openedFor)

      // One POST: the server links an existing company instead of duplicating
      // it, and saves the holders and bank accounts right after the company.
      const payload: Record<string, any> = {
        name: company.trim(),
        company: company.trim(),
        fantasy_name: fantasyName || company,
        email: email || null,
        phone: phone || null,
        country: countryValue,
        ...documentsPayload(documents, brazil),
        ...registerPayload(register, brazil),
        client_types: Array.from(roleTypes),
        is_qc_client: isQcClient,
      }

      // Add QC config fields if QC client
      if (isQcClient) {
        Object.assign(payload, buildQcClientCreatePayload(qcConfig))
      }

      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      // An error that carries the company: it was saved, a later step was not.
      // Saving again would only find it, so close and say so.
      const savedAnyway = !response.ok && typeof data.client?.id === 'string'
      if (!response.ok && !savedAnyway) {
        setFieldErrors(data.fieldErrors ?? {})
        throw new Error(data.error || data.message || 'Failed to create client')
      }
      if (savedAnyway) toast.error(data.error || 'The company was saved, but not everything with it.')

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
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto p-4 gap-3">
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
                <Label htmlFor="modal_company" className="text-xs">Company Name *</Label>
                <Input
                  id="modal_company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="ABC Coffee Trading"
                  className="h-8 text-sm rounded-none"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="modal_fantasy_name" className="text-xs">Fantasy/Brand Name</Label>
                <Input
                  id="modal_fantasy_name"
                  value={fantasyName}
                  onChange={(e) => setFantasyName(e.target.value)}
                  placeholder="ABC Coffee (optional)"
                  className="h-8 text-sm rounded-none"
                />
              </div>
            </div>

            {/* Row 2: Email + Phone (the company's own; people are added as contacts) */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="modal_email" className="text-xs">Email</Label>
                <Input
                  id="modal_email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@company.com"
                  className="h-8 text-sm rounded-none"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="modal_phone" className="text-xs">Phone</Label>
                <Input
                  id="modal_phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 234 567 8900"
                  className="h-8 text-sm rounded-none"
                />
              </div>
            </div>

            {/* Row 3: Country + person type (Brazil) or tax ID (elsewhere) */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Country</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger aria-label="Country" className="h-8 text-sm rounded-none">
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
              <CompanyDocumentsFields brazil={brazil} value={documents} onChange={setDocuments} errors={fieldErrors} />
            </div>

            {/* Row 4 (Brazil): CNPJ or CPF + IE */}
            {brazil && <BrazilDocumentRow value={documents} onChange={setDocuments} errors={fieldErrors} />}

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

            <div className="border-t" />

            <PendingRegister
              brazil={brazil}
              country={countryValue}
              value={register}
              onChange={setRegister}
              onEditingChange={setRegisterEditing}
            />
            {registerEditing && (
              <p className="text-xs text-muted-foreground">Add or cancel the open holder or account first.</p>
            )}
          </div>

          <DialogFooter className="-mx-4 -mb-4 sm:-mx-4 sm:-mb-4 sm:-bottom-4 sm:px-4">
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
              disabled={loading || !company.trim() || registerEditing}
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
