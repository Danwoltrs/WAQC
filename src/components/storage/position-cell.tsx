'use client'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Package, UserCog } from 'lucide-react'

interface PositionCellProps {
  position: {
    id: string
    position_code: string
    current_count: number
    capacity_per_position: number
    is_available: boolean
    samples?: any[]
    client_id?: string | null
  } | null
  onClick?: () => void
  onAssignClick?: () => void
  isSelected?: boolean
  cellSize?: number
  canManage?: boolean
}

export function PositionCell({ position, onClick, onAssignClick, isSelected, cellSize = 64, canManage = false }: PositionCellProps) {
  if (!position) {
    return (
      <div
        className="border border-dashed border-gray-200 dark:border-gray-700 rounded-md flex items-center justify-center text-gray-300 dark:text-gray-600"
        style={{
          height: `${cellSize}px`,
          width: `${cellSize}px`
        }}
      >
        <span className="text-xs">—</span>
      </div>
    )
  }

  const utilizationPercent = (position.current_count / position.capacity_per_position) * 100

  // Determine color based on utilization
  const getColorClass = () => {
    if (position.current_count === 0) {
      return 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500'
    } else if (utilizationPercent < 50) {
      return 'bg-green-50 dark:bg-green-900 border-green-300 dark:border-green-600 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-800'
    } else if (utilizationPercent < 80) {
      return 'bg-yellow-50 dark:bg-yellow-900 border-yellow-300 dark:border-yellow-600 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-800'
    } else if (utilizationPercent < 100) {
      return 'bg-orange-50 dark:bg-orange-900 border-orange-300 dark:border-orange-600 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-800'
    } else {
      return 'bg-red-50 dark:bg-red-900 border-red-300 dark:border-red-600 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-800'
    }
  }

  const colorClass = getColorClass()

  // Calculate font sizes based on cell size
  const fontSize = Math.max(10, Math.floor(cellSize / 6))
  const smallFontSize = Math.max(8, Math.floor(cellSize / 10))
  const iconSize = Math.max(12, Math.floor(cellSize / 6))

  return (
    <button
      onClick={onClick}
      className={cn(
        'border rounded-md flex flex-col items-center justify-center transition-all relative group',
        colorClass,
        isSelected && 'ring-2 ring-primary ring-offset-2 dark:ring-offset-gray-900',
        onClick && 'cursor-pointer',
        !onClick && 'cursor-default'
      )}
      style={{
        height: `${cellSize}px`,
        width: `${cellSize}px`,
        fontSize: `${fontSize}px`
      }}
    >
      {/* Position Code */}
      <span className="font-semibold">{position.position_code}</span>

      {/* Capacity indicator */}
      <span className="opacity-70" style={{ fontSize: `${smallFontSize}px` }}>
        {position.current_count}/{position.capacity_per_position}
      </span>

      {/* Utilization bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10 dark:bg-white/10 rounded-b-md overflow-hidden">
        <div
          className="h-full bg-current opacity-50"
          style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
        />
      </div>

      {/* Hover tooltip */}
      {onClick && (
        <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
          {position.current_count > 0 ? (
            <>
              <div>{position.position_code}</div>
              <div>{position.current_count} of {position.capacity_per_position} samples</div>
              {position.samples && position.samples.length > 0 && (
                <div className="text-[10px] mt-1">Click for details</div>
              )}
            </>
          ) : (
            <>
              <div>{position.position_code}</div>
              <div>Empty position</div>
            </>
          )}
        </div>
      )}

      {/* Sample indicator */}
      {position.current_count > 0 && (
        <Package
          className="absolute top-1 right-1 opacity-50"
          style={{
            height: `${iconSize}px`,
            width: `${iconSize}px`
          }}
        />
      )}

      {/* Assignment indicator */}
      {canManage && onAssignClick && (
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            onAssignClick()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onAssignClick()
            }
          }}
          className="absolute top-1 left-1 bg-background/80 backdrop-blur-sm rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-primary/10 z-10"
          aria-label="Assign position to client"
        >
          <UserCog
            className="text-muted-foreground hover:text-primary"
            style={{
              height: `${iconSize}px`,
              width: `${iconSize}px`
            }}
          />
        </div>
      )}
    </button>
  )
}
