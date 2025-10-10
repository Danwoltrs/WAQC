'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { ClientConfigurationManager } from '@/components/clients/client-configuration-manager'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ClientConfigurationTestPage() {
  const [clients, setClients] = useState<any[]>([])
  const [selectedClient, setSelectedClient] = useState<any | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadClients()
  }, [])

  const loadClients = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/clients')
      const data = await response.json()

      if (response.ok) {
        setClients(data.clients || [])
      }
    } catch (error) {
      console.error('Error loading clients:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredClients = clients.filter((client) =>
    client.name.toLowerCase().includes(search.toLowerCase()) ||
    (client.fantasy_name && client.fantasy_name.toLowerCase().includes(search.toLowerCase())) ||
    (client.company && client.company.toLowerCase().includes(search.toLowerCase()))
  )

  if (selectedClient) {
    return (
      <MainLayout>
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <Button
            variant="outline"
            onClick={() => setSelectedClient(null)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Client Selection
          </Button>

          <ClientConfigurationManager
            clientId={selectedClient.id}
            clientName={selectedClient.name}
          />
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold tracking-tight mt-2">
            Client Configuration Manager Test
          </h1>
          <p className="text-muted-foreground">
            Select a client to manage their quality specifications and preferences
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select a Client</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {loading ? (
              <p className="text-center text-muted-foreground py-8">Loading clients...</p>
            ) : filteredClients.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No clients found. {search && 'Try adjusting your search.'}
              </p>
            ) : (
              <div className="space-y-2">
                {filteredClients.slice(0, 20).map((client) => (
                  <button
                    key={client.id}
                    onClick={() => setSelectedClient(client)}
                    className="w-full text-left p-4 border rounded-lg hover:bg-muted transition-colors"
                  >
                    <div className="font-semibold">{client.name}</div>
                    {client.fantasy_name && (
                      <div className="text-sm text-muted-foreground">
                        {client.fantasy_name}
                      </div>
                    )}
                    {client.company && (
                      <div className="text-sm text-muted-foreground">
                        {client.company}
                      </div>
                    )}
                    {client.primary_category && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {client.primary_category}
                      </div>
                    )}
                  </button>
                ))}
                {filteredClients.length > 20 && (
                  <p className="text-sm text-muted-foreground text-center pt-2">
                    Showing first 20 results. Use search to narrow down.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Testing Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold mb-2">Quality Specifications Tab</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Click &quot;Assign Template&quot; to link a quality template to the client</li>
                <li>Optionally specify an origin to apply the template only to samples from that origin</li>
                <li>View assigned templates with their parameters and custom configurations</li>
                <li>Remove templates that are not in use by existing samples</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Configuration Inheritance</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Global Template: Defined in quality_templates table</li>
                <li>Client Template: Assignment in client_qualities with optional custom_parameters</li>
                <li>Sample-Specific: Individual samples can reference a client quality specification</li>
              </ul>
            </div>

            <div className="p-3 bg-muted rounded-md">
              <p className="font-semibold mb-1">Note:</p>
              <p className="text-muted-foreground">
                Defect Configurations and Notification Preferences tabs are placeholders.
                They will be implemented in subsequent tasks as the system evolves.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
