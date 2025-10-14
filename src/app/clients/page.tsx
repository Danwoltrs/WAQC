'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Plus, Search, Edit, Trash2, Loader2, Copy, Check, ChevronDown, ChevronRight, Layers
} from 'lucide-react'
import Link from 'next/link'
import { Switch } from '@/components/ui/switch'

interface OriginPricing {
  id: string
  origin: string
  pricing_model: 'per_sample' | 'per_pound' | 'complimentary'
  price_per_sample?: number
  price_per_pound_cents?: number
  currency: string
  is_active: boolean
}

interface Client {
  id: string
  name: string
  company: string
  fantasy_name?: string
  address?: string
  city?: string
  state?: string
  country?: string
  email?: string
  phone?: string
  is_active: boolean
  created_at: string
  client_types?: string[]
  is_qc_client?: boolean
  pricing_model?: 'per_sample' | 'per_pound' | 'complimentary'
  price_per_sample?: number
  price_per_pound_cents?: number
  currency?: string
  fee_payer?: 'exporter' | 'importer' | 'roaster' | 'final_buyer' | 'client_pays'
  payment_terms?: string
  billing_notes?: string
  has_origin_pricing?: boolean
  billing_basis?: 'approved_only' | 'approved_and_rejected'
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [togglingStatus, setTogglingStatus] = useState<string | null>(null)
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [originPricing, setOriginPricing] = useState<Record<string, OriginPricing[]>>({})
  const [loadingOriginPricing, setLoadingOriginPricing] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadClients()
  }, [searchQuery])

  const loadClients = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (searchQuery) params.append('search', searchQuery)

      const response = await fetch(`/api/clients?${params}`)
      const data = await response.json()

      if (response.ok) {
        setClients(data.clients)
      } else {
        console.error('Failed to load clients:', data.error)
      }
    } catch (error) {
      console.error('Error loading clients:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleActive = async (client: Client) => {
    try {
      setTogglingStatus(client.id)
      const response = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !client.is_active }),
      })

      if (response.ok) {
        await loadClients()
      } else {
        const error = await response.json()
        alert(`Failed to update client status: ${error.error}`)
      }
    } catch (error) {
      console.error('Error toggling client status:', error)
      alert('Failed to update client status')
    } finally {
      setTogglingStatus(null)
    }
  }

  const handleDelete = async (client: Client) => {
    if (!confirm(`Are you sure you want to delete client "${client.fantasy_name || client.name}"?`)) {
      return
    }

    try {
      const response = await fetch(`/api/clients/${client.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await loadClients()
      } else {
        const error = await response.json()
        alert(`Failed to delete client: ${error.error}`)
      }
    } catch (error) {
      console.error('Error deleting client:', error)
      alert('Failed to delete client')
    }
  }

  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email)
      setCopiedEmail(email)
      setTimeout(() => setCopiedEmail(null), 2000)
    } catch (error) {
      console.error('Failed to copy email:', error)
    }
  }

  const loadOriginPricing = async (clientId: string) => {
    if (loadingOriginPricing.has(clientId) || originPricing[clientId]) {
      return
    }

    try {
      setLoadingOriginPricing(prev => new Set(prev).add(clientId))
      const response = await fetch(`/api/clients/${clientId}/origin-pricing`)
      const data = await response.json()

      if (response.ok) {
        setOriginPricing(prev => ({
          ...prev,
          [clientId]: data.origin_pricing || []
        }))
      }
    } catch (error) {
      console.error('Error loading origin pricing:', error)
    } finally {
      setLoadingOriginPricing(prev => {
        const next = new Set(prev)
        next.delete(clientId)
        return next
      })
    }
  }

  const toggleRow = async (clientId: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(clientId)) {
      newExpanded.delete(clientId)
    } else {
      newExpanded.add(clientId)
      await loadOriginPricing(clientId)
    }
    setExpandedRows(newExpanded)
  }

  const formatClientTypes = (types?: string[]) => {
    if (!types || types.length === 0) return '-'
    return types
      .map(type => type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))
      .join(', ')
  }

  const formatPricing = (client: Client) => {
    if (!client.is_qc_client) return '-'
    if (!client.pricing_model) return '-'

    if (client.pricing_model === 'complimentary') {
      return 'Complimentary'
    } else if (client.pricing_model === 'per_sample' && client.price_per_sample) {
      return `${client.currency || 'USD'} ${client.price_per_sample.toFixed(2)}/sample`
    } else if (client.pricing_model === 'per_pound' && client.price_per_pound_cents) {
      return `${client.price_per_pound_cents.toFixed(2)}¢/lb`
    }
    return '-'
  }

  const formatOriginPricing = (pricing: OriginPricing) => {
    if (pricing.pricing_model === 'complimentary') {
      return 'Complimentary'
    } else if (pricing.pricing_model === 'per_sample' && pricing.price_per_sample) {
      return `${pricing.currency} ${pricing.price_per_sample.toFixed(2)}/sample`
    } else if (pricing.pricing_model === 'per_pound' && pricing.price_per_pound_cents) {
      return `${pricing.price_per_pound_cents.toFixed(2)}¢/lb`
    }
    return '-'
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
            <p className="text-muted-foreground">
              Manage your clients and their quality specifications
            </p>
          </div>
          <Link href="/clients/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Button>
          </Link>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clients by name, company, or fantasy name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Clients Table */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            Loading clients...
          </div>
        ) : clients.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <h3 className="text-lg font-semibold mb-2">No clients found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? 'Try adjusting your search criteria' : 'Get started by adding your first client'}
              </p>
              <Link href="/clients/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Client
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>QC / Pricing</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => {
                    const isExpanded = expandedRows.has(client.id)
                    const clientOriginPricing = originPricing[client.id] || []
                    const isLoadingPricing = loadingOriginPricing.has(client.id)

                    return (
                      <>
                        <TableRow key={client.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {client.has_origin_pricing && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => toggleRow(client.id)}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold">{client.fantasy_name || client.name}</span>
                                  {client.has_origin_pricing && (
                                    <Badge variant="secondary" className="text-xs">
                                      <Layers className="h-3 w-3 mr-1" />
                                      Multi-Origin
                                    </Badge>
                                  )}
                                </div>
                                {client.phone && (
                                  <span className="text-sm text-muted-foreground">{client.phone}</span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {client.email ? (
                              <div className="flex items-center gap-2">
                                <span className="text-sm truncate max-w-[200px]">{client.email}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 flex-shrink-0"
                                  onClick={() => handleCopyEmail(client.email!)}
                                >
                                  {copiedEmail === client.email ? (
                                    <Check className="h-3 w-3 text-green-600" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {(client.city || client.country) ? (
                              <span className="text-sm">
                                {[client.city, client.state, client.country].filter(Boolean).join(', ')}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{formatClientTypes(client.client_types)}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {client.is_qc_client !== false ? (
                                <>
                                  <Badge variant="default" className="text-xs w-fit">
                                    QC Client
                                  </Badge>
                                  <span className="text-sm">
                                    {client.has_origin_pricing ? 'See origins below' : formatPricing(client)}
                                  </span>
                                </>
                              ) : (
                                <Badge variant="outline" className="text-xs w-fit">
                                  No QC
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={client.is_active}
                                onCheckedChange={() => handleToggleActive(client)}
                                disabled={togglingStatus === client.id}
                              />
                              <span className="text-sm text-muted-foreground">
                                {client.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Link href={`/clients/${client.id}/edit`}>
                                <Button variant="ghost" size="sm">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </Link>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(client)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expandable Row for Origin Pricing */}
                        {isExpanded && client.has_origin_pricing && (
                          <TableRow key={`${client.id}-expanded`} className="bg-muted/50">
                            <TableCell colSpan={7}>
                              <div className="py-4 px-8">
                                <h4 className="text-sm font-semibold mb-3">Origin-Specific Pricing</h4>
                                {isLoadingPricing ? (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading origin pricing...
                                  </div>
                                ) : clientOriginPricing.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No origin-specific pricing configured</p>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {clientOriginPricing.map((pricing) => (
                                      <Card key={pricing.id} className="border-2">
                                        <CardContent className="p-4">
                                          <div className="flex items-center justify-between mb-2">
                                            <h5 className="font-semibold text-sm">{pricing.origin}</h5>
                                            <Badge
                                              variant={pricing.is_active ? 'default' : 'secondary'}
                                              className="text-xs"
                                            >
                                              {pricing.is_active ? 'Active' : 'Inactive'}
                                            </Badge>
                                          </div>
                                          <p className="text-sm text-muted-foreground">
                                            {formatOriginPricing(pricing)}
                                          </p>
                                        </CardContent>
                                      </Card>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  )
}
