'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface SampleTabItem {
  id: string
  label: string
  sublabel: string
  /** 'none' = grey/ungraded, 'in-progress' = yellow, 'pass' = green, 'fail' = red */
  status: 'none' | 'in-progress' | 'pass' | 'fail'
}

interface SampleTabsNavigationProps {
  samples: SampleTabItem[]
  activeSampleId: string
  onSampleChange: (id: string) => void
}

const STATUS_BG: Record<SampleTabItem['status'], { active: string; inactive: string }> = {
  'none': {
    active: 'bg-muted/60',
    inactive: '',
  },
  'in-progress': {
    active: 'bg-yellow-500/30',
    inactive: 'bg-yellow-500/15',
  },
  'pass': {
    active: 'bg-green-500/30',
    inactive: 'bg-green-500/15',
  },
  'fail': {
    active: 'bg-red-500/30',
    inactive: 'bg-red-500/15',
  },
}

export function SampleTabsNavigation({
  samples,
  activeSampleId,
  onSampleChange,
}: SampleTabsNavigationProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [showArrows, setShowArrows] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const overflows = el.scrollWidth > el.clientWidth + 1
    setShowArrows(overflows)
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  const scrollTabs = useCallback((direction: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: direction === 'left' ? -200 : 200, behavior: 'smooth' })
    setTimeout(updateScrollState, 300)
  }, [updateScrollState])

  // Scroll active tab into view when it changes
  useEffect(() => {
    if (!activeSampleId || !scrollRef.current) return
    const activeTab = scrollRef.current.querySelector(`[data-sample-id="${activeSampleId}"]`)
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      setTimeout(updateScrollState, 300)
    }
  }, [activeSampleId, updateScrollState])

  // Update scroll state when samples change or on resize
  useEffect(() => {
    updateScrollState()
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(updateScrollState)
    observer.observe(el)
    return () => observer.disconnect()
  }, [samples, updateScrollState])

  return (
    <div className="border-b bg-card sticky top-0 z-50 shrink-0">
      <div className="flex items-center">
        {/* Left arrow - always rendered when tabs overflow, disabled when at start */}
        {showArrows && (
          <Button
            variant="ghost"
            size="icon"
            className="h-14 w-8 shrink-0 rounded-none border-r disabled:opacity-30"
            onClick={() => scrollTabs('left')}
            disabled={!canScrollLeft}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}

        {/* Scrollable tabs container with thin scrollbar */}
        <div
          ref={scrollRef}
          className="overflow-x-auto overflow-y-hidden flex-1 sample-tabs-scroll"
          onScroll={updateScrollState}
        >
          <TabsList className="h-14 bg-transparent border-b-0 rounded-none flex-nowrap justify-start w-max">
            {samples.map((sample, index) => {
              const isActive = sample.id === activeSampleId
              const statusColors = STATUS_BG[sample.status]
              const bgColor = isActive ? statusColors.active : statusColors.inactive

              return (
                <div
                  key={sample.id}
                  data-sample-id={sample.id}
                  className={`flex items-center ${bgColor}`}
                >
                  {index > 0 && <div className="h-8 w-px bg-border/60 mx-1" />}
                  <TabsTrigger
                    value={sample.id}
                    className={`rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent hover:bg-accent/50 transition-colors py-3 ${index === 0 ? 'pl-6 pr-4' : 'px-4'}`}
                  >
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={`text-sm ${isActive ? 'font-bold underline decoration-1 underline-offset-2' : 'font-medium'}`}>
                        {sample.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {sample.sublabel}
                      </span>
                    </div>
                  </TabsTrigger>
                </div>
              )
            })}
          </TabsList>
        </div>

        {/* Right arrow - always rendered when tabs overflow, disabled when at end */}
        {showArrows && (
          <Button
            variant="ghost"
            size="icon"
            className="h-14 w-8 shrink-0 rounded-none border-l disabled:opacity-30"
            onClick={() => scrollTabs('right')}
            disabled={!canScrollRight}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

export type { SampleTabItem }
