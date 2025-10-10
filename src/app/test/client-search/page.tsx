'use client'

import { useState } from 'react'
import { ClientSearchDialog } from '@/components/clients/client-search-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ClientSearchTestPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<any>(null)

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Client Search Dialog Test</CardTitle>
          <CardDescription>
            Test the client search dialog component for sample intake workflow
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Open Dialog Button */}
          <div>
            <Button onClick={() => setDialogOpen(true)}>
              Open Client Search Dialog
            </Button>
          </div>

          {/* Selected Client Display */}
          {selectedClient && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <h3 className="font-semibold mb-3">Selected Client:</h3>
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground">Name:</span>
                    <p className="font-medium">{selectedClient.name}</p>
                  </div>
                  {selectedClient.fantasy_name && (
                    <div>
                      <span className="text-muted-foreground">Fantasy Name:</span>
                      <p className="font-medium">{selectedClient.fantasy_name}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {selectedClient.primary_category && (
                    <div>
                      <span className="text-muted-foreground">Type:</span>
                      <p className="font-medium">{selectedClient.primary_category}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Source:</span>
                    <p className="font-medium capitalize">
                      {selectedClient.source?.replace('_', ' ')}
                    </p>
                  </div>
                </div>

                {(selectedClient.address || selectedClient.city || selectedClient.country) && (
                  <div>
                    <span className="text-muted-foreground">Address:</span>
                    <p className="font-medium">
                      {[
                        selectedClient.address,
                        selectedClient.city,
                        selectedClient.state,
                        selectedClient.country,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {selectedClient.email && (
                    <div>
                      <span className="text-muted-foreground">Email:</span>
                      <p className="font-medium">{selectedClient.email}</p>
                    </div>
                  )}
                  {selectedClient.phone && (
                    <div>
                      <span className="text-muted-foreground">Phone:</span>
                      <p className="font-medium">{selectedClient.phone}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground">Is QC Client:</span>
                    <p className="font-medium">
                      {selectedClient.is_qc_client ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Can Import:</span>
                    <p className="font-medium">
                      {selectedClient.can_import ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <span className="text-muted-foreground">Raw Data:</span>
                  <pre className="mt-2 p-3 bg-background rounded border text-xs overflow-auto">
                    {JSON.stringify(selectedClient, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950 p-4 rounded">
            <h4 className="font-semibold mb-2">Testing Instructions:</h4>
            <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
              <li>Click the button above to open the search dialog</li>
              <li>Type at least 2 characters to start searching</li>
              <li>Search will automatically trigger after 300ms</li>
              <li>Results show client name, type, address, and contact info</li>
              <li>Click on a result to select it</li>
              <li>Selected client details will appear above</li>
              <li>
                Test with different search terms (company names, emails, addresses)
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Client Search Dialog */}
      <ClientSearchDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSelectClient={(client) => {
          console.log('Selected client:', client)
          setSelectedClient(client)
        }}
        onCreateNew={() => {
          console.log('Create new client clicked')
          alert('Create New Client functionality would open the client form here')
        }}
      />
    </div>
  )
}
