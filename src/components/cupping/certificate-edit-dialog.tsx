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
  bag_weight_kg: number | null
  bags_quantity_mt: number | null
  equivalent_60kg_bags: number | null
  shipment_month: string | null
  processing_method: string | null
  contract_number: string | null
  exporter_contract_nr: string | null
  buyer_contract_nr: string | null
  roaster_contract_nr: string | null
  seller_contract_nr: string | null
  shipper_contract_nr: string | null
  qc_client_contract_nr: string | null
  exporter_id: string | null
  importer_id: string | null
  roaster_id: string | null
  seller_id: string | null
}

interface Entity {
  id: string
  name: string
  country?: string | null
}

export function CertificateEditDialog({
  open,
  onOpenChange,
  sampleId,
  onSaved
}: CertificateEditDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sample, setSample] = useState<SampleData | null>(null)

  // Entity options
  const [exporters, setExporters] = useState<Entity[]>([])
  const [importers, setImporters] = useState<Entity[]>([])
  const [roasters, setRoasters] = useState<Entity[]>([])

  // Form state
  const [formData, setFormData] = useState<Partial<SampleData>>({})

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
          bag_weight_kg,
          bags_quantity_mt,
          equivalent_60kg_bags,
          shipment_month,
          processing_method,
          contract_number,
          exporter_contract_nr,
          buyer_contract_nr,
          roaster_contract_nr,
          seller_contract_nr,
          shipper_contract_nr,
          qc_client_contract_nr,
          exporter_id,
          importer_id,
          roaster_id,
          seller_id
        `)
        .eq('id', sampleId)
        .single()

      if (sampleError) throw sampleError

      setSample(sampleData)
      setFormData(sampleData)

      // Load entities in parallel
      const [exportersRes, importersRes, roastersRes] = await Promise.all([
        supabase.from('exporters').select('id, name, country').order('name'),
        supabase.from('importers').select('id, name, country').order('name'),
        supabase.from('roasters').select('id, name, country').order('name'),
      ])

      setExporters(exportersRes.data || [])
      setImporters(importersRes.data || [])
      setRoasters(roastersRes.data || [])
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

  const handleSave = async () => {
    if (!sampleId) return

    setSaving(true)
    try {
      const response = await fetch(`/api/samples/${sampleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
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
                  />
                </div>

                <div className="space-y-2">
                  <Label>Micro Origin / Region</Label>
                  <Input
                    value={formData.micro_origin || ''}
                    onChange={(e) => handleInputChange('micro_origin', e.target.value || null)}
                    placeholder="e.g., Cerrado Mineiro"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Processing Method</Label>
                  <Input
                    value={formData.processing_method || ''}
                    onChange={(e) => handleInputChange('processing_method', e.target.value || null)}
                    placeholder="e.g., Natural, Washed"
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
                  <Label>Number of Bags</Label>
                  <Input
                    type="number"
                    value={formData.bags || ''}
                    onChange={(e) => handleInputChange('bags', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="e.g., 250"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Bag Type</Label>
                  <Input
                    value={formData.bag_type || ''}
                    onChange={(e) => handleInputChange('bag_type', e.target.value || null)}
                    placeholder="e.g., Jute, GrainPro"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Bag Weight (kg)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.bag_weight_kg || ''}
                    onChange={(e) => handleInputChange('bag_weight_kg', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="e.g., 60"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Total Weight (MT)</Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={formData.bags_quantity_mt || ''}
                    onChange={(e) => handleInputChange('bags_quantity_mt', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="e.g., 18.75"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Equivalent 60kg Bags</Label>
                  <Input
                    type="number"
                    value={formData.equivalent_60kg_bags || ''}
                    onChange={(e) => handleInputChange('equivalent_60kg_bags', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="Auto-calculated"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
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
