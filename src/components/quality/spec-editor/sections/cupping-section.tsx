'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, X, GripVertical, Copy, Settings2 } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, rectSortingStrategy, useSortable, arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  createNumericScale, createWordingScale, createBooleanScale, getScaleMaxValue,
  type AttributeScaleType,
} from '@/types/attribute-scales'
import { CUPPING_ATTRIBUTE_TEMPLATES } from '@/types/cupping-templates'

interface SectionProps {
  params: any
  patch: (slice: Record<string, any>) => void
}

const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `a_${Math.round(performance.now())}_${Math.floor(Math.random() * 1e6)}`

function scaleSummary(scale: AttributeScaleType): string {
  if (scale.type === 'numeric') return `Numeric ${scale.min}–${scale.max} · step ${scale.increment}`
  if (scale.type === 'wording') return `Wording · ${scale.options.length} levels`
  return 'Yes / No'
}

export function CuppingSection({ params, patch }: SectionProps) {
  const attrs: any[] = params?.cupping_attributes || []
  const setAttrs = (next: any[]) => patch({ cupping_attributes: next })

  // One-time: ensure every attribute has a stable id for drag + keys.
  useEffect(() => {
    if (attrs.some((a) => !a.id)) {
      setAttrs(attrs.map((a) => (a.id ? a : { ...a, id: newId() })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const withIds = attrs.map((a) => (a.id ? a : { ...a, id: newId() }))
  const totalMax = withIds.reduce((sum, a) => sum + (a.scale ? getScaleMaxValue(a.scale) : 0), 0)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = withIds.findIndex((a) => a.id === active.id)
    const newIndex = withIds.findIndex((a) => a.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    setAttrs(arrayMove(withIds, oldIndex, newIndex))
  }

  const updateAttr = (id: string, slice: any) =>
    setAttrs(withIds.map((a) => (a.id === id ? { ...a, ...slice } : a)))
  const removeAttr = (id: string) => setAttrs(withIds.filter((a) => a.id !== id))
  const duplicateAttr = (id: string) => {
    const idx = withIds.findIndex((a) => a.id === id)
    if (idx < 0) return
    const copy = { ...withIds[idx], id: newId(), attribute: `${withIds[idx].attribute} (copy)` }
    setAttrs([...withIds.slice(0, idx + 1), copy, ...withIds.slice(idx + 1)])
  }
  const addAttr = () =>
    setAttrs([...withIds, { id: newId(), attribute: 'New attribute', scale: createNumericScale(1, 10, 0.25), is_required: true }])

  const loadTemplate = (id: string) => {
    const t = CUPPING_ATTRIBUTE_TEMPLATES.find((x) => x.id === id)
    if (!t) return
    setAttrs(t.attributes.map((a) => ({ id: newId(), attribute: a.attribute, scale: a.scale, is_required: true })))
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="max-w-[460px] space-y-1.5 mb-5">
        <Label className="text-xs text-muted-foreground">Load from template</Label>
        <Select value="" onValueChange={loadTemplate}>
          <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
          <SelectContent>
            {CUPPING_ATTRIBUTE_TEMPLATES.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-base font-semibold">Attributes</h3>
          <span className="text-sm text-muted-foreground">{withIds.length}{totalMax ? ` · max total ${totalMax}` : ''}</span>
        </div>
        <Button variant="outline" size="sm" onClick={addAttr} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add attribute
        </Button>
      </div>

      {withIds.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No attributes yet — load a template or add one.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={withIds.map((a) => a.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {withIds.map((a) => (
                <AttributeCard
                  key={a.id} attr={a}
                  onUpdate={(slice) => updateAttr(a.id, slice)}
                  onRemove={() => removeAttr(a.id)}
                  onDuplicate={() => duplicateAttr(a.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <p className="text-xs text-muted-foreground mt-4">Each attribute can use a numeric, wording, or yes/no scale — edit per card.</p>
    </div>
  )
}

function AttributeCard({
  attr, onUpdate, onRemove, onDuplicate,
}: {
  attr: any
  onUpdate: (slice: any) => void
  onRemove: () => void
  onDuplicate: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: attr.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const [editing, setEditing] = useState(false)
  const scale: AttributeScaleType = attr.scale || createNumericScale(1, 10, 0.25)

  const changeType = (type: 'numeric' | 'wording' | 'boolean') => {
    if (type === scale.type) return
    if (type === 'numeric') onUpdate({ scale: createNumericScale(1, 10, 0.25) })
    else if (type === 'wording') onUpdate({ scale: createWordingScale([{ label: 'Good', value: 7 }, { label: 'Fine', value: 10 }]) })
    else onUpdate({ scale: createBooleanScale() })
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between mb-2">
        <button {...attributes} {...listeners}
          className="h-6 w-6 grid place-items-center text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          title="Drag to reorder" aria-label="Drag to reorder">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setEditing((v) => !v)} title="Edit scale"
            className={`h-6 w-6 grid place-items-center rounded-md hover:bg-muted ${editing ? 'text-[#15663f] dark:text-[#5fcf8e]' : 'text-muted-foreground'}`}>
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDuplicate} title="Duplicate"
            className="h-6 w-6 grid place-items-center rounded-md text-muted-foreground hover:bg-muted">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button onClick={onRemove} title="Remove"
            className="h-6 w-6 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Input value={attr.attribute || ''} onChange={(e) => onUpdate({ attribute: e.target.value })}
        className="h-8 font-semibold border-transparent shadow-none px-2 focus-visible:border-input" placeholder="Attribute name" />
      <Input value={attr.abbreviation || ''} onChange={(e) => onUpdate({ abbreviation: e.target.value })}
        className="h-8 mt-1.5" placeholder="Abbr. (4–5)" maxLength={6} />

      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">{scale.type}</span>
        <span className="text-[11px] text-muted-foreground truncate">{scaleSummary(scale)}</span>
      </div>

      {editing && (
        <div className="mt-3 pt-3 border-t border-border space-y-2">
          <div className="space-y-1.5">
            <Label className="text-[11px]">Scale type</Label>
            <Select value={scale.type} onValueChange={(v) => changeType(v as any)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="numeric">Numeric</SelectItem>
                <SelectItem value="wording">Wording</SelectItem>
                <SelectItem value="boolean">Yes / No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ScaleEditor scale={scale} onChange={(s) => onUpdate({ scale: s })} />
        </div>
      )}
    </div>
  )
}

function ScaleEditor({ scale, onChange }: { scale: AttributeScaleType; onChange: (s: AttributeScaleType) => void }) {
  if (scale.type === 'numeric') {
    return (
      <div className="grid grid-cols-3 gap-2">
        <NumField label="Min" value={scale.min} onChange={(v) => onChange({ ...scale, min: v })} />
        <NumField label="Max" value={scale.max} onChange={(v) => onChange({ ...scale, max: v })} />
        <NumField label="Step" value={scale.increment} onChange={(v) => onChange({ ...scale, increment: v })} />
      </div>
    )
  }
  if (scale.type === 'boolean') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px]">True label</Label>
          <Input className="h-8" value={scale.trueLabel ?? 'Yes'} onChange={(e) => onChange({ ...scale, trueLabel: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">False label</Label>
          <Input className="h-8" value={scale.falseLabel ?? 'No'} onChange={(e) => onChange({ ...scale, falseLabel: e.target.value })} />
        </div>
      </div>
    )
  }
  // wording
  const options = scale.options || []
  const setOptions = (next: typeof options) => onChange({ ...scale, options: next.map((o, i) => ({ ...o, display_order: i })) })
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px]">Wording levels</Label>
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input className="h-8 flex-1" value={o.label}
            onChange={(e) => setOptions(options.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
          <Input className="h-8 w-14 text-center" type="number" value={String(o.value)}
            onChange={(e) => setOptions(options.map((x, j) => j === i ? { ...x, value: e.target.value === '' ? 0 : parseFloat(e.target.value) } : x))} />
          <button onClick={() => setOptions(options.filter((_, j) => j !== i))}
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs"
        onClick={() => setOptions([...options, { label: 'New', value: 0, display_order: options.length }])}>
        <Plus className="h-3.5 w-3.5" /> Add level
      </Button>
    </div>
  )
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Input className="h-8 text-center" type="number" value={String(value)}
        onChange={(e) => onChange(e.target.value === '' ? 0 : parseFloat(e.target.value))} />
    </div>
  )
}
