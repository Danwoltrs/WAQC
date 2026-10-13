'use client'

import { useState, useEffect, useMemo } from 'react'
import { Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle } from 'recharts'
import { cropYearRange } from '@/lib/crop-year'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { computeBagsAndMt } from '@/lib/report-data'
import { formatBags, formatMt } from '@/lib/bag-quantity'
import { bandColor, DEFAULT_SANKEY_PALETTE } from '@/lib/charts/sankey-layout'

interface FlowData {
  exporter: string
  importer: string
  roaster: string
  totalBags: number
  totalMt: number
  totalSamples: number
  approvedSamples: number
}

interface SankeyNode {
  name: string
  id: string
  type: 'exporter' | 'importer' | 'roaster'
  bags: number
  mt: number
  totalSamples: number
  approvedSamples: number
  approvalRate: number
}

interface SankeyLink {
  source: number
  target: number
  // Link width, in 60kg-equivalent bags.
  value: number
  mt: number
  totalSamples: number
  approvedSamples: number
  approvalRate: number
}

interface SankeyData {
  nodes: SankeyNode[]
  links: SankeyLink[]
  flowCount: number
}

const NODE_TYPE_LABELS: Record<SankeyNode['type'], string> = {
  exporter: 'Seller',
  importer: 'Importer',
  roaster: 'Roaster',
}

// Same olive bands as the period-report PDF Sankey and the supplier leaderboard.
const approvalColor = (rate: number | undefined) => bandColor(rate, DEFAULT_SANKEY_PALETTE)

const APPROVAL_BANDS = [
  { label: '90% and up', color: DEFAULT_SANKEY_PALETTE.high },
  { label: '70–89%', color: DEFAULT_SANKEY_PALETTE.mid },
  { label: 'below 70%', color: DEFAULT_SANKEY_PALETTE.low },
]

// Red and olive look alike to red-weak readers, so colour never carries the
// rate alone: blocks under 90% print it after the name, and hover states it.
const showRateLabel = (rate: number | undefined) => rate !== undefined && rate < 90

interface SupplyChainSankeyProps {
  filters?: {
    year?: number
    month?: number | null
    // Sep–Aug crop year start; overrides year + month when set.
    cropYear?: number | null
    laboratoryId?: string
    minBags?: number
    client?: string
    supplier?: string
    importer?: string
    roaster?: string
  }
  onNodeClick?: (node: SankeyNode) => void
}

// Custom node renderer with labels, filled by the company's approval band
const CustomNode = ({ x, y, width, height, index, payload }: any) => {
  const nodeKey = payload?.id || payload?.key || `node-${index}`
  return (
    <Layer key={nodeKey}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={approvalColor(payload.approvalRate)}
      />
      <text
        textAnchor="end"
        x={x - 6}
        y={y + height / 2}
        fontSize="13"
        fill="currentColor"
        dominantBaseline="middle"
        className="fill-foreground"
        style={{ fontWeight: 500 }}
      >
        {payload.name}
        {showRateLabel(payload.approvalRate) && (
          <tspan className="fill-muted-foreground" style={{ fontWeight: 400 }}>
            {`  ${payload.approvalRate}%`}
          </tspan>
        )}
      </text>
    </Layer>
  )
}

// Band between two companies, tinted by that pair's approval band
const CustomLink = ({
  sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth, payload,
}: any) => (
  <path
    d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
    fill="none"
    stroke={approvalColor(payload?.approvalRate)}
    strokeWidth={Math.max(linkWidth, 1)}
    className="[stroke-opacity:0.25] hover:[stroke-opacity:0.5] transition-[stroke-opacity]"
  />
)

const RateSwatch = ({ rate }: { rate: number }) => (
  <span
    aria-hidden
    className="inline-block h-2.5 w-2.5 rounded-[2px] mr-1.5 align-[-1px]"
    style={{ backgroundColor: approvalColor(rate) }}
  />
)

export function SupplyChainSankey({ filters, onNodeClick }: SupplyChainSankeyProps) {
  const [data, setData] = useState<SankeyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { profile, user } = useAuth()

  useEffect(() => {
    if (profile && user) {
      fetchData()
    }
  }, [filters, profile, user])

  const fetchData = async () => {
    if (!profile || !user) return

    try {
      setLoading(true)
      setError(null)

      // Build query for supply chain flow data
      const year = filters?.year || new Date().getFullYear()
      const month = filters?.month || null
      const minBags = filters?.minBags || 0

      let query = supabase
        .from('samples')
        .select(`
          bag_count,
          bag_weight_kg,
          bag_type,
          bags_quantity_mt,
          equivalent_60kg_bags,
          status,
          created_at,
          client_id,
          seller:companies!samples_seller_id_fkey(name, fantasy_name),
          importer:companies!samples_importer_id_fkey(name, fantasy_name),
          roaster:companies!samples_roaster_id_fkey(name, fantasy_name)
        `)
        .is('deleted_at', null)
        .not('seller_id', 'is', null)
        .not('importer_id', 'is', null)
        .not('roaster_id', 'is', null)
        .in('status', ['approved', 'rejected'])

      // Apply stakeholder filters (using IDs now)
      if (filters?.supplier) {
        query = query.eq('seller_id', filters.supplier)
      }
      if (filters?.importer) {
        query = query.eq('importer_id', filters.importer)
      }
      if (filters?.roaster) {
        query = query.eq('roaster_id', filters.roaster)
      }
      if (filters?.client) {
        query = query.eq('client_id', filters.client)
      }

      // Crop year overrides year + month when set (Sep–Aug window).
      if (filters?.cropYear != null) {
        const { start, end } = cropYearRange(filters.cropYear)
        query = query
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString())
      } else {
        if (year) {
          query = query
            .gte('created_at', `${year}-01-01`)
            .lt('created_at', `${year + 1}-01-01`)
        }
        if (month && month >= 1 && month <= 12) {
          const startDate = new Date(year, month - 1, 1)
          const endDate = new Date(year, month, 1)
          query = query
            .gte('created_at', startDate.toISOString())
            .lt('created_at', endDate.toISOString())
        }
      }

      // Apply lab filter based on user role
      if (profile.qc_role === 'lab_personnel' ||
          profile.qc_role === 'lab_quality_manager' ||
          profile.qc_role === 'lab_finance_manager') {
        // Lab users see only their lab's data
        if (profile.laboratory_id) {
          query = query.eq('laboratory_id', profile.laboratory_id)
        }
      } else if (filters?.laboratoryId &&
                 (profile.qc_role === 'global_admin' ||
                  profile.qc_role === 'global_quality_admin' ||
                  profile.qc_role === 'santos_hq_finance' ||
                  profile.qc_role === 'global_finance_admin')) {
        // Global users can filter by specific lab
        query = query.eq('laboratory_id', filters.laboratoryId)
      }

      const { data: samples, error: samplesError } = await query

      if (samplesError) throw samplesError

      // Aggregate flow data. Companies go by their trade (fantasy) name, so
      // two legal entities sharing one trade name show as one node.
      const flowMap = new Map<string, FlowData>()

      samples?.forEach((sample: any) => {
        const supplierName = companyDisplayName(sample.seller)
        const importerName = companyDisplayName(sample.importer)
        const roasterName = companyDisplayName(sample.roaster)

        if (!supplierName || !importerName || !roasterName) return

        // bags_quantity_mt is MT; bags are the 60kg equivalent, same as the reports.
        // A lot with no quantity has no volume to draw.
        const { bags, mt } = computeBagsAndMt(sample)
        if (!bags || bags < minBags) return
        const key = `${supplierName}|${importerName}|${roasterName}`
        const existing = flowMap.get(key)

        if (existing) {
          existing.totalBags += bags || 0
          existing.totalMt += mt || 0
          existing.totalSamples += 1
          if (sample.status === 'approved') {
            existing.approvedSamples += 1
          }
        } else {
          flowMap.set(key, {
            exporter: supplierName,
            importer: importerName,
            roaster: roasterName,
            totalBags: bags || 0,
            totalMt: mt || 0,
            totalSamples: 1,
            approvedSamples: sample.status === 'approved' ? 1 : 0
          })
        }
      })

      const flows = Array.from(flowMap.values())
        .sort((a, b) => b.totalBags - a.totalBags)
        .slice(0, 100) // Limit to top 100 flows to prevent overcrowding

      // Transform flow data to Sankey format
      const sankeyData = transformToSankeyData(flows, profile.qc_role || 'lab_personnel', user.id)
      setData(sankeyData)
    } catch (err) {
      console.error('Error fetching Sankey data:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to load supply chain data'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const transformToSankeyData = (flows: FlowData[], role: string, userId: string): SankeyData => {
    const nodeMap = new Map<string, number>()
    const nodes: any[] = []
    // One link per company pair, so hovering a band shows that pair's total.
    const linkMap = new Map<string, {
      source: number
      target: number
      bags: number
      mt: number
      totalSamples: number
      approvedSamples: number
    }>()

    const getOrCreateNode = (name: string, type: SankeyNode['type']): number => {
      const key = `${type}_${name}`
      if (nodeMap.has(key)) {
        return nodeMap.get(key)!
      }

      const index = nodes.length
      const nodeName = anonymizeName(name, type, role)
      nodes.push({
        name: nodeName,
        id: key,
        type,
        bags: 0,
        mt: 0,
        totalSamples: 0,
        approvedSamples: 0,
        key: key // Add unique key for React
      })
      nodeMap.set(key, index)
      return index
    }

    const addLink = (source: number, target: number, flow: FlowData) => {
      const key = `${source}-${target}`
      const existing = linkMap.get(key)
      if (existing) {
        existing.bags += flow.totalBags
        existing.mt += flow.totalMt
        existing.totalSamples += flow.totalSamples
        existing.approvedSamples += flow.approvedSamples
      } else {
        linkMap.set(key, {
          source,
          target,
          bags: flow.totalBags,
          mt: flow.totalMt,
          totalSamples: flow.totalSamples,
          approvedSamples: flow.approvedSamples
        })
      }
    }

    flows.forEach((flow) => {
      const exporterIdx = getOrCreateNode(flow.exporter, 'exporter')
      const importerIdx = getOrCreateNode(flow.importer, 'importer')
      const roasterIdx = getOrCreateNode(flow.roaster, 'roaster')

      for (const idx of [exporterIdx, importerIdx, roasterIdx]) {
        nodes[idx].bags += flow.totalBags
        nodes[idx].mt += flow.totalMt
        nodes[idx].totalSamples += flow.totalSamples
        nodes[idx].approvedSamples += flow.approvedSamples
      }

      addLink(exporterIdx, importerIdx, flow)
      addLink(importerIdx, roasterIdx, flow)
    })

    const links = Array.from(linkMap.entries()).map(([key, link]) => ({
      source: link.source,
      target: link.target,
      value: link.bags,
      mt: link.mt,
      approvalRate: link.totalSamples > 0
        ? Math.round((link.approvedSamples / link.totalSamples) * 100)
        : 0,
      totalSamples: link.totalSamples,
      approvedSamples: link.approvedSamples,
      key: `link-${key}` // Add unique key
    }))

    for (const node of nodes) {
      node.approvalRate = node.totalSamples > 0
        ? Math.round((node.approvedSamples / node.totalSamples) * 100)
        : 0
    }

    return { nodes, links, flowCount: flows.length }
  }

  const anonymizationMap = useMemo(() => new Map<string, string>(), [])

  const anonymizeName = (name: string, type: string, role: string): string => {
    // Global admins and quality admins see all names
    if (role === 'global_admin' || role === 'global_quality_admin' ||
        role === 'lab_quality_manager' || role === 'client') {
      return name
    }

    // Suppliers only see other exporters anonymized
    if (role === 'supplier' && type === 'exporter') {
      // TODO: Get current user's supplier name and don't anonymize it
      // For now, anonymize all except first one (demo)
      if (!anonymizationMap.has(name)) {
        const letter = String.fromCharCode(65 + anonymizationMap.size) // A, B, C, etc.
        anonymizationMap.set(name, `Supplier ${letter}`)
      }
      return anonymizationMap.get(name)!
    }

    return name
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-96">
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (!data || data.nodes.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">No supply chain data available for the selected period.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Supply Chain Flow Visualization</CardTitle>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Block size shows volume in bags. Colour shows approval rate:</span>
          {APPROVAL_BANDS.map(band => (
            <span key={band.label} className="inline-flex items-center">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-[2px] mr-1.5"
                style={{ backgroundColor: band.color }}
              />
              {band.label}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={600}>
          <Sankey
            data={data}
            node={<CustomNode />}
            link={<CustomLink />}
            nodePadding={50}
            margin={{ top: 20, right: 160, bottom: 20, left: 160 }}
          >
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null

                const data = payload[0]?.payload
                if (!data) return null

                // Node tooltip
                if (data.name) {
                  return (
                    <div className="bg-card border p-3 rounded-lg shadow-lg">
                      <p className="font-semibold">{data.name}</p>
                      <p className="text-xs text-muted-foreground">{NODE_TYPE_LABELS[data.type as SankeyNode['type']]}</p>
                      <p className="text-sm mt-1">
                        <span className="font-semibold">{formatBags(data.bags)}</span>
                        <span className="text-muted-foreground"> · </span>
                        <span className="font-semibold">{formatMt(data.mt)}</span>
                      </p>
                      <p className="text-sm">
                        <RateSwatch rate={data.approvalRate} />
                        <span className="font-semibold">{data.approvalRate}% approved</span>
                        <span className="text-muted-foreground"> · {data.approvedSamples} of {data.totalSamples} samples</span>
                      </p>
                    </div>
                  )
                }

                // Link tooltip (recharts swaps source/target for the node objects)
                if (data.source && data.target) {
                  return (
                    <div className="bg-card border p-3 rounded-lg shadow-lg">
                      <p className="text-xs text-muted-foreground">{data.source.name} → {data.target.name}</p>
                      <p className="text-sm mt-1">
                        <span className="font-semibold">{formatBags(data.value)}</span>
                        <span className="text-muted-foreground"> · </span>
                        <span className="font-semibold">{formatMt(data.mt)}</span>
                      </p>
                      <p className="text-sm">
                        <RateSwatch rate={data.approvalRate} />
                        <span className="font-semibold">{data.approvalRate}% approved</span>
                        <span className="text-muted-foreground"> · {data.approvedSamples} of {data.totalSamples} samples</span>
                      </p>
                    </div>
                  )
                }

                return null
              }}
            />
          </Sankey>
        </ResponsiveContainer>

        <div className="mt-4 flex justify-center gap-8 text-sm">
          <div className="text-center">
            <p className="font-semibold">Sellers</p>
            <p className="text-muted-foreground">{data.nodes.filter(n => n.type === 'exporter').length}</p>
          </div>
          <div className="text-center">
            <p className="font-semibold">Importers</p>
            <p className="text-muted-foreground">{data.nodes.filter(n => n.type === 'importer').length}</p>
          </div>
          <div className="text-center">
            <p className="font-semibold">Roasters</p>
            <p className="text-muted-foreground">{data.nodes.filter(n => n.type === 'roaster').length}</p>
          </div>
          <div className="text-center">
            <p className="font-semibold">Total Flows</p>
            <p className="text-muted-foreground">{data.flowCount}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
