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
  PssLinkStep,
  ContractLinkBadge,
  createEmptyContract,
  SuccessView
} from './intake'
import { OtherSampleIntake } from './intake/other-sample-intake'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { mapPssToFormData, mapSubContractOverride } from '@/lib/pss-intake-mapping'
import { resolvePssSelection } from '@/lib/pss-picker-option'

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
  // Category — defaults to existing QC flow
  sample_category: 'qc',
  awb_number: '',
  courier_name: '',
  is_quick_look: false,
  recipients: [],

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
  linked_pss_sample_contract_id: '',
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
    if (!formData.seller && !formData.importer && !formData.sample_type && !formData.selected_contract) return

    const dataToSave = { ...formData, photo_file: null }
    localStorage.setItem('sample-intake-form', JSON.stringify(dataToSave))
  }, [formData, success])

  // Validate seller from localStorage exists in exporters list, clear if stale.
  // Skip when a contract is currently linked — contract prefill is the source of
  // truth in that case, and the seller name may be a brand-new exporter the user
  // is about to create (the contract API auto-creates missing exporters, so this
  // mostly just guards against the brief race before exporters reload).
  useEffect(() => {
    if (exporters.length === 0 || !formData.seller) return
    if (formData.selected_contract) return

    const sellerExists = exporters.some(
      exp => exp.name.toLowerCase() === formData.seller.toLowerCase()
    )

    if (!sellerExists) {
      console.warn('[Sample Intake] Cached seller not found in exporters list, clearing:', formData.seller)
      setFormData(prev => ({ ...prev, seller: '' }))
    }
  }, [exporters, formData.seller, formData.selected_contract])

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
      const response = await fetch('/api/samples?sample_type=pss&status=approved&limit=200')
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

      // Merge: exporters table entries + clients with exporter role.
      // `name` is the legal name (used for value + DB resolution), `fantasy_name`
      // is the trade name shown as the dropdown label.
      const merged = [
        ...exportersList.map((e: any) => ({ id: e.id, name: e.name, fantasy_name: e.fantasy_name ?? null, country: e.country })),
        ...clientsList.map((c: any) => ({ id: c.id, name: c.company || c.name, fantasy_name: c.fantasy_name ?? null, country: c.country })),
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

      // Merge: importers table entries + clients with importer_buyer role.
      // `name` = legal name (value + DB resolution); `fantasy_name` = trade name (label).
      const merged = [
        ...importersList.map((i: any) => ({ id: i.id, name: i.name, fantasy_name: i.fantasy_name ?? null, country: i.country, client_id: i.client_id })),
        ...clientsList.map((c: any) => ({ id: c.id, name: c.company || c.name, fantasy_name: c.fantasy_name ?? null, country: c.country, client_id: c.id })),
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

      // Merge: roasters table entries + clients with roaster role.
      // `name` = legal name (value + DB resolution); `fantasy_name` = trade name (label).
      const merged = [
        ...roastersList.map((r: any) => ({ id: r.id, name: r.name, fantasy_name: r.fantasy_name ?? null, country: r.country })),
        ...clientsList.map((c: any) => ({ id: c.id, name: c.company || c.name, fantasy_name: c.fantasy_name ?? null, country: c.country })),
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
  // When a contract is replaced (user picks a different one in Step 1), any field that
  // the previous contract prefilled but the new one doesn't set is reset to its initial
  // value so a stale value can't linger. User-edited fields aren't affected — updateFormData
  // already removed them from contract_prefilled_fields.
  const applyContractPrefill = (patch: Partial<FormData>, prefilled: (keyof FormData)[]) => {
    setFormData(prev => {
      const next: FormData = { ...prev, ...patch }
      const newKeys = new Set<keyof FormData>(prefilled)
      for (const key of prev.contract_prefilled_fields) {
        if (!newKeys.has(key) && key in initialFormData) {
          ;(next as any)[key] = (initialFormData as any)[key]
        }
      }
      next.contract_prefilled_fields = Array.from(newKeys)
      return next
    })
    // The contract API auto-creates any exporters/importers it didn't find in
    // WAQC. Refresh the dropdown sources so the prefilled seller/shipper/importer
    // show up as selected instead of triggering the "not found" warning.
    loadExporters()
    loadImporters()
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

  // SS → PSS: selecting a mother PSS or a specific sub-contract prefills every
  // shared field via the same prefill-tracking machinery as contracts, so edits
  // clear per-field and reselecting resets stale values. A sub-contract keeps
  // linked_pss_sample_id on the mother and pins the exact leaf via
  // linked_pss_sample_contract_id, layering its per-leaf overrides on top.
  const handleSelectPss = (value: string) => {
    const sel = resolvePssSelection(approvedPSSSamples, value)
    if (!sel) return
    updateFormData('linked_pss_sample_id', sel.mother.id)
    updateFormData('linked_pss_sample_contract_id', sel.subContract ? sel.subContract.id : '')
    const base = mapPssToFormData(sel.mother)
    if (sel.subContract) {
      const override = mapSubContractOverride(sel.subContract)
      applyContractPrefill(
        { ...base.patch, ...override.patch },
        [...base.prefilled, ...override.prefilled]
      )
    } else {
      applyContractPrefill(base.patch, base.prefilled)
    }
  }

  // linked_pss_sample_id / linked_pss_sample_contract_id are cleared via separate
  // updateFormData calls because they are not tracked in contract_prefilled_fields,
  // so applyContractPrefill({}, []) alone would not reset them.
  const handleClearPss = () => {
    applyContractPrefill({}, [])
    updateFormData('linked_pss_sample_id', '')
    updateFormData('linked_pss_sample_contract_id', '')
  }

  // Step-1 sample-type change: leaving SS clears any linked PSS + its prefill.
  const handleStep1TypeChange = (value: string) => {
    updateFormData('sample_type', value as FormData['sample_type'])
    if (value !== 'ss' && formData.linked_pss_sample_id) {
      handleClearPss()
    }
  }

  const isOther = formData.sample_category === 'other'

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
        // For Other Samples, sample_type is captured in Step 5, so don't gate Step 3 on it.
        const baseQualityValidation = isOther
          ? !!(formData.origin && formData.laboratory_id)
          : !!(formData.sample_type && formData.origin && formData.laboratory_id)

        if (!isOther && (formData.sample_type === 'pss' || formData.sample_type === 'ss')) {
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
        // Step 5: For QC = Review (arrival_date). For Other = sub-type + recipients.
        if (isOther) {
          return !!formData.sample_type && formData.recipients.length > 0
        }
        return !!formData.arrival_date
      case 6:
        // Step 6: For QC = optional sub-contracts. For Other = Review (arrival_date).
        if (isOther) {
          return !!formData.arrival_date
        }
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

    // For QC the review lives on step 5; for Other on step 6.
    const reviewStep = isOther ? 6 : 5
    if (!validateStep(reviewStep)) {
      setError('Please complete all required fields')
      return
    }
    // For Other Samples, also require the sub-type + recipients gate (step 5).
    if (isOther && !validateStep(5)) {
      setError('Pick a sample sub-type and at least one recipient')
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
            async () => (supabase as any).from('companies').select('id, name').or('trading_roles.cs.["seller"],company_types.cs.{exporter}').ilike('name', formData.seller).limit(1).maybeSingle(),
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
            async () => (supabase as any).from('companies').select('id, name').or('trading_roles.cs.["seller"],company_types.cs.{exporter}').ilike('name', formData.shipper).limit(1).maybeSingle(),
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
            async () => (supabase as any).from('companies').select('id').filter('trading_roles', 'cs', '["buyer"]').ilike('name', toPattern(formData.importer)).limit(1).maybeSingle(),
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
            async () => (supabase as any).from('companies').select('id').eq('fantasy_name', qcClientSearchName).eq('is_qc_client', true).limit(1).maybeSingle(),
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
            async () => (supabase as any).from('companies').select('id').contains('company_types', ['roaster']).ilike('name', formData.roaster).limit(1).maybeSingle(),
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
            async () => (supabase as any)
              .from('companies')
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
        linked_pss_sample_id:
          formData.linked_pss_sample_id && formData.linked_pss_sample_id !== 'none'
            ? formData.linked_pss_sample_id
            : undefined,
        linked_pss_sample_contract_id:
          formData.linked_pss_sample_contract_id || undefined,
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
        certifications: formData.certifications && formData.certifications.length > 0
          ? formData.certifications
          : undefined,
        bags_quantity_mt: formData.bags_quantity_mt ? parseFloat(formData.bags_quantity_mt) : undefined,
        bag_count: formData.bag_count ? parseInt(formData.bag_count) : undefined,
        bag_weight_kg: formData.bag_weight_kg ? parseFloat(formData.bag_weight_kg) : undefined,
        bag_type: formData.bag_type || undefined,
        shipment_month: formData.shipment_month || undefined,
        status: 'received',
        workflow_stage: 'received',
        sample_category: formData.sample_category,
        awb_number: formData.awb_number || undefined,
        courier_name: formData.courier_name || undefined,
        is_quick_look: formData.is_quick_look
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

      const createdSampleId = result.sample.id

      // For Other Samples, persist the recipient list now that we have the sample id.
      if (isOther && formData.recipients.length > 0) {
        console.log('[Sample Intake] Creating', formData.recipients.length, 'sample recipients...')
        try {
          const recipResp = await fetch(`/api/samples/${createdSampleId}/recipients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipients: formData.recipients.map(r => ({
                client_id: r.client_id,
                contact_emails: r.contact_emails,
              })),
            }),
          })
          if (!recipResp.ok) {
            console.error('[Sample Intake] Failed to persist recipients (sample still created)')
          }
        } catch (recipErr) {
          console.error('[Sample Intake] Error creating recipients:', recipErr)
        }
      }

      // Create sub-contracts sequentially (to avoid tracking number race conditions)
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
                  Promise.resolve((supabase as any).from('companies').select('id').eq('fantasy_name', sc.importer).eq('is_qc_client', true).limit(1).maybeSingle())
                    .catch(() => ({ data: null, error: null }))
                )
              }
              scKeys.push('sc_importer')
              scLookups.push(
                Promise.resolve((supabase as any).from('companies').select('id').filter('trading_roles', 'cs', '["buyer"]').ilike('name', `%${sc.importer}%`).limit(1).maybeSingle())
                  .catch(() => ({ data: null, error: null }))
              )
            }
            if (sc.roaster) {
              scKeys.push('sc_roaster')
              scLookups.push(
                Promise.resolve((supabase as any).from('companies').select('id').contains('company_types', ['roaster']).ilike('name', sc.roaster).limit(1).maybeSingle())
                  .catch(() => ({ data: null, error: null }))
              )
            }
            if (sc.end_client) {
              scKeys.push('sc_end_client')
              scLookups.push(
                Promise.resolve((supabase as any).from('companies').select('id').ilike('fantasy_name', sc.end_client).limit(1).maybeSingle())
                  .catch(() => ({ data: null, error: null }))
              )
            }
            if (!sc.importer_is_qc_client && sc.qc_client) {
              scKeys.push('sc_qc_client')
              scLookups.push(
                Promise.resolve((supabase as any).from('companies').select('id').eq('fantasy_name', sc.qc_client).eq('is_qc_client', true).limit(1).maybeSingle())
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

  // Shared props for the step components. Components only read what they need;
  // extra props are ignored. Used by the combined Other-Sample screens.
  const stepProps = {
    formData,
    updateFormData,
    clients,
    laboratories,
    filteredClients,
    approvedPSSSamples,
    exporters,
    importers,
    roasters,
    qcClients,
    isGlobalUser,
    onEntityCreated: (type: 'exporter' | 'importer' | 'roaster' | 'end_client' | 'qc_client') => {
      if (type === 'exporter') loadExporters()
      else if (type === 'importer') loadImporters()
      else if (type === 'roaster') loadRoasters()
      else if (type === 'end_client' || type === 'qc_client') loadQcClients()
    },
  }

  // Other Sample = the lean sys.wolthers.com "New sample" flow: a contract-ref
  // search resolves buyer/seller/refs/allocations, then we write the shared
  // shipment_samples table (single) / create_sample_group RPC (per-container,
  // choices). Entirely separate from the QC wizard below.
  if (isOther) {
    const categoryBtn = (cat: 'qc' | 'other', label: string) => (
      <button
        type="button"
        onClick={() => updateFormData('sample_category', cat)}
        className={`px-3 py-1.5 rounded-md transition-colors ${
          formData.sample_category === cat
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {label}
      </button>
    )
    return (
      <FormWrapper className={asDialog ? 'flex flex-col flex-auto min-h-0' : 'w-fit'}>
        <HeaderWrapper className={asDialog ? 'mb-4 flex-shrink-0' : ''}>
          {!asDialog && <CardTitle>Sample Intake Form</CardTitle>}
          <div className="mt-3 inline-flex rounded-lg border border-input p-1 text-xs">
            {categoryBtn('qc', 'QC Sample')}
            {categoryBtn('other', 'Other Sample')}
          </div>
        </HeaderWrapper>
        <ContentWrapper className={asDialog ? 'flex-auto min-h-0 flex flex-col' : 'flex flex-col h-full'}>
          <OtherSampleIntake asDialog={asDialog} onSaved={() => onSuccess?.('')} />
        </ContentWrapper>
      </FormWrapper>
    )
  }

  return (
    <FormWrapper className={asDialog ? 'flex flex-col h-full min-h-0' : 'w-fit'}>
      <HeaderWrapper className={asDialog ? 'mb-4 flex-shrink-0' : ''}>
        {!asDialog && <CardTitle>Sample Intake Form</CardTitle>}

        {/* Category toggle — only meaningful on step 1 (before downstream fields diverge) */}
        {currentStep === 1 && (
          <div className="mt-3 inline-flex rounded-lg border border-input p-1 text-xs">
            <button
              type="button"
              onClick={() => updateFormData('sample_category', 'qc')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                formData.sample_category === 'qc'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              QC Sample
            </button>
            <button
              type="button"
              onClick={() => updateFormData('sample_category', 'other')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                formData.sample_category === 'other'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Other Sample
            </button>
          </div>
        )}

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
          <p className="text-sm font-medium">
            Sample Intake - {STEPS[currentStep - 1]?.name}
          </p>
        </div>
      </HeaderWrapper>

      <ContentWrapper className={asDialog ? 'flex-auto min-h-0 flex flex-col' : 'flex flex-col h-full'}>
        {/* Persistent contract link badge — outside the scroll region so it stays visible on long steps.
            Step 5 (review) renders its own compact contract chip beside Arrival Date, so skip it there. */}
        {currentStep > 1 && currentStep !== 5 && formData.selected_contract && (
          <ContractLinkBadge
            contract={formData.selected_contract}
            onUnlink={unlinkContract}
          />
        )}

        {/* Scrollable content area */}
        <div className="flex-auto min-h-0 overflow-y-auto space-y-6 pb-4">
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <>
              {currentStep === 1 && (
                isOther ? (
                  <ContractSearchStep
                    formData={formData}
                    applyContract={applyContractPrefill}
                    unlinkContract={unlinkContract}
                    onSkip={() => setCurrentStep(2)}
                  />
                ) : (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs text-muted-foreground">Sample Type *</Label>
                        <Select value={formData.sample_type} onValueChange={handleStep1TypeChange}>
                          <SelectTrigger className="w-[260px] h-9">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pss">PSS (Pre-Shipment Sample)</SelectItem>
                            <SelectItem value="ss">SS (Shipment Sample)</SelectItem>
                            <SelectItem value="type">Type Sample</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {formData.sample_type === 'ss' && (
                        <PssLinkStep
                          formData={formData}
                          approvedPSSSamples={approvedPSSSamples}
                          onSelectPss={handleSelectPss}
                          onClearPss={handleClearPss}
                        />
                      )}
                    </div>
                    {/* Contract search: the only path for PSS/Type, and the fallback
                        for an SS whose PSS isn't in WAQC (legacy). Hidden once an SS
                        has linked a WAQC PSS — that already carries the contract. */}
                    {(formData.sample_type !== 'ss' || !formData.linked_pss_sample_id) && (
                      <>
                        {formData.sample_type === 'ss' && (
                          <div className="flex items-center gap-3 pt-1">
                            <div className="h-px flex-1 bg-border" />
                            <span className="text-xs text-muted-foreground">
                              or, if the PSS isn&apos;t in our system, find the contract
                            </span>
                            <div className="h-px flex-1 bg-border" />
                          </div>
                        )}
                        <ContractSearchStep
                          formData={formData}
                          applyContract={applyContractPrefill}
                          unlinkContract={unlinkContract}
                          onSkip={() => setCurrentStep(2)}
                        />
                      </>
                    )}
                  </div>
                )
              )}

              {currentStep === 2 && <SupplyChainStep {...stepProps} />}

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
          </>
        </div>

        {/* Fixed footer */}
        <div className="flex-shrink-0 flex justify-between pt-4 border-t bg-background">
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
