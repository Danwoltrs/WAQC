'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { FlavorWheel, zoomOutLabel } from '@/components/cupping/cva/wheel/FlavorWheel'
import { leafTerm, sanitizePicks } from '@/lib/sensory'

export interface SensoryWheelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Flavor-wheel paths, each 1-3 strings. */
  value: string[][]
  cap: number
  onSave: (picks: string[][]) => void
  readOnly?: boolean
}

const sameKey = (a: string[], b: string[]) => a.length === b.length && a.every((s, i) => s === b[i])

export function SensoryWheelDialog({ open, onOpenChange, title, value, cap, onSave, readOnly = false }: SensoryWheelDialogProps) {
  const [working, setWorking] = useState<string[][]>(() => sanitizePicks(value, cap))
  const [refusals, setRefusals] = useState(0)
  const [frame, setFrame] = useState<{ family: string | null; zoomed: boolean }>({ family: null, zoomed: false })
  const [zoomOutRequests, setZoomOutRequests] = useState(0)
  const valueRef = useRef(value)
  valueRef.current = value

  // Seed the working copy from the saved value each time the dialog opens.
  useEffect(() => {
    if (open) {
      setWorking(sanitizePicks(valueRef.current, cap))
      setRefusals(0)
      setFrame({ family: null, zoomed: false })
    }
  }, [open, cap])

  const onToggle = useCallback(
    (pick: { path: string[] }) => {
      if (readOnly) return
      const exists = working.some((p) => sameKey(p, pick.path))
      if (exists) {
        setWorking(working.filter((p) => !sameKey(p, pick.path)))
      } else if (working.length < cap) {
        setWorking([...working, pick.path])
      } else {
        setRefusals((n) => n + 1)
      }
    },
    [working, cap, readOnly],
  )

  const remove = (path: string[]) => {
    if (readOnly) return
    setWorking((w) => w.filter((p) => !sameKey(p, path)))
  }

  const save = () => {
    onSave(sanitizePicks(working, cap))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none p-0 sm:p-0 xl:h-[85vh] xl:w-[95vw] xl:max-w-5xl xl:rounded-[10px]">
        <div className="flex flex-col gap-2 border-b-[0.5px] border-border px-4 py-3 pr-12">
          <div className="flex items-baseline gap-3">
            <DialogTitle className="text-[14px] font-semibold">{title}</DialogTitle>
            <span className="text-[12px] text-muted-foreground">{`${working.length} of ${cap}`}</span>
          </div>
          <DialogDescription className="sr-only">Pick flavor descriptors from the wheel.</DialogDescription>
          <div className="flex min-h-[24px] flex-wrap gap-1.5">
            {working.map((path) => (
              <span key={path.join('>')} className="inline-flex items-center gap-1 rounded-[4px] bg-muted px-2 py-0.5 text-[12px]">
                {leafTerm(path)}
                {!readOnly && (
                  <button
                    type="button"
                    aria-label={`Remove ${leafTerm(path)}`}
                    className="rounded-[4px] opacity-60 hover:opacity-100"
                    onClick={() => remove(path)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
        <div className="cva-root relative min-h-0 flex-1" style={{ ['--cva-accent' as string]: '#556b2f' }}>
          {(frame.family || frame.zoomed) && (
            <button
              type="button"
              aria-label={zoomOutLabel(frame.family)}
              className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-[6px] border-[0.5px] border-border bg-background px-2 py-1 text-[12px]"
              onClick={() => setZoomOutRequests((n) => n + 1)}
            >
              <ArrowLeft className="h-3 w-3" aria-hidden />
              {frame.family ?? 'Whole wheel'}
            </button>
          )}
          <FlavorWheel
            picks={working.map((path) => ({ path }))}
            onToggle={onToggle}
            active={open}
            refusals={refusals}
            chrome="external"
            onFrameChange={setFrame}
            zoomOutRequests={zoomOutRequests}
          />
        </div>
        <div className="flex justify-end gap-2 border-t-[0.5px] border-border px-4 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button type="button" onClick={save}>
              Save
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
