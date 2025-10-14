'use client'

import { useState, useEffect, useMemo } from 'react'
import { Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'

interface FlowData {
  exporter: string
  importer: string
  roaster: string
  totalBags: number
  totalSamples: number
  approvalRate: number
}

interface SankeyNode {
  name: string
  id: string
  type: 'exporter' | 'importer' | 'roaster'
}

interface SankeyLink {
  source: number
  target: number
  value: number
  approvalRate?: number
}

interface SankeyData {
  nodes: SankeyNode[]
  links: SankeyLink[]
}

interface SupplyChainSankeyProps {
  filters?: {
    year?: number
    month?: number | null
    laboratoryId?: string
    minBags?: number
    client?: string
    supplier?: string
    importer?: string
    roaster?: string
  }
  onNodeClick?: (node: SankeyNode) => void
}

// Custom node renderer with labels
const CustomNode = ({ x, y, width, height, index, payload, containerWidth }: any) => {
  const isOut = x + width + 6 > containerWidth
  const nodeKey = payload?.id || payload?.key || `node-${index}`
  return (
    <Layer key={nodeKey}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill="#8884d8"
        fillOpacity="0.8"
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
      </text>
    </Layer>
  )
}

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
        .select('supplier, importer, roaster, bags_quantity_mt, status, created_at, client_id')
        .not('supplier', 'is', null)
        .not('importer', 'is', null)
        .not('roaster', 'is', null)
        .in('status', ['approved', 'rejected'])
        .gte('bags_quantity_mt', minBags)

      // Apply stakeholder filters
      if (filters?.supplier) {
        query = query.eq('supplier', filters.supplier)
      }
      if (filters?.importer) {
        query = query.eq('importer', filters.importer)
      }
      if (filters?.roaster) {
        query = query.eq('roaster', filters.roaster)
      }
      if (filters?.client) {
        query = query.eq('client_id', filters.client)
      }

      // Apply year filter
      if (year) {
        query = query
          .gte('created_at', `${year}-01-01`)
          .lt('created_at', `${year + 1}-01-01`)
      }

      // Apply month filter if provided
      if (month && month >= 1 && month <= 12) {
        const startDate = new Date(year, month - 1, 1)
        const endDate = new Date(year, month, 1)
        query = query
          .gte('created_at', startDate.toISOString())
          .lt('created_at', endDate.toISOString())
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

      // Aggregate flow data
      const flowMap = new Map<string, {
        exporter: string
        importer: string
        roaster: string
        totalBags: number
        totalSamples: number
        approvedSamples: number
      }>()

      samples?.forEach(sample => {
        const key = `${sample.supplier}|${sample.importer}|${sample.roaster}`
        const existing = flowMap.get(key)

        if (existing) {
          existing.totalBags += sample.bags_quantity_mt || 0
          existing.totalSamples += 1
          if (sample.status === 'approved') {
            existing.approvedSamples += 1
          }
        } else {
          flowMap.set(key, {
            exporter: sample.supplier,
            importer: sample.importer,
            roaster: sample.roaster,
            totalBags: sample.bags_quantity_mt || 0,
            totalSamples: 1,
            approvedSamples: sample.status === 'approved' ? 1 : 0
          })
        }
      })

      // Convert to array and calculate approval rates
      const flows = Array.from(flowMap.values())
        .map(flow => ({
          ...flow,
          approvalRate: flow.totalSamples > 0
            ? Math.round((flow.approvedSamples / flow.totalSamples) * 100)
            : 0
        }))
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
    const links: any[] = []

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
        key: key // Add unique key for React
      })
      nodeMap.set(key, index)
      return index
    }

    flows.forEach((flow, flowIndex) => {
      const exporterIdx = getOrCreateNode(flow.exporter, 'exporter')
      const importerIdx = getOrCreateNode(flow.importer, 'importer')
      const roasterIdx = getOrCreateNode(flow.roaster, 'roaster')

      // Link from exporter to importer
      links.push({
        source: exporterIdx,
        target: importerIdx,
        value: flow.totalBags,
        approvalRate: flow.approvalRate,
        key: `link-${flowIndex}-exp-imp` // Add unique key
      })

      // Link from importer to roaster
      links.push({
        source: importerIdx,
        target: roasterIdx,
        value: flow.totalBags,
        approvalRate: flow.approvalRate,
        key: `link-${flowIndex}-imp-roast` // Add unique key
      })
    })

    return { nodes, links }
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

  const getNodeColor = (approvalRate?: number): string => {
    if (!approvalRate) return '#8884d8'
    if (approvalRate >= 90) return '#10b981' // green
    if (approvalRate >= 70) return '#f59e0b' // yellow
    return '#ef4444' // red
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
        <p className="text-sm text-muted-foreground">
          Node size represents volume. Color indicates approval rate:
          <span className="text-green-600"> Green (&gt;90%)</span>,
          <span className="text-yellow-600"> Yellow (70-90%)</span>,
          <span className="text-red-600"> Red (&lt;70%)</span>
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={600}>
          <Sankey
            data={data}
            node={<CustomNode />}
            link={{ stroke: '#8884d8', strokeOpacity: 0.3 }}
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
                      <p className="font-bold">{data.name}</p>
                      <p className="text-sm text-muted-foreground capitalize">{data.type}</p>
                    </div>
                  )
                }

                // Link tooltip
                if (data.value) {
                  return (
                    <div className="bg-card border p-3 rounded-lg shadow-lg">
                      <p className="text-sm">Volume: <span className="font-semibold">{data.value} bags</span></p>
                      {data.approvalRate !== undefined && (
                        <p className="text-sm">
                          Approval Rate:
                          <span className={`font-semibold ml-1 ${
                            data.approvalRate >= 90 ? 'text-green-600' :
                            data.approvalRate >= 70 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {data.approvalRate}%
                          </span>
                        </p>
                      )}
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
            <p className="font-semibold">Exporters</p>
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
            <p className="text-muted-foreground">{data.links.length / 2}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
