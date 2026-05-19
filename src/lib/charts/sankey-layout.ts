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
  id: string                 // unique within graph (e.g. "exporter:ABC")
  label: string              // display name
  column: 0 | 1 | 2          // 0 = Exporter, 1 = Importer, 2 = Roaster
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
  column: 0 | 1 | 2
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
}

// Project palette — drives node + link tinting. Three bands matching
// the supplier-review dashboard so the report and screen stay in sync.
const COLOR_HIGH = '#556b2f'   // ≥90%
const COLOR_MID = '#a9a454'    // 70–89%
const COLOR_LOW = '#ef4444'    // <70%
const COLOR_NEUTRAL = '#445763' // unknown approval rate

function bandColor(approvalRate: number | undefined): string {
  if (approvalRate === undefined || Number.isNaN(approvalRate)) return COLOR_NEUTRAL
  if (approvalRate >= 90) return COLOR_HIGH
  if (approvalRate >= 70) return COLOR_MID
  return COLOR_LOW
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

  if (inputNodes.length === 0 || inputLinks.length === 0) {
    return { width, height, nodes: [], links: [] }
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
    return { width, height, nodes: [], links: [] }
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
    fill: bandColor(n.approvalRate),
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
      stroke: bandColor(linkRate),
      strokeOpacity: 0.35,
    }
  })

  return { width, height, nodes: positionedNodes, links: positionedLinks }
}

export const SANKEY_COLORS = {
  high: COLOR_HIGH,
  mid: COLOR_MID,
  low: COLOR_LOW,
  neutral: COLOR_NEUTRAL,
}
