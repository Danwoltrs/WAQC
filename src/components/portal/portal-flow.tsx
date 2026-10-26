'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { computeSankeyLayout, DEFAULT_SANKEY_PALETTE, type SankeyInputNode } from '@/lib/charts/sankey-layout'
import type { FlowModel, OverviewMetric } from '@/lib/portal/overview-model'
import type { FlowStep } from '@/lib/portal/portal-facts'
import { PortalRanking, STEP_LABEL } from './portal-ranking'

const FALLBACK_WIDTH = 1150

function useWidth(ref: React.RefObject<HTMLDivElement | null>, forced?: number): number {
  const [w, setW] = useState(forced ?? FALLBACK_WIDTH)
  useEffect(() => {
    if (forced) return
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { if (el.clientWidth > 0) setW(el.clientWidth) })
    ro.observe(el)
    if (el.clientWidth > 0) setW(el.clientWidth)
    return () => ro.disconnect()
  }, [ref, forced])
  return forced ?? w
}

type SankeyFlow = Extract<FlowModel, { kind: 'sankey' }>

/** "564 certificates" or "56.4 MT on SS". */
function sizeText(n: number, unit: OverviewMetric): string {
  return unit === 'mt' ? `${n.toFixed(1)} MT on SS` : `${n} certificates`
}

function FlowSankey({ flow, forcedWidth, unit, onSelect }: {
  flow: SankeyFlow
  unit: OverviewMetric
  forcedWidth?: number
  onSelect: (step: FlowStep, value: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const width = useWidth(wrapRef, forcedWidth)
  const steps = flow.steps
  const middle = steps[Math.floor(steps.length / 2)]
  const middleCount = flow.nodes.filter(n => n.step === middle).length
  const height = Math.max(260, Math.min(600, middleCount * 34 + 80))

  const layout = useMemo(() => {
    const nodes: SankeyInputNode[] = flow.nodes.map(n => ({
      id: n.id, label: n.label, column: steps.indexOf(n.step) as SankeyInputNode['column'], approvalRate: n.approvalRate,
    }))
    const links = flow.links.map(l => ({ source: l.source, target: l.target, value: l.size, approvalRate: l.approvalRate }))
    return computeSankeyLayout(nodes, links, {
      width, height, nodeWidth: 8, nodePadding: 8, padding: 4, palette: DEFAULT_SANKEY_PALETTE, linkOpacity: 0.35,
    })
  }, [flow, steps, width, height])

  const rateOf = new Map(flow.links.map(l => [`${l.source}>${l.target}`, l.approvalRate]))
  const byId = new Map(flow.nodes.map(n => [n.id, n]))
  const lastCol = steps.length - 1

  return (
    <div ref={wrapRef} className="w-full">
    <svg width={width} height={height} aria-label="Certificate flow" style={{ fontFamily: 'Inter', fontSize: 11 }}>
      <g>
        {layout.links.map(l => (
          <path key={`${l.source.id}>${l.target.id}`} d={l.path} fill="none" stroke={l.stroke}
            strokeOpacity={l.strokeOpacity} strokeWidth={l.width}>
            <title>{`${l.source.label} → ${l.target.label}: ${sizeText(l.value, unit)}, ${Math.round(rateOf.get(`${l.source.id}>${l.target.id}`) ?? 0)}% approved`}</title>
          </path>
        ))}
      </g>
      <g>
        {layout.nodes.map(n => {
          const src = byId.get(n.id)
          if (!src) return null
          return (
            <rect key={n.id} className="cursor-pointer fill-[#151618] hover:fill-[#556b2f]"
              x={n.x0 - 3} y={n.y0} width={n.x1 - n.x0 + 6} height={Math.max(3, n.y1 - n.y0)}
              role="button" tabIndex={0}
              aria-label={`${src.label}, ${sizeText(src.size, unit)}, ${Math.round(src.approvalRate)}% approved`}
              onClick={() => onSelect(src.step, src.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(src.step, src.value) }
              }}>
              <title>{`${src.label}: show only this`}</title>
            </rect>
          )
        })}
      </g>
      <g>
        {layout.nodes.map(n => {
          const src = byId.get(n.id)
          if (!src) return null
          const last = n.column === lastCol
          return (
            <text key={n.id} aria-hidden="true" className="cursor-pointer fill-black/75 hover:fill-[#556b2f]"
              x={last ? n.x0 - 8 : n.x1 + 8} y={(n.y0 + n.y1) / 2} dy=".35em"
              textAnchor={last ? 'end' : 'start'}
              onClick={() => onSelect(src.step, src.value)}>{`${src.label}  ${unit === 'mt' ? src.size.toFixed(1) : src.size}`}</text>
          )
        })}
      </g>
    </svg>
    </div>
  )
}

export function PortalFlow({ flow, steps, unit = 'certificates', onSelect, width }: {
  flow: FlowModel
  unit?: OverviewMetric
  steps?: FlowStep[]
  onSelect: (step: FlowStep, value: string) => void
  width?: number
}) {
  if (flow.kind === 'empty') {
    return <div className="py-10 text-center text-[13px] text-black/40">No certificates for this selection</div>
  }
  if (flow.kind === 'ranking') return <PortalRanking flow={flow} onSelect={onSelect} />

  const drawn = steps ?? flow.steps
  return (
    <div className="w-full">
      <div className="mx-0.5 mb-1 flex justify-between text-[11px] uppercase tracking-[0.04em] text-black/40">
        {drawn.map(s => <span key={s}>{STEP_LABEL[s]}</span>)}
      </div>
      <FlowSankey flow={flow} forcedWidth={width} unit={unit} onSelect={onSelect} />
    </div>
  )
}
