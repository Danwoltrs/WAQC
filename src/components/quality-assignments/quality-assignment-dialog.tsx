'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Search } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface QualityAssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  mode: 'from-template' | 'from-client'
  templateId?: string
  clientId?: string
}

interface Client {
  id: string
  name: string
  company: string
  fantasy_name?: string
  certificate_pattern?: {
    has_quality_code?: boolean
    quality_position?: 'prefix' | 'suffix'
  }
}

interface QualityTemplate {
  id: string
  name_en: string
  name_pt: string
  name_es: string
  version: number
}

export function QualityAssignmentDialog({
  open,
  onOpenChange,
  onSuccess,
  mode,
  templateId,
  clientId
}: QualityAssignmentDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)

  // Form state
  const [selectedClientId, setSelectedClientId] = useState<string>(clientId || '')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(templateId || '')
  const [customName, setCustomName] = useState('')
  const [qualityCode, setQualityCode] = useState('')
  const [cupsPerSample, setCupsPerSample] = useState<number>(10)
  const [notes, setNotes] = useState('')

  // Search state
  const [clients, setClients] = useState<Client[]>([])
  const [templates, setTemplates] = useState<QualityTemplate[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [templateSearch, setTemplateSearch] = useState('')
  const [clientOpen, setClientOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)

  // Client settings
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showQualityCode, setShowQualityCode] = useState(false)

  // Fetch clients (for from-template mode)
  useEffect(() => {
    if (mode === 'from-template' && open) {
      fetchAvailableClients()
    }
  }, [mode, open, templateId])

  // Fetch templates (for from-client mode)
  useEffect(() => {
    if (mode === 'from-client' && open) {
      fetchAvailableTemplates()
      fetchClientSettings()
    }
  }, [mode, open, clientId])

  // Fetch client settings when in from-client mode
  const fetchClientSettings = async () => {
    if (!clientId) return

    try {
      const response = await fetch(`/api/clients/${clientId}`)
      if (!response.ok) throw new Error('Failed to fetch client')

      const data = await response.json()
      setSelectedClient(data.client)
      setShowQualityCode(data.client.certificate_pattern?.has_quality_code || false)
    } catch (error) {
      console.error('Error fetching client settings:', error)
    }
  }

  // Update client settings when client is selected
  useEffect(() => {
    if (selectedClientId) {
      const client = clients.find(c => c.id === selectedClientId)
      if (client) {
        console.log('Selected client:', client.name, 'has_quality_code:', client.certificate_pattern?.has_quality_code)
        setSelectedClient(client)
        setShowQualityCode(client.certificate_pattern?.has_quality_code || false)
      }
    }
  }, [selectedClientId, clients])

  const fetchAvailableClients = async () => {
    setSearchLoading(true)
    try {
      // Fetch all active clients
      const response = await fetch('/api/clients?is_active=true')
      if (!response.ok) throw new Error('Failed to fetch clients')

      const data = await response.json()

      // Filter out clients that already have this template assigned
      const assignedResponse = await fetch(`/api/client-qualities?template_id=${templateId}`)
      if (!assignedResponse.ok) throw new Error('Failed to fetch assigned clients')

      const assignedData = await assignedResponse.json()
      const assignedClientIds = new Set(assignedData.client_qualities.map((cq: any) => cq.client_id))

      const availableClients = data.clients.filter((client: Client) => !assignedClientIds.has(client.id))
      setClients(availableClients)
    } catch (error) {
      console.error('Error fetching clients:', error)
      toast({
        title: 'Error',
        description: 'Failed to load clients',
        variant: 'destructive'
      })
    } finally {
      setSearchLoading(false)
    }
  }

  const fetchAvailableTemplates = async () => {
    setSearchLoading(true)
    try {
      // Fetch all active templates
      const response = await fetch('/api/quality-templates?is_active=true')
      if (!response.ok) throw new Error('Failed to fetch templates')

      const data = await response.json()

      // Filter out templates already assigned to this client
      const assignedResponse = await fetch(`/api/client-qualities?client_id=${clientId}`)
      if (!assignedResponse.ok) throw new Error('Failed to fetch assigned templates')

      const assignedData = await assignedResponse.json()
      const assignedTemplateIds = new Set(assignedData.client_qualities.map((cq: any) => cq.template_id))

      const availableTemplates = data.templates.filter((template: QualityTemplate) => !assignedTemplateIds.has(template.id))
      setTemplates(availableTemplates)
    } catch (error) {
      console.error('Error fetching templates:', error)
      toast({
        title: 'Error',
        description: 'Failed to load quality templates',
        variant: 'destructive'
      })
    } finally {
      setSearchLoading(false)
    }
  }

  const handleSubmit = async () => {
    // Validation
    if (mode === 'from-template' && !selectedClientId) {
      toast({
        title: 'Validation Error',
        description: 'Please select a client',
        variant: 'destructive'
      })
      return
    }

    if (mode === 'from-client' && !selectedTemplateId) {
      toast({
        title: 'Validation Error',
        description: 'Please select a quality template',
        variant: 'destructive'
      })
      return
    }

    if (!customName.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a custom quality name',
        variant: 'destructive'
      })
      return
    }

    setLoading(true)
    try {
      const payload = {
        client_id: mode === 'from-template' ? selectedClientId : clientId,
        template_id: mode === 'from-client' ? selectedTemplateId : templateId,
        custom_name: customName.trim(),
        quality_code: qualityCode.trim() || null,
        code_position: selectedClient?.certificate_pattern?.quality_position || 'suffix',
        cups_per_sample: cupsPerSample,
        notes: notes.trim() || null,
        is_active: true
      }

      const response = await fetch('/api/client-qualities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create quality assignment')
      }

      toast({
        title: 'Success',
        description: 'Quality assignment created successfully'
      })

      // Reset form
      setCustomName('')
      setQualityCode('')
      setCupsPerSample(10)
      setNotes('')
      setSelectedClientId(clientId || '')
      setSelectedTemplateId(templateId || '')

      onSuccess?.()
      onOpenChange(false)
    } catch (error: any) {
      console.error('Error creating quality assignment:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to create quality assignment',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    client.company.toLowerCase().includes(clientSearch.toLowerCase())
  )

  const filteredTemplates = templates.filter(template =>
    template.name_en.toLowerCase().includes(templateSearch.toLowerCase()) ||
    template.name_pt.toLowerCase().includes(templateSearch.toLowerCase()) ||
    template.name_es.toLowerCase().includes(templateSearch.toLowerCase())
  )

  const getPreviewName = () => {
    if (!customName) return 'Enter a custom name to preview'
    if (!qualityCode || !showQualityCode) return customName
    return `${customName} | ${qualityCode}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'from-template' ? 'Assign Quality Template to Client' : 'Assign Quality Specification'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'from-template'
              ? 'Create a custom quality specification for a client based on this template'
              : 'Select a quality template and customize it for this client'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Client Selection (from-template mode) */}
          {mode === 'from-template' && (
            <div className="space-y-2">
              <Label htmlFor="client">Client</Label>
              <Popover open={clientOpen} onOpenChange={setClientOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={clientOpen}
                    className="w-full justify-between"
                    disabled={searchLoading}
                  >
                    {selectedClientId
                      ? clients.find((client) => client.id === selectedClientId)?.fantasy_name || clients.find((client) => client.id === selectedClientId)?.company
                      : "Select client..."}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput
                      placeholder="Search clients..."
                      value={clientSearch}
                      onValueChange={setClientSearch}
                    />
                    <CommandEmpty>No clients found.</CommandEmpty>
                    <CommandGroup className="max-h-64 overflow-auto">
                      {filteredClients.map((client) => (
                        <CommandItem
                          key={client.id}
                          value={client.id}
                          onSelect={() => {
                            setSelectedClientId(client.id)
                            setClientOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedClientId === client.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div>
                            <div className="font-medium">{client.fantasy_name || client.company}</div>
                            <div className="text-sm text-muted-foreground">{client.name}</div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Template Selection (from-client mode) */}
          {mode === 'from-client' && (
            <div className="space-y-2">
              <Label htmlFor="template">Quality Template</Label>
              <Popover open={templateOpen} onOpenChange={setTemplateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={templateOpen}
                    className="w-full justify-between"
                    disabled={searchLoading}
                  >
                    {selectedTemplateId
                      ? templates.find((template) => template.id === selectedTemplateId)?.name_en
                      : "Select template..."}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput
                      placeholder="Search templates..."
                      value={templateSearch}
                      onValueChange={setTemplateSearch}
                    />
                    <CommandEmpty>No templates found.</CommandEmpty>
                    <CommandGroup className="max-h-64 overflow-auto">
                      {filteredTemplates.map((template) => (
                        <CommandItem
                          key={template.id}
                          value={template.id}
                          onSelect={() => {
                            setSelectedTemplateId(template.id)
                            setTemplateOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedTemplateId === template.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="font-medium">
                            {template.name_en} <span className="text-sm text-muted-foreground font-normal">v{template.version}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Custom Name, Cups, and Quality Code */}
          <div className="space-y-2">
            <div className="flex items-start gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="custom-name">Custom Quality Name *</Label>
                <Input
                  id="custom-name"
                  placeholder="e.g., Alfenas Dulce, Santos Fancy Gourmet"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  This is how this quality will be displayed for this client
                </p>
              </div>

              <div className="w-px bg-border self-stretch mt-8" />

              <div className="w-24 space-y-2">
                <Label htmlFor="cups">Cups</Label>
                <Input
                  id="cups"
                  type="number"
                  min={1}
                  max={20}
                  value={cupsPerSample}
                  onChange={(e) => setCupsPerSample(Math.max(1, Math.min(20, parseInt(e.target.value) || 10)))}
                  className="text-center"
                />
                <p className="text-xs text-muted-foreground">
                  Per sample
                </p>
              </div>

              {showQualityCode && (
                <>
                  <div className="w-px bg-border self-stretch mt-8" />
                  <div className="w-32 space-y-2">
                    <Label htmlFor="quality-code">Code</Label>
                    <Input
                      id="quality-code"
                      placeholder="e.g., AD"
                      value={qualityCode}
                      onChange={(e) => setQualityCode(e.target.value.toUpperCase())}
                      maxLength={10}
                      className="text-center"
                    />
                    <p className="text-xs text-muted-foreground">
                      For cert #
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Internal notes about this quality assignment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Preview */}
          <div className="rounded-lg border p-4 bg-muted/50">
            <Label className="text-sm font-medium">Preview</Label>
            <p className="text-sm text-muted-foreground mt-1">Internal Display Name:</p>
            <p className="font-medium mt-1">{getPreviewName()}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Note: Certificates will show &quot;{customName || 'the custom name'}&quot; without the code
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
