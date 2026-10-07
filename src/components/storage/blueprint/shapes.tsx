'use client'

import type { PointerEvent as ReactPointerEvent } from 'react'
import { FLOOR_ITEM_LABELS, type FloorItem } from '@/lib/storage/floor-plan'
import type { EditorShelf } from './editor-state'
import type { ZoneStyle } from './zone-colors'

type Down = (e: ReactPointerEvent) => void

/** A shelf from above: outline, zone tint by share of cubbies, fill bar, thick front edge, letter. */
export function ShelfShape({ shelf, cmPerPx, zones, highlighted, onPointerDown }: {
  shelf: EditorShelf
  cmPerPx: number
  zones: Map<string, ZoneStyle>
  highlighted: boolean
  onPointerDown: Down
}) {
  const { x_cm: x, y_cm: y, width_cm: w, depth_cm: d, rot } = shelf
  const cx = x + w / 2
  const cy = y + d / 2
  const total = shelf.rows * shelf.columns
  const capacity = total * shelf.samples_per_position
  const occupied = shelf.cubbies.reduce((n, c) => n + c.occupied, 0)

  const counts = new Map<string, number>()
  for (const c of shelf.cubbies) if (c.company_id) counts.set(c.company_id, (counts.get(c.company_id) ?? 0) + 1)
  let offset = 0
  const stripes = [...counts].map(([id, n]) => {
    const width = total > 0 ? (w * n) / total : 0
    const style = zones.get(id)
    const el = style ? <rect key={id} x={x + offset} y={y} width={width} height={d} fill={style.color} fillOpacity={0.22} /> : null
    offset += width
    return el
  })

  return (
    <g transform={`rotate(${rot} ${cx} ${cy})`} onPointerDown={onPointerDown} className="cursor-pointer" data-testid={`shelf-${shelf.shelf_letter}`}>
      <rect x={x} y={y} width={w} height={d} className="fill-background" />
      {stripes}
      <rect x={x} y={y + d * 0.85} width={capacity > 0 ? (w * occupied) / capacity : 0} height={d * 0.15} className="fill-foreground" fillOpacity={0.35} />
      <rect x={x} y={y} width={w} height={d} fill="none" className="stroke-foreground" strokeWidth={highlighted ? 3 : 1.5} vectorEffect="non-scaling-stroke" />
      <line x1={x} y1={y + d} x2={x + w} y2={y + d} className="stroke-foreground" strokeWidth={3.5} vectorEffect="non-scaling-stroke" />
      {shelf.access_side === 'both' && (
        <line x1={x} y1={y} x2={x + w} y2={y} className="stroke-foreground" strokeWidth={3.5} vectorEffect="non-scaling-stroke" />
      )}
      <text
        x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={14 * cmPerPx} fontWeight={600}
        className="pointer-events-none select-none fill-foreground" transform={`rotate(${-rot} ${cx} ${cy})`}
      >
        {shelf.shelf_letter}
      </text>
    </g>
  )
}

/** Furniture, doors and windows from above. */
export function ItemShape({ item, cmPerPx, onPointerDown }: { item: FloorItem; cmPerPx: number; onPointerDown: Down }) {
  const { x, y, w, d, rot } = item
  const cx = x + w / 2
  const cy = y + d / 2
  const label = item.label || FLOOR_ITEM_LABELS[item.kind]
  return (
    <g transform={`rotate(${rot} ${cx} ${cy})`} onPointerDown={onPointerDown} className="cursor-pointer" data-testid={`item-${item.id}`}>
      {item.kind === 'door' ? (
        <>
          <rect x={x} y={y} width={w} height={d} className="fill-background stroke-foreground" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={`M ${x} ${y + d} L ${x} ${y + d - w} A ${w} ${w} 0 0 1 ${x + w} ${y + d}`} fill="none" className="stroke-foreground" strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </>
      ) : item.kind === 'window' ? (
        <>
          <rect x={x} y={y} width={w} height={d} className="fill-background stroke-foreground" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={x} y1={cy} x2={x + w} y2={cy} className="stroke-foreground" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </>
      ) : (
        <rect x={x} y={y} width={w} height={d} className="fill-muted stroke-muted-foreground" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
      {item.kind !== 'door' && item.kind !== 'window' && (
        <text
          x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={11 * cmPerPx}
          className="pointer-events-none select-none fill-muted-foreground" transform={`rotate(${-rot} ${cx} ${cy})`}
        >
          {label}
        </text>
      )}
    </g>
  )
}
