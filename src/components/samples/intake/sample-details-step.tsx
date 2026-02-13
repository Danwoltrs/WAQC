'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Upload } from 'lucide-react'
import { StepComponentProps } from './types'

interface SampleDetailsStepProps extends StepComponentProps {
  onPhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function SampleDetailsStep({ formData, updateFormData, onPhotoUpload }: SampleDetailsStepProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="arrival_date">Arrival Date *</Label>
        <Input
          id="arrival_date"
          type="date"
          value={formData.arrival_date}
          onChange={(e) => updateFormData('arrival_date', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="photo">Sample Photo</Label>
        <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
          <input
            id="photo"
            type="file"
            accept="image/*"
            onChange={onPhotoUpload}
            className="hidden"
          />
          <label htmlFor="photo" className="cursor-pointer">
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Click to upload photo</p>
            <p className="text-xs text-muted-foreground mt-1">
              {formData.photo_file
                ? formData.photo_file.name
                : 'PNG, JPG up to 10MB'}
            </p>
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => updateFormData('notes', e.target.value)}
          placeholder="Any additional information about this sample..."
          className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-input bg-background"
        />
      </div>

      <div className="bg-muted/50 p-4 rounded-lg space-y-2">
        <p className="text-sm font-medium">Review Your Information</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Origin:</span> {formData.origin || '-'}
          </div>
          <div>
            <span className="text-muted-foreground">Type:</span> {formData.sample_type?.toUpperCase() || '-'}
          </div>
          <div>
            <span className="text-muted-foreground">Seller:</span> {formData.seller || '-'}
            {formData.seller_contract_nr && <span className="text-muted-foreground"> - {formData.seller_contract_nr}</span>}
          </div>
          <div>
            <span className="text-muted-foreground">Shipper:</span> {(formData.same_seller_shipper ? formData.seller : formData.shipper) || '-'}
            {formData.supplier_contract_nr && <span className="text-muted-foreground"> - {formData.supplier_contract_nr}</span>}
          </div>
          {formData.importer && (
            <div>
              <span className="text-muted-foreground">Importer:</span> {formData.importer}
              {formData.importer_contract_nr && <span className="text-muted-foreground"> - {formData.importer_contract_nr}</span>}
            </div>
          )}
          {!formData.importer_is_qc_client && formData.qc_client && (
            <div>
              <span className="text-muted-foreground">QC Client:</span> {formData.qc_client}
              {formData.qc_client_contract_nr && <span className="text-muted-foreground"> - {formData.qc_client_contract_nr}</span>}
            </div>
          )}
          {formData.roaster && (
            <div>
              <span className="text-muted-foreground">Roaster:</span> {formData.roaster}
              {formData.roaster_contract_nr && <span className="text-muted-foreground"> - {formData.roaster_contract_nr}</span>}
            </div>
          )}
          {formData.end_client && (
            <div>
              <span className="text-muted-foreground">End Client:</span> {formData.end_client}
              {formData.end_client_contract_nr && <span className="text-muted-foreground"> - {formData.end_client_contract_nr}</span>}
            </div>
          )}
          {formData.wolthers_contract_nr && (
            <div>
              <span className="text-muted-foreground">Wolthers:</span> {formData.wolthers_contract_nr}
            </div>
          )}
          {formData.quality_name && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Quality:</span> {formData.quality_name}
            </div>
          )}
          <div className="col-span-2">
            <span className="text-muted-foreground">Quantity:</span>{' '}
            {formData.bags_quantity_mt
              ? `${formData.bags_quantity_mt} MT`
              : formData.bag_count
                ? `${formData.bag_count} bags`
                : 'N/A'}
            {formData.equivalent_60kg_bags && formData.origin?.toLowerCase() === 'brazil' &&
              ` (${Math.round(parseFloat(formData.equivalent_60kg_bags))} x 60kg)`
            }
            {formData.shipment_month && (() => {
              const [year, month] = formData.shipment_month.split('-')
              const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
              return ` ${monthNames[parseInt(month) - 1] || month} ${year} shpt`
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
