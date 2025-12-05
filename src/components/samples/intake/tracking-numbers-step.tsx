'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { StepComponentProps } from './types'

export function TrackingNumbersStep({ formData, updateFormData }: StepComponentProps) {
  // Check if sample type is PSS (Pre-Shipment Sample)
  const isPSS = formData.sample_type === 'pss'

  // Dynamic visibility based on supply chain selections
  const showSellerContract = !!formData.seller
  const showShipperContract = !!formData.shipper && !formData.same_seller_shipper
  const showImporterContract = !!formData.importer
  const showRoasterContract = !!formData.roaster
  const showQcClientContract = !formData.importer_is_qc_client && !!formData.qc_client

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        All contract numbers are optional. Fill in what is available.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Wolthers Contract - Always visible */}
        <div className="space-y-2">
          <Label htmlFor="wolthers_contract_nr">Wolthers Contract Number</Label>
          <Input
            id="wolthers_contract_nr"
            value={formData.wolthers_contract_nr}
            onChange={(e) => updateFormData('wolthers_contract_nr', e.target.value)}
            placeholder="e.g., WC-2024-001"
          />
        </div>

        {/* Seller Contract - Show if seller is filled */}
        {showSellerContract && (
          <div className="space-y-2">
            <Label htmlFor="seller_contract_nr">Seller Contract Number</Label>
            <Input
              id="seller_contract_nr"
              value={formData.seller_contract_nr}
              onChange={(e) => updateFormData('seller_contract_nr', e.target.value)}
              placeholder="e.g., SC-2024-001"
            />
          </div>
        )}

        {/* Shipper Contract - Show if shipper is filled AND different from seller */}
        {showShipperContract && (
          <div className="space-y-2">
            <Label htmlFor="shipper_contract_nr">Shipper Contract Number</Label>
            <Input
              id="shipper_contract_nr"
              value={formData.shipper_contract_nr}
              onChange={(e) => updateFormData('shipper_contract_nr', e.target.value)}
              placeholder="e.g., SH-2024-001"
            />
          </div>
        )}

        {/* Exporter Contract - Always visible for legacy support */}
        <div className="space-y-2">
          <Label htmlFor="exporter_contract_nr">Exporter Contract Number</Label>
          <Input
            id="exporter_contract_nr"
            value={formData.exporter_contract_nr}
            onChange={(e) => updateFormData('exporter_contract_nr', e.target.value)}
            placeholder="e.g., EX-2024-001"
          />
        </div>

        {/* Importer Contract - Show if importer is filled */}
        {showImporterContract && (
          <div className="space-y-2">
            <Label htmlFor="importer_contract_nr">Importer Contract Number</Label>
            <Input
              id="importer_contract_nr"
              value={formData.importer_contract_nr}
              onChange={(e) => updateFormData('importer_contract_nr', e.target.value)}
              placeholder="e.g., IM-2024-001"
            />
          </div>
        )}

        {/* Roaster Contract - Show if roaster is filled */}
        {showRoasterContract && (
          <div className="space-y-2">
            <Label htmlFor="roaster_contract_nr">Roaster Contract Number</Label>
            <Input
              id="roaster_contract_nr"
              value={formData.roaster_contract_nr}
              onChange={(e) => updateFormData('roaster_contract_nr', e.target.value)}
              placeholder="e.g., RC-2024-001"
            />
          </div>
        )}

        {/* QC Client Contract - Show if QC client is separate from importer */}
        {showQcClientContract && (
          <div className="space-y-2">
            <Label htmlFor="qc_client_contract_nr">QC Client Contract Number</Label>
            <Input
              id="qc_client_contract_nr"
              value={formData.qc_client_contract_nr}
              onChange={(e) => updateFormData('qc_client_contract_nr', e.target.value)}
              placeholder="e.g., QC-2024-001"
            />
          </div>
        )}

        {/* Only show ICO Number and Container Number for SS (Shipped Sample) */}
        {!isPSS && (
          <>
            <div className="space-y-2">
              <Label htmlFor="ico_number">ICO Number</Label>
              <Input
                id="ico_number"
                value={formData.ico_number}
                onChange={(e) => updateFormData('ico_number', e.target.value)}
                placeholder="e.g., ICO-123456"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="container_nr">Container Number</Label>
              <Input
                id="container_nr"
                value={formData.container_nr}
                onChange={(e) => updateFormData('container_nr', e.target.value)}
                placeholder="e.g., ABCD1234567"
              />
            </div>
          </>
        )}
      </div>

      {isPSS && (
        <p className="text-xs text-muted-foreground italic">
          Container and ICO numbers are not applicable for Pre-Shipment Samples
        </p>
      )}
    </div>
  )
}
