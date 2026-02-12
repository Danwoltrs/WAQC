'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Trash2, Download, Loader2, FileText, Pencil } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'

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
}

interface SampleContractsSectionProps {
  sampleId: string
  isEditMode: boolean
}

export function SampleContractsSection({ sampleId, isEditMode }: SampleContractsSectionProps) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [contractToDelete, setContractToDelete] = useState<Contract | null>(null)

  // Edit dialog state
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  // Entity options for dropdowns
  const [importers, setImporters] = useState<Array<{ id: string; name: string }>>([])
  const [roasters, setRoasters] = useState<Array<{ id: string; name: string }>>([])
  const [qcClients, setQcClients] = useState<Array<{ id: string; name: string }>>([])

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const loadContracts = useCallback(async () => {
    try {
      const response = await fetch(`/api/samples/${sampleId}/contracts`)
      if (response.ok) {
        const data = await response.json()
        setContracts(data.contracts || [])
      }
    } catch (err) {
      console.error('Error loading contracts:', err)
    } finally {
      setLoading(false)
    }
  }, [sampleId])

  const loadEntityOptions = useCallback(async () => {
    const [importerRes, roasterRes, clientRes] = await Promise.all([
      supabase.from('importers').select('id, name').order('name'),
      supabase.from('roasters').select('id, name').order('name'),
      supabase.from('clients').select('id, fantasy_name, company').eq('is_qc_client', true).order('fantasy_name'),
    ])

    // Deduplicate
    const dedup = (items: Array<{ id: string; name: string | null }>) => {
      const seen = new Set<string>()
      return items.filter(i => {
        if (!i.name || seen.has(i.name)) return false
        seen.add(i.name)
        return true
      }) as Array<{ id: string; name: string }>
    }

    setImporters(dedup((importerRes.data || []).map(i => ({ id: i.id, name: i.name }))))
    setRoasters(dedup((roasterRes.data || []).map(r => ({ id: r.id, name: r.name }))))
    setQcClients((clientRes.data || []).map(c => ({
      id: c.id,
      name: (c.fantasy_name || c.company) as string
    })))
  }, [supabase])

  useEffect(() => {
    loadContracts()
    loadEntityOptions()
  }, [loadContracts, loadEntityOptions])

  // Merged importer options (QC clients + importers when importer_is_qc_client)
  const mergedImporterOptions = useMemo(() => {
    if (editForm.importer_is_qc_client) {
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
  }, [editForm.importer_is_qc_client, qcClients, importers])

  const roasterOptions = useMemo(() => {
    return roasters.map(r => r.name).sort((a, b) => a.localeCompare(b))
  }, [roasters])

  const endClientOptions = useMemo(() => {
    return qcClients.map(c => c.name).sort((a, b) => a.localeCompare(b))
  }, [qcClients])

  // Resolve entity name to ID
  const resolveEntityId = (name: string, list: Array<{ id: string; name: string }>): string | null => {
    if (!name) return null
    const match = list.find(e => e.name.toLowerCase() === name.toLowerCase())
    return match?.id || null
  }

  const handleAddContract = () => {
    setEditingContract(null)
    setEditForm(emptyForm)
    setShowEditDialog(true)
  }

  const handleEditContract = (contract: Contract) => {
    setEditingContract(contract)
    setEditForm({
      importer_name: contract.importer_name || '',
      importer_is_qc_client: contract.importer_is_qc_client ?? true,
      roaster_name: contract.roaster_name || '',
      end_client_name: contract.end_client_name || '',
      qc_client_name: contract.qc_client_name || '',
      wolthers_contract_nr: contract.wolthers_contract_nr || '',
      buyer_contract_nr: contract.buyer_contract_nr || '',
      roaster_contract_nr: contract.roaster_contract_nr || '',
      qc_client_contract_nr: contract.qc_client_contract_nr || '',
      end_client_contract_nr: contract.end_client_contract_nr || '',
      supplier_contract_nr: contract.supplier_contract_nr || '',
      ico_number: contract.ico_number || '',
      container_nr: contract.container_nr || '',
    })
    setShowEditDialog(true)
  }

  const handleSaveContract = async () => {
    setSaving(true)
    try {
      // Resolve entity names to IDs
      const importerId = resolveEntityId(editForm.importer_name, importers)
      const roasterId = resolveEntityId(editForm.roaster_name, roasters)
      const endClientId = resolveEntityId(editForm.end_client_name, qcClients)
      const clientId = resolveEntityId(editForm.qc_client_name, qcClients)

      const payload = {
        importer_id: importerId,
        importer_is_qc_client: editForm.importer_is_qc_client,
        roaster_id: roasterId,
        end_client_id: endClientId,
        client_id: editForm.importer_is_qc_client ? null : clientId,
        wolthers_contract_nr: editForm.wolthers_contract_nr || null,
        buyer_contract_nr: editForm.buyer_contract_nr || null,
        roaster_contract_nr: editForm.roaster_contract_nr || null,
        qc_client_contract_nr: editForm.qc_client_contract_nr || null,
        end_client_contract_nr: editForm.end_client_contract_nr || null,
        supplier_contract_nr: editForm.supplier_contract_nr || null,
        ico_number: editForm.ico_number || null,
        container_nr: editForm.container_nr || null,
      }

      let response: Response
      if (editingContract) {
        // PATCH existing contract
        response = await fetch(
          `/api/samples/${sampleId}/contracts?contract_id=${editingContract.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        )
      } else {
        // POST new contract
        response = await fetch(`/api/samples/${sampleId}/contracts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (response.ok) {
        setShowEditDialog(false)
        setEditingContract(null)
        await loadContracts()
      } else {
        const err = await response.json()
        console.error('Error saving contract:', err)
      }
    } catch (err) {
      console.error('Error saving contract:', err)
    } finally {
      setSaving(false)
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
        a.download = `${contract?.tracking_number || 'certificate'}.pdf`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Error downloading certificate:', err)
    } finally {
      setDownloadingId(null)
    }
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

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              Contracts
              {contracts.length > 0 && (
                <Badge variant="secondary" className="text-xs">{contracts.length}</Badge>
              )}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleAddContract}
            >
              <Plus className="h-3 w-3" />
              Contract
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No sub-contracts. Click &quot;+ Contract&quot; to add one.
            </p>
          ) : (
            <div className="space-y-3">
              {contracts.map((contract) => (
                <div
                  key={contract.id}
                  className="border rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">{contract.tracking_number}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleEditContract(contract)}
                        title="Edit contract"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleDownloadCertificate(contract.id)}
                        disabled={downloadingId === contract.id}
                        title="Download certificate"
                      >
                        {downloadingId === contract.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Download className="h-3.5 w-3.5" />
                        }
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setContractToDelete(contract)
                          setShowDeleteDialog(true)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Entity summary */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {contract.importer_name && (
                      <>
                        <span className="text-muted-foreground">Importer</span>
                        <span>{contract.importer_name}</span>
                      </>
                    )}
                    {contract.roaster_name && (
                      <>
                        <span className="text-muted-foreground">Roaster</span>
                        <span>{contract.roaster_name}</span>
                      </>
                    )}
                    {contract.end_client_name && (
                      <>
                        <span className="text-muted-foreground">End Client</span>
                        <span>{contract.end_client_name}</span>
                      </>
                    )}
                    {contract.qc_client_name && (
                      <>
                        <span className="text-muted-foreground">QC Client</span>
                        <span>{contract.qc_client_name}</span>
                      </>
                    )}
                    {contract.buyer_contract_nr && (
                      <>
                        <span className="text-muted-foreground">Buyer Contract</span>
                        <span>{contract.buyer_contract_nr}</span>
                      </>
                    )}
                    {contract.wolthers_contract_nr && (
                      <>
                        <span className="text-muted-foreground">Wolthers Contract</span>
                        <span>{contract.wolthers_contract_nr}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit / Add Contract Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingContract ? 'Edit Sub-Contract' : 'Add Sub-Contract'}</DialogTitle>
            <DialogDescription>
              {editingContract
                ? `Editing ${editingContract.tracking_number}`
                : 'A new tracking number will be generated automatically.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
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
                          checked={editForm.importer_is_qc_client}
                          onCheckedChange={(checked) =>
                            setEditForm(f => ({ ...f, importer_is_qc_client: checked as boolean }))
                          }
                          className="h-3 w-3"
                        />
                        <Label className="text-[10px] cursor-pointer text-muted-foreground">=QC Client</Label>
                      </div>
                    </div>
                    <Select
                      value={editForm.importer_name || 'none'}
                      onValueChange={(value) =>
                        setEditForm(f => ({ ...f, importer_name: value === 'none' ? '' : value }))
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
                      value={editForm.buyer_contract_nr}
                      onChange={(e) => setEditForm(f => ({ ...f, buyer_contract_nr: e.target.value }))}
                      placeholder="Contract ref."
                      className="h-9"
                    />
                  </div>
                </div>

                {/* QC Client (when not same as importer) */}
                {!editForm.importer_is_qc_client && (
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">QC Client</Label>
                      <Select
                        value={editForm.qc_client_name || 'none'}
                        onValueChange={(value) =>
                          setEditForm(f => ({ ...f, qc_client_name: value === 'none' ? '' : value }))
                        }
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
                        value={editForm.qc_client_contract_nr}
                        onChange={(e) => setEditForm(f => ({ ...f, qc_client_contract_nr: e.target.value }))}
                        placeholder="Contract ref."
                        className="h-9"
                      />
                    </div>
                  </div>
                )}

                {/* Roaster */}
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Roaster</Label>
                    <Select
                      value={editForm.roaster_name || 'none'}
                      onValueChange={(value) =>
                        setEditForm(f => ({ ...f, roaster_name: value === 'none' ? '' : value }))
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
                      value={editForm.roaster_contract_nr}
                      onChange={(e) => setEditForm(f => ({ ...f, roaster_contract_nr: e.target.value }))}
                      placeholder="Contract ref."
                      className="h-9"
                    />
                  </div>
                </div>

                {/* End Client */}
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">End Client</Label>
                    <Select
                      value={editForm.end_client_name || 'none'}
                      onValueChange={(value) =>
                        setEditForm(f => ({ ...f, end_client_name: value === 'none' ? '' : value }))
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
                      value={editForm.end_client_contract_nr}
                      onChange={(e) => setEditForm(f => ({ ...f, end_client_contract_nr: e.target.value }))}
                      placeholder="Contract ref."
                      className="h-9"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Contract References */}
            <div className="border-t pt-3">
              <Label className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2 block">Contract References</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Wolthers</Label>
                  <Input
                    value={editForm.wolthers_contract_nr}
                    onChange={(e) => setEditForm(f => ({ ...f, wolthers_contract_nr: e.target.value }))}
                    placeholder="Wolthers ref."
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Supplier</Label>
                  <Input
                    value={editForm.supplier_contract_nr}
                    onChange={(e) => setEditForm(f => ({ ...f, supplier_contract_nr: e.target.value }))}
                    placeholder="Supplier ref."
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">ICO Number</Label>
                  <Input
                    value={editForm.ico_number}
                    onChange={(e) => setEditForm(f => ({ ...f, ico_number: e.target.value }))}
                    placeholder="ICO number"
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Container Nr.</Label>
                  <Input
                    value={editForm.container_nr}
                    onChange={(e) => setEditForm(f => ({ ...f, container_nr: e.target.value }))}
                    placeholder="Container nr."
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveContract} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingContract ? 'Save Changes' : 'Create Contract'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
