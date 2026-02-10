'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { Plus, Trash2, Download, Loader2, FileText } from 'lucide-react'
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

interface SampleContractsSectionProps {
  sampleId: string
  isEditMode: boolean
}

export function SampleContractsSection({ sampleId, isEditMode }: SampleContractsSectionProps) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [contractToDelete, setContractToDelete] = useState<Contract | null>(null)

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

  const handleAddContract = async () => {
    setCreating(true)
    try {
      const response = await fetch(`/api/samples/${sampleId}/contracts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (response.ok) {
        await loadContracts()
      }
    } catch (err) {
      console.error('Error creating contract:', err)
    } finally {
      setCreating(false)
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
              disabled={creating}
            >
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
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
