'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertCircle, Loader2 } from 'lucide-react'

interface CreateClientDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientType: 'exporter' | 'importer' | 'roaster'
  onSuccess: (clientName: string) => void
}

const CLIENT_TYPE_LABELS = {
  exporter: 'Exporter',
  importer: 'Importer',
  roaster: 'Roaster'
}

const CLIENT_TYPE_DB_VALUES = {
  exporter: ['exporter', 'producer_exporter'],
  importer: ['importer_buyer'],
  roaster: ['roaster', 'roaster_final_buyer']
}

export function CreateClientDialog({
  open,
  onOpenChange,
  clientType,
  onSuccess
}: CreateClientDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [company, setCompany] = useState('')
  const [fantasyName, setFantasyName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState('')
  const [selectedType, setSelectedType] = useState(CLIENT_TYPE_DB_VALUES[clientType][0])

  const resetForm = () => {
    setCompany('')
    setFantasyName('')
    setEmail('')
    setPhone('')
    setCountry('')
    setSelectedType(CLIENT_TYPE_DB_VALUES[clientType][0])
    setError(null)
  }

  const handleSubmit = async () => {
    if (!company) {
      setError('Company name is required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Determine API endpoint based on client type
      const apiEndpoint = clientType === 'exporter' ? '/api/exporters' :
                         clientType === 'importer' ? '/api/importers' :
                         '/api/roasters'

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: company,
          country: country || null,
          region: null,
          contact_email: email || null,
          contact_phone: phone || null,
          notes: fantasyName ? `Brand name: ${fantasyName}` : null
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Failed to create ${clientType}`)
      }

      // Reset form and notify parent with the created entity's name
      resetForm()
      const entityKey = clientType === 'exporter' ? 'exporter' :
                       clientType === 'importer' ? 'importer' :
                       'roaster'
      onSuccess(data[entityKey]?.name || company)
      onOpenChange(false)
    } catch (err: any) {
      console.error(`Error creating ${clientType}:`, err)
      setError(err.message || `Failed to create ${clientType}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => {
      onOpenChange(open)
      if (!open) resetForm()
    }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New {CLIENT_TYPE_LABELS[clientType]}</DialogTitle>
          <DialogDescription>
            Add a new {CLIENT_TYPE_LABELS[clientType].toLowerCase()} to the system
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="company">Company Name *</Label>
            <Input
              id="company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g., ABC Coffee Trading"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fantasy_name">Brand/Fantasy Name</Label>
            <Input
              id="fantasy_name"
              value={fantasyName}
              onChange={(e) => setFantasyName(e.target.value)}
              placeholder="e.g., ABC Coffee (optional)"
            />
            <p className="text-xs text-muted-foreground">
              Short name or brand name used in reports and certificates
            </p>
          </div>

          {CLIENT_TYPE_DB_VALUES[clientType].length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="client_type">Client Type</Label>
              <Select
                value={selectedType}
                onValueChange={setSelectedType}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {clientType === 'exporter' && (
                    <>
                      <SelectItem value="exporter">Exporter</SelectItem>
                      <SelectItem value="producer_exporter">Producer/Exporter</SelectItem>
                    </>
                  )}
                  {clientType === 'roaster' && (
                    <>
                      <SelectItem value="roaster">Roaster</SelectItem>
                      <SelectItem value="roaster_final_buyer">Roaster/Final Importer</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@company.com (optional)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 234 567 8900 (optional)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Select
              value={country}
              onValueChange={setCountry}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select country (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No country selected</SelectItem>
                <SelectItem value="Brazil">Brazil</SelectItem>
                <SelectItem value="Colombia">Colombia</SelectItem>
                <SelectItem value="Ethiopia">Ethiopia</SelectItem>
                <SelectItem value="Guatemala">Guatemala</SelectItem>
                <SelectItem value="Peru">Peru</SelectItem>
                <SelectItem value="Kenya">Kenya</SelectItem>
                <SelectItem value="Honduras">Honduras</SelectItem>
                <SelectItem value="Costa Rica">Costa Rica</SelectItem>
                <SelectItem value="El Salvador">El Salvador</SelectItem>
                <SelectItem value="Nicaragua">Nicaragua</SelectItem>
                <SelectItem value="United States">United States</SelectItem>
                <SelectItem value="Germany">Germany</SelectItem>
                <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                <SelectItem value="Netherlands">Netherlands</SelectItem>
                <SelectItem value="Japan">Japan</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !company}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              `Create ${CLIENT_TYPE_LABELS[clientType]}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
