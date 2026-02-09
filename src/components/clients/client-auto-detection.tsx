'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  History,
  MapPin,
  Building2,
  User
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClientMatch {
  id: string
  name: string
  company: string
  fantasy_name: string | null
  primary_category: string | null
  confidence: number
  matchReasons: MatchReason[]
  historicalData?: {
    totalSamples: number
    recentSamples: number
    lastSampleDate: string | null
    commonOrigins: string[]
    commonSuppliers: string[]
  }
}

interface MatchReason {
  type: 'exact_name' | 'partial_name' | 'origin_history' | 'supplier_history' | 'contract_match' | 'recent_activity'
  description: string
  weight: number
}

interface SampleMetadata {
  exporter?: string
  buyer?: string
  roaster?: string
  importer?: string
  origin?: string
  supplier?: string
  wolthers_contract_nr?: string
  exporter_contract_nr?: string
  buyer_contract_nr?: string
  roaster_contract_nr?: string
}

interface ClientAutoDetectionProps {
  metadata: SampleMetadata
  onClientSelect?: (clientId: string) => void
  onManualOverride?: () => void
  autoSelect?: boolean
  className?: string
}

export function ClientAutoDetection({
  metadata,
  onClientSelect,
  onManualOverride,
  autoSelect = false,
  className
}: ClientAutoDetectionProps) {
  const [matches, setMatches] = useState<ClientMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null)

  useEffect(() => {
    detectClients()
  }, [
    metadata.exporter,
    metadata.buyer,
    metadata.roaster,
    metadata.importer,
    metadata.origin,
    metadata.supplier,
    metadata.wolthers_contract_nr,
    metadata.exporter_contract_nr,
    metadata.buyer_contract_nr,
    metadata.roaster_contract_nr
  ])

  const detectClients = async () => {
    // Only run detection if we have some metadata
    if (!hasRelevantMetadata(metadata)) {
      setMatches([])
      return
    }

    setLoading(true)

    try {
      const clientMatches = await findMatchingClients(metadata)

      // Sort by confidence score
      clientMatches.sort((a, b) => b.confidence - a.confidence)

      setMatches(clientMatches)

      // Auto-select if enabled and we have a high-confidence match
      if (autoSelect && clientMatches.length > 0 && clientMatches[0].confidence >= 85) {
        setSelectedMatch(clientMatches[0].id)
        if (onClientSelect) {
          onClientSelect(clientMatches[0].id)
        }
      }
    } catch (error) {
      console.error('Error detecting clients:', error)
    } finally {
      setLoading(false)
    }
  }

  const hasRelevantMetadata = (meta: SampleMetadata): boolean => {
    return !!(
      meta.exporter ||
      meta.buyer ||
      meta.roaster ||
      meta.importer ||
      meta.wolthers_contract_nr ||
      meta.exporter_contract_nr ||
      meta.buyer_contract_nr ||
      meta.roaster_contract_nr
    )
  }

  const findMatchingClients = async (meta: SampleMetadata): Promise<ClientMatch[]> => {
    const matches: ClientMatch[] = []

    // Get all QC-enabled clients
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('qc_enabled', true)

    if (!clients) return matches

    // Get historical sample data for pattern matching
    const historicalData = await getHistoricalSampleData()

    for (const client of clients) {
      const matchReasons: MatchReason[] = []
      let confidence = 0

      // 1. Exact name matching (highest weight)
      const searchTerms = [
        meta.exporter,
        meta.buyer,
        meta.roaster,
        meta.importer
      ].filter(Boolean).map(term => term!.toLowerCase())

      const clientNames = [
        client.name,
        client.company,
        client.fantasy_name
      ].filter(Boolean).map(name => name!.toLowerCase())

      for (const searchTerm of searchTerms) {
        for (const clientName of clientNames) {
          if (clientName === searchTerm) {
            matchReasons.push({
              type: 'exact_name',
              description: `Exact match: "${searchTerm}" matches client name`,
              weight: 40
            })
            confidence += 40
          } else if (clientName.includes(searchTerm) || searchTerm.includes(clientName)) {
            matchReasons.push({
              type: 'partial_name',
              description: `Partial match: "${searchTerm}" similar to "${clientName}"`,
              weight: 25
            })
            confidence += 25
          }
        }
      }

      // 2. Contract number matching (very high confidence)
      const contractNumbers = [
        meta.wolthers_contract_nr,
        meta.exporter_contract_nr,
        meta.buyer_contract_nr,
        meta.roaster_contract_nr
      ].filter(Boolean)

      if (contractNumbers.length > 0) {
        const contractMatches = await checkContractHistory(client.id, contractNumbers as string[])
        if (contractMatches > 0) {
          matchReasons.push({
            type: 'contract_match',
            description: `${contractMatches} contract number(s) matched in history`,
            weight: 35
          })
          confidence += 35
        }
      }

      // 3. Historical origin matching
      if (meta.origin && historicalData[client.id]) {
        const clientHistory = historicalData[client.id]
        if (clientHistory.commonOrigins.includes(meta.origin)) {
          const originFrequency = calculateOriginFrequency(clientHistory, meta.origin)
          const weight = Math.min(20, originFrequency * 2)
          matchReasons.push({
            type: 'origin_history',
            description: `${originFrequency}% of past samples from ${meta.origin}`,
            weight
          })
          confidence += weight
        }
      }

      // 4. Historical supplier matching
      const supplierName = meta.supplier || meta.exporter
      if (supplierName && historicalData[client.id]) {
        const clientHistory = historicalData[client.id]
        if (clientHistory.commonSuppliers.some((s: string) =>
          s.toLowerCase().includes(supplierName.toLowerCase()) ||
          supplierName.toLowerCase().includes(s.toLowerCase())
        )) {
          matchReasons.push({
            type: 'supplier_history',
            description: `Previous samples from supplier "${supplierName}"`,
            weight: 15
          })
          confidence += 15
        }
      }

      // 5. Recent activity bonus (samples in last 90 days)
      if (historicalData[client.id] && historicalData[client.id].recentSamples > 0) {
        matchReasons.push({
          type: 'recent_activity',
          description: `${historicalData[client.id].recentSamples} samples in last 90 days`,
          weight: 10
        })
        confidence += 10
      }

      // Only include clients with some confidence level
      if (matchReasons.length > 0) {
        matches.push({
          id: client.id,
          name: client.name,
          company: client.company,
          fantasy_name: client.fantasy_name,
          primary_category: (client as any).primary_category || null,
          confidence: Math.min(100, confidence), // Cap at 100%
          matchReasons,
          historicalData: historicalData[client.id]
        })
      }
    }

    return matches
  }

  const getHistoricalSampleData = async () => {
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

    const { data: samples } = await supabase
      .from('samples')
      .select(`
        client_id,
        origin,
        created_at,
        seller:exporters!samples_seller_id_fkey(name)
      `)
      .not('client_id', 'is', null)

    const historyMap: Record<string, any> = {}

    if (samples) {
      for (const sample of samples) {
        if (!sample.client_id) continue

        if (!historyMap[sample.client_id]) {
          historyMap[sample.client_id] = {
            totalSamples: 0,
            recentSamples: 0,
            lastSampleDate: null,
            commonOrigins: [] as string[],
            commonSuppliers: [] as string[],
            originCounts: {} as Record<string, number>,
            supplierCounts: {} as Record<string, number>
          }
        }

        const history = historyMap[sample.client_id]
        history.totalSamples++

        if (new Date(sample.created_at!) >= threeMonthsAgo) {
          history.recentSamples++
        }

        if (!history.lastSampleDate || new Date(sample.created_at!) > new Date(history.lastSampleDate)) {
          history.lastSampleDate = sample.created_at
        }

        if (sample.origin) {
          history.originCounts[sample.origin] = (history.originCounts[sample.origin] || 0) + 1
        }

        const supplierName = (sample as any).seller?.name
        if (supplierName) {
          history.supplierCounts[supplierName] = (history.supplierCounts[supplierName] || 0) + 1
        }
      }

      // Convert counts to arrays
      for (const clientId in historyMap) {
        const history = historyMap[clientId]
        history.commonOrigins = Object.keys(history.originCounts)
        history.commonSuppliers = Object.keys(history.supplierCounts)
      }
    }

    return historyMap
  }

  const checkContractHistory = async (clientId: string, contractNumbers: string[]): Promise<number> => {
    const { data } = await supabase
      .from('samples')
      .select('id')
      .eq('client_id', clientId)
      .or(
        contractNumbers
          .map(num => `wolthers_contract_nr.eq.${num},exporter_contract_nr.eq.${num},buyer_contract_nr.eq.${num},roaster_contract_nr.eq.${num}`)
          .join(',')
      )
      .limit(1)

    return data?.length || 0
  }

  const calculateOriginFrequency = (history: any, origin: string): number => {
    const count = history.originCounts[origin] || 0
    return Math.round((count / history.totalSamples) * 100)
  }

  const handleSelectMatch = (matchId: string) => {
    setSelectedMatch(matchId)
    if (onClientSelect) {
      onClientSelect(matchId)
    }
  }

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 80) return 'text-green-600 dark:text-green-400'
    if (confidence >= 60) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-orange-600 dark:text-orange-400'
  }

  const getConfidenceBadgeVariant = (confidence: number): 'default' | 'secondary' | 'destructive' => {
    if (confidence >= 80) return 'default'
    if (confidence >= 60) return 'secondary'
    return 'destructive'
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Detecting potential client matches...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (matches.length === 0) {
    return null
  }

  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-sm font-semibold">Suggested Clients</h3>
              <Badge variant="outline" className="text-xs">
                {matches.length} {matches.length === 1 ? 'match' : 'matches'}
              </Badge>
            </div>
            {onManualOverride && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onManualOverride}
                className="text-xs"
              >
                Manual Selection
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {matches.slice(0, 3).map((match) => (
              <div
                key={match.id}
                className={cn(
                  "border rounded-lg p-4 cursor-pointer transition-all",
                  selectedMatch === match.id
                    ? "border-primary bg-primary/5"
                    : "hover:border-primary/50 hover:bg-accent/50"
                )}
                onClick={() => handleSelectMatch(match.id)}
              >
                <div className="space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{match.name}</p>
                        {selectedMatch === match.id && (
                          <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                        )}
                      </div>
                      {match.fantasy_name && (
                        <p className="text-sm text-muted-foreground truncate">
                          {match.fantasy_name}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={getConfidenceBadgeVariant(match.confidence)}
                      className="flex-shrink-0"
                    >
                      {match.confidence}% match
                    </Badge>
                  </div>

                  {/* Category */}
                  {match.primary_category && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      <span>{match.primary_category}</span>
                    </div>
                  )}

                  {/* Match Reasons */}
                  <div className="space-y-1">
                    {match.matchReasons.slice(0, 3).map((reason, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs">
                        {reason.type === 'exact_name' && <CheckCircle2 className="h-3 w-3 mt-0.5 text-green-600" />}
                        {reason.type === 'partial_name' && <User className="h-3 w-3 mt-0.5 text-blue-600" />}
                        {reason.type === 'contract_match' && <TrendingUp className="h-3 w-3 mt-0.5 text-purple-600" />}
                        {reason.type === 'origin_history' && <MapPin className="h-3 w-3 mt-0.5 text-orange-600" />}
                        {reason.type === 'supplier_history' && <Building2 className="h-3 w-3 mt-0.5 text-cyan-600" />}
                        {reason.type === 'recent_activity' && <History className="h-3 w-3 mt-0.5 text-indigo-600" />}
                        <span className="text-muted-foreground">{reason.description}</span>
                      </div>
                    ))}
                  </div>

                  {/* Historical Data */}
                  {match.historicalData && match.historicalData.totalSamples > 0 && (
                    <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <History className="h-3 w-3" />
                        <span>{match.historicalData.totalSamples} total samples</span>
                      </div>
                      {match.historicalData.recentSamples > 0 && (
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          <span>{match.historicalData.recentSamples} recent</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {matches.length > 3 && (
            <p className="text-xs text-muted-foreground text-center">
              +{matches.length - 3} more {matches.length - 3 === 1 ? 'match' : 'matches'} available
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
