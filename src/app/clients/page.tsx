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
  Plus, Search, Edit, Trash2, Building2, MapPin, Phone, Mail,
  CheckCircle, XCircle, Loader2
} from 'lucide-react'
import Link from 'next/link'
import { Switch } from '@/components/ui/switch'

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
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [togglingStatus, setTogglingStatus] = useState<string | null>(null)

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

  const formatClientTypes = (types?: string[]) => {
    if (!types || types.length === 0) return '-'
    return types
      .map(type => type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))
      .join(', ')
  }

  const formatPricing = (client: Client) => {
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
              <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
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
                    <TableHead>Contact</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Pricing</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{client.fantasy_name || client.name}</span>
                          </div>
                          {client.fantasy_name && client.fantasy_name !== client.name && (
                            <span className="text-sm text-muted-foreground ml-6">{client.company}</span>
                          )}
                          <div className="flex items-center gap-2 mt-1 ml-6">
                            {client.is_qc_client !== false && (
                              <Badge variant="default" className="text-xs">
                                QC Client
                              </Badge>
                            )}
                            {client.is_qc_client === false && (
                              <Badge variant="outline" className="text-xs">
                                Supply Chain
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm">
                          {client.email && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              <span className="truncate max-w-[200px]">{client.email}</span>
                            </div>
                          )}
                          {client.phone && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              <span>{client.phone}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(client.city || client.country) ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            <span>{[client.city, client.state, client.country].filter(Boolean).join(', ')}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatClientTypes(client.client_types)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatPricing(client)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={client.is_active}
                            onCheckedChange={() => handleToggleActive(client)}
                            disabled={togglingStatus === client.id}
                          />
                          {client.is_active ? (
                            <Badge variant="default" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              <XCircle className="h-3 w-3 mr-1" />
                              Inactive
                            </Badge>
                          )}
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
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  )
}
