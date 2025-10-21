'use client'

import { useState } from 'react'
import { ClientAutoDetection } from '@/components/clients/client-auto-detection'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

export default function ClientAutoDetectionTestPage() {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [metadata, setMetadata] = useState({
    exporter: '',
    buyer: '',
    roaster: '',
    importer: '',
    origin: '',
    supplier: '',
    wolthers_contract_nr: '',
    exporter_contract_nr: '',
    buyer_contract_nr: '',
    roaster_contract_nr: ''
  })

  const updateField = (field: string, value: string) => {
    setMetadata(prev => ({ ...prev, [field]: value }))
  }

  // Test scenarios
  const testScenarios = [
    {
      name: 'Brazil Exporter',
      data: {
        exporter: 'Carmo Coffees',
        buyer: '',
        roaster: '',
        importer: '',
        origin: 'Brazil',
        supplier: 'Fazenda São João',
        wolthers_contract_nr: '',
        exporter_contract_nr: '',
        buyer_contract_nr: '',
        roaster_contract_nr: ''
      }
    },
    {
      name: 'European Buyer',
      data: {
        exporter: '',
        buyer: 'Blaser Trading',
        roaster: 'Blaser Café',
        importer: '',
        origin: 'Colombia',
        supplier: '',
        wolthers_contract_nr: '',
        exporter_contract_nr: '',
        buyer_contract_nr: '',
        roaster_contract_nr: ''
      }
    },
    {
      name: 'Contract Match',
      data: {
        exporter: 'Unknown Exporter',
        buyer: '',
        roaster: '',
        importer: '',
        origin: 'Ethiopia',
        supplier: '',
        wolthers_contract_nr: 'W-2025-001',
        exporter_contract_nr: '',
        buyer_contract_nr: '',
        roaster_contract_nr: ''
      }
    },
    {
      name: 'Partial Name Match',
      data: {
        exporter: 'Coffee Company',
        buyer: '',
        roaster: '',
        importer: '',
        origin: 'Guatemala',
        supplier: '',
        wolthers_contract_nr: '',
        exporter_contract_nr: '',
        buyer_contract_nr: '',
        roaster_contract_nr: ''
      }
    }
  ]

  const loadScenario = (scenario: typeof testScenarios[0]) => {
    setMetadata(scenario.data)
    setSelectedClientId(null)
  }

  return (
    <div className="container max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Client Auto-Detection Test</h1>
        <p className="text-muted-foreground">
          Test the intelligent client matching system with various sample metadata scenarios
        </p>
      </div>

      {/* Test Scenarios */}
      <Card>
        <CardHeader>
          <CardTitle>Test Scenarios</CardTitle>
          <CardDescription>
            Load pre-configured scenarios to test different matching algorithms
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {testScenarios.map((scenario) => (
              <button
                key={scenario.name}
                onClick={() => loadScenario(scenario)}
                className="p-3 border rounded-lg hover:border-primary hover:bg-accent transition-colors text-left"
              >
                <p className="font-medium text-sm">{scenario.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {scenario.data.exporter || scenario.data.buyer || scenario.data.roaster || 'Mixed data'}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <Card>
          <CardHeader>
            <CardTitle>Sample Metadata</CardTitle>
            <CardDescription>
              Enter sample information to trigger client detection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="exporter">Exporter</Label>
                <Input
                  id="exporter"
                  value={metadata.exporter}
                  onChange={(e) => updateField('exporter', e.target.value)}
                  placeholder="Enter exporter name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="buyer">Buyer</Label>
                <Input
                  id="buyer"
                  value={metadata.buyer}
                  onChange={(e) => updateField('buyer', e.target.value)}
                  placeholder="Enter buyer name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="roaster">Roaster</Label>
                <Input
                  id="roaster"
                  value={metadata.roaster}
                  onChange={(e) => updateField('roaster', e.target.value)}
                  placeholder="Enter roaster name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="importer">Importer</Label>
                <Input
                  id="importer"
                  value={metadata.importer}
                  onChange={(e) => updateField('importer', e.target.value)}
                  placeholder="Enter importer name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="origin">Origin</Label>
                <Input
                  id="origin"
                  value={metadata.origin}
                  onChange={(e) => updateField('origin', e.target.value)}
                  placeholder="e.g., Brazil, Colombia"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier">Supplier</Label>
                <Input
                  id="supplier"
                  value={metadata.supplier}
                  onChange={(e) => updateField('supplier', e.target.value)}
                  placeholder="Farm or cooperative"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wolthers_contract">Wolthers Contract</Label>
                <Input
                  id="wolthers_contract"
                  value={metadata.wolthers_contract_nr}
                  onChange={(e) => updateField('wolthers_contract_nr', e.target.value)}
                  placeholder="W-2025-001"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exporter_contract">Exporter Contract</Label>
                <Input
                  id="exporter_contract"
                  value={metadata.exporter_contract_nr}
                  onChange={(e) => updateField('exporter_contract_nr', e.target.value)}
                  placeholder="Contract number"
                />
              </div>
            </div>

            {selectedClientId && (
              <div className="pt-4 border-t">
                <Label>Selected Client</Label>
                <Badge variant="default" className="mt-2">
                  Client ID: {selectedClientId}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Auto-Detection Results */}
        <div className="space-y-4">
          <ClientAutoDetection
            metadata={metadata}
            onClientSelect={(clientId) => {
              setSelectedClientId(clientId)
              console.log('Client selected:', clientId)
            }}
            autoSelect={false}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Detection Algorithm Features</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
                  40%
                </Badge>
                <div>
                  <p className="font-medium">Exact Name Match</p>
                  <p className="text-muted-foreground">Exporter/buyer/roaster matches client name exactly</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Badge variant="outline" className="bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                  35%
                </Badge>
                <div>
                  <p className="font-medium">Contract Number Match</p>
                  <p className="text-muted-foreground">Contract numbers found in historical data</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                  25%
                </Badge>
                <div>
                  <p className="font-medium">Partial Name Match</p>
                  <p className="text-muted-foreground">Similar names detected</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Badge variant="outline" className="bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300">
                  20%
                </Badge>
                <div>
                  <p className="font-medium">Origin History</p>
                  <p className="text-muted-foreground">Client has previous samples from this origin</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Badge variant="outline" className="bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300">
                  15%
                </Badge>
                <div>
                  <p className="font-medium">Supplier History</p>
                  <p className="text-muted-foreground">Previous samples from this supplier</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Badge variant="outline" className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                  10%
                </Badge>
                <div>
                  <p className="font-medium">Recent Activity</p>
                  <p className="text-muted-foreground">Samples in last 90 days</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Instructions */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-sm">Testing Instructions</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>1. Click on a test scenario button or manually enter sample metadata</p>
          <p>2. The auto-detection component will analyze the data and show matching clients</p>
          <p>3. Each match displays confidence score and reasons for the match</p>
          <p>4. Click on a suggested client to select it</p>
          <p>5. High confidence matches (85%+) can be auto-selected when enabled</p>
        </CardContent>
      </Card>
    </div>
  )
}
