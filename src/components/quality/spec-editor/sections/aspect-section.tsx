'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, X, GripVertical } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GREEN_ASPECT_TEMPLATES, ROAST_ASPECT_TEMPLATES,
  type AspectWording, type AspectConfiguration, type AspectConfigTemplate,
} from '@/types/aspect-configuration'

interface SectionProps {
  params: any
  patch: (slice: Record<string, any>) => void
  aspectType: 'green' | 'roast'
}

const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `w_${Math.round(performance.now())}_${Math.floor(Math.random() * 1e6)}`

function SortableWording({
  w, index, onLabel, onValue, onRemove,
}: {
  w: AspectWording; index: number
  onLabel: (v: string) => void
  onValue: (v: string) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-2 h-[42px] px-1 rounded-lg hover:bg-muted/40">
      <button
        {...attributes} {...listeners}
        className="h-7 w-6 grid place-items-center text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
        title="Drag to reorder" aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="h-6 w-6 grid place-items-center rounded-full border border-border text-[11px] font-medium text-muted-foreground shrink-0">
        {index + 1}
      </span>
      <Input value={w.label} onChange={(e) => onLabel(e.target.value)}
        className="h-8 flex-1 min-w-0 border-transparent shadow-none px-2 focus-visible:border-input" />
      <Label className="text-xs text-muted-foreground shrink-0">value</Label>
      <Input type="number" value={String(w.value)} onChange={(e) => onValue(e.target.value)}
        className="h-8 w-14 shrink-0 text-center px-1" />
      <button onClick={onRemove}
        className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
        title="Remove">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function AspectSection({ params, patch, aspectType }: SectionProps) {
  const paramKey = aspectType === 'green' ? 'green_aspect_configuration' : 'roast_aspect_configuration'
  const templates: AspectConfigTemplate[] = aspectType === 'green' ? GREEN_ASPECT_TEMPLATES : ROAST_ASPECT_TEMPLATES

  const config: AspectConfiguration = params?.[paramKey] || { wordings: [], notes: '' }
  const wordings: AspectWording[] = config.wordings || []

  const setConfig = (next: Partial<AspectConfiguration>) =>
    patch({ [paramKey]: { ...config, ...next } })

  const setWordings = (next: AspectWording[]) =>
    setConfig({ wordings: next.map((w, i) => ({ ...w, display_order: i })) })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = wordings.findIndex((w) => w.id === active.id)
    const newIndex = wordings.findIndex((w) => w.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    setWordings(arrayMove(wordings, oldIndex, newIndex))
  }

  // Add-new-wording row
  const [newLabel, setNewLabel] = useState('')
  const [newValue, setNewValue] = useState('')
  const addWording = () => {
    if (!newLabel.trim() || newValue === '') return
    const w: AspectWording = {
      id: newId(), label: newLabel.trim(), value: parseFloat(newValue), display_order: wordings.length,
    }
    setWordings([...wordings, w])
    setNewLabel(''); setNewValue('')
  }

  const loadTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    const cloned = t.configuration.wordings.map((w, i) => ({ ...w, id: newId(), display_order: i }))
    setConfig({ wordings: cloned, validation: t.configuration.validation, notes: t.configuration.notes || '' })
  }

  const minValue = config.validation?.min_acceptable_value
  const setMinValue = (raw: string) =>
    setConfig({ validation: raw === 'none' ? undefined : { ...config.validation, min_acceptable_value: parseFloat(raw) } })

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="max-w-[460px] space-y-1.5 mb-5">
          <Label className="text-xs text-muted-foreground">Load from template</Label>
          <Select value="" onValueChange={loadTemplate}>
            <SelectTrigger><SelectValue placeholder="Choose a scale…" /></SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-base font-semibold">Appearance wordings</h3>
          <span className="text-sm text-muted-foreground">{wordings.length}</span>
        </div>

        <div className="max-w-[460px]">
          {wordings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No wordings yet — load a scale or add one below.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={wordings.map((w) => w.id)} strategy={verticalListSortingStrategy}>
                <div className="divide-y divide-border/60">
                  {wordings.map((w, i) => (
                    <SortableWording
                      key={w.id} w={w} index={i}
                      onLabel={(v) => setWordings(wordings.map((x) => x.id === w.id ? { ...x, label: v } : x))}
                      onValue={(v) => setWordings(wordings.map((x) => x.id === w.id ? { ...x, value: v === '' ? 0 : parseFloat(v) } : x))}
                      onRemove={() => setWordings(wordings.filter((x) => x.id !== w.id))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <p className="text-xs text-muted-foreground mt-2">Drag the handle to reorder · higher value = better appearance.</p>

          {/* Add-new-wording row */}
          <div className="mt-3 pt-3 border-t border-dashed border-border flex items-end gap-2">
            <div className="flex-1 space-y-1.5 min-w-0">
              <Label className="text-xs">New wording</Label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Pale Green"
                onKeyDown={(e) => { if (e.key === 'Enter') addWording() }} />
            </div>
            <div className="w-20 space-y-1.5">
              <Label className="text-xs">Value</Label>
              <Input type="number" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="—"
                onKeyDown={(e) => { if (e.key === 'Enter') addWording() }} />
            </div>
            <Button onClick={addWording} disabled={!newLabel.trim() || newValue === ''} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>
      </div>

      {/* Minimum acceptable wording + notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-6 space-y-2">
          <Label className="text-xs text-muted-foreground">Minimum acceptable wording</Label>
          <Select value={minValue != null ? String(minValue) : 'none'} onValueChange={setMinValue}>
            <SelectTrigger><SelectValue placeholder="No validation" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No validation</SelectItem>
              {[...wordings].sort((a, b) => a.value - b.value).map((w) => (
                <SelectItem key={w.id} value={String(w.value)}>{w.label} (≥ {w.value})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 space-y-2">
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Input value={config.notes || ''} onChange={(e) => setConfig({ notes: e.target.value })} placeholder="Optional notes" />
        </div>
      </div>
    </div>
  )
}
