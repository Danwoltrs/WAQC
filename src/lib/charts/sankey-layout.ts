/**
 * Pure-math Sankey layout for PDF rendering.
 *
 * d3-sankey computes positions in any JS environment (no DOM/canvas
 * required), so we can run it server-side and feed the result into
 * @react-pdf/renderer's SVG primitives.
 *
 * The chart shape is fixed for our reports: three columns
 * (Exporter → Importer → Roaster), where width = bags and node color
 * is tinted by approval rate. Callers compose the inputs from their
 * report data and pass to `computeSankeyLayout`.
 */

import {
  sankey,
  sankeyLinkHorizontal,
  type SankeyNode,
  type SankeyLink,
} from 'd3-sankey'

export interface SankeyInputNode {
  id: string                 // unique within graph (e.g. "shipper:ABC")
  label: string              // display name
  /** Zero-indexed column position. Reports use up to 4 columns:
   *  0 = Shipper, 1 = Seller, 2 = Importer, 3 = Roaster. Type-3
   *  (importer client) charts only use 0–1; type-2 (roaster) uses
   *  0–2; type-1 (final buyer) uses 0–3. */
  column: 0 | 1 | 2 | 3
  /** Approval rate (0-100) for this node's bags. Drives node fill color. */
  approvalRate?: number
}

export interface SankeyInputLink {
  source: string             // node id
  target: string             // node id
  value: number              // bags
  /** Approval rate (0-100) on this specific link, optional. Falls back to
   *  source node's approval rate when not provided. */
  approvalRate?: number
}

export interface SankeyPositionedNode {
  id: string
  label: string
  column: 0 | 1 | 2 | 3
  x0: number
  x1: number
  y0: number
  y1: number
  value: number
  approvalRate: number | undefined
  fill: string
}

export interface SankeyPositionedLink {
  source: SankeyPositionedNode
  target: SankeyPositionedNode
  value: number
  width: number
  /** SVG path string ready to drop into a <Path d="…" /> element. */
  path: string
  /** Stroke color — tinted by approval rate of the source. */
  stroke: string
  /** Stroke opacity — 0.35 default, dims un-highlighted links. */
  strokeOpacity: number
}

export interface SankeyLayoutResult {
  width: number
  height: number
  nodes: SankeyPositionedNode[]
  links: SankeyPositionedLink[]
  /** The band colours this layout was tinted with — the legend reads them. */
  palette?: SankeyPalette
}

/** The three approval bands plus the colour for an unknown rate. */
export interface SankeyPalette {
  high: string    // ≥90%
  mid: string     // 70–89%
  low: string     // <70%
  neutral: string // unknown approval rate
}

/** Period reports: the supplier-review dashboard's olive bands. */
export const DEFAULT_SANKEY_PALETTE: SankeyPalette = {
  high: '#556b2f',
  mid: '#a9a454',
  low: '#ef4444',
  neutral: '#445763',
}

/** Annual report: charcoal for the norm, grey to watch, red for a problem. */
export const CHARCOAL_SANKEY_PALETTE: SankeyPalette = {
  high: '#2F3337',
  mid: '#A3A6AA',
  low: '#EF4444',
  neutral: '#6B6E72',
}

function bandColor(approvalRate: number | undefined, palette: SankeyPalette): string {
  if (approvalRate === undefined || Number.isNaN(approvalRate)) return palette.neutral
  if (approvalRate >= 90) return palette.high
  if (approvalRate >= 70) return palette.mid
  return palette.low
}

export interface SankeyLayoutOptions {
  width: number
  height: number
  /** Node thickness in px. Default 14. */
  nodeWidth?: number
  /** Vertical gap between nodes in the same column. Default 8. */
  nodePadding?: number
  /** Outer chart padding (top/bottom/left/right) in px. Default 8. */
  padding?: number
  /** Band colours. Default: the olive period-report palette. */
  palette?: SankeyPalette
  /** Link stroke opacity. Default 0.35. */
  linkOpacity?: number
}

/**
 * Compute positions for a Sankey graph. Returns layout-ready nodes
 * and links with SVG path strings — no further computation needed by
 * the renderer.
 *
 * The chart is empty-safe: passing zero nodes/links returns an empty
 * layout so callers can render a placeholder without crashing.
 */
export function computeSankeyLayout(
  inputNodes: SankeyInputNode[],
  inputLinks: SankeyInputLink[],
  options: SankeyLayoutOptions,
): SankeyLayoutResult {
  const { width, height } = options
  const nodeWidth = options.nodeWidth ?? 14
  const nodePadding = options.nodePadding ?? 8
  const padding = options.padding ?? 8
  const palette = options.palette ?? DEFAULT_SANKEY_PALETTE
  const linkOpacity = options.linkOpacity ?? 0.35

  if (inputNodes.length === 0 || inputLinks.length === 0) {
    return { width, height, nodes: [], links: [], palette }
  }

  // d3-sankey requires links to reference nodes by index. Build an
  // index map keyed by our string ids.
  const idToIndex = new Map<string, number>()
  inputNodes.forEach((n, i) => idToIndex.set(n.id, i))

  type GraphNode = SankeyNode<SankeyInputNode, SankeyInputLink>
  type GraphLink = SankeyLink<SankeyInputNode, SankeyInputLink>

  // d3-sankey's TypeScript types are strict about source/target being
  // already-resolved Node objects, but the runtime accepts numeric
  // indices and resolves them itself. Cast through unknown to bypass
  // the typing — the resulting positioned data is fully typed.
  const graphNodes = inputNodes.map(n => ({ ...n }))
  const graphLinks = inputLinks
    .filter(l => idToIndex.has(l.source) && idToIndex.has(l.target) && l.value > 0)
    .map(l => ({
      ...l,
      source: idToIndex.get(l.source)!,
      target: idToIndex.get(l.target)!,
    }))

  if (graphLinks.length === 0) {
    return { width, height, nodes: [], links: [], palette }
  }

  // Column-aware alignment so the three stages always lay out left → right.
  const layout = sankey<SankeyInputNode, SankeyInputLink>()
    .nodeAlign((n: any) => (n as GraphNode).column ?? 0)
    .nodeWidth(nodeWidth)
    .nodePadding(nodePadding)
    .extent([
      [padding, padding],
      [width - padding, height - padding],
    ])

  const { nodes, links } = layout({
    nodes: graphNodes,
    links: graphLinks as unknown as GraphLink[],
  })

  const pathBuilder = sankeyLinkHorizontal<SankeyInputNode, SankeyInputLink>()

  const positionedNodes: SankeyPositionedNode[] = (nodes as GraphNode[]).map(n => ({
    id: n.id,
    label: n.label,
    column: n.column,
    x0: n.x0 ?? 0,
    x1: n.x1 ?? 0,
    y0: n.y0 ?? 0,
    y1: n.y1 ?? 0,
    value: n.value ?? 0,
    approvalRate: n.approvalRate,
    fill: bandColor(n.approvalRate, palette),
  }))

  const positionedLinks: SankeyPositionedLink[] = (links as GraphLink[]).map(l => {
    const source = positionedNodes[(l.source as GraphNode).index ?? 0]
    const target = positionedNodes[(l.target as GraphNode).index ?? 0]
    const linkRate = l.approvalRate ?? source.approvalRate
    return {
      source,
      target,
      value: l.value ?? 0,
      width: Math.max(1, l.width ?? 0),
      path: pathBuilder(l as any) ?? '',
      stroke: bandColor(linkRate, palette),
      strokeOpacity: linkOpacity,
    }
  })

  return { width, height, nodes: positionedNodes, links: positionedLinks, palette }
}

export const SANKEY_COLORS = {
  high: DEFAULT_SANKEY_PALETTE.high,
  mid: DEFAULT_SANKEY_PALETTE.mid,
  low: DEFAULT_SANKEY_PALETTE.low,
  neutral: DEFAULT_SANKEY_PALETTE.neutral,
}
