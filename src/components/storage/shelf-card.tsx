'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Package, Eye, EyeOff, User, Grid3x3, Edit } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ShelfCardProps {
  shelf: {
    id: string
    shelf_number: number
    shelf_letter: string
    rows: number
    columns: number
    samples_per_position: number
    client_id?: string | null
    allow_client_view?: boolean
    clients?: {
      id: string
      name: string
    } | null
    utilization?: {
      total_positions: number
      occupied_positions: number
      total_capacity: number
      current_count: number
      utilization_percentage: number
    }
  }
  onViewDetails?: () => void
  onEdit?: () => void
  canEdit?: boolean
}

export function ShelfCard({ shelf, onViewDetails, onEdit, canEdit }: ShelfCardProps) {
  const utilization = shelf.utilization || {
    total_positions: 0,
    occupied_positions: 0,
    total_capacity: 0,
    current_count: 0,
    utilization_percentage: 0
  }

  const getUtilizationColor = (percentage: number) => {
    if (percentage === 0) return 'text-gray-500'
    if (percentage < 50) return 'text-green-600'
    if (percentage < 80) return 'text-yellow-600'
    if (percentage < 100) return 'text-orange-600'
    return 'text-red-600'
  }

  const totalCapacity = shelf.rows * shelf.columns * shelf.samples_per_position

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Grid3x3 className="h-4 w-4" />
              Shelf {shelf.shelf_letter}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {shelf.rows} rows × {shelf.columns} columns
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            #{shelf.shelf_number}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Client Assignment */}
        {shelf.client_id && shelf.clients ? (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-3 w-3 text-primary" />
            <span className="font-medium">{shelf.clients.name}</span>
            {shelf.allow_client_view ? (
              <Badge variant="default" className="text-xs gap-1">
                <Eye className="h-3 w-3" />
                Client Visible
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs gap-1">
                <EyeOff className="h-3 w-3" />
                Hidden
              </Badge>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-3 w-3" />
            <span>Unassigned (General Use)</span>
          </div>
        )}

        {/* Utilization Stats */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Sample Storage Capacity</span>
            <span className="font-semibold">{totalCapacity.toLocaleString()}</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Currently Stored</span>
            <span className={cn('font-semibold', getUtilizationColor(utilization.utilization_percentage))}>
              {utilization.current_count.toLocaleString()} ({utilization.utilization_percentage.toFixed(1)}%)
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Occupied Positions</span>
            <span className="font-semibold">
              {utilization.occupied_positions} / {utilization.total_positions}
            </span>
          </div>

          {/* Utilization bar */}
          <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all',
                utilization.utilization_percentage === 0 && 'bg-gray-300 dark:bg-gray-600',
                utilization.utilization_percentage > 0 && utilization.utilization_percentage < 50 && 'bg-green-500',
                utilization.utilization_percentage >= 50 && utilization.utilization_percentage < 80 && 'bg-yellow-500',
                utilization.utilization_percentage >= 80 && utilization.utilization_percentage < 100 && 'bg-orange-500',
                utilization.utilization_percentage >= 100 && 'bg-red-500'
              )}
              style={{ width: `${Math.min(utilization.utilization_percentage, 100)}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {onViewDetails && (
            <Button variant="outline" size="sm" onClick={onViewDetails} className="flex-1">
              <Package className="h-3 w-3 mr-1" />
              View Positions
            </Button>
          )}
          {canEdit && onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
