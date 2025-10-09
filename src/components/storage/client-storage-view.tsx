'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Package, Eye, Grid3x3, MapPin } from 'lucide-react'
import { ShelfDetailDialog } from './shelf-detail-dialog'

interface ClientStorageViewProps {
  clientId?: string // If provided, override API call
}

export function ClientStorageView({ clientId }: ClientStorageViewProps) {
  const [loading, setLoading] = useState(true)
  const [shelves, setShelves] = useState<any[]>([])
  const [statistics, setStatistics] = useState<any>(null)
  const [selectedShelf, setSelectedShelf] = useState<any>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)

  useEffect(() => {
    loadClientStorage()
  }, [clientId])

  const loadClientStorage = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/clients/me/storage-view')
      const data = await response.json()

      if (response.ok) {
        setShelves(data.shelves)
        setStatistics(data.statistics)
      } else {
        console.error('Failed to load client storage:', data.error)
      }
    } catch (error) {
      console.error('Error loading client storage:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleViewShelf = (shelf: any) => {
    setSelectedShelf(shelf)
    setDetailDialogOpen(true)
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading your storage information...
      </div>
    )
  }

  if (!shelves || shelves.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Grid3x3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No Storage Assigned</h3>
          <p className="text-muted-foreground">
            You do not have any dedicated storage shelves assigned yet.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-6">
        {/* Statistics */}
        {statistics && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{statistics.total_shelves}</div>
                <p className="text-xs text-muted-foreground">Your Dedicated Shelves</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {statistics.total_capacity.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Storage Capacity</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {statistics.your_samples_count.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Your Stored Samples</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Shelves Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shelves.map((shelf) => {
            const utilizationPercent = shelf.utilization?.utilization_percentage || 0

            return (
              <Card key={shelf.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Grid3x3 className="h-4 w-4" />
                    Shelf {shelf.shelf_letter}
                  </CardTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>{shelf.laboratories?.name}</span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Your Samples</span>
                      <span className="font-semibold">{shelf.your_samples_count || 0}</span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total Capacity</span>
                      <span className="font-semibold">{shelf.total_capacity.toLocaleString()}</span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Overall Utilization</span>
                      <span className="font-semibold">{utilizationPercent.toFixed(1)}%</span>
                    </div>

                    {/* Utilization bar */}
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          utilizationPercent < 50
                            ? 'bg-green-500'
                            : utilizationPercent < 80
                            ? 'bg-yellow-500'
                            : 'bg-orange-500'
                        }`}
                        style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
                      />
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewShelf(shelf)}
                    className="w-full"
                  >
                    <Package className="h-3 w-3 mr-2" />
                    View Your Samples
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Shelf Detail Dialog (client view) */}
      {selectedShelf && (
        <ShelfDetailDialog
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          shelfId={selectedShelf.id}
          laboratoryId={selectedShelf.laboratory_id}
          shelfLetter={selectedShelf.shelf_letter}
        />
      )}
    </>
  )
}
