'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Grid3x3, Package, Eye, User, Plus, Edit, UserCog, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ShelfDetailDialog } from './shelf-detail-dialog'
import { ShelfAssignmentDialog } from './shelf-assignment-dialog'

interface StorageLayoutViewProps {
  laboratoryId: string
  onAddShelf?: () => void
  canManage?: boolean
}

interface Shelf {
  id: string
  shelf_number: number
  shelf_letter: string
  rows: number
  columns: number
  samples_per_position: number
  x_position: number
  y_position: number
  client_id?: string | null
  allow_client_view?: boolean
  clients?: {
    id: string
    name: string
  } | null
  utilization?: {
    utilization_percentage: number
    current_count: number
    total_capacity: number
  }
}

export function StorageLayoutView({ laboratoryId, onAddShelf, canManage }: StorageLayoutViewProps) {
  const [loading, setLoading] = useState(true)
  const [laboratory, setLaboratory] = useState<any>(null)
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [selectedShelf, setSelectedShelf] = useState<Shelf | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [entrancePosition, setEntrancePosition] = useState({ x: 0, y: 0 })
  const [shelfPositions, setShelfPositions] = useState<Record<string, { x: number, y: number }>>({})
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [scale, setScale] = useState(1)
  const floorPlanRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadStorageLayout()
  }, [laboratoryId])

  // Auto-dismiss notifications after 4 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  useEffect(() => {
    if (laboratory) {
      setEntrancePosition({
        x: laboratory.entrance_x_position || 0,
        y: laboratory.entrance_y_position || 0
      })
    }
  }, [laboratory])

  // Calculate scale based on container size
  useEffect(() => {
    const calculateScale = () => {
      if (!floorPlanRef.current || shelves.length === 0) return

      const container = floorPlanRef.current
      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight

      // Find the maximum extent of all shelves and entrance
      let maxX = Math.max(
        entrancePosition.x,
        ...shelves.map(s => {
          const pos = shelfPositions[s.id] || { x: s.x_position, y: s.y_position }
          return pos.x + s.columns * 2 // Each column = 2 grid units
        })
      )
      let maxY = Math.max(
        entrancePosition.y,
        ...shelves.map(s => {
          const pos = shelfPositions[s.id] || { x: s.x_position, y: s.y_position }
          return pos.y + 2 // Approximate height in grid units
        })
      )

      // Add some padding
      maxX += 3
      maxY += 3

      // Calculate scale to fit content
      const baseGridSize = 50
      const scaleX = (containerWidth - 40) / (maxX * baseGridSize)
      const scaleY = (containerHeight - 40) / (maxY * baseGridSize)

      // Use the smaller scale to ensure everything fits, with min/max bounds
      const newScale = Math.max(0.3, Math.min(1, Math.min(scaleX, scaleY)))
      setScale(newScale)
    }

    calculateScale()
    window.addEventListener('resize', calculateScale)
    return () => window.removeEventListener('resize', calculateScale)
  }, [shelves, entrancePosition, shelfPositions])

  const loadStorageLayout = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/laboratories/${laboratoryId}/storage-layout`)
      const data = await response.json()

      if (response.ok) {
        setLaboratory(data.laboratory)
        setShelves(data.shelves)

        // Initialize shelf positions
        const positions: Record<string, { x: number, y: number }> = {}
        data.shelves.forEach((shelf: Shelf) => {
          positions[shelf.id] = { x: shelf.x_position, y: shelf.y_position }
        })
        setShelfPositions(positions)
      } else {
        console.error('Failed to load storage layout:', data.error)
      }
    } catch (error) {
      console.error('Error loading storage layout:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleShelfClick = (shelf: Shelf) => {
    if (!editMode) {
      setSelectedShelf(shelf)
      setDetailDialogOpen(true)
    }
  }

  const handleAssignClick = (shelf: Shelf, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedShelf(shelf)
    setAssignmentDialogOpen(true)
  }

  const handleAssignmentUpdated = () => {
    // Reload the storage layout to show updated assignments
    loadStorageLayout()
  }

  const handleSaveFloorPlan = async () => {
    try {
      console.log('Saving floor plan...', {
        laboratoryId,
        entrancePosition,
        shelfPositionsCount: Object.keys(shelfPositions).length
      })

      // Update laboratory entrance position
      const labPayload = {
        entrance_x_position: entrancePosition.x,
        entrance_y_position: entrancePosition.y
      }
      console.log('Updating laboratory with:', labPayload)

      const labResponse = await fetch(`/api/laboratories/${laboratoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(labPayload)
      })

      if (!labResponse.ok) {
        const errorData = await labResponse.json()
        console.error('Failed to update entrance position:', errorData)
        setNotification({
          type: 'error',
          message: `Failed to update entrance position: ${errorData.error || 'Unknown error'}`
        })
        return
      }

      const labResult = await labResponse.json()
      console.log('Laboratory update successful:', labResult)

      // Update all shelf positions
      const updatePromises = Object.entries(shelfPositions).map(([shelfId, position]) =>
        fetch(`/api/laboratories/${laboratoryId}/shelves/${shelfId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            x_position: position.x,
            y_position: position.y
          })
        })
      )

      const results = await Promise.all(updatePromises)
      const allSuccess = results.every(r => r.ok)

      if (allSuccess) {
        setEditMode(false)
        // Force a fresh reload without cache
        await loadStorageLayout()
        console.log('Floor plan saved successfully')
        setNotification({ type: 'success', message: 'Floor plan updated successfully' })
      } else {
        console.error('Some shelf updates failed')
        setNotification({ type: 'error', message: 'Some shelf positions failed to update' })
      }
    } catch (error) {
      console.error('Error updating floor plan:', error)
      setNotification({
        type: 'error',
        message: 'Failed to update floor plan: ' + (error instanceof Error ? error.message : 'Unknown error')
      })
    }
  }

  const getUtilizationColor = (percentage: number) => {
    if (percentage === 0) return 'bg-gray-100 border-gray-300'
    if (percentage < 50) return 'bg-green-100 border-green-400'
    if (percentage < 80) return 'bg-yellow-100 border-yellow-400'
    if (percentage < 100) return 'bg-orange-100 border-orange-400'
    return 'bg-red-100 border-red-400'
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading storage layout...
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        {/* Laboratory Statistics */}
        {laboratory?.statistics && (
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{laboratory.statistics.total_shelves}</div>
                <p className="text-xs text-muted-foreground">Total Shelves</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {laboratory.statistics.total_capacity.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Sample Storage Capacity</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {laboratory.statistics.current_count.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Currently Stored</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className={cn(
                  'text-2xl font-bold',
                  laboratory.statistics.utilization_percentage < 50 && 'text-green-600',
                  laboratory.statistics.utilization_percentage >= 50 && laboratory.statistics.utilization_percentage < 80 && 'text-yellow-600',
                  laboratory.statistics.utilization_percentage >= 80 && 'text-orange-600'
                )}>
                  {laboratory.statistics.utilization_percentage.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">Utilization</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 2D Floor Plan */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Lab Floor Plan</CardTitle>
              <div className="flex gap-2">
                {canManage && !editMode && onAddShelf && (
                  <Button onClick={onAddShelf} size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Shelf
                  </Button>
                )}
                {canManage && !editMode && (
                  <Button onClick={() => setEditMode(true)} size="sm" variant="outline">
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Floor Plan
                  </Button>
                )}
                {editMode && (
                  <>
                    <Button onClick={() => setEditMode(false)} size="sm" variant="outline">
                      Cancel
                    </Button>
                    <Button onClick={handleSaveFloorPlan} size="sm">
                      Save Changes
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {shelves.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Grid3x3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="mb-2">No shelves configured</p>
                {canManage && onAddShelf && (
                  <Button onClick={onAddShelf} variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Shelf
                  </Button>
                )}
              </div>
            ) : (
              <div
                ref={floorPlanRef}
                className="relative min-h-[300px] h-[60vh] bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border-2 border-dashed border-gray-200 dark:border-gray-700 overflow-auto"
              >
                {/* Grid background */}
                <div
                  className="absolute inset-0 pointer-events-none dark:opacity-30"
                  style={{
                    backgroundImage: 'linear-gradient(to right, rgba(229, 231, 235, 1) 1px, transparent 1px), linear-gradient(to bottom, rgba(229, 231, 235, 1) 1px, transparent 1px)',
                    backgroundSize: `${50 * scale}px ${50 * scale}px`
                  }}
                />

                {/* Entrance Door Indicator - Always show */}
                <div
                    draggable={editMode}
                    onDragStart={(e) => {
                      if (editMode) {
                        // Store the offset from where the user grabbed the element
                        const rect = e.currentTarget.getBoundingClientRect()
                        setDragOffset({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top
                        })
                        e.dataTransfer.effectAllowed = 'move'
                      }
                    }}
                    onDragEnd={(e) => {
                      if (editMode && e.clientX !== 0 && e.clientY !== 0) {
                        const parent = e.currentTarget.parentElement
                        if (parent) {
                          const rect = parent.getBoundingClientRect()

                          // Calculate position based on top-left corner
                          const x = Math.round((e.clientX - rect.left - dragOffset.x) / (50 * scale))
                          const y = Math.round((e.clientY - rect.top - dragOffset.y) / (50 * scale))

                          setEntrancePosition({
                            x: Math.max(0, x),
                            y: Math.max(0, y)
                          })
                        }
                      }
                    }}
                    className={cn(
                      "absolute",
                      editMode && "cursor-move hover:scale-110 transition-transform"
                    )}
                    style={{
                      left: `${entrancePosition.x * 50 * scale + 20}px`,
                      top: `${entrancePosition.y * 50 * scale + 20}px`,
                      zIndex: 15,
                      transform: `scale(${scale})`
                    }}
                  >
                    <div className="relative group">
                      {/* Quarter circle arc (door swing) */}
                      <svg width="60" height="60" viewBox="0 0 60 60" className="absolute" style={{ left: '-30px', top: '-30px' }}>
                        {/* Door frame */}
                        <line x1="30" y1="30" x2="30" y2="0" stroke="currentColor" strokeWidth="3" className="text-blue-600 dark:text-blue-400" />
                        {/* Door arc */}
                        <path
                          d="M 30 0 A 30 30 0 0 1 60 30 L 30 30 Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeDasharray="4 2"
                          className="text-blue-500 dark:text-blue-300"
                        />
                        {/* Door swing fill */}
                        <path
                          d="M 30 0 A 30 30 0 0 1 60 30 L 30 30 Z"
                          fill="currentColor"
                          className="text-blue-100 dark:text-blue-900 opacity-30"
                        />
                      </svg>

                      {/* Center dot marker */}
                      <div className="absolute w-3 h-3 bg-blue-600 dark:bg-blue-400 rounded-full -translate-x-1/2 -translate-y-1/2" />

                      {/* Label */}
                      <div className="absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-blue-600 dark:bg-blue-500 text-white text-xs font-semibold px-2 py-1 rounded shadow-lg">
                        {editMode ? 'ENTRANCE (Drag to Move)' : 'ENTRANCE'}
                      </div>

                      {/* Hover tooltip */}
                      {!editMode && (
                        <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                          Main Entrance Door
                        </div>
                      )}
                    </div>
                  </div>

                {/* Shelves positioned on the floor plan */}
                {shelves.map((shelf) => {
                  const utilizationPercent = shelf.utilization?.utilization_percentage || 0
                  const colorClass = getUtilizationColor(utilizationPercent)
                  const currentPosition = shelfPositions[shelf.id] || { x: shelf.x_position, y: shelf.y_position }

                  return (
                    <button
                      key={shelf.id}
                      draggable={editMode}
                      onDragStart={(e) => {
                        if (editMode) {
                          // Store the offset from where the user grabbed the element
                          const rect = e.currentTarget.getBoundingClientRect()
                          setDragOffset({
                            x: e.clientX - rect.left,
                            y: e.clientY - rect.top
                          })
                          e.dataTransfer.effectAllowed = 'move'
                        }
                      }}
                      onDragEnd={(e) => {
                        if (editMode && e.clientX !== 0 && e.clientY !== 0) {
                          const parent = e.currentTarget.parentElement
                          if (parent) {
                            const rect = parent.getBoundingClientRect()

                            // Calculate position based on top-left corner
                            const x = Math.round((e.clientX - rect.left - dragOffset.x) / (50 * scale))
                            const y = Math.round((e.clientY - rect.top - dragOffset.y) / (50 * scale))

                            setShelfPositions(prev => ({
                              ...prev,
                              [shelf.id]: {
                                x: Math.max(0, x),
                                y: Math.max(0, y)
                              }
                            }))
                          }
                        }
                      }}
                      onClick={() => handleShelfClick(shelf)}
                      className={cn(
                        'absolute border-2 rounded-lg p-3 hover:shadow-lg transition-all group bg-white dark:bg-gray-800',
                        editMode ? 'cursor-move hover:scale-105' : 'cursor-pointer',
                        colorClass
                      )}
                      style={{
                        left: `${currentPosition.x * 50 * scale + 20}px`,
                        top: `${currentPosition.y * 50 * scale + 20}px`,
                        width: `${shelf.columns * 100 * scale}px`,
                        minHeight: `${80 * scale}px`,
                        fontSize: `${14 * scale}px`
                      }}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm">Shelf {shelf.shelf_letter}</span>
                          {shelf.allow_client_view && (
                            <Eye className="h-3 w-3 text-primary" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {shelf.rows}×{shelf.columns}
                        </div>
                        {shelf.clients ? (
                          <div className="flex items-center gap-1 text-xs">
                            <User className="h-2 w-2" />
                            <span className="truncate">{shelf.clients.name}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-2 w-2" />
                            <span>Open for All</span>
                          </div>
                        )}
                        <div className="text-xs font-semibold">
                          {utilizationPercent.toFixed(0)}% full
                        </div>
                      </div>

                      {/* Hover tooltip */}
                      <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {editMode ? 'Drag to move shelf' : 'Click to view positions'}
                      </div>
                    </button>
                  )
                })}

                {/* Scale indicator */}
                <div className="absolute bottom-4 right-4 text-xs text-muted-foreground bg-white dark:bg-gray-800 px-2 py-1 rounded border">
                  Scale: 1 square = 1m²
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Shelf Detail Dialog */}
      {selectedShelf && (
        <>
          <ShelfDetailDialog
            open={detailDialogOpen}
            onOpenChange={setDetailDialogOpen}
            shelfId={selectedShelf.id}
            laboratoryId={laboratoryId}
            shelfLetter={selectedShelf.shelf_letter}
          />
          <ShelfAssignmentDialog
            open={assignmentDialogOpen}
            onOpenChange={setAssignmentDialogOpen}
            shelfId={selectedShelf.id}
            laboratoryId={laboratoryId}
            shelfLetter={selectedShelf.shelf_letter}
            currentClientId={selectedShelf.client_id}
            currentAllowClientView={selectedShelf.allow_client_view}
            onAssignmentUpdated={handleAssignmentUpdated}
          />
        </>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-top duration-300">
          <div className={cn(
            "px-6 py-4 rounded-lg shadow-2xl border-2 min-w-[300px] max-w-[500px]",
            notification.type === 'success'
              ? "bg-green-50 border-green-500 text-green-900 dark:bg-green-900/20 dark:border-green-500 dark:text-green-100"
              : "bg-red-50 border-red-500 text-red-900 dark:bg-red-900/20 dark:border-red-500 dark:text-red-100"
          )}>
            <div className="flex items-center justify-between gap-4">
              <p className="font-medium">{notification.message}</p>
              <button
                onClick={() => setNotification(null)}
                className="text-current opacity-70 hover:opacity-100 transition-opacity"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
