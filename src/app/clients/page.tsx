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
  Plus, Search, Edit, Trash2, Loader2, Copy, Check
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
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null)

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
                    <TableHead>Type</TableHead>
                    <TableHead>QC</TableHead>
                    <TableHead>Pricing</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold">{client.fantasy_name || client.name}</span>
                          {client.email && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span className="truncate max-w-[250px]">{client.email}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => handleCopyEmail(client.email!)}
                              >
                                {copiedEmail === client.email ? (
                                  <Check className="h-3 w-3 text-green-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          )}
                          {client.phone && (
                            <span className="text-sm text-muted-foreground">{client.phone}</span>
                          )}
                          {(client.city || client.country) && (
                            <span className="text-sm text-muted-foreground">
                              {[client.city, client.state, client.country].filter(Boolean).join(', ')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatClientTypes(client.client_types)}</span>
                      </TableCell>
                      <TableCell>
                        {client.is_qc_client !== false ? (
                          <Badge variant="default" className="text-xs">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            No
                          </Badge>
                        )}
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
