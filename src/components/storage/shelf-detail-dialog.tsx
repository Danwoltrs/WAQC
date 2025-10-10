'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PositionGrid } from './position-grid'
import { PositionAssignmentDialog } from './position-assignment-dialog'
import { Package, X, Calendar, MapPin, FileText, Users, Edit2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase-browser'

type ProfileData = {
  qc_role: string
  laboratory_id: string | null
  is_global_admin: boolean
}

interface ShelfDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shelfId: string
  laboratoryId: string
  shelfLetter?: string
}

interface Position {
  id: string
  position_code: string
  current_count: number
  capacity_per_position: number
  is_available: boolean
  row_number: number
  column_number: number
  samples?: any[]
  client_id?: string | null
  allow_client_view?: boolean
}

export function ShelfDetailDialog({
  open,
  onOpenChange,
  shelfId,
  laboratoryId,
  shelfLetter
}: ShelfDetailDialogProps) {
  const [loading, setLoading] = useState(true)
  const [shelf, setShelf] = useState<any>(null)
  const [grid, setGrid] = useState<(Position | null)[][]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [positionToAssign, setPositionToAssign] = useState<Position | null>(null)
  const [canManage, setCanManage] = useState(false) // Can assign positions to clients
  const [canUpdateCount, setCanUpdateCount] = useState(false) // Can update sample counts
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [editingCount, setEditingCount] = useState(false)
  const [newCount, setNewCount] = useState<number>(0)

  // Check user permissions
  useEffect(() => {
    async function checkPermissions() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setCanManage(false)
        setCanUpdateCount(false)
        return
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('qc_role, laboratory_id, is_global_admin')
        .eq('id', user.id)
        .single()

      const profile = profileData as ProfileData | null

      if (profile) {
        // User can manage positions (assign to clients) if they are global admin, global_quality_admin, or lab_quality_manager for this lab
        const canManagePositions = profile.is_global_admin ||
          profile.qc_role === 'global_quality_admin' ||
          (profile.qc_role === 'lab_quality_manager' && profile.laboratory_id === laboratoryId)

        setCanManage(canManagePositions)

        // User can update sample counts if they have manage permissions OR are lab staff for this lab
        const canUpdateCounts = canManagePositions ||
          (profile.qc_role === 'lab_assistant' && profile.laboratory_id === laboratoryId) ||
          (profile.qc_role === 'sample_intake_specialist' && profile.laboratory_id === laboratoryId)

        setCanUpdateCount(canUpdateCounts)
      }
    }

    checkPermissions()
  }, [laboratoryId])

  useEffect(() => {
    if (open) {
      loadShelfDetails()
    }
  }, [open, shelfId])

  const loadShelfDetails = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/laboratories/${laboratoryId}/shelves/${shelfId}/positions`)
      const data = await response.json()

      if (response.ok) {
        setShelf(data.shelf)
        setGrid(data.grid)
        setPositions(data.positions)
      } else {
        console.error('Failed to load shelf details:', data.error)
      }
    } catch (error) {
      console.error('Error loading shelf details:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePositionClick = (position: Position, isCtrlClick: boolean = false) => {
    if (selectionMode || isCtrlClick) {
      // Multi-selection mode
      setSelectedPositions(prev => {
        const newSet = new Set(prev)
        if (newSet.has(position.id)) {
          newSet.delete(position.id)
        } else {
          newSet.add(position.id)
        }
        return newSet
      })
      if (!selectionMode) {
        setSelectionMode(true)
      }
    } else {
      // Single selection mode (details panel)
      setSelectedPosition(position)
    }
  }

  const handleClosePositionDetail = () => {
    setSelectedPosition(null)
  }

  const handlePositionAssignClick = (position: Position) => {
    setPositionToAssign(position)
    setAssignmentDialogOpen(true)
  }

  const handleAssignmentUpdated = () => {
    // Reload shelf details to get updated position data
    loadShelfDetails()
    // Clear selections after bulk assignment
    setSelectedPositions(new Set())
    setSelectionMode(false)
  }

  const handleCancelSelection = () => {
    setSelectedPositions(new Set())
    setSelectionMode(false)
  }

  const handleBulkAssign = (clientId: string | null, allowClientView: boolean = false) => {
    // This will be implemented in the API update
    const positionIds = Array.from(selectedPositions)
    // For now, we'll handle this through the existing assignment dialog
    // TODO: Create bulk assignment API endpoint
  }

  const handleUpdateCount = async () => {
    if (!selectedPosition) return

    try {
      const response = await fetch(`/api/laboratories/${laboratoryId}/positions/${selectedPosition.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_count: newCount
        })
      })

      if (response.ok) {
        setEditingCount(false)
        loadShelfDetails()
      } else {
        alert('Failed to update count')
      }
    } catch (error) {
      console.error('Error updating count:', error)
      alert('Failed to update count')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] w-[98vw] max-h-[95vh] h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Shelf {shelfLetter || shelf?.shelf_letter} - Storage Positions
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">
            Loading shelf details...
          </div>
        ) : !shelf ? (
          <div className="py-12 text-center text-muted-foreground">
            Failed to load shelf details
          </div>
        ) : (
          <div className="flex flex-col flex-1 space-y-4 py-4 overflow-hidden">
            {/* Shelf summary */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-shrink-0">
              <span>Dimensions: {shelf.rows} rows × {shelf.columns} columns</span>
              <span>•</span>
              <span>Total Positions: {positions.length}</span>
              <span>•</span>
              <span>Occupied: {positions.filter(p => p.current_count > 0).length}</span>
            </div>

            {/* Bulk Actions Toolbar */}
            {canManage && (
              <div className="flex items-center justify-between gap-4 flex-shrink-0">
                {selectionMode ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{selectedPositions.size} positions selected</Badge>
                      <Button onClick={handleCancelSelection} variant="ghost" size="sm">
                        Cancel
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          // Open assignment dialog with multiple positions
                          setPositionToAssign(null)
                          setAssignmentDialogOpen(true)
                        }}
                        size="sm"
                        variant="outline"
                        disabled={selectedPositions.size === 0}
                      >
                        Assign to Client
                      </Button>
                      <Button
                        onClick={async () => {
                          // Mark positions as unusable (set capacity to 0)
                          const updatePromises = Array.from(selectedPositions).map(id =>
                            fetch(`/api/laboratories/${laboratoryId}/positions/${id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                capacity_per_position: 0
                              })
                            })
                          )

                          const results = await Promise.all(updatePromises)
                          if (results.every(r => r.ok)) {
                            handleAssignmentUpdated()
                          } else {
                            alert('Some positions failed to update')
                          }
                        }}
                        size="sm"
                        variant="outline"
                        disabled={selectedPositions.size === 0}
                      >
                        Mark as Unusable
                      </Button>
                      <Button
                        onClick={async () => {
                          // Clear all assignments (set to null)
                          const updatePromises = Array.from(selectedPositions).map(id =>
                            fetch(`/api/laboratories/${laboratoryId}/positions/${id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                client_id: null,
                                allow_client_view: false
                              })
                            })
                          )

                          const results = await Promise.all(updatePromises)
                          if (results.every(r => r.ok)) {
                            handleAssignmentUpdated()
                          } else {
                            alert('Some positions failed to update')
                          }
                        }}
                        size="sm"
                        variant="outline"
                        disabled={selectedPositions.size === 0}
                      >
                        Free for All
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setSelectionMode(true)}
                      variant="outline"
                      size="sm"
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Bulk Assign Positions
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Or Ctrl+Click positions to multi-select
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-6 flex-1 overflow-hidden min-h-0">
              {/* Position Grid */}
              <div className="flex-1 min-h-0">
                <PositionGrid
                  shelf={shelf}
                  grid={grid}
                  onPositionClick={handlePositionClick}
                  onPositionAssignClick={handlePositionAssignClick}
                  selectedPositionId={selectedPosition?.id}
                  selectedPositionIds={selectedPositions}
                  selectionMode={selectionMode}
                  size="responsive"
                  canManage={canManage}
                />
              </div>

              {/* Position Details Panel */}
              {selectedPosition && (
                <Card className="w-80 flex-shrink-0">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">
                          Position {selectedPosition.position_code.substring(1)}
                        </h3>
                        {editingCount ? (
                          <div className="flex items-center gap-2 mt-2">
                            <Input
                              type="number"
                              min="0"
                              max={selectedPosition.capacity_per_position}
                              value={newCount}
                              onChange={(e) => setNewCount(parseInt(e.target.value) || 0)}
                              className="w-20 h-8 text-sm"
                              autoFocus
                            />
                            <span className="text-sm text-muted-foreground">
                              / {selectedPosition.capacity_per_position}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleUpdateCount}
                              className="h-8 w-8 p-0"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingCount(false)}
                              className="h-8 w-8 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-sm text-muted-foreground">
                              {selectedPosition.current_count} / {selectedPosition.capacity_per_position} samples
                            </p>
                            {canUpdateCount && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setNewCount(selectedPosition.current_count)
                                  setEditingCount(true)
                                }}
                                className="h-6 w-6 p-0"
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClosePositionDetail}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Samples List */}
                    {selectedPosition.samples && selectedPosition.samples.length > 0 ? (
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-muted-foreground">
                          Stored Samples ({selectedPosition.samples.length})
                        </h4>
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                          {selectedPosition.samples.map((sample: any) => (
                            <Card key={sample.id} className="bg-accent/50">
                              <CardContent className="p-3">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Package className="h-3 w-3 text-primary" />
                                    <span className="font-medium text-sm">
                                      {sample.tracking_number}
                                    </span>
                                    <Badge variant="outline" className="text-xs">
                                      {sample.status}
                                    </Badge>
                                  </div>

                                  {sample.client_reference && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <FileText className="h-3 w-3" />
                                      <span>{sample.client_reference}</span>
                                    </div>
                                  )}

                                  {sample.origin && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <MapPin className="h-3 w-3" />
                                      <span>{sample.origin}</span>
                                    </div>
                                  )}

                                  {sample.intake_date && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <Calendar className="h-3 w-3" />
                                      <span>{new Date(sample.intake_date).toLocaleDateString()}</span>
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No samples stored</p>
                        <p className="text-xs mt-1">This position is available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </DialogContent>

      {/* Position Assignment Dialog */}
      {(positionToAssign || selectedPositions.size > 0) && (
        <PositionAssignmentDialog
          open={assignmentDialogOpen}
          onOpenChange={setAssignmentDialogOpen}
          positionId={positionToAssign?.id}
          positionIds={selectedPositions.size > 0 ? Array.from(selectedPositions) : undefined}
          laboratoryId={laboratoryId}
          positionCode={positionToAssign?.position_code || 'Multiple'}
          currentClientId={positionToAssign?.client_id}
          currentAllowClientView={positionToAssign?.allow_client_view}
          onAssignmentUpdated={handleAssignmentUpdated}
        />
      )}
    </Dialog>
  )
}
