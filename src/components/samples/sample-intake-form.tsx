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
  SampleInsert,
  STEPS,
  BasicInfoStep,
  TrackingNumbersStep,
  QuantityStep,
  SampleDetailsStep,
  SuccessView
} from './intake'

interface SampleIntakeFormProps {
  onSuccess?: (trackingNumber: string) => void
  asDialog?: boolean
}

const initialFormData: FormData = {
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
  quality_spec_id: '',
  quality_name: '',
  wolthers_contract_nr: '',
  exporter_contract_nr: '',
  buyer_contract_nr: '',
  roaster_contract_nr: '',
  ico_number: '',
  container_nr: '',
  bag_count: '',
  bag_weight_kg: '',
  bag_type: '',
  bags_quantity_mt: '',
  equivalent_60kg_bags: '',
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
  const [filteredClients, setFilteredClients] = useState<Client[]>([])
  const [approvedPSSSamples, setApprovedPSSSamples] = useState<any[]>([])
  const [generatedTrackingNumber, setGeneratedTrackingNumber] = useState<string>('')
  const [formData, setFormData] = useState<FormData>(initialFormData)

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
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('qc_enabled', true)
      .order('company')

    if (data && !error) {
      setClients(data as Client[])
    }
  }

  const loadLaboratories = async () => {
    if (profile?.laboratory_id && !profile?.is_global_admin) {
      const { data, error } = await supabase
        .from('laboratories')
        .select('*')
        .eq('id', profile.laboratory_id)
        .single()

      if (data && !error) {
        setLaboratories([data] as unknown as Laboratory[])
      }
    } else {
      const { data, error } = await supabase
        .from('laboratories')
        .select('*')
        .order('name')

      if (data && !error) {
        setLaboratories(data as unknown as Laboratory[])
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

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        const baseValidation = !!(
          formData.laboratory_id &&
          formData.exporter &&
          formData.origin &&
          formData.sample_type
        )

        // For PSS and SS samples, buyer and quality_spec_id are required
        if (formData.sample_type === 'pss' || formData.sample_type === 'ss') {
          return baseValidation && !!(formData.buyer && formData.quality_spec_id)
        }

        return baseValidation
      case 2:
        return true
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
      // Look up exporter UUID from exporter name
      let exporter_id: string | undefined
      if (formData.exporter) {
        const { data: exporterData, error: exporterError } = await supabase
          .from('exporters')
          .select('id')
          .ilike('name', formData.exporter)
          .limit(1)
          .single()

        if (exporterError) {
          console.error('Error looking up exporter:', exporterError)
          throw new Error('Failed to find exporter. Please check the exporter name.')
        }

        exporter_id = exporterData?.id
      }

      // Look up importer UUID from buyer name (if provided)
      let importer_id: string | undefined
      if (formData.buyer) {
        const { data: importerData } = await supabase
          .from('importers')
          .select('id')
          .ilike('name', formData.buyer)
          .limit(1)
          .maybeSingle()

        importer_id = importerData?.id
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
        client_id: formData.client_id || undefined,
        laboratory_id: formData.laboratory_id,
        origin: formData.origin,
        exporter_id: exporter_id,
        importer_id: importer_id,
        roaster_id: roaster_id,
        processing_method: formData.processing_method,
        sample_type: formData.sample_type || undefined,
        quality_spec_id: formData.quality_spec_id || undefined,
        wolthers_contract_nr: formData.wolthers_contract_nr || undefined,
        exporter_contract_nr: formData.exporter_contract_nr || undefined,
        buyer_contract_nr: formData.buyer_contract_nr || undefined,
        roaster_contract_nr: formData.roaster_contract_nr || undefined,
        ico_number: formData.ico_number || undefined,
        container_nr: formData.container_nr || undefined,
        bags_quantity_mt: formData.bags_quantity_mt ? parseFloat(formData.bags_quantity_mt) : undefined,
        bag_count: formData.bag_count ? parseInt(formData.bag_count) : undefined,
        bag_weight_kg: formData.bag_weight_kg ? parseFloat(formData.bag_weight_kg) : undefined,
        bag_type: formData.bag_type || undefined,
        status: 'received',
        workflow_stage: 'received'
      }

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
    <FormWrapper className={asDialog ? '' : 'w-full max-w-4xl mx-auto'}>
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

      <ContentWrapper className={asDialog ? 'space-y-6' : 'space-y-6'}>
        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {currentStep === 1 && (
          <BasicInfoStep
            formData={formData}
            updateFormData={updateFormData}
            clients={clients}
            laboratories={laboratories}
            filteredClients={filteredClients}
            approvedPSSSamples={approvedPSSSamples}
          />
        )}

        {currentStep === 2 && (
          <TrackingNumbersStep
            formData={formData}
            updateFormData={updateFormData}
            clients={clients}
            laboratories={laboratories}
            filteredClients={filteredClients}
            approvedPSSSamples={approvedPSSSamples}
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
      </ContentWrapper>
    </FormWrapper>
  )
}
