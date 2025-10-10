'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PositionGrid } from './position-grid'
import { PositionAssignmentDialog } from './position-assignment-dialog'
import { Package, X, Calendar, MapPin, FileText } from 'lucide-react'
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
  const [canManage, setCanManage] = useState(false)

  // Check user permissions
  useEffect(() => {
    async function checkPermissions() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setCanManage(false)
        return
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('qc_role, laboratory_id, is_global_admin')
        .eq('id', user.id)
        .single()

      const profile = profileData as ProfileData | null

      if (profile) {
        // User can manage if they are global admin, global_quality_admin, or lab_quality_manager for this lab
        const canManagePositions = profile.is_global_admin ||
          profile.qc_role === 'global_quality_admin' ||
          (profile.qc_role === 'lab_quality_manager' && profile.laboratory_id === laboratoryId)

        setCanManage(canManagePositions)
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

  const handlePositionClick = (position: Position) => {
    setSelectedPosition(position)
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

            <div className="flex gap-6 flex-1 overflow-hidden min-h-0">
              {/* Position Grid */}
              <div className="flex-1 min-h-0">
                <PositionGrid
                  shelf={shelf}
                  grid={grid}
                  onPositionClick={handlePositionClick}
                  onPositionAssignClick={handlePositionAssignClick}
                  selectedPositionId={selectedPosition?.id}
                  size="responsive"
                  canManage={canManage}
                />
              </div>

              {/* Position Details Panel */}
              {selectedPosition && (
                <Card className="w-80 flex-shrink-0">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">{selectedPosition.position_code}</h3>
                        <p className="text-sm text-muted-foreground">
                          {selectedPosition.current_count} / {selectedPosition.capacity_per_position} samples
                        </p>
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
      {positionToAssign && (
        <PositionAssignmentDialog
          open={assignmentDialogOpen}
          onOpenChange={setAssignmentDialogOpen}
          positionId={positionToAssign.id}
          laboratoryId={laboratoryId}
          positionCode={positionToAssign.position_code}
          currentClientId={positionToAssign.client_id}
          currentAllowClientView={positionToAssign.allow_client_view}
          onAssignmentUpdated={handleAssignmentUpdated}
        />
      )}
    </Dialog>
  )
}
