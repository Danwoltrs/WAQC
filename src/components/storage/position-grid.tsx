'use client'

import { PositionCell } from './position-cell'
import { Badge } from '@/components/ui/badge'
import { useEffect, useState, useRef } from 'react'

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
}

interface PositionGridProps {
  shelf: {
    id: string
    shelf_letter: string
    rows: number
    columns: number
  }
  grid: (Position | null)[][]
  onPositionClick?: (position: Position, isCtrlClick?: boolean) => void
  onPositionAssignClick?: (position: Position) => void
  selectedPositionId?: string
  selectedPositionIds?: Set<string>
  selectionMode?: boolean
  size?: 'sm' | 'md' | 'lg' | 'responsive'
  canManage?: boolean
}

export function PositionGrid({
  shelf,
  grid,
  onPositionClick,
  onPositionAssignClick,
  selectedPositionId,
  selectedPositionIds,
  selectionMode = false,
  size = 'responsive',
  canManage = false
}: PositionGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [cellSize, setCellSize] = useState(96)
  const [headerSize, setHeaderSize] = useState(48)

  // Generate row letters (A, B, C, etc.)
  const getRowLetter = (rowIndex: number) => {
    return String.fromCharCode(65 + rowIndex) // A=65 in ASCII
  }

  // Calculate optimal cell size based on available space
  useEffect(() => {
    if (size === 'responsive' && containerRef.current) {
      const calculateSize = () => {
        const container = containerRef.current
        if (!container) return

        const containerWidth = container.clientWidth
        const containerHeight = container.clientHeight

        // Account for padding, gaps, and header
        const availableWidth = containerWidth - 100 // padding and row labels
        const availableHeight = containerHeight - 120 // padding, legend, and footer

        // Calculate cell size to fit the grid
        const cellWidth = Math.floor((availableWidth - (shelf.columns - 1) * 4) / shelf.columns)
        const cellHeight = Math.floor((availableHeight - (shelf.rows - 1) * 4) / shelf.rows)

        // Use the smaller dimension to keep cells square, with min/max bounds
        const calculatedSize = Math.max(80, Math.min(cellWidth, cellHeight, 200))
        setCellSize(calculatedSize)
        setHeaderSize(Math.max(32, calculatedSize / 3))
      }

      calculateSize()
      window.addEventListener('resize', calculateSize)
      return () => window.removeEventListener('resize', calculateSize)
    }
  }, [size, shelf.columns, shelf.rows])

  // Get fixed sizes for non-responsive mode
  const getFixedSizes = () => {
    if (size === 'sm') return { cell: 48, header: 24 }
    if (size === 'md') return { cell: 64, header: 32 }
    if (size === 'lg') return { cell: 96, header: 48 }
    return { cell: cellSize, header: headerSize }
  }

  const sizes = size === 'responsive' ? { cell: cellSize, header: headerSize } : getFixedSizes()

  return (
    <div ref={containerRef} className="flex flex-col h-full space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded" />
          <span className="text-muted-foreground">Empty</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 bg-green-50 dark:bg-green-900 border border-green-300 dark:border-green-600 rounded" />
          <span className="text-muted-foreground">&lt;50% Full</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 bg-yellow-50 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-600 rounded" />
          <span className="text-muted-foreground">50-80% Full</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 bg-orange-50 dark:bg-orange-900 border border-orange-300 dark:border-orange-600 rounded" />
          <span className="text-muted-foreground">80-100% Full</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 bg-red-50 dark:bg-red-900 border border-red-300 dark:border-red-600 rounded" />
          <span className="text-muted-foreground">At Capacity</span>
        </div>
      </div>

      {/* Grid Container */}
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-900">
          <div className="flex gap-2">
            {/* Row letters */}
            <div className="flex flex-col gap-1">
              <div style={{ height: `${sizes.header}px` }} />
              {grid.map((_, rowIndex) => (
                <div
                  key={rowIndex}
                  className="flex items-center justify-center font-semibold text-gray-600 dark:text-gray-300"
                  style={{
                    height: `${sizes.cell}px`,
                    width: `${sizes.header}px`,
                    fontSize: `${Math.max(12, sizes.header / 2)}px`
                  }}
                >
                  {getRowLetter(rowIndex)}
                </div>
              ))}
            </div>

            {/* Grid content */}
            <div className="flex flex-col gap-1">
              {/* Column numbers */}
              <div className="flex gap-1">
                {Array.from({ length: shelf.columns }, (_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-center font-semibold text-gray-600 dark:text-gray-300"
                    style={{
                      height: `${sizes.header}px`,
                      width: `${sizes.cell}px`,
                      fontSize: `${Math.max(12, sizes.header / 2)}px`
                    }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* Grid rows */}
              {grid.map((row, rowIndex) => (
                <div key={rowIndex} className="flex gap-1">
                  {row.map((position, colIndex) => (
                    <PositionCell
                      key={`${rowIndex}-${colIndex}`}
                      position={position}
                      onClick={position && onPositionClick ? (e: React.MouseEvent) => {
                        const isCtrlClick = e.ctrlKey || e.metaKey
                        onPositionClick(position, isCtrlClick)
                      } : undefined}
                      onAssignClick={position && onPositionAssignClick ? () => onPositionAssignClick(position) : undefined}
                      isSelected={position?.id === selectedPositionId}
                      isMultiSelected={selectedPositionIds?.has(position?.id || '')}
                      selectionMode={selectionMode}
                      cellSize={sizes.cell}
                      canManage={canManage}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Shelf label */}
          <div className="text-center mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Badge variant="outline" className="text-sm">
              Shelf {shelf.shelf_letter} ({shelf.rows} × {shelf.columns})
            </Badge>
          </div>
        </div>
      </div>
    </div>
  )
}

// Missing cn helper
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
