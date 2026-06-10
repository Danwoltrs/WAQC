'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Upload } from 'lucide-react'
import { StepComponentProps } from './types'

interface SampleDetailsStepProps extends StepComponentProps {
  onPhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function SampleDetailsStep({ formData, updateFormData, onPhotoUpload }: SampleDetailsStepProps) {
  const contract = formData.selected_contract
  const contractSummary = contract
    ? [contract.seller_name, contract.buyer_name].filter(Boolean).join(' → ')
    : ''
  const contractDetail = contract
    ? [
        contract.crop,
        contract.volume_bags != null ? `${contract.volume_bags} bags` : null,
        contract.bag_type,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <div className="space-y-3">
      {/* Arrival date + linked contract — side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
        <div className="space-y-1.5">
          <Label htmlFor="arrival_date">Arrival Date *</Label>
          <Input
            id="arrival_date"
            type="date"
            value={formData.arrival_date}
            onChange={(e) => updateFormData('arrival_date', e.target.value)}
          />
        </div>
        {contract && (
          <div className="space-y-1.5">
            <Label>Linked Contract</Label>
            <div className="rounded-md px-3 py-2 bg-[#556b2f]/10 border border-[#556b2f]/30">
              <div className="text-sm font-semibold truncate">#{contract.contract_number}</div>
              <div className="text-xs text-muted-foreground truncate">
                {contractSummary}
                {contractDetail ? ` · ${contractDetail}` : ''}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sample photo (compact) + notes — side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
        <div className="space-y-1.5">
          <Label htmlFor="photo">Sample Photo</Label>
          <div className="border-2 border-dashed border-muted rounded-lg p-3 text-center hover:border-primary/50 transition-colors">
            <input
              id="photo"
              type="file"
              accept="image/*"
              onChange={onPhotoUpload}
              className="hidden"
            />
            <label htmlFor="photo" className="flex cursor-pointer items-center justify-center gap-2">
              <Upload className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
              <span className="min-w-0 text-left">
                <span className="block text-sm font-medium">Click to upload photo</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {formData.photo_file ? formData.photo_file.name : 'PNG, JPG up to 10MB'}
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => updateFormData('notes', e.target.value)}
            placeholder="Any additional information about this sample..."
            className="w-full min-h-[72px] px-3 py-2 text-sm rounded-md border border-input bg-background"
          />
        </div>
      </div>

      <div className="bg-muted/50 p-3 rounded-lg space-y-1.5">
        <p className="text-sm font-medium">Review Your Information</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
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
