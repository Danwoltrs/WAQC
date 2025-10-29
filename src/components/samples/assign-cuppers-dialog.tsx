'use client'

import { useState, useEffect } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Users, CheckCircle2 } from 'lucide-react'

interface Cupper {
  id: string
  full_name: string
  email: string
  laboratory_id?: string
  qc_role?: string
}

interface AssignCuppersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleCount: number
  onAssign: (cupperIds: string[], cuppers: Cupper[]) => void
}

export function AssignCuppersDialog({
  open,
  onOpenChange,
  sampleCount,
  onAssign,
}: AssignCuppersDialogProps) {
  const [cuppers, setCuppers] = useState<Cupper[]>([])
  const [selectedCuppers, setSelectedCuppers] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      loadCuppers()
    }
  }, [open])

  const loadCuppers = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/profiles?role=lab_personnel&limit=50')
      if (response.ok) {
        const data = await response.json()
        setCuppers(data.profiles || [])
      } else {
        console.error('Failed to load cuppers')
      }
    } catch (error) {
      console.error('Error loading cuppers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleCupper = (cupperId: string) => {
    const newSelected = new Set(selectedCuppers)
    if (newSelected.has(cupperId)) {
      newSelected.delete(cupperId)
    } else {
      newSelected.add(cupperId)
    }
    setSelectedCuppers(newSelected)
  }

  const handleAssign = () => {
    const selectedCupperObjects = cuppers.filter((c) => selectedCuppers.has(c.id))
    onAssign(Array.from(selectedCuppers), selectedCupperObjects)
    setSelectedCuppers(new Set()) // Clear selection
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Assign Cuppers</DialogTitle>
          <DialogDescription>
            Select cuppers who will evaluate the {sampleCount} selected sample
            {sampleCount !== 1 ? 's' : ''}. Multiple cuppers can be assigned.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Selection Summary */}
          {selectedCuppers.size > 0 && (
            <div className="rounded-md bg-muted p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {selectedCuppers.size} cupper{selectedCuppers.size !== 1 ? 's' : ''} selected
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCuppers(new Set())}
              >
                Clear All
              </Button>
            </div>
          )}

          {/* Cuppers List */}
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading cuppers...
            </div>
          ) : cuppers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No cuppers available
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              <Label className="text-sm font-semibold">
                Available Cuppers ({cuppers.length})
              </Label>
              <div className="space-y-2">
                {cuppers.map((cupper) => (
                  <div
                    key={cupper.id}
                    className={`flex items-center space-x-3 rounded-md border p-3 cursor-pointer transition-colors hover:bg-muted ${
                      selectedCuppers.has(cupper.id) ? 'bg-muted border-primary' : ''
                    }`}
                    onClick={() => handleToggleCupper(cupper.id)}
                  >
                    <Checkbox
                      checked={selectedCuppers.has(cupper.id)}
                      onCheckedChange={() => handleToggleCupper(cupper.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{cupper.full_name}</span>
                        {cupper.qc_role && (
                          <Badge variant="outline" className="text-xs">
                            {cupper.qc_role.replace('_', ' ')}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {cupper.email}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={selectedCuppers.size === 0}
          >
            <Users className="h-4 w-4 mr-2" />
            Assign {selectedCuppers.size > 0 ? selectedCuppers.size : ''} Cupper
            {selectedCuppers.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
