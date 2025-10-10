'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Plus, Building2, MapPin, User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchResult {
  id: string
  company_id: string | null
  qc_client_id: string | null
  name: string
  fantasy_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  primary_category: string | null
  subcategories: string[] | null
  source: 'companies' | 'legacy_clients' | 'clients'
  relevance: number
  is_qc_client: boolean
  can_import: boolean
}

interface ClientSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectClient: (client: SearchResult) => void
  onCreateNew?: () => void
  title?: string
  description?: string
}

export function ClientSearchDialog({
  open,
  onOpenChange,
  onSelectClient,
  onCreateNew,
  title = 'Search for Client',
  description = 'Search for an existing client or create a new one',
}: ClientSearchDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounced search
  const searchClients = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/clients/search?q=${encodeURIComponent(query)}&limit=20`)

      if (!response.ok) {
        throw new Error('Failed to search clients')
      }

      const data = await response.json()
      setResults(data.results || [])
    } catch (err) {
      console.error('Error searching clients:', err)
      setError('Failed to search clients. Please try again.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      searchClients(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, searchClients])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setResults([])
      setError(null)
    }
  }, [open])

  const handleSelectClient = (client: SearchResult) => {
    onSelectClient(client)
    onOpenChange(false)
  }

  const handleCreateNew = () => {
    if (onCreateNew) {
      onCreateNew()
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 flex flex-col min-h-0">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, company, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto border rounded-lg min-h-[300px]">
            {loading && (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Searching...
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center h-full text-sm text-destructive">
                {error}
              </div>
            )}

            {!loading && !error && searchQuery.length < 2 && (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Enter at least 2 characters to search
              </div>
            )}

            {!loading && !error && searchQuery.length >= 2 && results.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground space-y-2">
                <p>No clients found matching &quot;{searchQuery}&quot;</p>
                {onCreateNew && (
                  <Button onClick={handleCreateNew} variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Client
                  </Button>
                )}
              </div>
            )}

            {!loading && !error && results.length > 0 && (
              <div className="divide-y">
                {results.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => handleSelectClient(client)}
                    className={cn(
                      "w-full p-4 text-left hover:bg-accent transition-colors",
                      "focus:outline-none focus:bg-accent"
                    )}
                  >
                    <div className="space-y-2">
                      {/* Client Name */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{client.name}</p>
                          {client.fantasy_name && (
                            <p className="text-sm text-muted-foreground truncate">
                              {client.fantasy_name}
                            </p>
                          )}
                        </div>
                        {client.is_qc_client ? (
                          <span className="inline-flex items-center rounded-full bg-green-50 dark:bg-green-950 px-2 py-1 text-xs font-medium text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                            QC Client
                          </span>
                        ) : client.can_import ? (
                          <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            Import Available
                          </span>
                        ) : null}
                      </div>

                      {/* Client Type and Source */}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {client.primary_category && (
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            <span>{client.primary_category}</span>
                          </div>
                        )}
                        {client.source && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span className="capitalize">{client.source.replace('_', ' ')}</span>
                          </div>
                        )}
                      </div>

                      {/* Address */}
                      {(client.address || client.city || client.country) && (
                        <div className="flex items-start gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          <span className="truncate">
                            {[client.address, client.city, client.state, client.country]
                              .filter(Boolean)
                              .join(', ')}
                          </span>
                        </div>
                      )}

                      {/* Contact Info */}
                      {(client.email || client.phone) && (
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {client.email && <span className="truncate">{client.email}</span>}
                          {client.phone && <span>{client.phone}</span>}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Create New Button */}
          {onCreateNew && results.length > 0 && (
            <div className="border-t pt-4">
              <Button onClick={handleCreateNew} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Create New Client
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
