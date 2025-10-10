'use client'

import { useState } from 'react'
import { ClientDetailView } from '@/components/clients/client-detail-view'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export default function ClientDetailTestPage() {
  const [clientId, setClientId] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

  const handleLoadClient = () => {
    if (clientId.trim()) {
      setSelectedClientId(clientId.trim())
    }
  }

  return (
    <div className="container mx-auto py-8 max-w-7xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Client Detail View Test</CardTitle>
          <CardDescription>
            Test the comprehensive client detail view component with tabs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="client-id">Client ID</Label>
              <Input
                id="client-id"
                placeholder="Enter client ID (UUID)"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleLoadClient()
                  }
                }}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleLoadClient}>Load Client</Button>
            </div>
          </div>

          <div className="border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950 p-4 rounded">
            <h4 className="font-semibold mb-2">Testing Instructions:</h4>
            <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
              <li>Enter a valid client ID (UUID) from your database</li>
              <li>Click &quot;Load Client&quot; or press Enter to view the detail page</li>
              <li>
                View will display 4 tabs: Overview, Samples, Quality Specs, and Metrics
              </li>
              <li>Overview tab shows complete client information and pricing</li>
              <li>Samples tab shows up to 50 recent samples with status badges</li>
              <li>
                Quality Specs tab displays assigned quality specifications and templates
              </li>
              <li>
                Metrics tab shows charts: Sample status pie chart and samples by origin bar chart
              </li>
              <li>Stats cards at the top show total samples, approved count, specs, and certificates</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {selectedClientId && (
        <div className="mt-6">
          <ClientDetailView clientId={selectedClientId} />
        </div>
      )}

      {!selectedClientId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Enter a client ID above to load the detail view
          </CardContent>
        </Card>
      )}
    </div>
  )
}
