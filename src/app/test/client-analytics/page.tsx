'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ClientAnalyticsDashboard } from '@/components/clients/client-analytics-dashboard'
import { supabase } from '@/lib/supabase'

export default function TestClientAnalyticsPage() {
  const [clientId, setClientId] = useState<string>('')
  const [clientName, setClientName] = useState<string>('')
  const [clients, setClients] = useState<any[]>([])
  const [showAnalytics, setShowAnalytics] = useState(false)

  useEffect(() => {
    async function fetchClients() {
      const { data } = await (supabase as any)
        .from('companies')
        .select('id, name, fantasy_name')
        .eq('is_qc_client', true)
        .limit(10)

      if (data) {
        setClients(data)
      }
    }
    fetchClients()
  }, [])

  const handleClientSelect = (client: any) => {
    setClientId(client.id)
    setClientName(client.fantasy_name || client.name)
    setShowAnalytics(true)
  }

  return (
    <div className="container mx-auto p-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Client Analytics Dashboard Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Select a Client or Enter Client ID</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter client UUID"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Client name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
              <Button onClick={() => setShowAnalytics(true)}>
                Load Analytics
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Quick Select (QC-Enabled Clients)</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {clients.map((client) => (
                <Button
                  key={client.id}
                  variant="outline"
                  onClick={() => handleClientSelect(client)}
                  className="justify-start"
                >
                  {client.fantasy_name || client.name}
                </Button>
              ))}
            </div>
          </div>

          {clients.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Found {clients.length} QC-enabled clients. Select one to view analytics.
            </div>
          )}
        </CardContent>
      </Card>

      {showAnalytics && clientId && clientName && (
        <ClientAnalyticsDashboard clientId={clientId} clientName={clientName} />
      )}

      {showAnalytics && (!clientId || !clientName) && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Please provide both client ID and name to view analytics
          </CardContent>
        </Card>
      )}
    </div>
  )
}
