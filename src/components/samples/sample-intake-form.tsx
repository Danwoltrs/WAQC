'use client'

import { useState, useEffect } from 'react'
import { supabase, Database } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, ChevronRight, ChevronLeft, Upload } from 'lucide-react'

type SampleInsert = Database['public']['Tables']['samples']['Insert']
type Client = Database['public']['Tables']['clients']['Row']
type Laboratory = Database['public']['Tables']['laboratories']['Row']

interface FormData {
  // Basic Info
  client_id: string
  laboratory_id: string
  exporter: string
  buyer: string
  roaster: string
  origin: string
  supplier: string
  processing_method: string
  sample_type: 'pss' | 'ss' | 'type' | ''
  linked_pss_sample_id: string // For linking SS to approved PSS

  // Tracking Numbers
  wolthers_contract_nr: string
  exporter_contract_nr: string
  buyer_contract_nr: string
  roaster_contract_nr: string
  ico_number: string
  container_nr: string

  // Quantity
  bags_quantity_mt: string
  bag_count: string

  // Sample Details
  arrival_date: string
  notes: string
  photo_file: File | null
}

const STEPS = [
  { id: 1, name: 'Basic Info', description: 'Sample identification and origin' },
  { id: 2, name: 'Tracking Numbers', description: 'Contract and shipment details' },
  { id: 3, name: 'Quantity', description: 'Bag quantities and specifications' },
  { id: 4, name: 'Sample Details', description: 'Arrival and additional information' }
]

const ORIGINS = [
  'Brazil', 'Colombia', 'Ethiopia', 'Kenya', 'Guatemala',
  'Costa Rica', 'Peru', 'Honduras', 'Nicaragua', 'Mexico',
  'El Salvador', 'Panama', 'Bolivia', 'Ecuador', 'Rwanda',
  'Burundi', 'Tanzania', 'Uganda', 'Vietnam', 'Indonesia'
]

const PROCESSING_METHODS = [
  'Natural', 'Washed', 'Honey', 'Semi-Washed', 'Wet Hulled',
  'Anaerobic', 'Carbonic Maceration', 'Other'
]

interface SampleIntakeFormProps {
  onSuccess?: (trackingNumber: string) => void
  asDialog?: boolean
}

export function SampleIntakeForm({ onSuccess, asDialog = false }: SampleIntakeFormProps = {}) {
  const { profile } = useAuth()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [laboratories, setLaboratories] = useState<Laboratory[]>([])
  const [filteredClients, setFilteredClients] = useState<Client[]>([])
  const [approvedPSSSamples, setApprovedPSSSamples] = useState<any[]>([])
  const [generatedTrackingNumber, setGeneratedTrackingNumber] = useState<string>('')

  const [formData, setFormData] = useState<FormData>({
    client_id: '',
    laboratory_id: '',
    exporter: '',
    buyer: '',
    roaster: '',
    origin: '',
    supplier: '',
    processing_method: '',
    sample_type: '',
    linked_pss_sample_id: '',
    wolthers_contract_nr: '',
    exporter_contract_nr: '',
    buyer_contract_nr: '',
    roaster_contract_nr: '',
    ico_number: '',
    container_nr: '',
    bags_quantity_mt: '',
    bag_count: '',
    arrival_date: new Date().toISOString().split('T')[0],
    notes: '',
    photo_file: null
  })

  // Load clients and laboratories
  useEffect(() => {
    loadClients()
    loadLaboratories()

    // Load saved form data from localStorage
    const savedData = localStorage.getItem('sample-intake-form')
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData)
        setFormData(prev => ({ ...prev, ...parsed, photo_file: null }))
      } catch (e) {
        console.error('Failed to parse saved form data:', e)
      }
    }
  }, [])

  // Save form data to localStorage on changes
  useEffect(() => {
    const dataToSave = { ...formData, photo_file: null }
    localStorage.setItem('sample-intake-form', JSON.stringify(dataToSave))
  }, [formData])

  // Client auto-detection based on exporter/buyer names
  useEffect(() => {
    if (formData.exporter || formData.buyer) {
      const searchTerm = (formData.exporter || formData.buyer).toLowerCase()
      const filtered = clients.filter(client =>
        client.company.toLowerCase().includes(searchTerm) ||
        client.name.toLowerCase().includes(searchTerm)
      )
      setFilteredClients(filtered)

      // Auto-select if exact match
      if (filtered.length === 1) {
        setFormData(prev => ({ ...prev, client_id: filtered[0].id }))
      }
    } else {
      setFilteredClients([])
    }
  }, [formData.exporter, formData.buyer, clients])

  // Auto-populate laboratory and origin for user's assigned lab
  useEffect(() => {
    if (profile?.laboratory_id && laboratories.length > 0) {
      // Only auto-populate if not already set (avoid overwriting saved form data)
      const savedData = localStorage.getItem('sample-intake-form')
      if (!savedData || !JSON.parse(savedData).laboratory_id) {
        setFormData(prev => {
          // If laboratory_id is already set, don't override
          if (prev.laboratory_id) return prev

          const updates: Partial<FormData> = {
            laboratory_id: profile.laboratory_id!
          }

          // Check if lab is in Brazil and auto-populate origin
          const userLab = laboratories.find(lab => lab.id === profile.laboratory_id) as any
          if (userLab) {
            const labLocation = (userLab.location || '').toLowerCase()
            const labCountry = (userLab.country || '').toLowerCase()

            if (labLocation.includes('brazil') || labCountry.includes('brazil') ||
                userLab.name.toLowerCase().includes('brazil')) {
              updates.origin = 'Brazil'
            }
          }

          return { ...prev, ...updates }
        })
      }
    }
  }, [profile, laboratories])

  const loadClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('qc_enabled', true)
      .order('company')

    if (data && !error) {
      setClients(data)
    }
  }

  const loadLaboratories = async () => {
    // If user has an assigned laboratory, only show their lab
    // Global admins can see all labs
    if (profile?.laboratory_id && !profile?.is_global_admin) {
      const { data, error } = await supabase
        .from('laboratories')
        .select('*')
        .eq('id', profile.laboratory_id)
        .single()

      if (data && !error) {
        setLaboratories([data])
      }
    } else {
      // Global admins or users without assigned lab see all labs
      const { data, error } = await supabase
        .from('laboratories')
        .select('*')
        .order('name')

      if (data && !error) {
        setLaboratories(data)
      }
    }
  }

  const loadApprovedPSSSamples = async () => {
    const { data, error } = await supabase
      .from('samples')
      .select('id, tracking_number, origin, supplier, created_at')
      .eq('sample_type', 'pss')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(50)

    if (data && !error) {
      setApprovedPSSSamples(data)
    }
  }

  // Load approved PSS samples when sample type changes to SS
  useEffect(() => {
    if (formData.sample_type === 'ss') {
      loadApprovedPSSSamples()
    }
  }, [formData.sample_type])

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(
          formData.laboratory_id &&
          formData.exporter &&
          formData.origin &&
          formData.sample_type
        )
      case 2:
        return true // All fields are optional in tracking numbers
      case 3:
        return !!(formData.bags_quantity_mt || formData.bag_count)
      case 4:
        return !!formData.arrival_date
      default:
        return false
    }
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setError(null)
      setCurrentStep(prev => Math.min(prev + 1, 4))
    } else {
      setError('Please fill in all required fields')
    }
  }

  const handlePrevious = () => {
    setError(null)
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError('Photo file size must be less than 10MB')
        return
      }
      updateFormData('photo_file', file)
    }
  }

  const handleSubmit = async () => {
    if (!validateStep(4)) {
      setError('Please complete all required fields')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Prepare sample data
      const sampleData: Partial<SampleInsert> = {
        client_id: formData.client_id || undefined,
        laboratory_id: formData.laboratory_id,
        origin: formData.origin,
        supplier: formData.supplier || formData.exporter,
        processing_method: formData.processing_method,
        sample_type: formData.sample_type || undefined,
        wolthers_contract_nr: formData.wolthers_contract_nr || undefined,
        exporter_contract_nr: formData.exporter_contract_nr || undefined,
        buyer_contract_nr: formData.buyer_contract_nr || undefined,
        roaster_contract_nr: formData.roaster_contract_nr || undefined,
        ico_number: formData.ico_number || undefined,
        container_nr: formData.container_nr || undefined,
        bags_quantity_mt: formData.bags_quantity_mt ? parseFloat(formData.bags_quantity_mt) : undefined,
        bag_count: formData.bag_count ? parseInt(formData.bag_count) : undefined,
        status: 'received',
        workflow_stage: 'received'
      }

      // Create sample via API
      const response = await fetch('/api/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleData)
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create sample')
      }

      setGeneratedTrackingNumber(result.sample.tracking_number)
      setSuccess(true)

      // Call onSuccess callback if provided (for dialog mode)
      if (onSuccess) {
        onSuccess(result.sample.tracking_number)
      }

      // Clear form and localStorage
      localStorage.removeItem('sample-intake-form')

    } catch (err: any) {
      console.error('Error creating sample:', err)
      setError(err.message || 'Failed to create sample')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      client_id: '',
      laboratory_id: '',
      exporter: '',
      buyer: '',
      roaster: '',
      origin: '',
      supplier: '',
      processing_method: '',
      sample_type: '',
      linked_pss_sample_id: '',
      wolthers_contract_nr: '',
      exporter_contract_nr: '',
      buyer_contract_nr: '',
      roaster_contract_nr: '',
      ico_number: '',
      container_nr: '',
      bags_quantity_mt: '',
      bag_count: '',
      arrival_date: new Date().toISOString().split('T')[0],
      notes: '',
      photo_file: null
    })
    setCurrentStep(1)
    setSuccess(false)
    setError(null)
    setGeneratedTrackingNumber('')
    setApprovedPSSSamples([])
    localStorage.removeItem('sample-intake-form')
  }

  if (success) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-semibold">Sample Created Successfully</h2>
            <div className="space-y-2">
              <p className="text-muted-foreground">Tracking Number:</p>
              <Badge variant="outline" className="text-lg px-4 py-2 font-mono">
                {generatedTrackingNumber}
              </Badge>
            </div>
            <Button onClick={resetForm} size="lg" className="mt-4">
              Create Another Sample
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Sample Intake Form</CardTitle>
        <div className="flex gap-2 mt-4">
          {STEPS.map((step) => (
            <div
              key={step.id}
              className={`flex-1 h-2 rounded-full transition-colors ${
                step.id <= currentStep ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
        <div className="mt-2">
          <p className="text-sm font-medium">{STEPS[currentStep - 1].name}</p>
          <p className="text-xs text-muted-foreground">{STEPS[currentStep - 1].description}</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Step 1: Basic Info */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="laboratory_id">Laboratory *</Label>
                <Select
                  value={formData.laboratory_id}
                  onValueChange={(value) => updateFormData('laboratory_id', value)}
                  disabled={laboratories.length === 1}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select laboratory" />
                  </SelectTrigger>
                  <SelectContent>
                    {laboratories.map((lab) => (
                      <SelectItem key={lab.id} value={lab.id}>
                        {lab.name} - {lab.location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {laboratories.length === 1 && (
                  <p className="text-xs text-muted-foreground">
                    Your assigned laboratory
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="origin">Origin *</Label>
                <Select
                  value={formData.origin}
                  onValueChange={(value) => updateFormData('origin', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select origin" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORIGINS.map((origin) => (
                      <SelectItem key={origin} value={origin}>
                        {origin}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="exporter">Exporter *</Label>
                <Select
                  value={formData.exporter === '' ? 'custom' : clients.find(c => c.company === formData.exporter || c.fantasy_name === formData.exporter) ? formData.exporter : 'custom'}
                  onValueChange={(value) => {
                    if (value === 'new') {
                      // User wants to create new client - keep input empty
                      updateFormData('exporter', '')
                    } else if (value !== 'custom') {
                      // User selected existing client
                      const client = clients.find(c => c.company === value || c.fantasy_name === value)
                      updateFormData('exporter', client?.fantasy_name || client?.company || value)
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select existing or type new" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Type custom name...</SelectItem>
                    <SelectItem value="new">+ Create New Client</SelectItem>
                    {clients.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Existing Clients
                        </div>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.company}>
                            {client.fantasy_name || client.company}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
                {(formData.exporter === '' || !clients.find(c => c.company === formData.exporter || c.fantasy_name === formData.exporter)) && (
                  <Input
                    id="exporter"
                    value={formData.exporter}
                    onChange={(e) => updateFormData('exporter', e.target.value)}
                    placeholder="Enter exporter name"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="buyer">Buyer</Label>
                <Select
                  value={formData.buyer === '' ? 'custom' : clients.find(c => c.company === formData.buyer || c.fantasy_name === formData.buyer) ? formData.buyer : 'custom'}
                  onValueChange={(value) => {
                    if (value === 'new') {
                      updateFormData('buyer', '')
                    } else if (value !== 'custom') {
                      const client = clients.find(c => c.company === value || c.fantasy_name === value)
                      updateFormData('buyer', client?.fantasy_name || client?.company || value)
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select existing or type new" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Type custom name...</SelectItem>
                    <SelectItem value="new">+ Create New Client</SelectItem>
                    {clients.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Existing Clients
                        </div>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.company}>
                            {client.fantasy_name || client.company}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
                {(formData.buyer === '' || !clients.find(c => c.company === formData.buyer || c.fantasy_name === formData.buyer)) && (
                  <Input
                    id="buyer"
                    value={formData.buyer}
                    onChange={(e) => updateFormData('buyer', e.target.value)}
                    placeholder="Enter buyer name"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="roaster">Roaster</Label>
                <Select
                  value={formData.roaster === '' ? 'custom' : clients.find(c => c.company === formData.roaster || c.fantasy_name === formData.roaster) ? formData.roaster : 'custom'}
                  onValueChange={(value) => {
                    if (value === 'new') {
                      updateFormData('roaster', '')
                    } else if (value !== 'custom') {
                      const client = clients.find(c => c.company === value || c.fantasy_name === value)
                      updateFormData('roaster', client?.fantasy_name || client?.company || value)
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select existing or type new" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Type custom name...</SelectItem>
                    <SelectItem value="new">+ Create New Client</SelectItem>
                    {clients.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Existing Clients
                        </div>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.company}>
                            {client.fantasy_name || client.company}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
                {(formData.roaster === '' || !clients.find(c => c.company === formData.roaster || c.fantasy_name === formData.roaster)) && (
                  <Input
                    id="roaster"
                    value={formData.roaster}
                    onChange={(e) => updateFormData('roaster', e.target.value)}
                    placeholder="Enter roaster name"
                  />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier">Supplier Name</Label>
              <Input
                id="supplier"
                value={formData.supplier}
                onChange={(e) => updateFormData('supplier', e.target.value)}
                placeholder="Farm or cooperative name (optional)"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="processing_method">Processing Method</Label>
                <Select
                  value={formData.processing_method}
                  onValueChange={(value) => updateFormData('processing_method', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select method (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROCESSING_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sample_type">Sample Type *</Label>
                <Select
                  value={formData.sample_type}
                  onValueChange={(value) => updateFormData('sample_type', value as any)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pss">PSS (Pre-Shipment Sample)</SelectItem>
                    <SelectItem value="ss">SS (Shipment Sample)</SelectItem>
                    <SelectItem value="type">Type Sample</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Show PSS linking when sample type is SS */}
            {formData.sample_type === 'ss' && (
              <div className="space-y-2 bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <Label htmlFor="linked_pss_sample_id">
                  Link to Approved Pre-Shipment Sample
                  <span className="ml-2 text-xs text-muted-foreground">(Recommended for Shipment Samples)</span>
                </Label>
                <Select
                  value={formData.linked_pss_sample_id}
                  onValueChange={(value) => updateFormData('linked_pss_sample_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select approved PSS sample..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No linked sample</SelectItem>
                    {approvedPSSSamples.length > 0 ? (
                      approvedPSSSamples.map((sample) => (
                        <SelectItem key={sample.id} value={sample.id}>
                          {sample.tracking_number} - {sample.origin} ({sample.supplier || 'No supplier'})
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-samples" disabled>
                        No approved PSS samples available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {formData.linked_pss_sample_id && (
                  <p className="text-xs text-muted-foreground">
                    This shipment sample will be linked to the selected pre-shipment sample for tracking.
                  </p>
                )}
              </div>
            )}

            {filteredClients.length > 0 && !formData.client_id && (
              <div className="space-y-2">
                <Label>Detected Clients</Label>
                <div className="flex gap-2 flex-wrap">
                  {filteredClients.map((client) => (
                    <Badge
                      key={client.id}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10"
                      onClick={() => updateFormData('client_id', client.id)}
                    >
                      {client.company}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Tracking Numbers */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              All contract numbers are optional. Fill in what is available.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wolthers_contract_nr">Wolthers Contract Number</Label>
                <Input
                  id="wolthers_contract_nr"
                  value={formData.wolthers_contract_nr}
                  onChange={(e) => updateFormData('wolthers_contract_nr', e.target.value)}
                  placeholder="e.g., WC-2024-001"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exporter_contract_nr">Exporter Contract Number</Label>
                <Input
                  id="exporter_contract_nr"
                  value={formData.exporter_contract_nr}
                  onChange={(e) => updateFormData('exporter_contract_nr', e.target.value)}
                  placeholder="e.g., EX-2024-001"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="buyer_contract_nr">Buyer Contract Number</Label>
                <Input
                  id="buyer_contract_nr"
                  value={formData.buyer_contract_nr}
                  onChange={(e) => updateFormData('buyer_contract_nr', e.target.value)}
                  placeholder="e.g., BC-2024-001"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="roaster_contract_nr">Roaster Contract Number</Label>
                <Input
                  id="roaster_contract_nr"
                  value={formData.roaster_contract_nr}
                  onChange={(e) => updateFormData('roaster_contract_nr', e.target.value)}
                  placeholder="e.g., RC-2024-001"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ico_number">ICO Number</Label>
                <Input
                  id="ico_number"
                  value={formData.ico_number}
                  onChange={(e) => updateFormData('ico_number', e.target.value)}
                  placeholder="e.g., ICO-123456"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="container_nr">Container Number</Label>
                <Input
                  id="container_nr"
                  value={formData.container_nr}
                  onChange={(e) => updateFormData('container_nr', e.target.value)}
                  placeholder="e.g., ABCD1234567"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Quantity */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm font-medium mb-2">Quantity Priority</p>
              <p className="text-xs text-muted-foreground">
                M/T (Metric Tons) is displayed as the primary quantity. Provide at least one quantity measurement.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bags_quantity_mt" className="flex items-center gap-2">
                  Quantity (M/T) *
                  <Badge variant="secondary" className="text-xs">Priority</Badge>
                </Label>
                <Input
                  id="bags_quantity_mt"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.bags_quantity_mt}
                  onChange={(e) => updateFormData('bags_quantity_mt', e.target.value)}
                  placeholder="e.g., 18.50"
                />
                <p className="text-xs text-muted-foreground">
                  Metric Tons (preferred)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bag_count">Bag Count</Label>
                <Input
                  id="bag_count"
                  type="number"
                  min="1"
                  value={formData.bag_count}
                  onChange={(e) => updateFormData('bag_count', e.target.value)}
                  placeholder="e.g., 300"
                />
                <p className="text-xs text-muted-foreground">
                  Number of bags
                </p>
              </div>
            </div>

            {formData.bags_quantity_mt && formData.bag_count && (
              <div className="bg-primary/5 p-4 rounded-lg">
                <p className="text-sm font-medium mb-1">Calculated Average</p>
                <p className="text-xs text-muted-foreground">
                  {(parseFloat(formData.bags_quantity_mt) * 1000 / parseInt(formData.bag_count)).toFixed(2)} kg per bag
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Sample Details */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="arrival_date">Arrival Date *</Label>
              <Input
                id="arrival_date"
                type="date"
                value={formData.arrival_date}
                onChange={(e) => updateFormData('arrival_date', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="photo">Sample Photo</Label>
              <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                <input
                  id="photo"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <label htmlFor="photo" className="cursor-pointer">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Click to upload photo</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formData.photo_file
                      ? formData.photo_file.name
                      : 'PNG, JPG up to 10MB'}
                  </p>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => updateFormData('notes', e.target.value)}
                placeholder="Any additional information about this sample..."
                className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-input bg-background"
              />
            </div>

            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <p className="text-sm font-medium">Review Your Information</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Origin:</span> {formData.origin}
                </div>
                <div>
                  <span className="text-muted-foreground">Supplier:</span> {formData.supplier}
                </div>
                <div>
                  <span className="text-muted-foreground">Type:</span> {formData.sample_type?.toUpperCase()}
                </div>
                <div>
                  <span className="text-muted-foreground">Quantity:</span> {formData.bags_quantity_mt || formData.bag_count || 'N/A'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          {currentStep < 4 ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={!validateStep(currentStep)}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !validateStep(4)}
            >
              {loading ? 'Creating Sample...' : 'Create Sample'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
