'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Plus, Search, Edit, Trash2, Building2, MapPin, Phone, Mail,
  FileText, Download, CheckCircle, XCircle
} from 'lucide-react'
import Link from 'next/link'

interface Client {
  id: string
  name: string
  company: string
  fantasy_name?: string
  vat?: string
  address?: string
  city?: string
  state?: string
  country?: string
  zip_code?: string
  email?: string
  phone?: string
  contact_person?: string
  notes?: string
  is_active: boolean
  quality_specs_count?: number
  created_at: string
  // New fields
  client_types?: string[]
  is_qc_client?: boolean
  pricing_model?: 'per_sample' | 'per_pound'
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
  const [importing, setImporting] = useState(false)

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

        {/* Clients List */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clients.map((client) => (
              <Card key={client.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {client.fantasy_name || client.name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {client.company}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {client.is_qc_client !== false && (
                          <Badge className="text-xs bg-blue-500 hover:bg-blue-600">
                            QC Client
                          </Badge>
                        )}
                        {client.is_qc_client === false && (
                          <Badge variant="outline" className="text-xs">
                            Supply Chain
                          </Badge>
                        )}
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
                        {client.quality_specs_count !== undefined && client.quality_specs_count > 0 && (
                          <Badge variant="outline" className="text-xs">
                            <FileText className="h-3 w-3 mr-1" />
                            {client.quality_specs_count} specs
                          </Badge>
                        )}
                      </div>
                      {client.client_types && client.client_types.length > 0 && (
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          {client.client_types.map((type) => (
                            <Badge key={type} variant="secondary" className="text-xs">
                              {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {client.email && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                  {(client.city || client.country) && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span>{[client.city, client.state, client.country].filter(Boolean).join(', ')}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-3 border-t">
                    <Link href={`/clients/${client.id}/edit`}>
                      <Button variant="outline" size="sm">
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(client)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  )
}
