'use client'

import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { StepComponentProps } from './types'
import { ORIGINS, PROCESSING_METHODS } from './constants'

export function BasicInfoStep({
  formData,
  updateFormData,
  clients,
  laboratories,
  filteredClients,
  approvedPSSSamples
}: StepComponentProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="laboratory_id">Laboratory *</Label>
          <Select
            value={formData.laboratory_id}
            onValueChange={(value) => updateFormData('laboratory_id', value)}
            disabled={laboratories.length === 1}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select laboratory" />
            </SelectTrigger>
            <SelectContent>
              {laboratories.map((lab) => (
                <SelectItem key={lab.id} value={lab.id}>
                  {lab.name} - {lab.location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {laboratories.length === 1 && (
            <p className="text-xs text-muted-foreground">
              Your assigned laboratory
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="origin">Origin *</Label>
          <Select
            value={formData.origin}
            onValueChange={(value) => updateFormData('origin', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select origin" />
            </SelectTrigger>
            <SelectContent>
              {ORIGINS.map((origin) => (
                <SelectItem key={origin} value={origin}>
                  {origin}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="exporter">Exporter *</Label>
          <Select
            value={formData.exporter === '' ? 'custom' : clients.find(c => c.company === formData.exporter || c.fantasy_name === formData.exporter) ? formData.exporter : 'custom'}
            onValueChange={(value) => {
              if (value === 'new') {
                updateFormData('exporter', '')
              } else if (value !== 'custom') {
                const client = clients.find(c => c.company === value || c.fantasy_name === value)
                updateFormData('exporter', client?.fantasy_name || client?.company || value)
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select existing or type new" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Type custom name...</SelectItem>
              <SelectItem value="new">+ Create New Client</SelectItem>
              {clients.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    Existing Clients
                  </div>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.company}>
                      {client.fantasy_name || client.company}
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
          {(formData.exporter === '' || !clients.find(c => c.company === formData.exporter || c.fantasy_name === formData.exporter)) && (
            <Input
              id="exporter"
              value={formData.exporter}
              onChange={(e) => updateFormData('exporter', e.target.value)}
              placeholder="Enter exporter name"
            />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="buyer">Buyer</Label>
          <Select
            value={formData.buyer === '' ? 'custom' : clients.find(c => c.company === formData.buyer || c.fantasy_name === formData.buyer) ? formData.buyer : 'custom'}
            onValueChange={(value) => {
              if (value === 'new') {
                updateFormData('buyer', '')
              } else if (value !== 'custom') {
                const client = clients.find(c => c.company === value || c.fantasy_name === value)
                updateFormData('buyer', client?.fantasy_name || client?.company || value)
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select existing or type new" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Type custom name...</SelectItem>
              <SelectItem value="new">+ Create New Client</SelectItem>
              {clients.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    Existing Clients
                  </div>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.company}>
                      {client.fantasy_name || client.company}
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
          {(formData.buyer === '' || !clients.find(c => c.company === formData.buyer || c.fantasy_name === formData.buyer)) && (
            <Input
              id="buyer"
              value={formData.buyer}
              onChange={(e) => updateFormData('buyer', e.target.value)}
              placeholder="Enter buyer name"
            />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="roaster">Roaster</Label>
          <Select
            value={formData.roaster === '' ? 'custom' : clients.find(c => c.company === formData.roaster || c.fantasy_name === formData.roaster) ? formData.roaster : 'custom'}
            onValueChange={(value) => {
              if (value === 'new') {
                updateFormData('roaster', '')
              } else if (value !== 'custom') {
                const client = clients.find(c => c.company === value || c.fantasy_name === value)
                updateFormData('roaster', client?.fantasy_name || client?.company || value)
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select existing or type new" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Type custom name...</SelectItem>
              <SelectItem value="new">+ Create New Client</SelectItem>
              {clients.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    Existing Clients
                  </div>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.company}>
                      {client.fantasy_name || client.company}
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
          {(formData.roaster === '' || !clients.find(c => c.company === formData.roaster || c.fantasy_name === formData.roaster)) && (
            <Input
              id="roaster"
              value={formData.roaster}
              onChange={(e) => updateFormData('roaster', e.target.value)}
              placeholder="Enter roaster name"
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="supplier">Supplier Name</Label>
        <Input
          id="supplier"
          value={formData.supplier}
          onChange={(e) => updateFormData('supplier', e.target.value)}
          placeholder="Farm or cooperative name (optional)"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="processing_method">Processing Method</Label>
          <Select
            value={formData.processing_method}
            onValueChange={(value) => updateFormData('processing_method', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select method (optional)" />
            </SelectTrigger>
            <SelectContent>
              {PROCESSING_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sample_type">Sample Type *</Label>
          <Select
            value={formData.sample_type}
            onValueChange={(value) => updateFormData('sample_type', value as any)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pss">PSS (Pre-Shipment Sample)</SelectItem>
              <SelectItem value="ss">SS (Shipment Sample)</SelectItem>
              <SelectItem value="type">Type Sample</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {formData.sample_type === 'ss' && (
        <div className="space-y-2 bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <Label htmlFor="linked_pss_sample_id">
            Link to Approved Pre-Shipment Sample
            <span className="ml-2 text-xs text-muted-foreground">(Recommended for Shipment Samples)</span>
          </Label>
          <Select
            value={formData.linked_pss_sample_id}
            onValueChange={(value) => updateFormData('linked_pss_sample_id', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select approved PSS sample..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No linked sample</SelectItem>
              {approvedPSSSamples.length > 0 ? (
                approvedPSSSamples.map((sample) => (
                  <SelectItem key={sample.id} value={sample.id}>
                    {sample.tracking_number} - {sample.origin} ({sample.supplier || 'No supplier'})
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="no-samples" disabled>
                  No approved PSS samples available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {formData.linked_pss_sample_id && (
            <p className="text-xs text-muted-foreground">
              This shipment sample will be linked to the selected pre-shipment sample for tracking.
            </p>
          )}
        </div>
      )}

      {filteredClients.length > 0 && !formData.client_id && (
        <div className="space-y-2">
          <Label>Detected Clients</Label>
          <div className="flex gap-2 flex-wrap">
            {filteredClients.map((client) => (
              <Badge
                key={client.id}
                variant="outline"
                className="cursor-pointer hover:bg-primary/10"
                onClick={() => updateFormData('client_id', client.id)}
              >
                {client.company}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
