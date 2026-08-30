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
import { Users, CheckCircle2, Check, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { GUEST_NAME_MAX, normalizeGuestNames, type GuestCupper } from '@/lib/cupping/roster'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Cupper {
  id: string
  full_name: string
  email: string
  laboratory_id?: string
  qc_role?: string
  is_cupper?: boolean
  is_q_grader?: boolean
}

interface AssignCuppersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleCount: number
  onAssign: (cupperIds: string[], cuppers: Cupper[], guests: string[]) => void
  existingCupperIds?: string[]
  /** Guests already on the roster when managing cuppers; their chips are pre-filled. */
  existingGuests?: GuestCupper[]
}

export function AssignCuppersDialog({
  open,
  onOpenChange,
  sampleCount,
  onAssign,
  existingCupperIds,
  existingGuests,
}: AssignCuppersDialogProps) {
  const [cuppers, setCuppers] = useState<Cupper[]>([])
  const [selectedCuppers, setSelectedCuppers] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  // Guest cuppers: visitors without a login. Names only; ids are minted by
  // the assignment route. The list handed to onAssign is definitive.
  const [guestNames, setGuestNames] = useState<string[]>([])
  const [guestInput, setGuestInput] = useState('')

  useEffect(() => {
    if (open) {
      loadCuppers()
      setGuestNames((existingGuests ?? []).map((g) => g.name))
      setGuestInput('')
    }
  }, [open])

  const addGuest = () => {
    if (!guestInput.trim()) return
    setGuestNames((prev) => normalizeGuestNames([...prev, guestInput]))
    setGuestInput('')
  }

  const removeGuest = (name: string) => {
    setGuestNames((prev) => prev.filter((n) => n !== name))
  }

  const isEditing = existingCupperIds && existingCupperIds.length > 0

  const loadCuppers = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/cuppers')
      if (response.ok) {
        const data = await response.json()
        const loadedCuppers = data.cuppers || []
        setCuppers(loadedCuppers)
        // Pre-select existing cuppers if editing, otherwise all cuppers
        if (existingCupperIds && existingCupperIds.length > 0) {
          setSelectedCuppers(new Set(existingCupperIds))
        } else {
          setSelectedCuppers(new Set(loadedCuppers.map((c: Cupper) => c.id)))
        }
      } else {
        console.error('Failed to load cuppers:', response.status, response.statusText)
        const errorData = await response.json().catch(() => ({}))
        console.error('Error details:', errorData)
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
    onAssign(Array.from(selectedCuppers), selectedCupperObjects, guestNames)
    setSelectedCuppers(new Set()) // Clear selection
    setGuestNames([])
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Manage Cuppers' : 'Assign Cuppers'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Update cupper assignments for the ${sampleCount} selected sample${sampleCount !== 1 ? 's' : ''}.`
              : `Select cuppers who will evaluate the ${sampleCount} selected sample${sampleCount !== 1 ? 's' : ''}. Multiple cuppers can be assigned.`}
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

          {/* Cuppers Table */}
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading cuppers...
            </div>
          ) : cuppers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No cuppers available
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Available Cuppers ({cuppers.length})
              </Label>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-24 text-center">Q Grader</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cuppers.map((cupper) => (
                      <TableRow
                        key={cupper.id}
                        className={`cursor-pointer ${
                          selectedCuppers.has(cupper.id) ? 'bg-muted' : ''
                        }`}
                        onClick={() => handleToggleCupper(cupper.id)}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedCuppers.has(cupper.id)}
                            onCheckedChange={() => handleToggleCupper(cupper.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {cupper.full_name}
                        </TableCell>
                        <TableCell className="text-center">
                          {cupper.is_q_grader && (
                            <Check className="h-4 w-4 mx-auto text-primary" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Guest cuppers */}
          <div className="space-y-2">
            <Label htmlFor="guest-name" className="text-sm font-semibold">
              Guest cuppers
            </Label>
            <div className="flex gap-2">
              <Input
                id="guest-name"
                placeholder="Guest name"
                maxLength={GUEST_NAME_MAX}
                value={guestInput}
                onChange={(e) => setGuestInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addGuest()
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                aria-label="Add guest"
                onClick={addGuest}
                disabled={!guestInput.trim()}
              >
                Add
              </Button>
            </div>
            {guestNames.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {guestNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
                  >
                    {name}
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      onClick={() => removeGuest(name)}
                      className="rounded-full p-0.5 hover:bg-accent"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Visitors without a login. Each guest gets their own cards; no scores are recorded for them.
            </p>
          </div>
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
            {isEditing ? 'Update' : 'Assign'} {selectedCuppers.size > 0 ? selectedCuppers.size : ''} Cupper
            {selectedCuppers.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
