'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react'
import {
  FormData,
  Client,
  Laboratory,
  Exporter,
  Importer,
  SampleInsert,
  STEPS,
  SupplyChainStep,
  QualityStep,
  QuantityStep,
  SampleDetailsStep,
  SuccessView
} from './intake'

interface SampleIntakeFormProps {
  onSuccess?: (trackingNumber: string) => void
  asDialog?: boolean
}

const initialFormData: FormData = {
  // Step 1: Supply Chain
  seller: '',
  seller_contract_nr: '',
  exporter_sample_number: '', // Seller/exporter's sample reference (in Step 1)
  same_seller_shipper: true,
  shipper: '',
  shipper_contract_nr: '',
  importer: '',
  importer_contract_nr: '',
  importer_is_qc_client: true,
  qc_client: '',
  qc_client_contract_nr: '',
  supplier: '',
  supplier_contract_nr: '',
  roaster: '',
  roaster_contract_nr: '',

  // Step 2: Quality
  client_id: '',
  laboratory_id: '',
  origin: '',
  micro_origin: '',
  processing_method: '',
  sample_type: '',
  linked_pss_sample_id: '',
  quality_spec_id: '',
  quality_name: '',
  hide_exporter_on_label: false,
  certifications: [],

  // Legacy contract fields
  wolthers_contract_nr: '',
  exporter_contract_nr: '',
  ico_number: '',
  container_nr: '',

  // Step 3: Weight
  bag_count: '',
  bag_weight_kg: '',
  bag_type: '',
  bags_quantity_mt: '',
  equivalent_60kg_bags: '',
  bulk_container_count: '',
  shipment_month: '',

  // Step 4: Review
  arrival_date: new Date().toISOString().split('T')[0],
  notes: '',
  photo_file: null
}

export function SampleIntakeForm({ onSuccess, asDialog = false }: SampleIntakeFormProps = {}) {
  const { profile } = useAuth()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [laboratories, setLaboratories] = useState<Laboratory[]>([])
  const [exporters, setExporters] = useState<Exporter[]>([])
  const [importers, setImporters] = useState<Importer[]>([])
  const [qcClients, setQcClients] = useState<Client[]>([]) // Clients where is_qc_client = true
  const [filteredClients, setFilteredClients] = useState<Client[]>([])
  const [approvedPSSSamples, setApprovedPSSSamples] = useState<any[]>([])
  const [generatedTrackingNumber, setGeneratedTrackingNumber] = useState<string>('')
  const [formData, setFormData] = useState<FormData>(initialFormData)

  // Load clients, laboratories, exporters, and importers
  useEffect(() => {
    loadClients()
    loadLaboratories()
    loadExporters()
    loadImporters()
    loadQcClients()

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

  // Save form data to localStorage on changes (skip when in success state or when form is empty)
  useEffect(() => {
    // Don't save empty forms or when showing success view
    if (success) return
    // Don't save if form is essentially empty (just reset)
    if (!formData.seller && !formData.importer && !formData.sample_type) return

    const dataToSave = { ...formData, photo_file: null }
    localStorage.setItem('sample-intake-form', JSON.stringify(dataToSave))
  }, [formData, success])

  // Client auto-detection based on importer/seller names
  // For PSS/SS samples: importer or qc_client is the client (they own quality specs)
  // For type samples: either can be used
  useEffect(() => {
    // Use qc_client if separate, otherwise use importer
    const clientName = formData.importer_is_qc_client ? formData.importer : formData.qc_client
    if (clientName || formData.seller) {
      // Prioritize importer/qc_client for client matching (PSS/SS samples need their quality specs)
      const searchTerm = (clientName || formData.seller).toLowerCase()
      const filtered = clients.filter(client =>
        client.company.toLowerCase().includes(searchTerm) ||
        client.name.toLowerCase().includes(searchTerm)
      )
      setFilteredClients(filtered)

      // Auto-select if exact match
      // BUT: Don't overwrite client_id if a quality spec is already selected
      // (quality spec selection should take precedence as it's more specific)
      if (filtered.length === 1 && !formData.quality_spec_id) {
        setFormData(prev => ({ ...prev, client_id: filtered[0].id }))
      }
    } else {
      setFilteredClients([])
    }
  }, [formData.seller, formData.importer, formData.qc_client, formData.importer_is_qc_client, clients])

  // Auto-populate laboratory and origin for user's assigned lab
  useEffect(() => {
    if (profile?.laboratory_id && laboratories.length > 0) {
      const savedData = localStorage.getItem('sample-intake-form')
      if (!savedData || !JSON.parse(savedData).laboratory_id) {
        setFormData(prev => {
          if (prev.laboratory_id) return prev

          const updates: Partial<FormData> = {
            laboratory_id: profile.laboratory_id!
          }

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

  // Load approved PSS samples when sample type changes to SS
  useEffect(() => {
    if (formData.sample_type === 'ss') {
      loadApprovedPSSSamples()
    }
  }, [formData.sample_type])

  const loadClients = async () => {
    try {
      const response = await fetch('/api/clients?qc_enabled=true&limit=500')
      if (response.ok) {
        const data = await response.json()
        // Filter for qc_enabled since API might not support that filter directly
        const qcEnabledClients = (data.clients || []).filter((c: any) => c.qc_enabled)
        setClients(qcEnabledClients as Client[])
      } else {
        console.error('Failed to load clients:', response.status)
      }
    } catch (error) {
      console.error('Error loading clients:', error)
    }
  }

  const loadLaboratories = async () => {
    console.log('Loading laboratories via API')
    try {
      const response = await fetch('/api/laboratories')
      if (response.ok) {
        const data = await response.json()
        // Filter for active labs only
        const activeLabs = (data.laboratories || []).filter((lab: any) => lab.is_active)
        console.log('Loaded laboratories:', activeLabs)
        setLaboratories(activeLabs as unknown as Laboratory[])
      } else {
        console.error('Failed to load laboratories:', response.status)
      }
    } catch (error) {
      console.error('Error loading laboratories:', error)
    }
  }

  const loadApprovedPSSSamples = async () => {
    try {
      const response = await fetch('/api/samples?sample_type=pss&status=approved&limit=50')
      if (response.ok) {
        const data = await response.json()
        setApprovedPSSSamples(data.samples || [])
      } else {
        console.error('Failed to load approved PSS samples:', response.status)
      }
    } catch (error) {
      console.error('Error loading approved PSS samples:', error)
    }
  }

  const loadExporters = async () => {
    try {
      const response = await fetch('/api/exporters')
      if (response.ok) {
        const data = await response.json()
        const exportersList = data.exporters || []
        // Deduplicate by name (case-insensitive)
        const seen = new Set<string>()
        const unique = exportersList.filter((exp: any) => {
          const key = exp.name.toLowerCase()
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        setExporters(unique as unknown as Exporter[])
      } else {
        console.error('Failed to load exporters:', response.status)
      }
    } catch (error) {
      console.error('Error loading exporters:', error)
    }
  }

  const loadImporters = async () => {
    try {
      const response = await fetch('/api/importers')
      if (response.ok) {
        const data = await response.json()
        const importersList = data.importers || []
        // Deduplicate by name (case-insensitive)
        const seen = new Set<string>()
        const unique = importersList.filter((imp: any) => {
          const key = imp.name.toLowerCase()
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        setImporters(unique as unknown as Importer[])
      } else {
        console.error('Failed to load importers:', response.status)
      }
    } catch (error) {
      console.error('Error loading importers:', error)
    }
  }

  const loadQcClients = async () => {
    try {
      const response = await fetch('/api/clients?limit=500')
      if (response.ok) {
        const data = await response.json()
        // Filter for is_qc_client = true
        const qcClientsList = (data.clients || []).filter((c: any) => c.is_qc_client)
        setQcClients(qcClientsList as Client[])
      } else {
        console.error('Failed to load QC clients:', response.status)
      }
    } catch (error) {
      console.error('Error loading QC clients:', error)
    }
  }

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        // Step 1: Supply Chain - Seller is required, shipper required only if not same as seller
        const hasShipper = formData.same_seller_shipper || !!formData.shipper
        return !!(formData.seller && hasShipper)
      case 2:
        // Step 2: Quality - Sample type, origin, and laboratory required
        // Quality spec required for PSS/SS samples
        const baseQualityValidation = !!(
          formData.sample_type &&
          formData.origin &&
          formData.laboratory_id
        )

        if (formData.sample_type === 'pss' || formData.sample_type === 'ss') {
          const hasImporterOrQcClient = formData.importer_is_qc_client
            ? !!formData.importer
            : !!(formData.importer || formData.qc_client)
          return baseQualityValidation && hasImporterOrQcClient && !!formData.quality_spec_id
        }

        return baseQualityValidation
      case 3:
        // Step 3: Weight
        return !!(formData.bags_quantity_mt || formData.bag_count)
      case 4:
        // Step 4: Review
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
      // Look up seller UUID from seller name
      let seller_id: string | undefined
      if (formData.seller) {
        const { data: sellerData, error: sellerError } = await supabase
          .from('exporters')
          .select('id')
          .ilike('name', formData.seller)
          .limit(1)
          .single()

        if (sellerError) {
          console.error('Error looking up seller:', sellerError)
          throw new Error('Failed to find seller. Please check the seller name.')
        }

        seller_id = sellerData?.id
      }

      // Look up shipper (exporter) UUID
      // If same_seller_shipper is true, shipper = seller
      // Otherwise, look up the separate shipper name
      let exporter_id: string | undefined
      if (formData.same_seller_shipper) {
        exporter_id = seller_id // Shipper is same as seller
      } else if (formData.shipper) {
        const { data: shipperData, error: shipperError } = await supabase
          .from('exporters')
          .select('id')
          .ilike('name', formData.shipper)
          .limit(1)
          .single()

        if (shipperError) {
          console.error('Error looking up shipper:', shipperError)
          throw new Error('Failed to find shipper. Please check the shipper name.')
        }

        exporter_id = shipperData?.id
      }

      // Look up importer UUID from importer name (if provided)
      let importer_id: string | undefined
      if (formData.importer) {
        // First check if it's from the clients table (when importer_is_qc_client is true and they selected a client)
        const { data: clientAsImporter } = await supabase
          .from('clients')
          .select('id')
          .or(`company.ilike.${formData.importer},fantasy_name.ilike.${formData.importer}`)
          .eq('is_qc_client', true)
          .limit(1)
          .maybeSingle()

        // If not found in clients, look in importers table
        if (!clientAsImporter) {
          const { data: importerData } = await supabase
            .from('importers')
            .select('id')
            .ilike('name', formData.importer)
            .limit(1)
            .maybeSingle()

          importer_id = importerData?.id
        }
        // Note: if it's a client (not importer), importer_id stays undefined, which is OK
      }

      // Determine client_id based on importer_is_qc_client checkbox
      let qc_client_id: string | undefined = formData.client_id || undefined
      if (formData.importer_is_qc_client) {
        // The importer IS the QC client - find the client by matching importer name
        if (formData.importer) {
          const { data: clientData } = await supabase
            .from('clients')
            .select('id')
            .or(`company.ilike.${formData.importer},fantasy_name.ilike.${formData.importer}`)
            .eq('is_qc_client', true)
            .limit(1)
            .maybeSingle()

          if (clientData) {
            qc_client_id = clientData.id
          } else {
            // Check if the importer has a linked client_id
            const { data: importerWithClient } = await supabase
              .from('importers')
              .select('client_id')
              .ilike('name', formData.importer)
              .not('client_id', 'is', null)
              .limit(1)
              .maybeSingle()

            if (importerWithClient?.client_id) {
              qc_client_id = importerWithClient.client_id
            }
          }
        }
      } else {
        // QC client is separate - look up by qc_client name
        if (formData.qc_client) {
          const { data: separateClientData } = await supabase
            .from('clients')
            .select('id')
            .or(`company.ilike.${formData.qc_client},fantasy_name.ilike.${formData.qc_client}`)
            .eq('is_qc_client', true)
            .limit(1)
            .maybeSingle()

          if (separateClientData) {
            qc_client_id = separateClientData.id
          }
        }
      }

      // Look up roaster UUID from roaster name (if provided)
      let roaster_id: string | undefined
      if (formData.roaster) {
        const { data: roasterData } = await supabase
          .from('roasters')
          .select('id')
          .ilike('name', formData.roaster)
          .limit(1)
          .maybeSingle()

        roaster_id = roasterData?.id
      }

      const sampleData: Partial<SampleInsert> = {
        client_id: qc_client_id, // Use the resolved QC client ID
        laboratory_id: formData.laboratory_id,
        origin: formData.origin,
        micro_origin: formData.micro_origin || undefined,
        seller_id: seller_id,
        exporter_id: exporter_id, // This is the shipper
        same_seller_shipper: formData.same_seller_shipper,
        importer_id: importer_id,
        roaster_id: roaster_id,
        processing_method: formData.processing_method,
        sample_type: formData.sample_type || undefined,
        quality_spec_id: formData.quality_spec_id || undefined,
        quality_name: formData.quality_name ? formData.quality_name.trim() : undefined,
        hide_exporter_on_label: formData.hide_exporter_on_label || false,
        wolthers_contract_nr: formData.wolthers_contract_nr || undefined,
        seller_contract_nr: formData.seller_contract_nr || undefined,
        shipper_contract_nr: formData.shipper_contract_nr || undefined,
        exporter_contract_nr: formData.exporter_contract_nr || undefined,
        buyer_contract_nr: formData.importer_contract_nr || undefined, // Map to existing DB column
        roaster_contract_nr: formData.roaster_contract_nr || undefined,
        qc_client_contract_nr: formData.qc_client_contract_nr || undefined,
        ico_number: formData.ico_number || undefined,
        container_nr: formData.container_nr || undefined,
        bags_quantity_mt: formData.bags_quantity_mt ? parseFloat(formData.bags_quantity_mt) : undefined,
        bag_count: formData.bag_count ? parseInt(formData.bag_count) : undefined,
        bag_weight_kg: formData.bag_weight_kg ? parseFloat(formData.bag_weight_kg) : undefined,
        bag_type: formData.bag_type || undefined,
        shipment_month: formData.shipment_month || undefined,
        status: 'received',
        workflow_stage: 'received'
      }

      console.log('Submitting sample with quality_name:', formData.quality_name, 'Processed:', sampleData.quality_name)

      const response = await fetch('/api/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleData)
      })

      const result = await response.json()

      if (!response.ok) {
        const errorMsg = result.details
          ? `${result.error}: ${result.details}`
          : (result.error || 'Failed to create sample')
        throw new Error(errorMsg)
      }

      setGeneratedTrackingNumber(result.sample.tracking_number)
      setSuccess(true)

      if (onSuccess) {
        onSuccess(result.sample.tracking_number)
      }

      localStorage.removeItem('sample-intake-form')

    } catch (err: any) {
      console.error('Error creating sample:', err)
      setError(err.message || 'Failed to create sample')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData(initialFormData)
    setCurrentStep(1)
    setSuccess(false)
    setError(null)
    setGeneratedTrackingNumber('')
    setApprovedPSSSamples([])
    localStorage.removeItem('sample-intake-form')
  }

  if (success) {
    return <SuccessView trackingNumber={generatedTrackingNumber} onReset={resetForm} asDialog={asDialog} />
  }

  const FormWrapper = asDialog ? 'div' : Card
  const HeaderWrapper = asDialog ? 'div' : CardHeader
  const ContentWrapper = asDialog ? 'div' : CardContent

  return (
    <FormWrapper className={asDialog ? '' : 'w-full max-w-5xl mx-auto'}>
      <HeaderWrapper className={asDialog ? 'mb-4' : ''}>
        {!asDialog && <CardTitle>Sample Intake Form</CardTitle>}
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
      </HeaderWrapper>

      <ContentWrapper className={asDialog ? 'flex flex-col h-full' : 'flex flex-col h-full'}>
        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto space-y-6 pb-4">
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {currentStep === 1 && (
            <SupplyChainStep
              formData={formData}
              updateFormData={updateFormData}
              clients={clients}
              laboratories={laboratories}
              filteredClients={filteredClients}
              approvedPSSSamples={approvedPSSSamples}
              exporters={exporters}
              importers={importers}
              qcClients={qcClients}
            />
          )}

          {currentStep === 2 && (
            <QualityStep
              formData={formData}
              updateFormData={updateFormData}
              clients={clients}
              laboratories={laboratories}
              filteredClients={filteredClients}
              approvedPSSSamples={approvedPSSSamples}
              importers={importers}
              qcClients={qcClients}
            />
          )}

          {currentStep === 3 && (
            <QuantityStep
              formData={formData}
              updateFormData={updateFormData}
              clients={clients}
              laboratories={laboratories}
              filteredClients={filteredClients}
              approvedPSSSamples={approvedPSSSamples}
            />
          )}

          {currentStep === 4 && (
            <SampleDetailsStep
              formData={formData}
              updateFormData={updateFormData}
              clients={clients}
              laboratories={laboratories}
              filteredClients={filteredClients}
              approvedPSSSamples={approvedPSSSamples}
              onPhotoUpload={handlePhotoUpload}
            />
          )}
        </div>

        {/* Fixed footer */}
        <div className="flex-shrink-0 flex justify-between pt-4 border-t bg-background sticky bottom-0">
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
      </ContentWrapper>
    </FormWrapper>
  )
}
