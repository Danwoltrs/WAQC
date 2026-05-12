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
  Roaster,
  SampleInsert,
  STEPS,
  SupplyChainStep,
  QualityStep,
  QuantityStep,
  SampleDetailsStep,
  ContractsStep,
  ContractSearchStep,
  ContractLinkBadge,
  createEmptyContract,
  SuccessView
} from './intake'

// Timeout wrapper to prevent infinite hangs on Supabase queries
async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = 10000,
  errorMessage: string = 'Request timeout'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMessage))
    }, timeoutMs)

    fn()
      .then(result => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch(err => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

interface SampleIntakeFormProps {
  onSuccess?: (trackingNumber: string) => void
  asDialog?: boolean
}

const initialFormData: FormData = {
  // Step 2: Supply Chain
  seller: '',
  seller_contract_nr: '',
  exporter_sample_number: '', // Seller/exporter's sample reference (in Step 2)
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
  end_client: '',
  end_client_contract_nr: '',

  // Step 3: Quality
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
  crop_year: '',

  // Legacy contract fields
  wolthers_contract_nr: '',
  exporter_contract_nr: '',
  ico_number: '',
  container_nr: '',

  // Step 4: Weight
  bag_count: '',
  bag_weight_kg: '',
  bag_type: '',
  bags_quantity_mt: '',
  equivalent_60kg_bags: '',
  bulk_container_count: '',
  shipment_month: '',

  // Step 5: Review
  arrival_date: new Date().toISOString().split('T')[0],
  notes: '',
  photo_file: null,

  // Sub-contracts
  contracts: [],

  // Contract Search
  selected_contract: null,
  contract_prefilled_fields: [],
  contract_resolution: null,
}

export function SampleIntakeForm({ onSuccess, asDialog = false }: SampleIntakeFormProps = {}) {
  const { profile } = useAuth()

  // Check if user is a global admin or global cupper admin (can access all labs)
  const isGlobalUser = profile?.is_global_admin ||
    profile?.qc_role === 'global_admin' ||
    profile?.qc_role === 'global_cupper_admin' ||
    profile?.qc_role === 'global_quality_admin'

  // Debug: log profile and isGlobalUser
  console.log('[Sample Intake] Profile:', profile?.email, 'is_global_admin:', profile?.is_global_admin, 'qc_role:', profile?.qc_role, 'isGlobalUser:', isGlobalUser)

  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [laboratories, setLaboratories] = useState<Laboratory[]>([])
  const [exporters, setExporters] = useState<Exporter[]>([])
  const [importers, setImporters] = useState<Importer[]>([])
  const [roasters, setRoasters] = useState<Roaster[]>([])
  const [qcClients, setQcClients] = useState<Client[]>([]) // Clients where is_qc_client = true
  const [filteredClients, setFilteredClients] = useState<Client[]>([])
  const [approvedPSSSamples, setApprovedPSSSamples] = useState<any[]>([])
  const [generatedTrackingNumber, setGeneratedTrackingNumber] = useState<string>('')
  const [formData, setFormData] = useState<FormData>(initialFormData)

  // Load clients, laboratories, exporters, importers, and roasters
  useEffect(() => {
    loadClients()
    loadLaboratories()
    loadExporters()
    loadImporters()
    loadRoasters()
    loadQcClients()

    // Load saved form data from localStorage
    const savedData = localStorage.getItem('sample-intake-form')
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData)
        // Always use today's date for arrival_date (don't restore old dates)
        setFormData(prev => ({
          ...prev,
          ...parsed,
          photo_file: null,
          arrival_date: new Date().toISOString().split('T')[0]
        }))
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

  // Validate seller from localStorage exists in exporters list, clear if stale
  useEffect(() => {
    if (exporters.length === 0 || !formData.seller) return

    // Check if seller exists in exporters list (case-insensitive)
    const sellerExists = exporters.some(
      exp => exp.name.toLowerCase() === formData.seller.toLowerCase()
    )

    if (!sellerExists) {
      console.warn('[Sample Intake] Cached seller not found in exporters list, clearing:', formData.seller)
      setFormData(prev => ({ ...prev, seller: '' }))
    }
  }, [exporters, formData.seller])

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
      // Fetch from exporters table AND clients with exporter role
      const [exportersRes, clientsRes] = await Promise.all([
        fetch('/api/exporters'),
        fetch('/api/clients?client_types=exporter,producer_exporter&is_active=true&limit=500'),
      ])
      const exportersList = exportersRes.ok ? (await exportersRes.json()).exporters || [] : []
      const clientsList = clientsRes.ok ? (await clientsRes.json()).clients || [] : []

      // Merge: exporters table entries + clients with exporter role
      const merged = [
        ...exportersList.map((e: any) => ({ id: e.id, name: e.name, country: e.country })),
        ...clientsList.map((c: any) => ({ id: c.id, name: c.fantasy_name || c.company, country: c.country })),
      ]
      // Deduplicate by name (case-insensitive)
      const seen = new Set<string>()
      const unique = merged.filter((exp: any) => {
        const key = exp.name?.toLowerCase()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      setExporters(unique as unknown as Exporter[])
    } catch (error) {
      console.error('Error loading exporters:', error)
    }
  }

  const loadImporters = async () => {
    try {
      // Fetch from importers table AND clients with importer_buyer role
      const [importersRes, clientsRes] = await Promise.all([
        fetch('/api/importers'),
        fetch('/api/clients?client_types=importer_buyer&is_active=true&limit=500'),
      ])
      const importersList = importersRes.ok ? (await importersRes.json()).importers || [] : []
      const clientsList = clientsRes.ok ? (await clientsRes.json()).clients || [] : []

      // Merge: importers table entries + clients with importer_buyer role
      const merged = [
        ...importersList.map((i: any) => ({ id: i.id, name: i.name, country: i.country, client_id: i.client_id })),
        ...clientsList.map((c: any) => ({ id: c.id, name: c.fantasy_name || c.company, country: c.country, client_id: c.id })),
      ]
      // Deduplicate by name (case-insensitive)
      const seen = new Set<string>()
      const unique = merged.filter((imp: any) => {
        const key = imp.name?.toLowerCase()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      setImporters(unique as unknown as Importer[])
    } catch (error) {
      console.error('Error loading importers:', error)
    }
  }

  const loadRoasters = async () => {
    try {
      // Fetch from roasters table AND clients with roaster role
      const [roastersRes, clientsRes] = await Promise.all([
        fetch('/api/roasters'),
        fetch('/api/clients?client_types=roaster,roaster_final_buyer&is_active=true&limit=500'),
      ])
      const roastersList = roastersRes.ok ? (await roastersRes.json()).roasters || [] : []
      const clientsList = clientsRes.ok ? (await clientsRes.json()).clients || [] : []

      // Merge: roasters table entries + clients with roaster role
      const merged = [
        ...roastersList.map((r: any) => ({ id: r.id, name: r.name, country: r.country })),
        ...clientsList.map((c: any) => ({ id: c.id, name: c.fantasy_name || c.company, country: c.country })),
      ]
      // Deduplicate by name (case-insensitive)
      const seen = new Set<string>()
      const unique = merged.filter((r: any) => {
        const key = r.name?.toLowerCase()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      setRoasters(unique as unknown as Roaster[])
    } catch (error) {
      console.error('Error loading roasters:', error)
    }
  }

  const loadQcClients = async () => {
    try {
      const response = await fetch('/api/clients?is_qc_client=true&is_active=true&limit=500')
      if (response.ok) {
        const data = await response.json()
        setQcClients((data.clients || []) as Client[])
      } else {
        console.error('Failed to load QC clients:', response.status)
      }
    } catch (error) {
      console.error('Error loading QC clients:', error)
    }
  }

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData(prev => {
      const next: FormData = { ...prev, [field]: value }
      // If the user edits a contract-prefilled field, it's now "theirs" — drop it
      // from the tracking set so an Unlink won't clear it.
      if (prev.contract_prefilled_fields.includes(field)) {
        next.contract_prefilled_fields = prev.contract_prefilled_fields.filter(k => k !== field)
      }
      return next
    })
  }

  // Apply a contract-prefilled patch and remember which keys came from it.
  const applyContractPrefill = (patch: Partial<FormData>, prefilled: (keyof FormData)[]) => {
    setFormData(prev => {
      const next: FormData = { ...prev, ...patch }
      const keys = new Set<keyof FormData>(prev.contract_prefilled_fields)
      for (const k of prefilled) keys.add(k)
      next.contract_prefilled_fields = Array.from(keys)
      return next
    })
  }

  // Unlink the current contract: clear selected_contract and reset every still-untouched
  // prefilled field back to its initial value. User-edited fields were already removed
  // from contract_prefilled_fields by updateFormData, so they stay.
  const unlinkContract = () => {
    setFormData(prev => {
      const next: FormData = { ...prev }
      for (const key of prev.contract_prefilled_fields) {
        // Guard against stale keys restored from a localStorage session whose
        // FormData shape has since changed.
        if (key in initialFormData) {
          ;(next as any)[key] = (initialFormData as any)[key]
        }
      }
      next.selected_contract = null
      next.contract_resolution = null
      next.contract_prefilled_fields = []
      return next
    })
  }

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        // Step 1: Contract Search — always valid; selection is optional, skip is always allowed
        return true
      case 2:
        // Step 2: Supply Chain - Seller is required, shipper required only if not same as seller
        const hasShipper = formData.same_seller_shipper || !!formData.shipper
        return !!(formData.seller && hasShipper)
      case 3:
        // Step 3: Quality - Sample type, origin, and laboratory required
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
      case 4:
        // Step 4: Weight
        return !!(formData.bags_quantity_mt || formData.bag_count)
      case 5:
        // Step 5: Review
        return !!formData.arrival_date
      case 6:
        // Step 6: Contracts - always valid (contracts are optional)
        return true
      default:
        return false
    }
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setError(null)
      setCurrentStep(prev => Math.min(prev + 1, 6))
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

  const handleAddContract = () => {
    const newContract = createEmptyContract(formData)
    setFormData(prev => ({ ...prev, contracts: [...prev.contracts, newContract] }))
  }

  const handleRemoveContract = (index: number) => {
    setFormData(prev => ({ ...prev, contracts: prev.contracts.filter((_, i) => i !== index) }))
  }

  const handleGoToContracts = () => {
    if (validateStep(5)) {
      setError(null)
      setCurrentStep(6)
    } else {
      setError('Please fill in all required fields')
    }
  }

  const handleSubmit = async () => {
    console.log('[Sample Intake] handleSubmit called')

    if (!validateStep(5)) {
      setError('Please complete all required fields')
      return
    }

    setLoading(true)
    setError(null)

    try {
      console.log('[Sample Intake] Starting entity lookups in parallel...')
      console.log('[Sample Intake] Form data:', {
        seller: formData.seller,
        shipper: formData.shipper,
        same_seller_shipper: formData.same_seller_shipper,
        importer: formData.importer,
        qc_client: formData.qc_client,
        roaster: formData.roaster
      })

      // Run ALL entity lookups in parallel to avoid sequential delays
      const lookupPromises: Promise<any>[] = []
      const lookupKeys: string[] = []

      // Helper to create partial match pattern for ilike
      const toPattern = (name: string) => `%${name}%`

      // Increased timeout to 15 seconds for slower networks
      const LOOKUP_TIMEOUT = 15000

      // 1. Seller lookup from exporters table by name (samples.seller_id references exporters.id)
      // Use case-insensitive matching to handle variations in casing
      if (formData.seller) {
        lookupKeys.push('seller')
        lookupPromises.push(
          withTimeout(
            async () => supabase.from('exporters').select('id, name').ilike('name', formData.seller).limit(1).maybeSingle(),
            LOOKUP_TIMEOUT,
            'Seller lookup timeout'
          ).catch(err => { console.error('[Seller lookup error]', err); return { data: null, error: err } })
        )
      }

      // 2. Shipper lookup from exporters table by name (only if different from seller)
      // samples.exporter_id references exporters.id
      // Use case-insensitive matching to handle variations in casing
      if (!formData.same_seller_shipper && formData.shipper) {
        lookupKeys.push('shipper')
        lookupPromises.push(
          withTimeout(
            async () => supabase.from('exporters').select('id, name').ilike('name', formData.shipper).limit(1).maybeSingle(),
            LOOKUP_TIMEOUT,
            'Shipper lookup timeout'
          ).catch(err => { console.error('[Shipper lookup error]', err); return { data: null, error: err } })
        )
      }

      // 3. Importer lookup - always look up from importers table for importer_id
      // When importer_is_qc_client is true, ALSO look up from clients (handled by qc_client lookup below)
      if (formData.importer) {
        lookupKeys.push('importer')
        // Always try importers table first (for importer_id FK)
        lookupPromises.push(
          withTimeout(
            async () => supabase.from('importers').select('id').ilike('name', toPattern(formData.importer)).limit(1).maybeSingle(),
            LOOKUP_TIMEOUT,
            'Importer lookup timeout'
          ).catch(err => { console.error('[Importer lookup error]', err); return { data: null, error: err } })
        )
      }

      // 4. QC Client lookup - determine which name to search (only if not same as importer)
      const qcClientSearchName = formData.importer_is_qc_client ? formData.importer : formData.qc_client
      if (qcClientSearchName) {
        // Primary: lookup by exact fantasy_name match
        lookupKeys.push('qc_client_fantasy')
        lookupPromises.push(
          withTimeout(
            async () => supabase.from('clients').select('id').eq('fantasy_name', qcClientSearchName).eq('is_qc_client', true).limit(1).maybeSingle(),
            LOOKUP_TIMEOUT,
            'QC client fantasy lookup timeout'
          ).catch(err => { console.error('[QC client fantasy lookup error]', err); return { data: null, error: err } })
        )
      }

      // 5. Roaster lookup from roasters table by name
      if (formData.roaster) {
        lookupKeys.push('roaster')
        lookupPromises.push(
          withTimeout(
            async () => supabase.from('roasters').select('id').ilike('name', formData.roaster).limit(1).maybeSingle(),
            LOOKUP_TIMEOUT,
            'Roaster lookup timeout'
          ).catch(err => { console.error('[Roaster lookup error]', err); return { data: null, error: err } })
        )
      }

      // 6. End Client lookup from clients table by fantasy_name
      // No client_types filter - any client can be an end client
      if (formData.end_client) {
        lookupKeys.push('end_client')
        lookupPromises.push(
          withTimeout(
            async () => supabase
              .from('clients')
              .select('id')
              .ilike('fantasy_name', formData.end_client.trim())
              .limit(1)
              .maybeSingle(),
            LOOKUP_TIMEOUT,
            'End client lookup timeout'
          ).catch(err => { console.error('[End client lookup error]', err); return { data: null, error: err } })
        )
      }

      // Execute all lookups in parallel
      console.log('[Sample Intake] Running', lookupPromises.length, 'lookups in parallel for:', {
        seller: formData.seller,
        shipper: formData.same_seller_shipper ? '(same as seller)' : formData.shipper,
        importer: formData.importer,
        qcClient: qcClientSearchName,
        roaster: formData.roaster
      })
      const results = await Promise.all(lookupPromises)

      // Map results back to their keys with detailed logging
      const lookupResults: Record<string, string | undefined> = {}
      results.forEach((result, index) => {
        const key = lookupKeys[index]
        lookupResults[key] = result?.data?.id
        console.log(`[Sample Intake] Lookup ${key}:`, result?.data?.id || 'NOT FOUND', result?.error ? `(error: ${result.error.message})` : '')
      })

      console.log('[Sample Intake] Parallel lookup results:', lookupResults)

      // Extract resolved IDs
      const seller_id = lookupResults['seller']
      // When same_seller_shipper is true, use seller_id as exporter_id
      const exporter_id = formData.same_seller_shipper ? seller_id : lookupResults['shipper']
      // Always use importer_id from importers table lookup (even when importer=QC client)
      const importer_id = lookupResults['importer']
      const roaster_id = lookupResults['roaster']
      const end_client_id = lookupResults['end_client']

      // QC Client: use fantasy_name lookup, fallback to form's client_id
      let qc_client_id = lookupResults['qc_client_fantasy'] || formData.client_id || undefined

      console.log('[Sample Intake] Entity lookups complete. Resolved IDs:', {
        seller_id,
        exporter_id,
        importer_id,
        qc_client_id,
        roaster_id,
        end_client_id,
        same_seller_shipper: formData.same_seller_shipper
      })

      const sampleData: Record<string, any> = {
        client_id: qc_client_id, // Use the resolved QC client ID
        contract_id: formData.selected_contract?.id || undefined,
        laboratory_id: formData.laboratory_id,
        origin: formData.origin,
        micro_origin: formData.micro_origin || undefined,
        seller_id: seller_id,
        exporter_id: exporter_id, // This is the shipper
        same_seller_shipper: formData.same_seller_shipper,
        importer_is_qc_client: formData.importer_is_qc_client,
        exporter_sample_number: formData.exporter_sample_number || undefined,
        importer_id: importer_id,
        roaster_id: roaster_id,
        end_client_id: end_client_id,
        end_client_contract_nr: formData.end_client_contract_nr || undefined,
        supplier: formData.supplier || undefined,
        supplier_contract_nr: formData.supplier_contract_nr || undefined,
        processing_method: formData.processing_method,
        crop_year: formData.crop_year || undefined,
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

      console.log('[Sample Intake] Submitting sample with quality_name:', formData.quality_name, 'Processed:', sampleData.quality_name)
      console.log('[Sample Intake] Calling POST /api/samples...')

      // Wrap API call with timeout to prevent infinite hangs
      const response = await withTimeout(
        () => fetch('/api/samples', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sampleData)
        }),
        30000, // 30 second timeout for API call
        'Sample creation API timeout - please try again'
      )

      console.log('[Sample Intake] API response status:', response.status)
      const result = await response.json()
      console.log('[Sample Intake] API response body:', result)

      if (!response.ok) {
        const errorMsg = result.details
          ? `${result.error}: ${result.details}`
          : (result.error || 'Failed to create sample')
        throw new Error(errorMsg)
      }

      console.log('[Sample Intake] Sample created successfully:', result.sample.tracking_number)

      // Create sub-contracts sequentially (to avoid tracking number race conditions)
      const createdSampleId = result.sample.id
      const subContractTrackingNumbers: string[] = []

      if (formData.contracts.length > 0) {
        console.log('[Sample Intake] Creating', formData.contracts.length, 'sub-contracts...')
        for (let i = 0; i < formData.contracts.length; i++) {
          const sc = formData.contracts[i]
          try {
            // Resolve entity IDs for this sub-contract
            const scLookups: Promise<any>[] = []
            const scKeys: string[] = []

            if (sc.importer) {
              if (sc.importer_is_qc_client) {
                scKeys.push('sc_client')
                scLookups.push(
                  Promise.resolve(supabase.from('clients').select('id').eq('fantasy_name', sc.importer).eq('is_qc_client', true).limit(1).maybeSingle())
                    .catch(() => ({ data: null, error: null }))
                )
              }
              scKeys.push('sc_importer')
              scLookups.push(
                Promise.resolve(supabase.from('importers').select('id').ilike('name', `%${sc.importer}%`).limit(1).maybeSingle())
                  .catch(() => ({ data: null, error: null }))
              )
            }
            if (sc.roaster) {
              scKeys.push('sc_roaster')
              scLookups.push(
                Promise.resolve(supabase.from('roasters').select('id').ilike('name', sc.roaster).limit(1).maybeSingle())
                  .catch(() => ({ data: null, error: null }))
              )
            }
            if (sc.end_client) {
              scKeys.push('sc_end_client')
              scLookups.push(
                Promise.resolve(supabase.from('clients').select('id').ilike('fantasy_name', sc.end_client).limit(1).maybeSingle())
                  .catch(() => ({ data: null, error: null }))
              )
            }
            if (!sc.importer_is_qc_client && sc.qc_client) {
              scKeys.push('sc_qc_client')
              scLookups.push(
                Promise.resolve(supabase.from('clients').select('id').eq('fantasy_name', sc.qc_client).eq('is_qc_client', true).limit(1).maybeSingle())
                  .catch(() => ({ data: null, error: null }))
              )
            }

            const scResults = await Promise.all(scLookups)
            const scResolved: Record<string, string | undefined> = {}
            scResults.forEach((r, idx) => { scResolved[scKeys[idx]] = r?.data?.id })

            const contractBody: Record<string, any> = {
              importer_id: scResolved['sc_importer'] || null,
              importer_is_qc_client: sc.importer_is_qc_client,
              roaster_id: scResolved['sc_roaster'] || null,
              end_client_id: scResolved['sc_end_client'] || null,
              client_id: scResolved['sc_client'] || scResolved['sc_qc_client'] || null,
              wolthers_contract_nr: sc.wolthers_contract_nr || null,
              buyer_contract_nr: sc.buyer_contract_nr || null,
              roaster_contract_nr: sc.roaster_contract_nr || null,
              qc_client_contract_nr: sc.qc_client_contract_nr || null,
              end_client_contract_nr: sc.end_client_contract_nr || null,
              supplier_contract_nr: sc.supplier_contract_nr || null,
              ico_number: sc.ico_number || null,
              container_nr: sc.container_nr || null,
              exporter_sample_number: sc.exporter_sample_number || null,
              bag_count: sc.bag_count ? parseInt(sc.bag_count) : null,
              bag_weight_kg: sc.bag_weight_kg ? parseFloat(sc.bag_weight_kg) : null,
              bag_type: sc.bag_type || null,
              bags_quantity_mt: sc.bags_quantity_mt ? parseFloat(sc.bags_quantity_mt) : null,
              equivalent_60kg_bags: sc.equivalent_60kg_bags ? parseInt(sc.equivalent_60kg_bags) : null,
              shipment_month: sc.shipment_month || null,
            }

            const scResponse = await fetch(`/api/samples/${createdSampleId}/contracts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(contractBody)
            })

            if (scResponse.ok) {
              const scResult = await scResponse.json()
              subContractTrackingNumbers.push(scResult.contract.tracking_number)
              console.log(`[Sample Intake] Sub-contract ${i + 1} created:`, scResult.contract.tracking_number)
            } else {
              console.error(`[Sample Intake] Failed to create sub-contract ${i + 1}`)
            }
          } catch (scErr) {
            console.error(`[Sample Intake] Error creating sub-contract ${i + 1}:`, scErr)
          }
        }
      }

      setGeneratedTrackingNumber(result.sample.tracking_number)
      setSuccess(true)

      if (onSuccess) {
        onSuccess(result.sample.tracking_number)
      }

      localStorage.removeItem('sample-intake-form')

    } catch (err: any) {
      console.error('[Sample Intake] Error creating sample:', err)
      setError(err.message || 'Failed to create sample')
    } finally {
      console.log('[Sample Intake] handleSubmit completed, setting loading to false')
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
    <FormWrapper className={asDialog ? '' : 'w-fit'}>
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
          <p className="text-sm font-medium">Sample Intake - {STEPS[currentStep - 1].name}</p>
        </div>
      </HeaderWrapper>

      <ContentWrapper className={asDialog ? 'flex flex-col h-full' : 'flex flex-col h-full'}>
        {/* Persistent contract link badge — outside the scroll region so it stays visible on long steps */}
        {currentStep > 1 && formData.selected_contract && (
          <ContractLinkBadge
            contract={formData.selected_contract}
            onUnlink={unlinkContract}
          />
        )}

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto space-y-6 pb-4">
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {currentStep === 1 && (
            <ContractSearchStep
              formData={formData}
              applyContract={applyContractPrefill}
              unlinkContract={unlinkContract}
              onSkip={() => setCurrentStep(2)}
            />
          )}

          {currentStep === 2 && (
            <SupplyChainStep
              formData={formData}
              updateFormData={updateFormData}
              clients={clients}
              laboratories={laboratories}
              filteredClients={filteredClients}
              approvedPSSSamples={approvedPSSSamples}
              exporters={exporters}
              importers={importers}
              roasters={roasters}
              qcClients={qcClients}
              onEntityCreated={(type) => {
                if (type === 'exporter') loadExporters()
                else if (type === 'importer') loadImporters()
                else if (type === 'roaster') loadRoasters()
                else if (type === 'end_client' || type === 'qc_client') loadQcClients()
              }}
            />
          )}

          {currentStep === 3 && (
            <QualityStep
              formData={formData}
              updateFormData={updateFormData}
              clients={clients}
              laboratories={laboratories}
              filteredClients={filteredClients}
              approvedPSSSamples={approvedPSSSamples}
              importers={importers}
              qcClients={qcClients}
              isGlobalUser={isGlobalUser}
            />
          )}

          {currentStep === 4 && (
            <QuantityStep
              formData={formData}
              updateFormData={updateFormData}
              clients={clients}
              laboratories={laboratories}
              filteredClients={filteredClients}
              approvedPSSSamples={approvedPSSSamples}
            />
          )}

          {currentStep === 5 && (
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

          {currentStep === 6 && (
            <ContractsStep
              formData={formData}
              updateFormData={updateFormData}
              clients={clients}
              laboratories={laboratories}
              filteredClients={filteredClients}
              approvedPSSSamples={approvedPSSSamples}
              importers={importers}
              roasters={roasters}
              qcClients={qcClients}
              onAddContract={handleAddContract}
              onRemoveContract={handleRemoveContract}
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

          <div className="flex gap-2">
            {currentStep < 5 && (
              <Button
                type="button"
                onClick={handleNext}
                disabled={!validateStep(currentStep)}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}

            {currentStep === 5 && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoToContracts}
                  disabled={!validateStep(5)}
                >
                  + Add Sub-Contracts
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || !validateStep(5)}
                >
                  {loading ? 'Creating Sample...' : 'Create Sample'}
                </Button>
              </>
            )}

            {currentStep === 6 && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddContract}
                >
                  + Add Sub-Contract
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Submit All'}
                </Button>
              </>
            )}
          </div>
        </div>
      </ContentWrapper>
    </FormWrapper>
  )
}
