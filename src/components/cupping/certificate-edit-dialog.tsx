'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'
import { isSampleEditor } from '@/lib/sample-edit-permissions'
import { BulkQuantityFields } from '@/components/samples/intake/bulk-quantity-fields'
import {
  BAG_TYPE_LABELS,
  bagWeightForType,
  bulkQuantitiesFromContainers,
  computeBagQuantities,
} from '@/lib/bag-quantity'
import { Loader2 } from 'lucide-react'

interface CertificateEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleId: string
  onSaved?: () => void
}

interface SampleData {
  id: string
  tracking_number: string
  origin: string | null
  micro_origin: string | null
  ico_number: string | null
  container_nr: string | null
  bags: number | null
  bag_type: string | null
  bag_count: number | null
  bag_weight_kg: number | null
  bags_quantity_mt: number | null
  equivalent_60kg_bags: number | null
  container_count: number | null
  shipment_month: string | null
  processing_method: string | null
  contract_number: string | null
  exporter_contract_nr: string | null
  buyer_contract_nr: string | null
  roaster_contract_nr: string | null
  seller_contract_nr: string | null
  shipper_contract_nr: string | null
  qc_client_contract_nr: string | null
  end_client_contract_nr: string | null
  supplier_contract_nr: string | null
  exporter_id: string | null
  importer_id: string | null
  roaster_id: string | null
  seller_id: string | null
  end_client_id: string | null
}

interface Entity {
  id: string
  name: string
  country?: string | null
}

/**
 * Quantity is edited as strings (a half-typed "43." must survive a render)
 * and parsed once, at save. Bulk is containers + total MT (spec addendum
 * 2026-08-28); bags are count × weight. MT and the 60 kg equivalent are never
 * typed — they derive.
 */
interface QuantityForm {
  bag_type: string
  bag_count: string
  bag_weight_kg: string
  container_count: string
  bags_quantity_mt: string
}

const EMPTY_QUANTITY: QuantityForm = {
  bag_type: '', bag_count: '', bag_weight_kg: '', container_count: '', bags_quantity_mt: '',
}

const BAG_TYPE_OPTIONS = Object.entries(BAG_TYPE_LABELS).map(([value, label]) => ({
  value,
  label: label.charAt(0).toUpperCase() + label.slice(1),
}))

/** The loaded columns this form owns; they go back only through quantityPayload. */
const QUANTITY_COLUMNS = [
  'bags', 'bag_type', 'bag_count', 'bag_weight_kg', 'bags_quantity_mt', 'equivalent_60kg_bags', 'container_count',
] as const

function quantityFormFromSample(s: SampleData): QuantityForm {
  const str = (v: number | null | undefined) => (v == null ? '' : String(v))
  return {
    bag_type: s.bag_type ?? '',
    // bag_count is what intake writes; `bags` is the legacy column older rows still carry.
    bag_count: str(s.bag_count ?? s.bags),
    bag_weight_kg: str(s.bag_weight_kg),
    container_count: str(s.container_count),
    bags_quantity_mt: str(s.bags_quantity_mt),
  }
}

/**
 * What the PATCH stores: the quantity quintet plus container_count, never the
 * legacy `bags`. Bulk derives everything from containers + MT (bag_count IS
 * the 60 kg equivalent, bag_weight_kg = 21600, the invariant the reports rely
 * on); a blank container count is one container and a blank MT is
 * containers × 21.6, the defaults the fields show.
 */
function quantityPayload(q: QuantityForm) {
  if (q.bag_type === 'bulk') {
    return {
      bag_type: 'bulk',
      ...bulkQuantitiesFromContainers(Number(q.container_count) || 1, Number(q.bags_quantity_mt) || 0),
    }
  }
  const bag_count = Number(q.bag_count) > 0 ? Math.round(Number(q.bag_count)) : null
  const bag_weight_kg = Number(q.bag_weight_kg) > 0 ? Number(q.bag_weight_kg) : null
  const derived = computeBagQuantities(bag_count, bag_weight_kg, q.bag_type)
  return {
    bag_type: q.bag_type || null,
    bag_count,
    bag_weight_kg,
    bags_quantity_mt: derived.bags_quantity_mt,
    equivalent_60kg_bags: derived.equivalent_60kg_bags,
    // Bags are not asked for containers, so a count the row already carries
    // is kept as loaded rather than wiped.
    container_count: Number(q.container_count) > 0 ? Math.round(Number(q.container_count)) : null,
  }
}

export function CertificateEditDialog({
  open,
  onOpenChange,
  sampleId,
  onSaved
}: CertificateEditDialogProps) {
  const { toast } = useToast()
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sample, setSample] = useState<SampleData | null>(null)
  const [canEditContent, setCanEditContent] = useState(true)

  const isEditor = isSampleEditor(profile)

  // Entity options
  const [exporters, setExporters] = useState<Entity[]>([])
  const [importers, setImporters] = useState<Entity[]>([])
  const [roasters, setRoasters] = useState<Entity[]>([])
  const [clients, setClients] = useState<Entity[]>([])

  // Form state
  const [formData, setFormData] = useState<Partial<SampleData>>({})
  const [quantity, setQuantity] = useState<QuantityForm>(EMPTY_QUANTITY)

  // Load sample data and entity options
  useEffect(() => {
    if (open && sampleId) {
      loadData()
    }
  }, [open, sampleId])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load sample data
      const { data: sampleData, error: sampleError } = await supabase
        .from('samples')
        .select(`
          id,
          tracking_number,
          origin,
          micro_origin,
          ico_number,
          container_nr,
          bags,
          bag_type,
          bag_count,
          bag_weight_kg,
          bags_quantity_mt,
          equivalent_60kg_bags,
          container_count,
          shipment_month,
          processing_method,
          contract_number,
          exporter_contract_nr,
          buyer_contract_nr,
          roaster_contract_nr,
          seller_contract_nr,
          shipper_contract_nr,
          qc_client_contract_nr,
          end_client_contract_nr,
          supplier_contract_nr,
          exporter_id,
          importer_id,
          roaster_id,
          seller_id,
          end_client_id
        `)
        .eq('id', sampleId)
        .single()

      if (sampleError) throw sampleError

      setSample(sampleData)
      setFormData(sampleData)
      setQuantity(quantityFormFromSample(sampleData))

      // Determine whether quality (lock-sensitive) fields are still editable.
      try {
        const permRes = await fetch(`/api/cupping/check-edit-permission?sampleId=${sampleId}`)
        if (permRes.ok) {
          const perm = await permRes.json()
          setCanEditContent(perm.canEditContent ?? true)
        }
      } catch {
        // Non-blocking — default to editable; the server still enforces the lock.
      }

      // Load entities in parallel — all from companies, filtered by role/type
      const [exportersRes, importersRes, roastersRes, clientsRes] = await Promise.all([
        (supabase as any).from('companies').select('id, name, country').or('trading_roles.cs.["seller"],company_types.cs.{exporter}').order('name'),
        (supabase as any).from('companies').select('id, name, country').filter('trading_roles', 'cs', '["buyer"]').order('name'),
        (supabase as any).from('companies').select('id, name, country').contains('company_types', ['roaster']).order('name'),
        (supabase as any).from('companies').select('id, fantasy_name, name, country').eq('is_qc_client', true).order('fantasy_name'),
      ])

      setExporters(exportersRes.data || [])
      setImporters(importersRes.data || [])
      setRoasters(roastersRes.data || [])
      setClients((clientsRes.data || []).map((c: any) => ({ id: c.id, name: c.fantasy_name || c.name || c.id, country: c.country })))
    } catch (error) {
      console.error('Error loading data:', error)
      toast({
        title: 'Error',
        description: 'Failed to load sample data',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: keyof SampleData, value: string | number | null) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleBagTypeChange = (bagType: string) => {
    // A new bag type brings its standard weight (Brazil jute/PP = 60 kg, else
    // 70; big bag 1000); bulk has no per-bag weight to edit, so it is left.
    setQuantity(q => ({
      ...q,
      bag_type: bagType,
      bag_weight_kg: bagType && bagType !== 'bulk'
        ? String(bagWeightForType(bagType, formData.origin) ?? '')
        : q.bag_weight_kg,
    }))
  }

  const derivedQuantity = quantityPayload(quantity)

  const handleSave = async () => {
    if (!sampleId) return

    setSaving(true)
    try {
      // The loaded quantity columns are replaced by the form's derived set so
      // the row can never be saved in the legacy "720 × 21600 kg bulk" shape.
      const body: Record<string, unknown> = { ...formData }
      for (const column of QUANTITY_COLUMNS) delete body[column]
      Object.assign(body, derivedQuantity)

      const response = await fetch(`/api/samples/${sampleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update sample')
      }

      toast({
        title: 'Success',
        description: 'Certificate data updated successfully'
      })

      onSaved?.()
      onOpenChange(false)
    } catch (error: any) {
      console.error('Error saving:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to update certificate data',
        variant: 'destructive'
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Certificate Data</DialogTitle>
          <DialogDescription>
            Update the sample information that appears on the certificate. Changes will be reflected when you regenerate the certificate.
          </DialogDescription>
        </DialogHeader>

        {!isEditor && (
          <div className="rounded-md border border-amber-300/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Only master cuppers and global admins can edit certificate data. You can review the values but cannot save changes.
          </div>
        )}
        {isEditor && !canEditContent && (
          <div className="rounded-md border border-amber-300/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Quality fields (origin, micro origin, processing) are locked 7 days after the certificate was issued. Commercial and logistics fields can still be edited.
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="supply-chain" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="supply-chain">Supply Chain</TabsTrigger>
              <TabsTrigger value="references">Reference Numbers</TabsTrigger>
              <TabsTrigger value="details">Sample Details</TabsTrigger>
            </TabsList>

            {/* Supply Chain Tab */}
            <TabsContent value="supply-chain" className="space-y-4 mt-4">
              {/* Exporter */}
              <div className="space-y-2">
                <Label>Exporter</Label>
                <Select
                  value={formData.exporter_id || ''}
                  onValueChange={(value) => handleInputChange('exporter_id', value || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select exporter..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {exporters.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} {e.country ? `(${e.country})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Importer */}
              <div className="space-y-2">
                <Label>Importer</Label>
                <Select
                  value={formData.importer_id || ''}
                  onValueChange={(value) => handleInputChange('importer_id', value || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select importer..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {importers.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} {e.country ? `(${e.country})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Roaster */}
              <div className="space-y-2">
                <Label>Roaster</Label>
                <Select
                  value={formData.roaster_id || ''}
                  onValueChange={(value) => handleInputChange('roaster_id', value || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select roaster..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {roasters.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} {e.country ? `(${e.country})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Seller/Supplier (uses exporters table) */}
              <div className="space-y-2">
                <Label>Seller / Supplier (Farm/Coop)</Label>
                <Select
                  value={formData.seller_id || ''}
                  onValueChange={(value) => handleInputChange('seller_id', value || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select seller..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {exporters.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} {e.country ? `(${e.country})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* End Client */}
              <div className="space-y-2">
                <Label>End Client</Label>
                <Select
                  value={formData.end_client_id || ''}
                  onValueChange={(value) => handleInputChange('end_client_id', value || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select end client..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.country ? `(${c.country})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* Reference Numbers Tab */}
            <TabsContent value="references" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ICO Number</Label>
                  <Input
                    value={formData.ico_number || ''}
                    onChange={(e) => handleInputChange('ico_number', e.target.value || null)}
                    placeholder="e.g., 2-0001-001-23-001"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Container Number</Label>
                  <Input
                    value={formData.container_nr || ''}
                    onChange={(e) => handleInputChange('container_nr', e.target.value || null)}
                    placeholder="e.g., MSKU1234567"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Wolthers Contract</Label>
                  <Input
                    value={formData.contract_number || ''}
                    onChange={(e) => handleInputChange('contract_number', e.target.value || null)}
                    placeholder="Internal contract number"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Exporter Contract</Label>
                  <Input
                    value={formData.exporter_contract_nr || ''}
                    onChange={(e) => handleInputChange('exporter_contract_nr', e.target.value || null)}
                    placeholder="Exporter's contract number"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Buyer/Importer Contract</Label>
                  <Input
                    value={formData.buyer_contract_nr || ''}
                    onChange={(e) => handleInputChange('buyer_contract_nr', e.target.value || null)}
                    placeholder="Buyer's contract number"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Roaster Contract</Label>
                  <Input
                    value={formData.roaster_contract_nr || ''}
                    onChange={(e) => handleInputChange('roaster_contract_nr', e.target.value || null)}
                    placeholder="Roaster's contract number"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Seller Contract</Label>
                  <Input
                    value={formData.seller_contract_nr || ''}
                    onChange={(e) => handleInputChange('seller_contract_nr', e.target.value || null)}
                    placeholder="Seller's contract number"
                  />
                </div>

                <div className="space-y-2">
                  <Label>QC Client Contract</Label>
                  <Input
                    value={formData.qc_client_contract_nr || ''}
                    onChange={(e) => handleInputChange('qc_client_contract_nr', e.target.value || null)}
                    placeholder="QC Client's contract number"
                  />
                </div>

                <div className="space-y-2">
                  <Label>End Client Contract</Label>
                  <Input
                    value={formData.end_client_contract_nr || ''}
                    onChange={(e) => handleInputChange('end_client_contract_nr', e.target.value || null)}
                    placeholder="End Client's contract number"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Supplier Contract</Label>
                  <Input
                    value={formData.supplier_contract_nr || ''}
                    onChange={(e) => handleInputChange('supplier_contract_nr', e.target.value || null)}
                    placeholder="Supplier's contract number"
                  />
                </div>
              </div>
            </TabsContent>

            {/* Sample Details Tab */}
            <TabsContent value="details" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Origin</Label>
                  <Input
                    value={formData.origin || ''}
                    onChange={(e) => handleInputChange('origin', e.target.value || null)}
                    placeholder="e.g., Brazil"
                    disabled={!canEditContent}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Micro Origin / Region</Label>
                  <Input
                    value={formData.micro_origin || ''}
                    onChange={(e) => handleInputChange('micro_origin', e.target.value || null)}
                    placeholder="e.g., Cerrado Mineiro"
                    disabled={!canEditContent}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Processing Method</Label>
                  <Input
                    value={formData.processing_method || ''}
                    onChange={(e) => handleInputChange('processing_method', e.target.value || null)}
                    placeholder="e.g., Natural, Washed"
                    disabled={!canEditContent}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Shipment Month</Label>
                  <Input
                    value={formData.shipment_month || ''}
                    onChange={(e) => handleInputChange('shipment_month', e.target.value || null)}
                    placeholder="e.g., Jan/2025"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Bag Type</Label>
                  <Select
                    value={quantity.bag_type || 'none'}
                    onValueChange={(value) => handleBagTypeChange(value === 'none' ? '' : value)}
                  >
                    <SelectTrigger aria-label="Bag Type">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {BAG_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {quantity.bag_type === 'bulk' ? (
                  <BulkQuantityFields
                    containers={quantity.container_count}
                    mt={quantity.bags_quantity_mt}
                    onChange={(next) => setQuantity(q => ({ ...q, ...next }))}
                  />
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="cert-edit-bag-count">Number of Bags</Label>
                      <Input
                        id="cert-edit-bag-count"
                        type="number"
                        min="0"
                        step="1"
                        value={quantity.bag_count}
                        onChange={(e) => setQuantity(q => ({ ...q, bag_count: e.target.value }))}
                        placeholder="e.g., 250"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cert-edit-bag-weight">Bag Weight (kg)</Label>
                      <Input
                        id="cert-edit-bag-weight"
                        type="number"
                        min="0"
                        step="0.1"
                        value={quantity.bag_weight_kg}
                        onChange={(e) => setQuantity(q => ({ ...q, bag_weight_kg: e.target.value }))}
                        placeholder="e.g., 60"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Total Weight (MT)</Label>
                      <div className="flex h-10 items-center text-sm text-muted-foreground">
                        {derivedQuantity.bags_quantity_mt != null ? `${derivedQuantity.bags_quantity_mt} MT` : '—'}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Equivalent 60kg Bags</Label>
                      <div className="flex h-10 items-center text-sm text-muted-foreground">
                        {derivedQuantity.equivalent_60kg_bags ?? '—'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || !isEditor}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
