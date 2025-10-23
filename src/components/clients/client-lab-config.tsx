'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Save, AlertCircle, Info } from 'lucide-react'

interface Laboratory {
  id: string
  name: string
  location: string
  country?: string
}

interface LabConfig {
  id?: string
  laboratory_id: string
  starting_sequence: number
  notes?: string
}

interface ClientLabConfigProps {
  clientId: string
  clientName: string
}

export function ClientLabConfig({ clientId, clientName }: ClientLabConfigProps) {
  const [laboratories, setLaboratories] = useState<Laboratory[]>([])
  const [configs, setConfigs] = useState<Record<string, LabConfig>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [clientId])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load all laboratories
      const { data: labsData, error: labsError } = await supabase
        .from('laboratories')
        .select('id, name, location, country')
        .order('name')

      if (labsError) throw labsError
      setLaboratories(labsData || [])

      // Load existing configurations
      const response = await fetch(`/api/clients/${clientId}/lab-configs`)
      const { configs: existingConfigs } = await response.json()

      // Convert array to object keyed by laboratory_id
      const configMap: Record<string, LabConfig> = {}
      existingConfigs?.forEach((config: any) => {
        configMap[config.laboratory_id] = {
          id: config.id,
          laboratory_id: config.laboratory_id,
          starting_sequence: config.starting_sequence,
          notes: config.notes
        }
      })
      setConfigs(configMap)
    } catch (err: any) {
      console.error('Error loading data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (labId: string) => {
    setSaving(labId)
    setError(null)

    try {
      const config = configs[labId]
      if (!config) return

      const response = await fetch(`/api/clients/${clientId}/lab-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          laboratory_id: labId,
          starting_sequence: config.starting_sequence,
          notes: config.notes
        })
      })

      if (!response.ok) {
        const { error } = await response.json()
        throw new Error(error)
      }

      // Reload to get the new config ID if it was inserted
      await loadData()
    } catch (err: any) {
      console.error('Error saving config:', err)
      setError(err.message)
    } finally {
      setSaving(null)
    }
  }

  const handleDelete = async (labId: string) => {
    const config = configs[labId]
    if (!config?.id) return

    setSaving(labId)
    setError(null)

    try {
      const response = await fetch(
        `/api/clients/${clientId}/lab-configs?config_id=${config.id}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        const { error } = await response.json()
        throw new Error(error)
      }

      // Remove from local state
      const newConfigs = { ...configs }
      delete newConfigs[labId]
      setConfigs(newConfigs)
    } catch (err: any) {
      console.error('Error deleting config:', err)
      setError(err.message)
    } finally {
      setSaving(null)
    }
  }

  const updateConfig = (labId: string, field: keyof LabConfig, value: any) => {
    setConfigs(prev => ({
      ...prev,
      [labId]: {
        ...prev[labId],
        laboratory_id: labId,
        [field]: value
      }
    }))
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading configurations...</div>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Laboratory-Specific Starting Sequences</CardTitle>
        <CardDescription>
          Configure different starting sequence numbers for {clientName} across different laboratories.
          Each lab will maintain its own independent sequence counter.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="bg-muted/50 p-4 rounded-lg">
          <p className="text-sm font-medium mb-2 flex items-center gap-2">
            <Info className="w-4 h-4" />
            How it works
          </p>
          <p className="text-xs text-muted-foreground">
            Set a starting sequence for each laboratory. If not set, the global client starting sequence will be used.
            Each lab maintains its own counter, so Brazil can be at 8900 while Colombia starts at 5000.
          </p>
        </div>

        <div className="space-y-3">
          {laboratories.map((lab) => {
            const config = configs[lab.id]
            const hasConfig = !!config

            return (
              <div
                key={lab.id}
                className="border rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{lab.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {lab.location} {lab.country && `• ${lab.country}`}
                    </p>
                  </div>
                  {hasConfig && (
                    <Badge variant="secondary">Configured</Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`seq-${lab.id}`}>Starting Sequence Number</Label>
                    <Input
                      id={`seq-${lab.id}`}
                      type="number"
                      min="1"
                      value={config?.starting_sequence || ''}
                      onChange={(e) => updateConfig(lab.id, 'starting_sequence', e.target.value)}
                      placeholder="e.g., 8900"
                    />
                    <p className="text-xs text-muted-foreground">
                      {config?.starting_sequence
                        ? `Next tracking number will start at ${String(config.starting_sequence).padStart(6, '0')}`
                        : 'Using global client starting sequence'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`notes-${lab.id}`}>Notes (Optional)</Label>
                    <Input
                      id={`notes-${lab.id}`}
                      value={config?.notes || ''}
                      onChange={(e) => updateConfig(lab.id, 'notes', e.target.value)}
                      placeholder="e.g., Continuing from previous system"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleSave(lab.id)}
                    disabled={!config?.starting_sequence || saving === lab.id}
                  >
                    <Save className="h-3 w-3 mr-1" />
                    {saving === lab.id ? 'Saving...' : 'Save Configuration'}
                  </Button>

                  {hasConfig && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(lab.id)}
                      disabled={saving === lab.id}
                    >
                      {saving === lab.id ? 'Removing...' : 'Remove'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
