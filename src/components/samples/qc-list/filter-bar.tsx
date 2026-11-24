'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { DateRangeFields } from '@/components/filters/date-range-fields'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Search, Filter, Settings2 } from 'lucide-react'
import { COLUMN_LABELS } from './types'

const STAGE_CHIPS = ([
  { value: null, label: 'All stages' },
  { value: 'received', label: 'Received' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'roasting', label: 'Roasting' },
  { value: 'review', label: 'Review' },
  { value: 'certified', label: 'Certified' },
  { value: 'rejected', label: 'Rejected' },
] as const)

export interface SamplesFilterBarProps {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  /** The stage chips; null = "All". */
  workflowStageFilter: string | null
  onWorkflowStageFilterChange: (value: string | null) => void
  /** Behind the Filters popover; null = "All Status". */
  statusFilter: string | null
  onStatusFilterChange: (value: string | null) => void
  /** Behind the Filters popover; null = "All Types". */
  sampleTypeFilter: string | null
  onSampleTypeFilterChange: (value: string | null) => void
  originFilter: string
  onOriginFilterChange: (value: string) => void
  qualityFilter: string
  onQualityFilterChange: (value: string) => void
  dateFrom: string
  dateTo: string
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
  /** "Show deleted samples" is offered to global admins only. */
  isGlobalAdmin: boolean
  showDeleted: boolean
  onShowDeletedChange: (value: boolean) => void
  /** The count on the Filters button. */
  advancedFilterCount: number
  /** Whether "Clear all" is shown. */
  anyFilterActive: boolean
  onClearFilters: () => void
  columnVisibility: Record<string, boolean>
  onToggleColumn: (column: string) => void
}

/**
 * The left half of the QC samples list's pinned header: search, stage chips,
 * the advanced filters popover, "Clear all" and the columns menu.
 */
export function SamplesFilterBar({
  searchQuery,
  onSearchQueryChange,
  workflowStageFilter,
  onWorkflowStageFilterChange,
  statusFilter,
  onStatusFilterChange,
  sampleTypeFilter,
  onSampleTypeFilterChange,
  originFilter,
  onOriginFilterChange,
  qualityFilter,
  onQualityFilterChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  isGlobalAdmin,
  showDeleted,
  onShowDeletedChange,
  advancedFilterCount,
  anyFilterActive,
  onClearFilters,
  columnVisibility,
  onToggleColumn,
}: SamplesFilterBarProps) {
  // Everything except the search box and the stage chips, which the bar lays
  // out itself. Lives behind the Filters popover.
  const advancedFilterControls = (
    <>
      <Select value={statusFilter || 'all'} onValueChange={(val) => onStatusFilterChange(val === 'all' ? null : val)}>
        <SelectTrigger>
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="received">Received</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="under_review">Under Review</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
        </SelectContent>
      </Select>

      <Select value={sampleTypeFilter || 'all'} onValueChange={(val) => onSampleTypeFilterChange(val === 'all' ? null : val)}>
        <SelectTrigger>
          <SelectValue placeholder="Sample Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="pss">PSS</SelectItem>
          <SelectItem value="ss">SS</SelectItem>
          <SelectItem value="type">Type</SelectItem>
        </SelectContent>
      </Select>

      <Input placeholder="Origin..." value={originFilter} onChange={(e) => onOriginFilterChange(e.target.value)} />
      <Input placeholder="Quality..." value={qualityFilter} onChange={(e) => onQualityFilterChange(e.target.value)} />
      <div className="col-span-2">
        <DateRangeFields from={dateFrom} to={dateTo} onFromChange={onDateFromChange} onToChange={onDateToChange} />
      </div>
      {isGlobalAdmin && (
        <label className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Checkbox checked={showDeleted} onCheckedChange={(v) => onShowDeletedChange(v === true)} className="h-3.5 w-3.5" />
          Show deleted samples
        </label>
      )}
    </>
  )

  const renderStageChips = () => STAGE_CHIPS.map(chip => {
    const active = workflowStageFilter === chip.value
    return (
      <button
        key={chip.label}
        type="button"
        onClick={() => onWorkflowStageFilterChange(chip.value)}
        className={`h-6 px-2 text-[11px] rounded-full border whitespace-nowrap transition-colors ${
          active
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground'
        }`}
      >
        {chip.value === null ? 'All' : chip.label}
      </button>
    )
  })

  const columnsMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" title="Toggle columns">
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.entries(COLUMN_LABELS).map(([key, label]) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={columnVisibility[key]}
            onCheckedChange={() => onToggleColumn(key)}
          >
            {label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="relative w-[200px] shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search samples..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="h-7 pl-8 text-[12px]"
          />
        </div>
        {renderStageChips()}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]">
              <Filter className="h-3.5 w-3.5 mr-1" />
              Filters
              {advancedFilterCount > 0 && (
                <span className="ml-1 rounded-full bg-primary text-primary-foreground px-1.5 text-[10px] leading-4">
                  {advancedFilterCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[420px]">
            <div className="grid grid-cols-2 gap-2">
              {advancedFilterControls}
            </div>
          </PopoverContent>
        </Popover>
        {anyFilterActive && (
          <button
            type="button"
            onClick={onClearFilters}
            className="h-7 px-2 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors whitespace-nowrap"
          >
            Clear all
          </button>
        )}
        {columnsMenu()}
      </div>
    </div>
  )
}
