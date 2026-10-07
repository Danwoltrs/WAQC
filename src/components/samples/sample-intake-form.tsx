'use client'

import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { cvaQualityIds } from '@/lib/cupping-protocol-scope'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { AlertCircle, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react'
import {
  FormData,
  Client,
  Laboratory,
  Exporter,
  Importer,
  Roaster,
  SampleInsert,
  QC_STEPS,
  CONTRACT_STEP,
  DETAILS_STEP,
  REVIEW_STEP,
  STEP_AFTER_CONTRACT_LINK,
  stepIssues,
  submitIssues,
  nextStep,
  previousStep,
  SampleFieldsStep,
  ReviewStep,
  createEmptyContract,
  appendContract,
  contractQuantities,
  EMPTY_QUANTITY,
  quantityFieldsFromStored,
  SuccessView,
  type CreatedSample,
  type IntakeRules,
} from './intake'
import type { SubContractFormData } from './intake'
import { OtherSampleIntake } from './intake/other-sample-intake'
import { ContractStep } from './intake/contract-step'
import { LabOriginPickers } from './intake/lab-origin-pickers'
import { WizardStepper } from './intake/wizard-stepper'
import { SegmentedControl } from './intake/segmented-control'
import { focusField, focusFirstField, issueField } from './intake/field-targets'
import type { DetailsSection } from './intake/review-summary'
import { cn } from '@/lib/utils'
import './intake/intake-radius.css'
import {
  mapContractToFormData,
  toSelectedContract,
  isStaleContractLink,
  linkedPartyIds,
  type ContractWithParties,
  type ContractResolution,
  mapContractToSubContract,
} from '@/lib/contract-intake-mapping'
import { mapPssToFormData, mapSiblingToContractRow } from '@/lib/pss-intake-mapping'
import { pssOfficialRef, resolvePssSelection, siblingAsSample } from '@/lib/pss-picker-option'
import { contractDisplayNumber } from '@/lib/contract-family'
import { mergePrefill, type PrefillOptions } from '@/lib/intake-prefill'
import type { ContractInput } from '@/lib/sample-group'
import { toast } from 'sonner'

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
  /** The new lab unit: its lab number (never shown, see CLAUDE.md) and its id. */
  onSuccess?: (trackingNumber: string, sampleId?: string) => void
  asDialog?: boolean
  /** Closes the host dialog: the New Sample step's Cancel. */
  onCancel?: () => void
  /**
   * The specialty intake, the CVA picker's Add sample (Daniel 2026-10-07:
   * "will only add specialty samples"). A lot is specialty by its quality, so
   * this wizard takes only a CVA quality: it lists no other, drops one a
   * draft or a contract filled in, and creates nothing without one. QC
   * samples only, with a draft of its own, and no success screen: the host
   * takes the new lot by its id.
   */
  specialtyOnly?: boolean
}

const DRAFT_KEY = 'sample-intake-form'
const SPECIALTY_DRAFT_KEY = 'sample-intake-form:specialty'

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

  // Step 4: Quantity (boxes × bags per box, see quantity-model)
  ...EMPTY_QUANTITY,
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

// A draft saved by an older build may carry keys FormData no longer has
// (bulk_container_count, linked_pss_sample_contract_id) or lack ones it gained
// (container_count). Keep only the keys the form knows and give every saved
// contract the current shape, so a stale draft cannot smuggle a dead column
// into the POST body or leave a contract without its container field.
const CONTRACT_KEYS = Object.keys(createEmptyContract(initialFormData))
/**
 * Fields a saved draft must NOT bring back, alongside photo_file and
 * arrival_date which the caller already refuses.
 *
 * The Wolthers contract number arrives with a link (a picked contract, a linked
 * PSS) or is typed; applyContractPrefill only resets keys it had prefilled
 * itself. So a number restored from a draft written days ago for a DIFFERENT
 * shipment would sit in the field with no correcting path, looking exactly like
 * one the user had just typed. `selected_contract` goes with it: a restored
 * "Linked to contract #…" badge for a contract this sample was never about is
 * the same lie in a different place.
 */
const DRAFT_EXCLUDED_KEYS = new Set<string>([
  'wolthers_contract_nr',
  'selected_contract',
  'contract_resolution',
  'contract_prefilled_fields',
])

/**
 * A draft saved before quantities were entered as boxes (2026-10-01) holds
 * bag_count / bags_quantity_mt instead: read it into boxes so the restored
 * quantity is the one the user typed.
 */
function upgradeDraftQuantity(source: Record<string, unknown>): Record<string, unknown> {
  if ('bags_per_box' in source || !('bag_count' in source)) return {}
  return { ...quantityFieldsFromStored(source as Parameters<typeof quantityFieldsFromStored>[0]) }
}

function restoreDraft(raw: unknown): Partial<FormData> {
  if (!raw || typeof raw !== 'object') return {}
  const draft: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key in initialFormData && !DRAFT_EXCLUDED_KEYS.has(key)) draft[key] = value
  }
  Object.assign(draft, upgradeDraftQuantity(raw as Record<string, unknown>))
  draft.contracts = Array.isArray(draft.contracts)
    ? draft.contracts.map((c) => {
        // Same rule per sub-contract: its Wolthers number is typed, so a stale
        // one must not come back looking freshly entered.
        const next: Record<string, unknown> = { container_count: '', wolthers_contract_nr: '', contract_id: '' }
        if (c && typeof c === 'object') {
          for (const k of CONTRACT_KEYS) {
            // Its sys contract link goes with the number it was found by.
            if (k === 'wolthers_contract_nr' || k === 'contract_id') continue
            if (k in c) next[k] = (c as Record<string, unknown>)[k]
          }
          Object.assign(next, upgradeDraftQuantity(c as Record<string, unknown>))
        }
        return next
      })
    : []
  return draft as Partial<FormData>
}

// Resolve a contract's counterparties to company ids the same way the mother's
// are resolved in handleSubmit (importer by legal-name ilike, QC and end client
// by fantasy name, roaster by legal name), then shape it as the ContractInput
// the server copies onto the sibling row. A failed lookup leaves the id null
// rather than blocking the sample; the name stays on the form to fix later.
async function resolveContractInput(sc: SubContractFormData): Promise<ContractInput> {
  const db = supabase as any
  const lookup = (query: unknown): Promise<{ data: { id?: string } | null }> =>
    Promise.resolve(query as Promise<{ data: { id?: string } | null }>).catch(() => ({ data: null }))
  const [client, importer, roaster, endClient, qcClient] = await Promise.all([
    sc.importer && sc.importer_is_qc_client
      ? lookup(db.from('companies').select('id').eq('fantasy_name', sc.importer).eq('is_qc_client', true).limit(1).maybeSingle())
      : null,
    sc.importer
      ? lookup(db.from('companies').select('id').filter('trading_roles', 'cs', '["buyer"]').ilike('name', `%${sc.importer}%`).limit(1).maybeSingle())
      : null,
    sc.roaster
      ? lookup(db.from('companies').select('id').contains('company_types', ['roaster']).ilike('name', sc.roaster).limit(1).maybeSingle())
      : null,
    sc.end_client
      ? lookup(db.from('companies').select('id').ilike('fantasy_name', sc.end_client).limit(1).maybeSingle())
      : null,
    !sc.importer_is_qc_client && sc.qc_client
      ? lookup(db.from('companies').select('id').eq('fantasy_name', sc.qc_client).eq('is_qc_client', true).limit(1).maybeSingle())
      : null,
  ])
  const id = (r: { data: { id?: string } | null } | null) => r?.data?.id ?? null
  const q = contractQuantities(sc)
  return {
    importer_id: id(importer),
    importer_is_qc_client: sc.importer_is_qc_client,
    roaster_id: id(roaster),
    end_client_id: id(endClient),
    client_id: id(client) ?? id(qcClient),
    wolthers_contract_nr: sc.wolthers_contract_nr || null,
    contract_id: sc.contract_id || null,
    linked_pss_sample_id: sc.linked_pss_sample_id || null,
    buyer_contract_nr: sc.buyer_contract_nr || null,
    roaster_contract_nr: sc.roaster_contract_nr || null,
    qc_client_contract_nr: sc.qc_client_contract_nr || null,
    end_client_contract_nr: sc.end_client_contract_nr || null,
    supplier_contract_nr: sc.supplier_contract_nr || null,
    ico_number: sc.ico_number || null,
    container_nr: sc.container_nr || null,
    exporter_sample_number: sc.exporter_sample_number || null,
    bag_type: q.bag_type,
    bag_count: q.bag_count,
    bag_weight_kg: q.bag_weight_kg,
    bags_quantity_mt: q.bags_quantity_mt,
    equivalent_60kg_bags: q.equivalent_60kg_bags,
    container_count: q.container_count,
    container_size: q.container_size,
    bag_liner: q.bag_liner,
    shipment_month: sc.shipment_month || null,
  }
}

export function SampleIntakeForm({ onSuccess, asDialog = false, onCancel, specialtyOnly = false }: SampleIntakeFormProps = {}) {
  const { profile } = useAuth()
  const draftKey = specialtyOnly ? SPECIALTY_DRAFT_KEY : DRAFT_KEY

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
  // What the success screen names: the lab unit, then its contract siblings.
  const [createdSamples, setCreatedSamples] = useState<CreatedSample[]>([])
  const [formData, setFormData] = useState<FormData>(initialFormData)
  // The specialty intake's qualities (the CVA ones): every one in the
  // database, plus any the quality step meets on a client's list (a
  // specification linked from here is one of them before a reload could say so).
  const [specialtyQualityIds, setSpecialtyQualityIds] = useState<ReadonlySet<string>>(() => new Set())
  const [specialtyLoaded, setSpecialtyLoaded] = useState(false)
  const addSpecialtyQualities = (ids: string[]) => {
    setSpecialtyQualityIds((prev) => (ids.every((id) => prev.has(id)) ? prev : new Set([...prev, ...ids])))
  }
  const rules: IntakeRules = specialtyOnly ? { specialtyQualityIds } : {}

  // Load clients, laboratories, exporters, importers, and roasters
  useEffect(() => {
    loadClients()
    loadLaboratories()
    loadExporters()
    loadImporters()
    loadRoasters()
    loadQcClients()

    // Load saved form data from localStorage
    const savedData = localStorage.getItem(draftKey)
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData)
        // Always use today's date for arrival_date (don't restore old dates)
        setFormData(prev => ({
          ...prev,
          ...restoreDraft(parsed),
          photo_file: null,
          arrival_date: new Date().toISOString().split('T')[0]
        }))
      } catch (e) {
        console.error('Failed to parse saved form data:', e)
      }
    }
  }, [draftKey])

  useEffect(() => {
    if (!specialtyOnly) return
    let live = true
    cvaQualityIds(supabase)
      .then((ids) => { if (live) addSpecialtyQualities([...ids]) })
      // Unknown means none: no quality gets through on a guess.
      .catch((err) => console.error('[Sample Intake] Specialty qualities failed to load:', err))
      .finally(() => { if (live) setSpecialtyLoaded(true) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialtyOnly])

  // A quality that is not specialty does not stay on a specialty intake,
  // whether a draft or a linked contract filled it in: the list never offers
  // it, so the field shows empty and asks for one that is.
  useEffect(() => {
    if (!specialtyOnly || !specialtyLoaded) return
    if (formData.quality_spec_id && !specialtyQualityIds.has(formData.quality_spec_id)) {
      setFormData((prev) => ({ ...prev, quality_spec_id: '', quality_name: '' }))
    }
  }, [specialtyOnly, specialtyLoaded, specialtyQualityIds, formData.quality_spec_id])

  // Save form data to localStorage on changes (skip when in success state or when form is empty)
  useEffect(() => {
    // Don't save empty forms or when showing success view
    if (success) return
    // Don't save if form is essentially empty (just reset)
    if (!formData.seller && !formData.importer && !formData.sample_type && !formData.selected_contract) return

    const dataToSave = { ...formData, photo_file: null }
    localStorage.setItem(draftKey, JSON.stringify(dataToSave))
  }, [formData, success, draftKey])

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
      const savedData = localStorage.getItem(draftKey)
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
  }, [profile, laboratories, draftKey])

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
  // already removed them from contract_prefilled_fields. `keepOthers` layers a
  // second source on top without that reset (see intake-prefill.ts).
  const applyContractPrefill = (
    patch: Partial<FormData>,
    prefilled: (keyof FormData)[],
    opts: PrefillOptions = {},
  ) => {
    setFormData(prev => mergePrefill(prev, patch, prefilled, initialFormData, opts))
    // The contract API auto-creates any exporters/importers it didn't find in
    // WAQC. Refresh the dropdown sources so the prefilled seller/shipper/importer
    // show up as selected instead of triggering the "not found" warning.
    loadExporters()
    loadImporters()
  }

  // A contract picked in Step 1 fills the form and moves on to Step 2, never
  // further (see wizard.ts): Step 2 is where the sample reference and the
  // shipper are checked, and its header names the contract.
  const linkContractFromSearch = (patch: Partial<FormData>, prefilled: (keyof FormData)[]) => {
    applyContractPrefill(patch, prefilled)
    setError(null)
    setCurrentStep(STEP_AFTER_CONTRACT_LINK)
  }

  // The Wolthers-contract field is a typeahead over the same sys register as
  // Step 1. The user typed the number; picking one of the offered matches links
  // that contract so the parties/quality/quantity prefill runs. The number the
  // mapper writes is the picked contract's own, which is what the field already
  // holds: an exact typed number auto-links only itself, and a clicked
  // suggestion set the field to its number before this ran.
  const handleSelectContractNumber = async (picked: { id: string; contract_number: string }) => {
    try {
      const res = await fetch(`/api/contracts/${picked.id}`)
      const body = await res.json()
      if (!res.ok) return
      const contract = body.contract as ContractWithParties
      const resolution = body.resolution as ContractResolution
      const { patch, prefilled } = mapContractToFormData(contract, resolution)
      applyContractPrefill(
        {
          ...patch,
          selected_contract: toSelectedContract(contract),
          contract_resolution: {
            seller_match_count: resolution.candidate_seller_exporter_ids.length,
            shipper_match_count: resolution.candidate_shipper_exporter_ids.length,
            multiple_seller_matches: resolution.multiple_seller_matches,
            multiple_shipper_matches: resolution.multiple_shipper_matches,
            importer_resolved: resolution.resolved_client_id !== null || resolution.resolved_importer_id !== null,
            quality_match: resolution.quality_match ?? null,
          },
        },
        [...prefilled, 'contract_resolution', 'selected_contract'],
      )
      void proposeContractFamily(contract)
    } catch {
      // A failed lookup must never disturb the typed number - the field keeps it.
    }
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
      // The family rows were proposed FROM this link; hand-added rows stay.
      next.contracts = prev.contracts.filter(c => c.proposed_from !== 'contract')
      return next
    })
  }

  // Proposed contract rows replace earlier proposals from the same source and
  // leave hand-added rows alone, so re-linking never doubles the list.
  const proposeContractRows = (source: 'pss' | 'contract', rows: SubContractFormData[]) => {
    setFormData(prev => ({
      ...prev,
      contracts: [...prev.contracts.filter(c => c.proposed_from !== source), ...rows],
    }))
  }

  // The linked contract's sys family — a same-parties split into separate
  // contracts (42089/26A/B/C, or a fresh-numbered sibling) — as proposed
  // contract rows for the user to confirm or remove in the contracts step. Each
  // member is loaded through the same route the typed number uses, so its row
  // is filled exactly as a picked contract would be. The Wolthers number IS
  // written here: it is the member's own, the row is marked as proposed, and
  // the user sees it before anything is saved — the 2026-09-10 rule exists so
  // that no number reaches a certificate unseen, not so that a contract the
  // system already knows has to be retyped.
  const proposeContractFamily = async (contract: ContractWithParties) => {
    const family = contract.family ?? []
    if (family.length === 0) {
      proposeContractRows('contract', [])
      return
    }
    const loaded = await Promise.all(
      family.map(async (member) => {
        try {
          const res = await fetch(`/api/contracts/${member.id}`)
          if (!res.ok) return null
          const body = await res.json()
          return { member, contract: body.contract as ContractWithParties, resolution: body.resolution as ContractResolution }
        } catch {
          return null
        }
      }),
    )
    setFormData(prev => {
      const rows: SubContractFormData[] = loaded
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .map(({ member, contract: c, resolution }) => ({
          ...createEmptyContract(prev),
          ...mapContractToSubContract(c, resolution),
          wolthers_contract_nr: contractDisplayNumber(member),
          proposed_from: 'contract' as const,
        }))
      return { ...prev, contracts: [...prev.contracts.filter(c => c.proposed_from !== 'contract'), ...rows] }
    })
  }

  // SS → PSS: the picker lists a PSS lab unit and each of its contract
  // siblings, and a sibling is a sample in its own right, so whichever row is
  // picked, linked_pss_sample_id names that exact sample. Its fields prefill
  // through the same tracking machinery as contracts: edits clear per field
  // and reselecting resets stale values.
  const handleSelectPss = async (value: string) => {
    const sel = resolvePssSelection(approvedPSSSamples, value)
    if (!sel) return
    updateFormData('linked_pss_sample_id', sel.sample.id)
    const base = mapPssToFormData(sel.sample)
    applyContractPrefill(base.patch, base.prefilled)

    // A PSS that covers several contracts is a lab unit plus siblings. Linking
    // the LAB UNIT means the SS covers the same contracts: propose one contract
    // row per sibling, each pointing at that sibling as its PSS, for the user
    // to confirm or remove in the contracts step. Picking a sibling names the
    // one contract the SS ships against, so nothing is proposed then.
    const siblings: any[] = Array.isArray(sel.sample.sub_contracts) ? sel.sample.sub_contracts : []
    proposeContractRows(
      'pss',
      !sel.sample.lab_source_sample_id
        ? siblings.filter((sc) => sc?.id).map((sc) => mapSiblingToContractRow(siblingAsSample(sel.sample, sc)))
        : [],
    )

    // The PSS's own sys contract IS the SS's contract: an SS ships against
    // the contract its PSS was approved for, so the link is taken from the PSS
    // row directly and never re-resolved by number. sys stores a split family
    // under ONE shared contract_number (42089/26A, /26B, /26C differ only by
    // split_suffix), so a lookup by number lands on the family, mother first,
    // and a bare-string check of "does the FK agree with the number" read a
    // correctly linked sub-contract as a mislink and dropped it (the bug of
    // 2026-09-21). The number the SS carries is the contract's own, printed as
    // sys prints it, so the link and the field agree at submit. Layered on top
    // with keepOthers: a plain prefill would reset the ICO, sample number and
    // quantity the PSS just filled; only the link and its number are taken,
    // never the contract's field patch — the PSS is the sample's truth, the
    // contract merely names it. A PSS whose stored number contradicts its own
    // link yields to the link; database/check_ss_pss_contract_links.sql lists
    // such PSS rows for repair. A failed lookup leaves the PSS's number as
    // typed-only, and the server still files the SS by the PSS's contract.
    const contractId = typeof sel.sample.contract_id === 'string' ? sel.sample.contract_id : null
    if (!contractId) return
    try {
      const res = await fetch(`/api/contracts/${contractId}`)
      if (!res.ok) return
      const body = await res.json()
      const contract = body.contract as ContractWithParties
      // The contract's own seller (Ecom) ref, when sys has one, over whatever
      // the PSS row carries: a PSS lab unit holds contract #1's ref, and an SS
      // on contract #2 printed it (prod 2026-09-23, 41914 / 41915).
      const sellerRef = contract.seller_reference?.trim() || null
      applyContractPrefill(
        {
          selected_contract: toSelectedContract(contract),
          wolthers_contract_nr: contractDisplayNumber(contract),
          ...(sellerRef ? { seller_contract_nr: sellerRef } : {}),
        },
        ['selected_contract', 'wolthers_contract_nr', ...(sellerRef ? (['seller_contract_nr'] as const) : [])],
        { keepOthers: true },
      )
    } catch {
      // See above: the PSS prefill stands on its own.
    }
  }

  // linked_pss_sample_id is cleared via a separate updateFormData call because
  // it is not tracked in contract_prefilled_fields, so applyContractPrefill({}, [])
  // alone would not reset it.
  const handleClearPss = () => {
    applyContractPrefill({}, [])
    updateFormData('linked_pss_sample_id', '')
    proposeContractRows('pss', [])
  }

  // Step-1 sample-type change: leaving SS clears any linked PSS + its prefill.
  const handleStep1TypeChange = (value: string) => {
    updateFormData('sample_type', value as FormData['sample_type'])
    if (value !== 'ss' && formData.linked_pss_sample_id) {
      handleClearPss()
    }
  }

  const isOther = !specialtyOnly && formData.sample_category === 'other'

  // What still blocks the current step (see ./intake/wizard). The footer
  // lists it beside the disabled button, so a long step says what is missing.
  const currentIssues = stepIssues(currentStep, formData, rules)

  // Layout-only state: the scrolling body (focus and jumps are found in it),
  // the footer's primary button, and a Step 2 section an Edit link asked for.
  const bodyRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const pendingSection = useRef<DetailsSection | null>(null)

  // Take the user to the field an issue names ("Still needed" list, or a
  // Continue pressed before the step is complete).
  const jumpToIssue = (issue: string) => {
    const field = issueField(issue)
    if (field) focusField(bodyRef.current, field)
  }

  const handleNext = () => {
    if (currentIssues.length === 0) {
      setError(null)
      setCurrentStep(nextStep)
    } else {
      setError(`Still needed: ${currentIssues.join(', ')}`)
      jumpToIssue(currentIssues[0])
    }
  }

  const handlePrevious = () => {
    setError(null)
    setCurrentStep(previousStep)
  }

  // Back to an earlier step (the stepper, or an Edit link on the review),
  // optionally to one section of Step 2. Never forward: steps are not skipped.
  const goToStep = (step: number, section?: DetailsSection) => {
    if (step > currentStep) return
    setError(null)
    pendingSection.current = section ?? null
    setCurrentStep(step)
  }

  // Each step opens at its top with the cursor in its first field; an Edit
  // link lands on its section instead.
  useEffect(() => {
    bodyRef.current?.scrollTo?.({ top: 0 })
    const frame = requestAnimationFrame(() => {
      const root = bodyRef.current
      const section = pendingSection.current
      pendingSection.current = null
      if (section) {
        const box = root?.querySelector<HTMLElement>(`[data-section="${section}"]`)
        box?.scrollIntoView?.({ block: 'start' })
        focusFirstField(box)
      } else if (currentStep === CONTRACT_STEP && formData.selected_contract) {
        primaryRef.current?.focus()
      } else {
        focusFirstField(root)
      }
    })
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep])

  // Step 1's two ways on: a PSS picked from the list (an SS), or No contract.
  const pickPssFromSearch = (value: string) => {
    void handleSelectPss(value)
    setError(null)
    setCurrentStep(STEP_AFTER_CONTRACT_LINK)
  }
  const continueWithoutContract = () => {
    setError(null)
    setCurrentStep(DETAILS_STEP)
  }

  // Enter in a text field continues on Steps 1 and 2. Controls with an Enter
  // of their own keep it: buttons and selects, an open typeahead, the contract
  // search and the sub-contract rows (`data-enter-scope`), and anything in a
  // portal (a create-company dialog opened from here). Never on the review
  // step: creating samples is always an explicit click.
  const handleWizardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.defaultPrevented || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.nativeEvent.isComposing) return
    if (currentStep === REVIEW_STEP) return
    const target = e.target as HTMLElement
    if (!(target instanceof HTMLInputElement) || !e.currentTarget.contains(target)) return
    if (['checkbox', 'radio', 'file', 'button', 'submit', 'reset'].includes(target.type)) return
    if (target.getAttribute('aria-expanded') === 'true' || target.closest('[data-enter-scope]')) return
    e.preventDefault()
    handleNext()
  }

  // Every photo comes through here (picked, dropped or taken); the size check is the form's.
  const handlePhotoFile = (file: File | null) => {
    if (file && file.size > 10 * 1024 * 1024) {
      setError('Photo file size must be less than 10MB')
      return
    }
    setError(null)
    updateFormData('photo_file', file)
  }

  // A hand-added contract carries the parent's sample nr and blank references
  // (see createEmptyContract); it never continues from the previous contract.
  // It is added on the first click, on the step the user is on: the old
  // review step's "+ Add Sub-Contracts" only moved to a separate contracts
  // step, so the first click never added one.
  const handleAddContract = () => {
    setFormData(prev => ({ ...prev, contracts: appendContract(prev) }))
  }

  const handleRemoveContract = (index: number) => {
    setFormData(prev => ({ ...prev, contracts: prev.contracts.filter((_, i) => i !== index) }))
  }

  const handleSubmit = async () => {
    console.log('[Sample Intake] handleSubmit called')

    // The details and the review must both be complete: every contract row
    // with a bag type resolves to a quantity within the bulk cap.
    const issues = submitIssues(formData, rules)
    if (issues.length > 0) {
      setError(`Still needed: ${issues.join(', ')}`)
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

      // The linked contract already names its parties by company id. Those ids
      // are used for every party whose field still reads as the contract's;
      // only a party the user renamed is looked up by name below. A seller the
      // exporter list does not carry (untagged on sys) used to fail that ilike
      // and leave seller_id null on the sample.
      const linkedIds = linkedPartyIds(formData)

      // 1. Seller lookup from exporters table by name (samples.seller_id references exporters.id)
      // Use case-insensitive matching to handle variations in casing
      if (formData.seller && !linkedIds.seller_id) {
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
      if (!formData.same_seller_shipper && formData.shipper && !linkedIds.exporter_id) {
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
      if (formData.importer && !linkedIds.importer_id) {
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

      // Extract resolved IDs — the link's where it still applies, else the lookup's
      const seller_id = linkedIds.seller_id ?? lookupResults['seller']
      // When same_seller_shipper is true, use seller_id as exporter_id
      const exporter_id = formData.same_seller_shipper ? seller_id : (linkedIds.exporter_id ?? lookupResults['shipper'])
      // Always use importer_id from importers table lookup (even when importer=QC client)
      const importer_id = linkedIds.importer_id ?? lookupResults['importer']
      const roaster_id = lookupResults['roaster']
      const end_client_id = lookupResults['end_client']

      // QC Client: use fantasy_name lookup, fallback to form's client_id
      let qc_client_id = lookupResults['qc_client_fantasy'] || formData.client_id || undefined

      // Contracts #2..N ride along on the POST as ContractInput rows and the
      // server creates them as siblings of the lab unit in the same request,
      // so a browser that drops after the sample is created cannot leave the
      // contracts behind. Their counterparties are resolved here, client-side,
      // exactly as the mother's were above.
      const contractInputs = await Promise.all(formData.contracts.map(resolveContractInput))

      // Boxes × bags per box resolve to the stored columns in one place
      // (quantity-model); the server re-derives bulk from containers + MT to
      // the same row.
      const motherQuantity = contractQuantities(formData)

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
        // The linked contract goes up only while the typed number still reads
        // as its number: sys resolves contract_id before the number, so a link
        // left behind by a corrected number would file the sample elsewhere.
        contract_id:
          formData.selected_contract &&
          !isStaleContractLink(
            formData.wolthers_contract_nr,
            formData.selected_contract.contract_number,
            formData.selected_contract.split_suffix,
          )
            ? formData.selected_contract.id
            : undefined,
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
        bags_quantity_mt: motherQuantity.bags_quantity_mt ?? undefined,
        bag_count: motherQuantity.bag_count ?? undefined,
        bag_weight_kg: motherQuantity.bag_weight_kg ?? undefined,
        container_count: motherQuantity.container_count ?? undefined,
        container_size: motherQuantity.container_size ?? undefined,
        equivalent_60kg_bags: motherQuantity.equivalent_60kg_bags ?? undefined,
        bag_liner: motherQuantity.bag_liner ?? undefined,
        bag_type: formData.bag_type || undefined,
        shipment_month: formData.shipment_month || undefined,
        contracts: contractInputs.length > 0 ? contractInputs : undefined,
        status: 'received',
        workflow_stage: 'received',
        sample_category: specialtyOnly ? 'qc' : formData.sample_category,
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

      // The lab unit exists even when a contract could not become a sibling
      // (or got no certificate): the server reports those per input instead
      // of failing the POST. Say which, numbered as on the form, so the user
      // adds them from the sample overlay rather than registering the coffee twice.
      const failedSiblings: Array<{ index: number; error: string }> = result.siblings?.failed ?? []
      if (failedSiblings.length > 0) {
        toast.warning(
          `Sample created, but ${failedSiblings.length} contract${failedSiblings.length === 1 ? '' : 's'} could not be added`,
          {
            description: failedSiblings.map(f => `Contract #${f.index + 2}: ${f.error}`).join('\n'),
            duration: 12000,
          },
        )
      }

      localStorage.removeItem(draftKey)

      // The specialty intake has no success screen (it would print the lab
      // number): it starts clean for the next lot and the host shows the new one.
      if (specialtyOnly) {
        resetForm()
        onSuccess?.(result.sample.tracking_number, createdSampleId)
        return
      }

      setCreatedSamples([result.sample, ...(result.siblings?.created ?? [])])
      setSuccess(true)

      if (onSuccess) {
        onSuccess(result.sample.tracking_number, createdSampleId)
      }

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
    setCreatedSamples([])
    setApprovedPSSSamples([])
    localStorage.removeItem(draftKey)
  }

  if (success) {
    return <SuccessView samples={createdSamples} onReset={resetForm} asDialog={asDialog} />
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
    specialtyQualityIds: specialtyOnly ? specialtyQualityIds : undefined,
    onSpecialtyQualities: specialtyOnly ? addSpecialtyQualities : undefined,
    onSelectContractNumber: handleSelectContractNumber,
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
    return (
      <FormWrapper data-intake-wizard className={asDialog ? 'flex flex-col flex-auto min-h-0' : 'w-fit'}>
        <HeaderWrapper className={asDialog ? 'mb-4 flex-shrink-0' : ''}>
          <div className="flex min-h-8 flex-wrap items-center gap-3 pr-8">
            <h2 className="text-lg font-semibold">New Sample</h2>
            <SegmentedControl
              size="sm"
              ariaLabel="Sample category"
              value={formData.sample_category}
              options={[{ value: 'qc', label: 'QC Sample' }, { value: 'other', label: 'Other Sample' }]}
              onChange={(cat) => updateFormData('sample_category', cat)}
              className="ml-auto"
            />
          </div>
        </HeaderWrapper>
        <ContentWrapper className={asDialog ? 'flex-auto min-h-0 flex flex-col' : 'flex flex-col h-full'}>
          <OtherSampleIntake asDialog={asDialog} onSaved={() => onSuccess?.('')} />
        </ContentWrapper>
      </FormWrapper>
    )
  }

  const contract = formData.selected_contract
  const linkedPss = formData.linked_pss_sample_id
    ? resolvePssSelection(approvedPSSSamples, formData.linked_pss_sample_id)?.sample
    : null
  const quantity = contractQuantities(formData)
  const compact = currentStep === CONTRACT_STEP
  // The link as the header names it on Steps 2 and 3: the confirmation of a
  // pick, the way New Inquiry names the contact it was opened for.
  const linkFacts = contract
    ? [contract.buyer_name, formData.importer_contract_nr || null, contract.quality_description].filter(Boolean).join(' · ')
    : ''

  return (
    <FormWrapper
      data-intake-wizard
      data-intake-compact={compact ? '' : undefined}
      onKeyDown={handleWizardKeyDown}
      className={asDialog ? 'flex h-full min-h-0 flex-col' : 'w-full'}
    >
      <HeaderWrapper className={cn('flex-shrink-0 space-y-3', asDialog && 'pb-4')}>
        <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 pr-8">
          <h2 className="text-lg font-semibold">{specialtyOnly ? 'New specialty sample' : 'New Sample'}</h2>
          {compact ? (specialtyOnly ? null : (
            <SegmentedControl
              size="sm"
              ariaLabel="Sample category"
              value={formData.sample_category}
              options={[{ value: 'qc', label: 'QC Sample' }, { value: 'other', label: 'Other Sample' }]}
              onChange={(cat) => updateFormData('sample_category', cat)}
              className="ml-auto"
            />
          )) : (contract || linkedPss) ? (
            <p className="flex min-w-0 items-baseline gap-2 text-sm" data-testid="linked-header">
              <span className="font-mono font-semibold">
                {linkedPss ? `PSS #${pssOfficialRef(linkedPss) || linkedPss.tracking_number}` : `#${contractDisplayNumber(contract!)}`}
              </span>
              {contract && (
                <span className="min-w-0 truncate text-muted-foreground">
                  {linkedPss ? `contract #${contractDisplayNumber(contract)} · ` : ''}{linkFacts}
                </span>
              )}
              <Button type="button" variant="ghost" onClick={() => goToStep(CONTRACT_STEP)} className="h-7 flex-shrink-0 px-2 text-xs">
                Change
              </Button>
            </p>
          ) : (
            <span className="text-sm text-muted-foreground">No contract</span>
          )}
        </div>
        <WizardStepper steps={QC_STEPS} current={currentStep} onGoTo={(step) => goToStep(step)} />
      </HeaderWrapper>

      <ContentWrapper className={asDialog ? 'flex min-h-0 flex-auto flex-col' : 'flex flex-col'}>
        {/* Step 1's contract box sits at the body's edge: 4px of room (pulled
            back by the negative margin) keeps its focus ring from being clipped. */}
        <div ref={bodyRef} className={cn('min-h-0 flex-auto overflow-y-auto', compact ? '-mx-1 px-1' : 'border-t')}>
          <div className={cn('mx-auto w-full', compact ? 'pb-2' : 'py-5')}>
            {error && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {currentStep === CONTRACT_STEP && (
              <ContractStep
                formData={formData}
                approvedPSSSamples={approvedPSSSamples}
                onTypeChange={handleStep1TypeChange}
                onSelectPss={pickPssFromSearch}
                onClearPss={handleClearPss}
                applyContract={linkContractFromSearch}
                unlinkContract={unlinkContract}
                onLinked={proposeContractFamily}
                onNoContract={continueWithoutContract}
              />
            )}

            {currentStep === DETAILS_STEP && <SampleFieldsStep {...stepProps} />}

            {currentStep === REVIEW_STEP && (
              <ReviewStep
                {...stepProps}
                onPhoto={handlePhotoFile}
                onAddContract={handleAddContract}
                onRemoveContract={handleRemoveContract}
                onEdit={goToStep}
              />
            )}
          </div>
        </div>

        {/* Pinned footer (button rules 3 and 4). Steps 2 and 3: the link,
            the live quantity and what is missing on the left; Back, then
            the one filled button, on the right. Step 1: Cancel and Continue,
            as in New Inquiry. */}
        <div className={cn('flex flex-shrink-0 items-center gap-3 border-t bg-background pt-4', compact && 'mt-4')}>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {/* Lab and origin only when there is a choice (or a gap); with
                one lab and one origin they fill themselves. */}
            {!compact && (
              <LabOriginPickers formData={formData} updateFormData={updateFormData} laboratories={laboratories} />
            )}
            {!compact && (
              <span className="tabular-nums" aria-live="polite">
                <span className="font-semibold text-foreground" data-testid="quantity-equivalent">
                  {quantity.equivalent_60kg_bags != null ? `${quantity.equivalent_60kg_bags} bags` : '—'}
                </span>
                {' · '}
                <span className="font-semibold text-foreground" data-testid="quantity-mt">
                  {quantity.bags_quantity_mt != null ? `${Number(quantity.bags_quantity_mt.toFixed(3))} MT` : '—'}
                </span>
                {formData.contracts.length > 0 && ` · ${formData.contracts.length + 1} contracts`}
              </span>
            )}
            {!compact && (currentIssues.length > 0 ? (
              <button
                type="button"
                onClick={() => jumpToIssue(currentIssues[0])}
                className="min-w-0 max-w-[60ch] truncate rounded-sm text-left hover:text-foreground hover:underline"
                title={currentIssues.join('\n')}
                data-testid="step-issues"
              >
                Still needed: {currentIssues.join(', ')}
              </button>
            ) : (
              <span className="text-[#22c55e]">Everything needed is filled in</span>
            ))}
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {compact && onCancel && (
              <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {!compact && (
              <Button type="button" variant="outline" size="sm" onClick={handlePrevious} aria-label="Back">
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            )}
            {currentStep < REVIEW_STEP ? (
              <Button
                ref={primaryRef}
                type="button"
                size="sm"
                onClick={handleNext}
                disabled={compact && !contract && !formData.linked_pss_sample_id}
                title={compact && !contract && !formData.linked_pss_sample_id ? 'Pick a contract, or use No contract' : undefined}
              >
                Continue
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button ref={primaryRef} type="button" size="sm" onClick={handleSubmit} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading
                  ? 'Creating...'
                  : formData.contracts.length > 0
                    ? `Create ${formData.contracts.length + 1} samples`
                    : 'Create sample'}
              </Button>
            )}
          </div>
        </div>
      </ContentWrapper>
    </FormWrapper>
  )
}
