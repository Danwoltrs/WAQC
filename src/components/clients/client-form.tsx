'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Save, X, Search, Building2, MapPin, Mail, Phone, AlertCircle } from 'lucide-react'
import { Database } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'

type Client = Database['public']['Tables']['clients']['Row']
type ClientInsert = Database['public']['Tables']['clients']['Insert']

interface ClientFormProps {
  clientId?: string
  mode: 'create' | 'edit'
}

const CLIENT_TYPE_OPTIONS = [
  { value: 'producer', label: 'Producer' },
  { value: 'producer_exporter', label: 'Producer/Exporter' },
  { value: 'cooperative', label: 'Cooperative' },
  { value: 'exporter', label: 'Exporter' },
  { value: 'importer_buyer', label: 'Importer/Buyer' },
  { value: 'roaster', label: 'Roaster' },
  { value: 'final_buyer', label: 'Final Buyer' },
  { value: 'roaster_final_buyer', label: 'Roaster/Final Buyer' },
]

const FEE_PAYER_OPTIONS = [
  { value: 'exporter', label: 'Exporter' },
  { value: 'importer', label: 'Importer' },
  { value: 'roaster', label: 'Roaster' },
  { value: 'final_buyer', label: 'Final Buyer' },
  { value: 'client_pays', label: 'Client Pays' },
]

export function ClientForm({ clientId, mode }: ClientFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState<Partial<Client>>({
    name: '',
    company: '',
    fantasy_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    country: '',
    client_types: [],
    is_qc_client: true,
    pricing_model: 'per_sample',
    price_per_sample: undefined,
    price_per_pound_cents: undefined,
    currency: 'USD',
    fee_payer: 'client_pays',
    payment_terms: '',
    billing_notes: '',
    qc_enabled: true,
  })

  const [selectedClientType, setSelectedClientType] = useState<string>('')

  // Legacy search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)

  // Load client data if editing
  useEffect(() => {
    if (mode === 'edit' && clientId) {
      loadClient()
    }
  }, [clientId, mode])

  const loadClient = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/clients/${clientId}`)
      const data = await response.json()

      if (response.ok) {
        setFormData(data.client)
        setSelectedClientType(data.client.client_types?.[0] || '')
      } else {
        setError(data.error || 'Failed to load client')
      }
    } catch (err) {
      setError('Error loading client')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    try {
      setSearching(true)
      const response = await fetch(`/api/clients/search?q=${encodeURIComponent(searchQuery)}&limit=10`)
      const data = await response.json()

      if (response.ok) {
        setSearchResults(data.results || [])
        setShowSearchResults(true)
      } else {
        setError(data.error || 'Search failed')
      }
    } catch (err) {
      setError('Error searching legacy database')
      console.error(err)
    } finally {
      setSearching(false)
    }
  }

  const handleImportLegacyClient = (result: any) => {
    // Populate form with legacy data
    setFormData({
      ...formData,
      name: result.name || '',
      company: result.name || '',
      fantasy_name: result.fantasy_name || '',
      email: result.email || '',
      phone: result.phone || '',
      address: result.address || '',
      city: result.city || '',
      state: result.state || '',
      country: result.country || '',
    })

    // Mark as imported from legacy
    if (result.company_id) {
      setFormData(prev => ({ ...prev, company_id: result.company_id }))
    }
    if (result.legacy_client_id) {
      setFormData(prev => ({ ...prev, legacy_client_id: result.legacy_client_id }))
    }

    // Close search results
    setShowSearchResults(false)
    setSearchQuery('')
    setSearchResults([])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const payload = {
        ...formData,
        client_types: selectedClientType ? [selectedClientType] : [],
        // Ensure numeric fields are numbers or null
        price_per_sample: formData.price_per_sample ? Number(formData.price_per_sample) : null,
        price_per_pound_cents: formData.price_per_pound_cents ? Number(formData.price_per_pound_cents) : null,
      }

      const url = mode === 'create' ? '/api/clients' : `/api/clients/${clientId}`
      const method = mode === 'create' ? 'POST' : 'PATCH'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (response.ok) {
        router.push('/clients')
        router.refresh()
      } else {
        setError(data.error || `Failed to ${mode} client`)
      }
    } catch (err) {
      setError(`Error ${mode === 'create' ? 'creating' : 'updating'} client`)
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Legacy Database Search - Only show in create mode */}
      {mode === 'create' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Legacy Database
            </CardTitle>
            <CardDescription>
              Search for existing companies in trips.wolthers.com to import their data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Search by company name, fantasy name, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
              />
              <Button
                type="button"
                onClick={handleSearch}
                disabled={searching || !searchQuery.trim()}
              >
                {searching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </>
                )}
              </Button>
            </div>

            {/* Search Results */}
            {showSearchResults && (
              <div className="space-y-2">
                {searchResults.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                    <p>No companies found matching "{searchQuery}"</p>
                    <p className="text-sm mt-1">Create a new client using the form below</p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                    </p>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {searchResults.map((result, index) => (
                        <Card key={index} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                  <h4 className="font-semibold">{result.name}</h4>
                                  {result.is_qc_client && (
                                    <Badge variant="default">Already in QC</Badge>
                                  )}
                                  {result.source_table === 'companies' && (
                                    <Badge variant="secondary">trips.wolthers.com</Badge>
                                  )}
                                  {result.source_table === 'legacy_clients' && (
                                    <Badge variant="outline">Legacy DB</Badge>
                                  )}
                                </div>
                                {result.fantasy_name && result.fantasy_name !== result.name && (
                                  <p className="text-sm text-muted-foreground">
                                    Fantasy: {result.fantasy_name}
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                  {result.email && (
                                    <div className="flex items-center gap-1">
                                      <Mail className="h-3 w-3" />
                                      {result.email}
                                    </div>
                                  )}
                                  {result.phone && (
                                    <div className="flex items-center gap-1">
                                      <Phone className="h-3 w-3" />
                                      {result.phone}
                                    </div>
                                  )}
                                  {(result.city || result.country) && (
                                    <div className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {[result.city, result.state, result.country].filter(Boolean).join(', ')}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleImportLegacyClient(result)}
                                disabled={result.is_qc_client}
                              >
                                {result.is_qc_client ? 'Already Exists' : 'Import'}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Primary contact and company details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Contact Name *</Label>
              <Input
                id="name"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company">Company Name *</Label>
              <Input
                id="company"
                value={formData.company || ''}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                required
                placeholder="Acme Coffee Co."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fantasy_name">Fantasy Name</Label>
              <Input
                id="fantasy_name"
                value={formData.fantasy_name || ''}
                onChange={(e) => setFormData({ ...formData, fantasy_name: e.target.value })}
                placeholder="Trading name or brand"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                placeholder="contact@company.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1 234 567 8900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
            <div className="space-y-2">
              <Label htmlFor="client_type">Client Type</Label>
              <Select
                value={selectedClientType}
                onValueChange={(value) => setSelectedClientType(value)}
              >
                <SelectTrigger id="client_type">
                  <SelectValue placeholder="Select client type" />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="is_qc_client_basic">Quality Control Client</Label>
              <div className="flex items-center space-x-3 h-10 px-3 border rounded-md">
                <Checkbox
                  id="is_qc_client_basic"
                  checked={formData.is_qc_client || false}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_qc_client: checked as boolean })
                  }
                />
                <Label htmlFor="is_qc_client_basic" className="font-normal cursor-pointer">
                  Hired us for QC services
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address Information */}
      <Card>
        <CardHeader>
          <CardTitle>Address Information</CardTitle>
          <CardDescription>
            Physical location details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Street Address</Label>
            <Input
              id="address"
              value={formData.address || ''}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="123 Coffee Street"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city || ''}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="São Paulo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State/Province</Label>
              <Input
                id="state"
                value={formData.state || ''}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                placeholder="SP"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={formData.country || ''}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                placeholder="Brazil"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing & Billing - Only show if they hired us for QC */}
      {formData.is_qc_client && (
        <Card>
          <CardHeader>
            <CardTitle>Pricing & Billing</CardTitle>
            <CardDescription>
              Fee structure and payment details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pricing_model">Pricing Model</Label>
              <Select
                value={formData.pricing_model || 'per_sample'}
                onValueChange={(value: 'per_sample' | 'per_pound') =>
                  setFormData({ ...formData, pricing_model: value })
                }
              >
                <SelectTrigger id="pricing_model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_sample">Per Sample (Flat Fee)</SelectItem>
                  <SelectItem value="per_pound">Per Pound (¢/lb)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.pricing_model === 'per_sample' && (
              <div className="space-y-2">
                <Label htmlFor="price_per_sample">Price per Sample ({formData.currency || 'USD'})</Label>
                <Input
                  id="price_per_sample"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price_per_sample || ''}
                  onChange={(e) => setFormData({ ...formData, price_per_sample: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="50.00"
                />
              </div>
            )}

            {formData.pricing_model === 'per_pound' && (
              <div className="space-y-2">
                <Label htmlFor="price_per_pound_cents">Price per Pound (¢/lb, minimum 0.25)</Label>
                <Input
                  id="price_per_pound_cents"
                  type="number"
                  step="0.01"
                  min="0.25"
                  value={formData.price_per_pound_cents || ''}
                  onChange={(e) => setFormData({ ...formData, price_per_pound_cents: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="2.50"
                />
                <p className="text-xs text-muted-foreground">
                  Based on container/lot size (M/T or bags × kg)
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={formData.currency || 'USD'}
                  onValueChange={(value) => setFormData({ ...formData, currency: value })}
                >
                  <SelectTrigger id="currency">
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

              <div className="space-y-2">
                <Label htmlFor="fee_payer">Who Pays the Fee</Label>
                <Select
                  value={formData.fee_payer || 'client_pays'}
                  onValueChange={(value) => setFormData({ ...formData, fee_payer: value as any })}
                >
                  <SelectTrigger id="fee_payer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEE_PAYER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_terms">Payment Terms</Label>
              <Input
                id="payment_terms"
                value={formData.payment_terms || ''}
                onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                placeholder="Net 30, Net 60, Due on receipt, etc."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="billing_notes">Billing Notes</Label>
              <Textarea
                id="billing_notes"
                value={formData.billing_notes || ''}
                onChange={(e) => setFormData({ ...formData, billing_notes: e.target.value })}
                placeholder="Special billing instructions or notes"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={saving}
        >
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {mode === 'create' ? 'Create Client' : 'Update Client'}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
