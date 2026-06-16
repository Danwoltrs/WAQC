'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Trash2, Download, Loader2, FileText, Save, ChevronDown, ChevronRight } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { certificateFilenameFromResponse } from '@/lib/certificate-filename'
import { computeBagQuantities, bulkQuantitiesFromMt, approxBulkContainers } from '@/lib/bag-quantity'

const BAG_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'jute_bag', label: 'Jute bag' },
  { value: 'pp_bag', label: 'PP bag' },
  { value: 'big_bag', label: 'Big bag' },
  { value: 'bulk', label: 'Bulk' },
]

// Weights that don't depend on origin; jute/pp are left for the user to set.
const FIXED_BAG_WEIGHTS: Record<string, string> = { big_bag: '1000', bulk: '21600' }

interface Contract {
  id: string
  tracking_number: string
  importer_name: string | null
  roaster_name: string | null
  end_client_name: string | null
  qc_client_name: string | null
  importer_is_qc_client: boolean | null
  wolthers_contract_nr: string | null
  buyer_contract_nr: string | null
  roaster_contract_nr: string | null
  qc_client_contract_nr: string | null
  end_client_contract_nr: string | null
  supplier_contract_nr: string | null
  ico_number: string | null
  container_nr: string | null
  importer_id: string | null
  roaster_id: string | null
  end_client_id: string | null
  client_id: string | null
  sort_order: number
  bag_count?: number | null
  bag_weight_kg?: number | null
  bag_type?: string | null
  bags_quantity_mt?: number | null
  equivalent_60kg_bags?: number | null
}

interface EditForm {
  importer_name: string
  importer_is_qc_client: boolean
  roaster_name: string
  end_client_name: string
  qc_client_name: string
  wolthers_contract_nr: string
  buyer_contract_nr: string
  roaster_contract_nr: string
  qc_client_contract_nr: string
  end_client_contract_nr: string
  supplier_contract_nr: string
  ico_number: string
  container_nr: string
  bag_type: string
  bag_count: string
  bag_weight_kg: string
  bags_quantity_mt: string
}

const emptyForm: EditForm = {
  importer_name: '',
  importer_is_qc_client: true,
  roaster_name: '',
  end_client_name: '',
  qc_client_name: '',
  wolthers_contract_nr: '',
  buyer_contract_nr: '',
  roaster_contract_nr: '',
  qc_client_contract_nr: '',
  end_client_contract_nr: '',
  supplier_contract_nr: '',
  ico_number: '',
  container_nr: '',
  bag_type: '',
  bag_count: '',
  bag_weight_kg: '',
  bags_quantity_mt: '',
}

export interface MotherSampleInfo {
  tracking_number: string
  sample_type?: string
  importer_name?: string | null
  importer_is_qc_client?: boolean
  roaster_name?: string | null
  end_client_name?: string | null
  qc_client_name?: string | null
  wolthers_contract_nr?: string | null
  buyer_contract_nr?: string | null
  roaster_contract_nr?: string | null
  qc_client_contract_nr?: string | null
  end_client_contract_nr?: string | null
  supplier_contract_nr?: string | null
  ico_number?: string | null
  container_nr?: string | null
  bag_type?: string | null
  bag_count?: number | null
  bag_weight_kg?: number | null
  bags_quantity_mt?: number | null
}

interface SampleContractsSectionProps {
  sampleId: string
  isEditMode: boolean
  motherSample?: MotherSampleInfo
}

export function SampleContractsSection({ sampleId, isEditMode, motherSample }: SampleContractsSectionProps) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [contractToDelete, setContractToDelete] = useState<Contract | null>(null)

  // Per-contract edit forms (keyed by contract ID)
  const [editForms, setEditForms] = useState<Record<string, EditForm>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [showOptionalFields, setShowOptionalFields] = useState<Record<string, boolean>>({})

  // "Adding new" state
  const [addingNew, setAddingNew] = useState(false)
  const [newForm, setNewForm] = useState<EditForm>(emptyForm)
  const [newShowOptional, setNewShowOptional] = useState(false)

  // Entity options for dropdowns
  const [importers, setImporters] = useState<Array<{ id: string; name: string }>>([])
  const [roasters, setRoasters] = useState<Array<{ id: string; name: string }>>([])
  const [qcClients, setQcClients] = useState<Array<{ id: string; name: string }>>([])

  const isPSS = motherSample?.sample_type === 'pss'
  const motherHasRoaster = !!motherSample?.roaster_name
  const motherHasEndClient = !!motherSample?.end_client_name

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const loadContracts = useCallback(async () => {
    try {
      const response = await fetch(`/api/samples/${sampleId}/contracts`)
      if (response.ok) {
        const data = await response.json()
        const loaded = data.contracts || []
        setContracts(loaded)
        // Initialize edit forms from loaded contracts
        const forms: Record<string, EditForm> = {}
        const optionals: Record<string, boolean> = {}
        for (const c of loaded) {
          forms[c.id] = contractToForm(c)
          optionals[c.id] = !!(c.roaster_name || c.end_client_name)
        }
        setEditForms(forms)
        setShowOptionalFields(optionals)
      }
    } catch (err) {
      console.error('Error loading contracts:', err)
    } finally {
      setLoading(false)
    }
  }, [sampleId])

  const loadEntityOptions = useCallback(async () => {
    const [importerRes, roasterRes, clientRes] = await Promise.all([
      (supabase as any).from('companies').select('id, name').filter('trading_roles', 'cs', '["buyer"]').order('name'),
      (supabase as any).from('companies').select('id, name').contains('company_types', ['roaster']).order('name'),
      (supabase as any).from('companies').select('id, fantasy_name, name').eq('is_qc_client', true).order('fantasy_name'),
    ])

    const dedup = (items: Array<{ id: string; name: string | null }>) => {
      const seen = new Set<string>()
      return items.filter(i => {
        if (!i.name || seen.has(i.name)) return false
        seen.add(i.name)
        return true
      }) as Array<{ id: string; name: string }>
    }

    setImporters(dedup((importerRes.data || []).map((i: any) => ({ id: i.id, name: i.name }))))
    setRoasters(dedup((roasterRes.data || []).map((r: any) => ({ id: r.id, name: r.name }))))
    setQcClients((clientRes.data || []).map((c: any) => ({
      id: c.id,
      name: (c.fantasy_name || c.name) as string
    })))
  }, [supabase])

  useEffect(() => {
    loadContracts()
    loadEntityOptions()
  }, [loadContracts, loadEntityOptions])

  const resolveEntityId = (name: string, list: Array<{ id: string; name: string }>): string | null => {
    if (!name) return null
    const match = list.find(e => e.name.toLowerCase() === name.toLowerCase())
    return match?.id || null
  }

  const contractToForm = (c: Contract): EditForm => ({
    importer_name: c.importer_name || '',
    importer_is_qc_client: c.importer_is_qc_client ?? true,
    roaster_name: c.roaster_name || '',
    end_client_name: c.end_client_name || '',
    qc_client_name: c.qc_client_name || '',
    wolthers_contract_nr: c.wolthers_contract_nr || '',
    buyer_contract_nr: c.buyer_contract_nr || '',
    roaster_contract_nr: c.roaster_contract_nr || '',
    qc_client_contract_nr: c.qc_client_contract_nr || '',
    end_client_contract_nr: c.end_client_contract_nr || '',
    supplier_contract_nr: c.supplier_contract_nr || '',
    ico_number: c.ico_number || '',
    container_nr: c.container_nr || '',
    bag_type: c.bag_type || '',
    bag_count: c.bag_count != null ? String(c.bag_count) : '',
    bag_weight_kg: c.bag_weight_kg != null ? String(c.bag_weight_kg) : '',
    bags_quantity_mt: c.bags_quantity_mt != null ? String(c.bags_quantity_mt) : '',
  })

  const buildMotherForm = (): EditForm => {
    if (!motherSample) return emptyForm
    return {
      importer_name: motherSample.importer_name || '',
      importer_is_qc_client: motherSample.importer_is_qc_client ?? true,
      roaster_name: motherSample.roaster_name || '',
      end_client_name: motherSample.end_client_name || '',
      qc_client_name: motherSample.qc_client_name || '',
      wolthers_contract_nr: motherSample.wolthers_contract_nr || '',
      buyer_contract_nr: motherSample.buyer_contract_nr || '',
      roaster_contract_nr: motherSample.roaster_contract_nr || '',
      qc_client_contract_nr: motherSample.qc_client_contract_nr || '',
      end_client_contract_nr: motherSample.end_client_contract_nr || '',
      supplier_contract_nr: motherSample.supplier_contract_nr || '',
      ico_number: motherSample.ico_number || '',
      container_nr: motherSample.container_nr || '',
      bag_type: motherSample.bag_type || '',
      bag_count: motherSample.bag_count != null ? String(motherSample.bag_count) : '',
      bag_weight_kg: motherSample.bag_weight_kg != null ? String(motherSample.bag_weight_kg) : '',
      bags_quantity_mt: motherSample.bags_quantity_mt != null ? String(motherSample.bags_quantity_mt) : '',
    }
  }

  const handleAddNew = () => {
    setNewForm(buildMotherForm())
    setNewShowOptional(motherHasRoaster || motherHasEndClient)
    setAddingNew(true)
  }

  const handleSaveNew = async () => {
    setSavingId('new')
    try {
      const payload = formToPayload(newForm)
      const response = await fetch(`/api/samples/${sampleId}/contracts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (response.ok) {
        setAddingNew(false)
        await loadContracts()
      } else {
        const err = await response.json()
        console.error('Error saving contract:', err)
      }
    } catch (err) {
      console.error('Error saving contract:', err)
    } finally {
      setSavingId(null)
    }
  }

  const handleSaveExisting = async (contractId: string) => {
    const form = editForms[contractId]
    if (!form) return
    setSavingId(contractId)
    try {
      const payload = formToPayload(form)
      const response = await fetch(
        `/api/samples/${sampleId}/contracts?contract_id=${contractId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      if (response.ok) {
        await loadContracts()
      } else {
        const err = await response.json()
        console.error('Error saving contract:', err)
      }
    } catch (err) {
      console.error('Error saving contract:', err)
    } finally {
      setSavingId(null)
    }
  }

  const formToPayload = (form: EditForm) => {
    const importerId = resolveEntityId(form.importer_name, importers)
    const roasterId = resolveEntityId(form.roaster_name, roasters)
    const endClientId = resolveEntityId(form.end_client_name, qcClients)
    // Bulk is weight-driven (net MT is the source of truth, container density
    // varies); everything else is bags-driven.
    let bagCount = form.bag_count ? parseInt(form.bag_count) : null
    let bagWeight = form.bag_weight_kg ? parseFloat(form.bag_weight_kg) : null
    let bags_quantity_mt: number | null
    let equivalent_60kg_bags: number | null
    if (form.bag_type === 'bulk') {
      const mt = form.bags_quantity_mt ? parseFloat(form.bags_quantity_mt) : null
      ;({ bags_quantity_mt, equivalent_60kg_bags } = bulkQuantitiesFromMt(mt))
      bagWeight = 21600
      bagCount = equivalent_60kg_bags // keep bag_count = equivalent for display continuity
    } else {
      ;({ bags_quantity_mt, equivalent_60kg_bags } = computeBagQuantities(bagCount, bagWeight, form.bag_type))
    }
    return {
      importer_id: importerId,
      importer_is_qc_client: form.importer_is_qc_client,
      roaster_id: roasterId,
      end_client_id: endClientId,
      wolthers_contract_nr: form.wolthers_contract_nr || null,
      buyer_contract_nr: form.buyer_contract_nr || null,
      roaster_contract_nr: form.roaster_contract_nr || null,
      qc_client_contract_nr: form.qc_client_contract_nr || null,
      end_client_contract_nr: form.end_client_contract_nr || null,
      supplier_contract_nr: form.supplier_contract_nr || null,
      ico_number: form.ico_number || null,
      container_nr: form.container_nr || null,
      bag_type: form.bag_type || null,
      bag_count: bagCount,
      bag_weight_kg: bagWeight,
      bags_quantity_mt,
      equivalent_60kg_bags,
    }
  }

  const handleDeleteContract = async () => {
    if (!contractToDelete) return
    setDeletingId(contractToDelete.id)
    try {
      const response = await fetch(
        `/api/samples/${sampleId}/contracts?contract_id=${contractToDelete.id}`,
        { method: 'DELETE' }
      )
      if (response.ok) {
        setContracts(prev => prev.filter(c => c.id !== contractToDelete.id))
        setEditForms(prev => {
          const copy = { ...prev }
          delete copy[contractToDelete.id]
          return copy
        })
      }
    } catch (err) {
      console.error('Error deleting contract:', err)
    } finally {
      setDeletingId(null)
      setShowDeleteDialog(false)
      setContractToDelete(null)
    }
  }

  const handleDownloadCertificate = async (contractId: string) => {
    setDownloadingId(contractId)
    try {
      const response = await fetch(`/api/samples/${sampleId}/certificate?contract_id=${contractId}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const contract = contracts.find(c => c.id === contractId)
        // Use the server's filename (official cert number + buyer reference).
        a.download = certificateFilenameFromResponse(response, contract?.tracking_number, contract?.buyer_contract_nr)
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Error downloading certificate:', err)
    } finally {
      setDownloadingId(null)
    }
  }

  const updateEditForm = (contractId: string, updater: (f: EditForm) => EditForm) => {
    setEditForms(prev => ({
      ...prev,
      [contractId]: updater(prev[contractId] || emptyForm)
    }))
  }

  // Helper to get display name for accordion header
  const getContractLabel = (c: Contract) => {
    return c.importer_name || c.qc_client_name || c.tracking_number
  }

  const getContractRef = (c: Contract) => {
    return c.buyer_contract_nr || c.wolthers_contract_nr || null
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contracts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Loading...
          </div>
        </CardContent>
      </Card>
    )
  }

  const totalContracts = 1 + contracts.length // mother + sub-contracts

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              Contracts
              <Badge variant="secondary" className="text-xs">{totalContracts}</Badge>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleAddNew}
              disabled={addingNew}
            >
              <Plus className="h-3 w-3" />
              Add Sub-Contract
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Accordion
            type="multiple"
            defaultValue={['mother']}
            className="w-full"
          >
            {/* Mother Contract (read-only) */}
            {motherSample && (
              <AccordionItem value="mother" className="border rounded-lg mb-2 px-3">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex items-center gap-3 text-sm">
                    <Badge variant="outline" className="text-[10px] font-normal shrink-0">1</Badge>
                    <span className="font-medium">{motherSample.importer_name || motherSample.qc_client_name || motherSample.tracking_number}</span>
                    {(motherSample.buyer_contract_nr || motherSample.wolthers_contract_nr) && (
                      <span className="text-muted-foreground text-xs">
                        ({motherSample.buyer_contract_nr || motherSample.wolthers_contract_nr})
                      </span>
                    )}
                    {motherSample.bags_quantity_mt != null && motherSample.bags_quantity_mt > 0 && (
                      <span className="text-muted-foreground text-xs ml-auto mr-2">
                        {motherSample.bags_quantity_mt} MT
                      </span>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs pb-1">
                    <span className="text-muted-foreground">Tracking Number</span>
                    <span className="font-mono">{motherSample.tracking_number}</span>
                    {motherSample.importer_name && (
                      <>
                        <span className="text-muted-foreground">Importer</span>
                        <span>{motherSample.importer_name}</span>
                      </>
                    )}
                    {motherSample.roaster_name && (
                      <>
                        <span className="text-muted-foreground">Roaster</span>
                        <span>{motherSample.roaster_name}</span>
                      </>
                    )}
                    {motherSample.end_client_name && (
                      <>
                        <span className="text-muted-foreground">End Client</span>
                        <span>{motherSample.end_client_name}</span>
                      </>
                    )}
                    {motherSample.qc_client_name && !motherSample.importer_is_qc_client && (
                      <>
                        <span className="text-muted-foreground">QC Client</span>
                        <span>{motherSample.qc_client_name}</span>
                      </>
                    )}
                    {motherSample.wolthers_contract_nr && (
                      <>
                        <span className="text-muted-foreground">Wolthers Contract</span>
                        <span>{motherSample.wolthers_contract_nr}</span>
                      </>
                    )}
                    {motherSample.buyer_contract_nr && (
                      <>
                        <span className="text-muted-foreground">Buyer Contract</span>
                        <span>{motherSample.buyer_contract_nr}</span>
                      </>
                    )}
                    {motherSample.roaster_contract_nr && (
                      <>
                        <span className="text-muted-foreground">Roaster Contract</span>
                        <span>{motherSample.roaster_contract_nr}</span>
                      </>
                    )}
                    {!isPSS && motherSample.ico_number && (
                      <>
                        <span className="text-muted-foreground">ICO Number</span>
                        <span>{motherSample.ico_number}</span>
                      </>
                    )}
                    {!isPSS && motherSample.container_nr && (
                      <>
                        <span className="text-muted-foreground">Container Nr.</span>
                        <span>{motherSample.container_nr}</span>
                      </>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Sub-Contracts (editable accordions) */}
            {contracts.map((contract, idx) => (
              <AccordionItem
                key={contract.id}
                value={contract.id}
                className="border rounded-lg mb-2 px-3"
              >
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex items-center gap-3 text-sm w-full">
                    <Badge variant="outline" className="text-[10px] font-normal shrink-0">
                      {(motherSample ? 2 : 1) + idx}
                    </Badge>
                    <span className="font-medium">{getContractLabel(contract)}</span>
                    {getContractRef(contract) && (
                      <span className="text-muted-foreground text-xs">
                        ({getContractRef(contract)})
                      </span>
                    )}
                    {contract.bags_quantity_mt != null && contract.bags_quantity_mt > 0 && (
                      <span className="text-muted-foreground text-xs ml-auto mr-2">
                        {contract.bags_quantity_mt} MT
                      </span>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ContractForm
                    form={editForms[contract.id] || contractToForm(contract)}
                    setForm={(updater) => updateEditForm(contract.id, updater)}
                    importers={importers}
                    roasters={roasters}
                    qcClients={qcClients}
                    isPSS={isPSS}
                    motherHasRoaster={motherHasRoaster}
                    motherHasEndClient={motherHasEndClient}
                    showOptional={showOptionalFields[contract.id] ?? false}
                    setShowOptional={(v) => setShowOptionalFields(prev => ({ ...prev, [contract.id]: v }))}
                    isNew={false}
                  />
                  <div className="flex items-center justify-between pt-3 border-t mt-3">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                      {contract.tracking_number}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          setContractToDelete(contract)
                          setShowDeleteDialog(true)
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDownloadCertificate(contract.id)
                        }}
                        disabled={downloadingId === contract.id}
                      >
                        {downloadingId === contract.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Download className="h-3 w-3" />
                        }
                        Certificate
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSaveExisting(contract.id)
                        }}
                        disabled={savingId === contract.id}
                      >
                        {savingId === contract.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Save className="h-3 w-3" />
                        }
                        Save
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}

            {/* New Sub-Contract (inline form) */}
            {addingNew && (
              <AccordionItem value="new" className="border border-dashed rounded-lg mb-2 px-3">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex items-center gap-3 text-sm">
                    <Badge variant="outline" className="text-[10px] font-normal shrink-0">
                      {totalContracts + 1}
                    </Badge>
                    <span className="font-medium text-muted-foreground">New Sub-Contract</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ContractForm
                    form={newForm}
                    setForm={(updater) => setNewForm(updater)}
                    importers={importers}
                    roasters={roasters}
                    qcClients={qcClients}
                    isPSS={isPSS}
                    motherHasRoaster={motherHasRoaster}
                    motherHasEndClient={motherHasEndClient}
                    showOptional={newShowOptional}
                    setShowOptional={setNewShowOptional}
                    isNew={true}
                  />
                  <div className="flex items-center justify-end gap-2 pt-3 border-t mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setAddingNew(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={handleSaveNew}
                      disabled={savingId === 'new'}
                    >
                      {savingId === 'new'
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Plus className="h-3 w-3" />
                      }
                      Create Sub-Contract
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>

          {contracts.length === 0 && !addingNew && (
            <p className="text-xs text-muted-foreground text-center py-2">
              No sub-contracts yet. Click &ldquo;Add Sub-Contract&rdquo; to create one.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sub-Contract</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete sub-contract {contractToDelete?.tracking_number}?
              This will also delete its certificate. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDeleteContract}
              disabled={!!deletingId}
            >
              {deletingId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================================
// Shared inline form for editing a sub-contract
// ============================================================
function ContractForm({
  form,
  setForm,
  importers,
  roasters,
  qcClients,
  isPSS,
  motherHasRoaster,
  motherHasEndClient,
  showOptional,
  setShowOptional,
  isNew,
}: {
  form: EditForm
  setForm: (updater: (f: EditForm) => EditForm) => void
  importers: Array<{ id: string; name: string }>
  roasters: Array<{ id: string; name: string }>
  qcClients: Array<{ id: string; name: string }>
  isPSS: boolean
  motherHasRoaster: boolean
  motherHasEndClient: boolean
  showOptional: boolean
  setShowOptional: (v: boolean) => void
  isNew: boolean
}) {
  const mergedImporterOptions = useMemo(() => {
    if (form.importer_is_qc_client) {
      const clientOptions = qcClients.map(c => c.name)
      const importerNames = importers.map(i => i.name)
      const seen = new Set<string>()
      return [...clientOptions, ...importerNames]
        .filter(name => {
          const key = name.toLowerCase()
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .sort((a, b) => a.localeCompare(b))
    }
    return importers.map(i => i.name).sort((a, b) => a.localeCompare(b))
  }, [form.importer_is_qc_client, qcClients, importers])

  const roasterOptions = useMemo(() => {
    return roasters.map(r => r.name).sort((a, b) => a.localeCompare(b))
  }, [roasters])

  const endClientOptions = useMemo(() => {
    return qcClients.map(c => c.name).sort((a, b) => a.localeCompare(b))
  }, [qcClients])

  const isBulk = form.bag_type === 'bulk'
  const qty = isBulk
    ? bulkQuantitiesFromMt(form.bags_quantity_mt ? parseFloat(form.bags_quantity_mt) : null)
    : computeBagQuantities(
        form.bag_count ? parseInt(form.bag_count) : null,
        form.bag_weight_kg ? parseFloat(form.bag_weight_kg) : null,
        form.bag_type,
      )

  return (
    <div className="space-y-4">
      {/* Supply Chain */}
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2 block">Supply Chain</Label>
        <div className="space-y-3">
          {/* Importer */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Label className="text-xs text-muted-foreground">Importer</Label>
                <div className="flex items-center gap-1">
                  <Checkbox
                    checked={form.importer_is_qc_client}
                    onCheckedChange={(checked) =>
                      setForm(f => ({ ...f, importer_is_qc_client: checked as boolean }))
                    }
                    className="h-3 w-3"
                    disabled
                  />
                  <Label className="text-[10px] cursor-pointer text-muted-foreground">=QC Client</Label>
                </div>
              </div>
              <Select
                value={form.importer_name || 'none'}
                onValueChange={(value) =>
                  setForm(f => ({ ...f, importer_name: value === 'none' ? '' : value }))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select importer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select...</SelectItem>
                  {mergedImporterOptions.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Buyer Contract</Label>
              <Input
                value={form.buyer_contract_nr}
                onChange={(e) => setForm(f => ({ ...f, buyer_contract_nr: e.target.value }))}
                placeholder="Contract ref."
                className="h-9"
              />
            </div>
          </div>

          {/* QC Client (when not same as importer) */}
          {!form.importer_is_qc_client && (
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">QC Client</Label>
                <Select
                  value={form.qc_client_name || 'none'}
                  onValueChange={(value) =>
                    setForm(f => ({ ...f, qc_client_name: value === 'none' ? '' : value }))
                  }
                  disabled
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select QC client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select...</SelectItem>
                    {endClientOptions.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">QC Client Contract</Label>
                <Input
                  value={form.qc_client_contract_nr}
                  onChange={(e) => setForm(f => ({ ...f, qc_client_contract_nr: e.target.value }))}
                  placeholder="Contract ref."
                  className="h-9"
                />
              </div>
            </div>
          )}

          {/* Roaster & End Client — collapsible when mother didn't have them */}
          {(!motherHasRoaster && !motherHasEndClient) ? (
            <>
              <button
                type="button"
                onClick={() => setShowOptional(!showOptional)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showOptional
                  ? <ChevronDown className="h-3 w-3" />
                  : <ChevronRight className="h-3 w-3" />
                }
                Roaster & End Client
                <span className="text-[10px] opacity-60">(optional)</span>
              </button>
              {showOptional && (
                <>
                  <RoasterField form={form} setForm={setForm} roasterOptions={roasterOptions} />
                  <EndClientField form={form} setForm={setForm} endClientOptions={endClientOptions} />
                </>
              )}
            </>
          ) : (
            <>
              <RoasterField form={form} setForm={setForm} roasterOptions={roasterOptions} />
              <EndClientField form={form} setForm={setForm} endClientOptions={endClientOptions} />
            </>
          )}
        </div>
      </div>

      {/* Quantity */}
      <div className="border-t pt-3">
        <Label className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2 block">Quantity</Label>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Bag Type</Label>
            <Select
              value={form.bag_type || 'none'}
              onValueChange={(value) =>
                setForm(f => {
                  const bag_type = value === 'none' ? '' : value
                  const fixed = FIXED_BAG_WEIGHTS[bag_type]
                  return { ...f, bag_type, ...(fixed ? { bag_weight_kg: fixed } : {}) }
                })
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select...</SelectItem>
                {BAG_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isBulk ? (
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Net weight (M/T)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={form.bags_quantity_mt}
                onChange={(e) => setForm(f => ({ ...f, bags_quantity_mt: e.target.value }))}
                placeholder="e.g. 63"
                className="h-9"
              />
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Bags</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.bag_count}
                  onChange={(e) => setForm(f => ({ ...f, bag_count: e.target.value }))}
                  placeholder="0"
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Bag Weight (kg)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.bag_weight_kg}
                  onChange={(e) => setForm(f => ({ ...f, bag_weight_kg: e.target.value }))}
                  placeholder="60"
                  className="h-9"
                />
              </div>
            </>
          )}
        </div>
        {isBulk ? (
          qty.equivalent_60kg_bags != null && (
            <p className="text-xs text-muted-foreground mt-2">
              ≈ {approxBulkContainers(qty.bags_quantity_mt)} container(s) · eq. {qty.equivalent_60kg_bags.toLocaleString()} × 60kg bags
            </p>
          )
        ) : (
          (qty.bags_quantity_mt != null || qty.equivalent_60kg_bags != null) && (
            <p className="text-xs text-muted-foreground mt-2">
              {qty.bags_quantity_mt != null ? `${qty.bags_quantity_mt} MT` : ''}
              {qty.bags_quantity_mt != null && qty.equivalent_60kg_bags != null ? ' · ' : ''}
              {qty.equivalent_60kg_bags != null ? `${qty.equivalent_60kg_bags} × 60kg bags` : ''}
            </p>
          )
        )}
      </div>

      {/* Contract References */}
      <div className="border-t pt-3">
        <Label className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2 block">Contract References</Label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Wolthers</Label>
            <Input
              value={form.wolthers_contract_nr}
              onChange={(e) => setForm(f => ({ ...f, wolthers_contract_nr: e.target.value }))}
              placeholder="Wolthers ref."
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Supplier</Label>
            <Input
              value={form.supplier_contract_nr}
              onChange={(e) => setForm(f => ({ ...f, supplier_contract_nr: e.target.value }))}
              placeholder="Supplier ref."
              className="h-9"
            />
          </div>
          {!isPSS && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">ICO Number</Label>
                <Input
                  value={form.ico_number}
                  onChange={(e) => setForm(f => ({ ...f, ico_number: e.target.value }))}
                  placeholder="ICO number"
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Container Nr.</Label>
                <Input
                  value={form.container_nr}
                  onChange={(e) => setForm(f => ({ ...f, container_nr: e.target.value }))}
                  placeholder="Container nr."
                  className="h-9"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function RoasterField({ form, setForm, roasterOptions }: {
  form: EditForm
  setForm: (updater: (f: EditForm) => EditForm) => void
  roasterOptions: string[]
}) {
  return (
    <div className="grid grid-cols-2 gap-3 items-end">
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Roaster</Label>
        <Select
          value={form.roaster_name || 'none'}
          onValueChange={(value) =>
            setForm(f => ({ ...f, roaster_name: value === 'none' ? '' : value }))
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Select roaster" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select...</SelectItem>
            {roasterOptions.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Roaster Contract</Label>
        <Input
          value={form.roaster_contract_nr}
          onChange={(e) => setForm(f => ({ ...f, roaster_contract_nr: e.target.value }))}
          placeholder="Contract ref."
          className="h-9"
        />
      </div>
    </div>
  )
}

function EndClientField({ form, setForm, endClientOptions }: {
  form: EditForm
  setForm: (updater: (f: EditForm) => EditForm) => void
  endClientOptions: string[]
}) {
  return (
    <div className="grid grid-cols-2 gap-3 items-end">
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">End Client</Label>
        <Select
          value={form.end_client_name || 'none'}
          onValueChange={(value) =>
            setForm(f => ({ ...f, end_client_name: value === 'none' ? '' : value }))
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Select end client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select...</SelectItem>
            {endClientOptions.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">End Client Contract</Label>
        <Input
          value={form.end_client_contract_nr}
          onChange={(e) => setForm(f => ({ ...f, end_client_contract_nr: e.target.value }))}
          placeholder="Contract ref."
          className="h-9"
        />
      </div>
    </div>
  )
}
