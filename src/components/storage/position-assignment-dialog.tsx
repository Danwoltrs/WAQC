'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { User, Users, Eye, EyeOff } from 'lucide-react'

interface PositionAssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  positionId?: string
  positionIds?: string[]
  laboratoryId: string
  positionCode: string
  currentClientId?: string | null
  currentAllowClientView?: boolean
  onAssignmentUpdated?: () => void
}

interface Client {
  id: string
  name: string
  contact_name: string
}

export function PositionAssignmentDialog({
  open,
  onOpenChange,
  positionId,
  positionIds,
  laboratoryId,
  positionCode,
  currentClientId,
  currentAllowClientView,
  onAssignmentUpdated
}: PositionAssignmentDialogProps) {
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string | null>(currentClientId || null)
  const [allowClientView, setAllowClientView] = useState(currentAllowClientView || false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      loadClients()
      setSelectedClientId(currentClientId || null)
      setAllowClientView(currentAllowClientView || false)
    }
  }, [open, currentClientId, currentAllowClientView])

  const loadClients = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/clients')
      const data = await response.json()

      if (response.ok) {
        setClients(data.clients || [])
      } else {
        console.error('Failed to load clients:', data.error)
      }
    } catch (error) {
      console.error('Error loading clients:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)

      // Determine if this is a bulk operation
      const isBulkOperation = positionIds && positionIds.length > 0
      const targetPositionIds = isBulkOperation ? positionIds : [positionId!]

      // If bulk operation, update all positions
      if (isBulkOperation) {
        const updatePromises = targetPositionIds.map(id =>
          fetch(`/api/laboratories/${laboratoryId}/positions/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: selectedClientId,
              allow_client_view: allowClientView
            })
          })
        )

        const results = await Promise.all(updatePromises)
        const allSuccess = results.every(r => r.ok)

        if (allSuccess) {
          onAssignmentUpdated?.()
          onOpenChange(false)
        } else {
          console.error('Some position updates failed')
          alert('Some positions failed to update. Please try again.')
        }
      } else {
        // Single position update
        const response = await fetch(`/api/laboratories/${laboratoryId}/positions/${positionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: selectedClientId,
            allow_client_view: allowClientView
          })
        })

        const data = await response.json()

        if (response.ok) {
          onAssignmentUpdated?.()
          onOpenChange(false)
        } else {
          console.error('Failed to update position assignment:', data.error)
          alert(`Failed to update position assignment: ${data.error}`)
        }
      }
    } catch (error) {
      console.error('Error updating position assignment:', error)
      alert('Failed to update position assignment')
    } finally {
      setSaving(false)
    }
  }

  const isBulkOperation = positionIds && positionIds.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isBulkOperation
              ? `Assign ${positionIds.length} Positions`
              : `Assign Position ${positionCode}`}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading clients...
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Client Assignment Options */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Client Assignment</Label>

              {/* Open for All Clients */}
              <button
                onClick={() => setSelectedClientId(null)}
                className={`w-full flex items-center gap-3 p-4 border rounded-lg transition-all ${
                  selectedClientId === null
                    ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-2'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary/50'
                }`}
              >
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  selectedClientId === null ? 'bg-primary text-primary-foreground' : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  <Users className="h-5 w-5" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-semibold">Available for All Clients</div>
                  <div className="text-sm text-muted-foreground">
                    Any client can use this position
                  </div>
                </div>
              </button>

              {/* Specific Client Assignment */}
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground font-medium">
                  Or assign to a specific client:
                </div>
                <div className="max-h-[300px] overflow-y-auto space-y-2 border rounded-lg p-2">
                  {clients.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                      No clients available
                    </div>
                  ) : (
                    clients.map((client) => (
                      <button
                        key={client.id}
                        onClick={() => setSelectedClientId(client.id)}
                        className={`w-full flex items-center gap-3 p-3 border rounded-lg transition-all ${
                          selectedClientId === client.id
                            ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-2'
                            : 'border-gray-200 dark:border-gray-700 hover:border-primary/50'
                        }`}
                      >
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                          selectedClientId === client.id ? 'bg-primary text-primary-foreground' : 'bg-gray-100 dark:bg-gray-800'
                        }`}>
                          <User className="h-4 w-4" />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="font-medium">{client.name}</div>
                          {client.contact_name && (
                            <div className="text-xs text-muted-foreground">
                              {client.contact_name}
                            </div>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Client Visibility Toggle */}
            {selectedClientId && (
              <div className="space-y-3 pt-4 border-t">
                <Label className="text-base font-semibold">Client Visibility</Label>
                <button
                  onClick={() => setAllowClientView(!allowClientView)}
                  className={`w-full flex items-center gap-3 p-4 border rounded-lg transition-all ${
                    allowClientView
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                    allowClientView ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-gray-800'
                  }`}>
                    {allowClientView ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold">
                      {allowClientView ? 'Client Can View' : 'Client Cannot View'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {allowClientView
                        ? 'Client can see samples in this position in their dashboard'
                        : 'Position is private to laboratory staff only'
                      }
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? 'Saving...' : 'Save Assignment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
