'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Plus, Search, Edit, Trash2, Building, MapPin, Phone, Mail,
  Users, CheckCircle, XCircle, User, Warehouse, Grid3x3, MoveIcon,
  Wind, DoorOpen, Box, Square, AlertTriangle
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuth } from '@/components/providers/auth-provider'
import { LabStorageManagement } from '@/components/storage/lab-storage-management'

interface Laboratory {
  id: string
  name: string
  location: string
  country?: string
  address?: string
  neighborhood?: string
  city?: string
  state?: string
  zip_code?: string
  type: string
  storage_capacity: number
  contact_email?: string
  contact_phone?: string
  is_active: boolean
  supported_origins?: string[]
  fee_per_sample?: number
  fee_currency?: string
  billing_basis?: 'approved_only' | 'approved_and_rejected'
  personnel_count?: number
  created_at: string
}

interface Personnel {
  id: string
  email: string
  full_name: string
  qc_role: string
  is_active: boolean
  created_at: string
  is_global_admin?: boolean
}

interface ShelfData {
  id: string
  shelf_letter: string
  rows: number
  columns: number
  samples_per_position: number
  capacity: number
  x_position: number
  y_position: number
  client_id: string
  allow_client_view: boolean
}

interface Client {
  id: string
  name: string
}

interface Obstacle {
  id: string
  x: number
  y: number
  width: number
  height: number
  type: 'aircon' | 'door' | 'column' | 'wall' | 'other'
  label: string
}

const ORIGIN_OPTIONS = [
  'Brazil',
  'Colombia',
  'El Salvador',
  'Guatemala',
  'Honduras',
  'Mexico',
  'Nicaragua',
  'Peru',
]

export default function LaboratoriesPage() {
  const { profile, permissions } = useAuth()
  const [laboratories, setLaboratories] = useState<Laboratory[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [addLabDialogOpen, setAddLabDialogOpen] = useState(false)
  const [labCreationStep, setLabCreationStep] = useState(1) // 1 = Basic Info, 2 = Shelves, 3 = Placement
  const [createdLabId, setCreatedLabId] = useState<string | null>(null)
  const [editingLab, setEditingLab] = useState<Laboratory | null>(null)
  const [viewingPersonnel, setViewingPersonnel] = useState<Laboratory | null>(null)
  const [viewingStorage, setViewingStorage] = useState<Laboratory | null>(null)
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [loadingPersonnel, setLoadingPersonnel] = useState(false)
  const [addPersonnelDialogOpen, setAddPersonnelDialogOpen] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [togglingStatus, setTogglingStatus] = useState<string | null>(null)

  // New lab form state
  const [newLab, setNewLab] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    country: '',
    type: 'lab' as 'lab' | 'hq' | '3rd_party_lab',
    contact_email: '',
    contact_phone: '',
    admin_email: '',
    admin_name: '',
    supported_origins: [] as string[],
    is_3rd_party: false,
    fee_per_sample: undefined as number | undefined,
    fee_currency: 'USD' as string,
    billing_basis: 'approved_only' as 'approved_only' | 'approved_and_rejected'
  })

  // Storage shelves state
  const [shelves, setShelves] = useState<ShelfData[]>([])

  // Obstacles state
  const [obstacles, setObstacles] = useState<Obstacle[]>([])
  const [placementMode, setPlacementMode] = useState<'shelves' | 'obstacles'>('shelves')
  const [selectedObstacleType, setSelectedObstacleType] = useState<'aircon' | 'door' | 'column' | 'wall' | 'other'>('aircon')

  // New personnel form state
  const [newPersonnel, setNewPersonnel] = useState({
    email: '',
    full_name: '',
    qc_role: 'lab_personnel' as string
  })

  const canManageAllLabs = profile?.is_global_admin || profile?.qc_role === 'global_quality_admin'
  const canManageOwnLab = profile?.qc_role === 'lab_quality_manager'

  useEffect(() => {
    loadLaboratories()
    loadClients()
  }, [searchQuery])

  const loadLaboratories = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/laboratories')
      const data = await response.json()

      if (response.ok) {
        let filtered = data.laboratories
        if (searchQuery) {
          filtered = filtered.filter((lab: Laboratory) =>
            lab.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            lab.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
            lab.country?.toLowerCase().includes(searchQuery.toLowerCase())
          )
        }
        setLaboratories(filtered)
      }
    } catch (error) {
      console.error('Error loading laboratories:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadClients = async () => {
    try {
      const response = await fetch('/api/clients')
      const data = await response.json()
      if (response.ok) {
        setClients(data.clients || [])
      }
    } catch (error) {
      console.error('Error loading clients:', error)
    }
  }

  const loadPersonnel = async (labId: string) => {
    try {
      setLoadingPersonnel(true)
      const response = await fetch(`/api/laboratories/${labId}/personnel`)
      const data = await response.json()

      if (response.ok) {
        setPersonnel(data.personnel)
      }
    } catch (error) {
      console.error('Error loading personnel:', error)
    } finally {
      setLoadingPersonnel(false)
    }
  }

  const calculateTotalCapacity = () => {
    return shelves.reduce((total, shelf) => total + shelf.capacity, 0)
  }

  const handleAddShelf = () => {
    // Auto-assign next letter
    const nextLetter = String.fromCharCode(65 + shelves.length) // A, B, C...
    const newShelf: ShelfData = {
      id: `shelf-${Date.now()}`,
      shelf_letter: nextLetter,
      rows: 3,
      columns: 8,
      samples_per_position: 42,
      capacity: 1008, // 3 * 8 * 42
      x_position: 0,
      y_position: 0,
      client_id: '',
      allow_client_view: false
    }
    setShelves([...shelves, newShelf])
  }

  const handleUpdateShelf = (shelfId: string, updates: Partial<ShelfData>) => {
    setShelves(shelves.map(shelf => {
      if (shelf.id === shelfId) {
        const updated = { ...shelf, ...updates }
        // Recalculate capacity
        updated.capacity = updated.rows * updated.columns * updated.samples_per_position
        return updated
      }
      return shelf
    }))
  }

  const handleRemoveShelf = (shelfId: string) => {
    setShelves(shelves.filter(shelf => shelf.id !== shelfId))
  }

  const handleAddObstacle = (x: number, y: number) => {
    const newObstacle: Obstacle = {
      id: `obstacle-${Date.now()}`,
      x,
      y,
      width: 1,
      height: 1,
      type: selectedObstacleType,
      label: selectedObstacleType.charAt(0).toUpperCase() + selectedObstacleType.slice(1)
    }
    setObstacles([...obstacles, newObstacle])
  }

  const handleRemoveObstacle = (obstacleId: string) => {
    setObstacles(obstacles.filter(obs => obs.id !== obstacleId))
  }

  const handleUpdateObstacle = (obstacleId: string, updates: Partial<Obstacle>) => {
    setObstacles(obstacles.map(obs =>
      obs.id === obstacleId ? { ...obs, ...updates } : obs
    ))
  }

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (placementMode !== 'obstacles') return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / 50)
    const y = Math.floor((e.clientY - rect.top) / 50)

    // Check if clicking on existing obstacle to remove it
    const existingObstacle = obstacles.find(obs =>
      x >= obs.x && x < obs.x + obs.width &&
      y >= obs.y && y < obs.y + obs.height
    )

    if (existingObstacle) {
      handleRemoveObstacle(existingObstacle.id)
    } else {
      handleAddObstacle(x, y)
    }
  }

  const getObstacleIcon = (type: string) => {
    switch (type) {
      case 'aircon': return Wind
      case 'door': return DoorOpen
      case 'column': return Box
      case 'wall': return Square
      default: return AlertTriangle
    }
  }

  const handleNextStep = async () => {
    if (labCreationStep === 1) {
      // Validate basic info
      if (!newLab.name || !newLab.address || !newLab.city || !newLab.state || !newLab.country) {
        alert('Please fill in laboratory name, address, city, state, and country')
        return
      }
      setLabCreationStep(2)
    } else if (labCreationStep === 2) {
      // Validate shelves and create lab
      if (shelves.length === 0) {
        alert('Please add at least one storage shelf')
        return
      }

      // Create the laboratory first
      const location = [newLab.address, newLab.city, newLab.state, newLab.zip_code]
        .filter(Boolean).join(', ')

      try {
        const response = await fetch('/api/laboratories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newLab.name,
            location: location,
            country: newLab.country,
            type: newLab.type,
            storage_capacity: calculateTotalCapacity(),
            contact_email: newLab.contact_email,
            contact_phone: newLab.contact_phone,
            supported_origins: newLab.supported_origins.length > 0 ? newLab.supported_origins : null,
            is_3rd_party: newLab.is_3rd_party,
            fee_per_sample: newLab.is_3rd_party ? newLab.fee_per_sample : null,
            fee_currency: newLab.is_3rd_party ? newLab.fee_currency : null,
            billing_basis: newLab.is_3rd_party ? newLab.billing_basis : null
          })
        })

        if (response.ok) {
          const data = await response.json()
          setCreatedLabId(data.laboratory.id)
          setLabCreationStep(3)
        } else {
          const error = await response.json()
          alert(`Failed to create laboratory: ${error.error}`)
        }
      } catch (error) {
        console.error('Error creating laboratory:', error)
        alert('Failed to create laboratory')
      }
    }
  }

  const handlePreviousStep = () => {
    if (labCreationStep > 1) {
      setLabCreationStep(labCreationStep - 1)
    }
  }

  const handleFinishCreation = async () => {
    if (!createdLabId) return

    // Create all shelves via API
    try {
      for (const shelf of shelves) {
        await fetch(`/api/laboratories/${createdLabId}/shelves`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shelf_letter: shelf.shelf_letter,
            rows: shelf.rows,
            columns: shelf.columns,
            samples_per_position: shelf.samples_per_position,
            x_position: shelf.x_position,
            y_position: shelf.y_position,
            client_id: shelf.client_id || null,
            allow_client_view: shelf.allow_client_view
          })
        })
      }

      // Create admin user if provided
      if (newLab.admin_email && newLab.admin_name) {
        try {
          await fetch(`/api/laboratories/${createdLabId}/personnel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: newLab.admin_email,
              full_name: newLab.admin_name,
              qc_role: 'lab_director'
            })
          })
        } catch (error) {
          console.error('Error creating lab admin:', error)
          // Don't fail the whole process if admin creation fails
        }
      }

      // Reset and close
      setAddLabDialogOpen(false)
      setLabCreationStep(1)
      setCreatedLabId(null)
      setNewLab({
        name: '',
        address: '',
        city: '',
        state: '',
        zip_code: '',
        country: '',
        type: 'lab',
        contact_email: '',
        contact_phone: '',
        admin_email: '',
        admin_name: '',
        supported_origins: [],
        is_3rd_party: false,
        fee_per_sample: undefined,
        fee_currency: 'USD',
        billing_basis: 'approved_only'
      })
      setShelves([])
      setObstacles([])
      setPlacementMode('shelves')
      await loadLaboratories()

      if (newLab.admin_email) {
        alert('Laboratory created successfully! An invitation email has been sent to the lab administrator.')
      } else {
        alert('Laboratory created successfully!')
      }
    } catch (error) {
      console.error('Error creating shelves:', error)
      alert('Laboratory created but some shelves failed to save')
    }
  }

  const handleUpdateLab = async () => {
    if (!editingLab) return

    try {
      // Auto-generate location from address fields if they exist
      const location = [
        editingLab.address,
        editingLab.neighborhood,
        editingLab.city,
        editingLab.state
      ].filter(Boolean).join(', ') || editingLab.location

      const requestBody = {
        name: editingLab.name,
        location: location,
        country: editingLab.country,
        address: editingLab.address,
        neighborhood: editingLab.neighborhood,
        city: editingLab.city,
        state: editingLab.state,
        type: editingLab.type,
        storage_capacity: editingLab.storage_capacity,
        contact_email: editingLab.contact_email,
        contact_phone: editingLab.contact_phone,
        is_active: editingLab.is_active,
        supported_origins: editingLab.supported_origins || [],
        zip_code: editingLab.zip_code,
        fee_per_sample: editingLab.type === '3rd_party_lab' ? editingLab.fee_per_sample : null,
        fee_currency: editingLab.type === '3rd_party_lab' ? editingLab.fee_currency : null,
        billing_basis: editingLab.type === '3rd_party_lab' ? editingLab.billing_basis : null
      }

      console.log('Sending PATCH request with body:', requestBody)

      const response = await fetch(`/api/laboratories/${editingLab.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      if (response.ok) {
        setEditingLab(null)
        await loadLaboratories()
      } else {
        const error = await response.json()
        console.error('Update failed with error:', error)
        alert(`Failed to update laboratory: ${error.error}${error.details ? ' - ' + error.details : ''}`)
      }
    } catch (error) {
      console.error('Error updating laboratory:', error)
    }
  }

  const handleToggleActive = async (lab: Laboratory) => {
    try {
      setTogglingStatus(lab.id)
      const response = await fetch(`/api/laboratories/${lab.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !lab.is_active }),
      })

      if (response.ok) {
        await loadLaboratories()
      } else {
        const error = await response.json()
        alert(`Failed to update laboratory status: ${error.error}`)
      }
    } catch (error) {
      console.error('Error toggling laboratory status:', error)
      alert('Failed to update laboratory status')
    } finally {
      setTogglingStatus(null)
    }
  }

  const handleDeleteLab = async (lab: Laboratory) => {
    if (!confirm(`Are you sure you want to delete laboratory "${lab.name}"?`)) {
      return
    }

    try {
      const response = await fetch(`/api/laboratories/${lab.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await loadLaboratories()
      } else {
        const error = await response.json()
        alert(`Failed to delete laboratory: ${error.error}`)
      }
    } catch (error) {
      console.error('Error deleting laboratory:', error)
    }
  }

  const handleViewPersonnel = (lab: Laboratory) => {
    setViewingPersonnel(lab)
    loadPersonnel(lab.id)
  }

  const handleAddPersonnel = async () => {
    if (!viewingPersonnel) return
    if (!newPersonnel.email || !newPersonnel.full_name) {
      alert('Please fill in email and full name')
      return
    }

    try {
      const response = await fetch(`/api/laboratories/${viewingPersonnel.id}/personnel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPersonnel)
      })

      const data = await response.json()

      if (response.ok) {
        setAddPersonnelDialogOpen(false)
        setNewPersonnel({
          email: '',
          full_name: '',
          qc_role: 'lab_personnel'
        })
        await loadPersonnel(viewingPersonnel.id)
        alert(data.message || 'Personnel added successfully')
      } else {
        alert(data.error || 'Failed to add personnel')
      }
    } catch (error) {
      console.error('Error adding personnel:', error)
      alert('Failed to add personnel. Please try again.')
    }
  }

  const handleRemovePersonnel = async (personnelId: string) => {
    if (!viewingPersonnel) return
    if (!confirm('Are you sure you want to remove this person from the laboratory?')) {
      return
    }

    try {
      const response = await fetch(`/api/laboratories/${viewingPersonnel.id}/personnel/${personnelId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await loadPersonnel(viewingPersonnel.id)
      } else {
        const error = await response.json()
        alert(`Failed to remove personnel: ${error.error}`)
      }
    } catch (error) {
      console.error('Error removing personnel:', error)
    }
  }

  const getRoleBadge = (role: string) => {
    const roleLabels: Record<string, string> = {
      lab_personnel: 'Lab Personnel',
      lab_q_grader: 'Lab Q Grader',
      lab_director: 'Lab Director',
      lab_finance_manager: 'Finance Manager',
      lab_quality_manager: 'Quality Manager',
      global_admin: 'Global Admin',
      global_quality_admin: 'Global Quality Admin',
      global_finance_admin: 'Global Finance Admin',
      santos_hq_finance: 'Santos HQ Finance'
    }
    return roleLabels[role] || role
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Laboratories</h1>
            <p className="text-muted-foreground">
              Manage laboratory locations, storage, and personnel
            </p>
          </div>
          {canManageAllLabs && (
            <Dialog open={addLabDialogOpen} onOpenChange={setAddLabDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Laboratory
                </Button>
              </DialogTrigger>
              <DialogContent className={labCreationStep === 3 ? "max-w-[98vw] max-h-[95vh] h-[95vh] overflow-hidden" : "max-w-4xl max-h-[90vh] overflow-y-auto"}>
                <DialogHeader>
                  <DialogTitle>Add New Laboratory - Step {labCreationStep} of 3</DialogTitle>
                </DialogHeader>

                {/* Progress indicator */}
                <div className="flex gap-2 mb-4">
                  <div className={`flex-1 h-2 rounded-full transition-colors ${labCreationStep >= 1 ? 'bg-primary' : 'bg-muted'}`} />
                  <div className={`flex-1 h-2 rounded-full transition-colors ${labCreationStep >= 2 ? 'bg-primary' : 'bg-muted'}`} />
                  <div className={`flex-1 h-2 rounded-full transition-colors ${labCreationStep >= 3 ? 'bg-primary' : 'bg-muted'}`} />
                </div>

                {labCreationStep === 1 && (
                  /* Step 1: Basic Information */
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Laboratory Name *</Label>
                      <Input
                        id="name"
                        value={newLab.name}
                        onChange={(e) => setNewLab({ ...newLab, name: e.target.value })}
                        placeholder="Santos HQ Laboratory"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="address">Street Address *</Label>
                      <Input
                        id="address"
                        value={newLab.address}
                        onChange={(e) => setNewLab({ ...newLab, address: e.target.value })}
                        placeholder="Rua do Porto 123"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="city">City *</Label>
                        <Input
                          id="city"
                          value={newLab.city}
                          onChange={(e) => setNewLab({ ...newLab, city: e.target.value })}
                          placeholder="Santos"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state">State *</Label>
                        <Input
                          id="state"
                          value={newLab.state}
                          onChange={(e) => setNewLab({ ...newLab, state: e.target.value })}
                          placeholder="SP"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="zip_code">ZIP/CEP Code</Label>
                        <Input
                          id="zip_code"
                          value={newLab.zip_code}
                          onChange={(e) => setNewLab({ ...newLab, zip_code: e.target.value })}
                          placeholder="11010-100"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="country">Country *</Label>
                        <Select
                          value={newLab.country}
                          onValueChange={(value) => setNewLab({ ...newLab, country: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select country..." />
                          </SelectTrigger>
                          <SelectContent>
                            {ORIGIN_OPTIONS.map((origin) => (
                              <SelectItem key={origin} value={origin}>
                                {origin}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="type">Type</Label>
                        <Select
                          value={newLab.type}
                          onValueChange={(value: any) => setNewLab({ ...newLab, type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lab">Laboratory</SelectItem>
                            <SelectItem value="hq">Headquarters</SelectItem>
                            <SelectItem value="3rd_party_lab">3rd Party Lab</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="contact_email">Contact Email</Label>
                        <Input
                          id="contact_email"
                          type="email"
                          value={newLab.contact_email}
                          onChange={(e) => setNewLab({ ...newLab, contact_email: e.target.value })}
                          placeholder="lab@wolthers.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact_phone">Contact Phone</Label>
                        <Input
                          id="contact_phone"
                          value={newLab.contact_phone}
                          onChange={(e) => setNewLab({ ...newLab, contact_phone: e.target.value })}
                          placeholder="+55 13 1234-5678"
                        />
                      </div>
                    </div>

                    {/* Supported Origins - All Labs */}
                    <div className="pt-4 border-t space-y-2">
                      <Label>Supported Origins</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {ORIGIN_OPTIONS.map((origin) => (
                          <div key={origin} className="flex items-center gap-2">
                            <Checkbox
                              id={`origin_${origin}`}
                              checked={newLab.supported_origins.includes(origin)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setNewLab({
                                    ...newLab,
                                    supported_origins: [...newLab.supported_origins, origin]
                                  })
                                } else {
                                  setNewLab({
                                    ...newLab,
                                    supported_origins: newLab.supported_origins.filter(o => o !== origin)
                                  })
                                }
                              }}
                            />
                            <Label htmlFor={`origin_${origin}`} className="cursor-pointer font-normal">
                              {origin}
                            </Label>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Select which coffee origins this laboratory can handle
                      </p>
                    </div>

                    {/* 3rd Party Lab Configuration */}
                    <div className="pt-4 border-t space-y-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="is_3rd_party"
                          checked={newLab.is_3rd_party}
                          onCheckedChange={(checked) => setNewLab({ ...newLab, is_3rd_party: checked as boolean })}
                        />
                        <Label htmlFor="is_3rd_party" className="font-semibold cursor-pointer">
                          This is a 3rd Party Laboratory
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground -mt-2">
                        Check this if we outsource QC services to this laboratory and pay them fees
                      </p>

                      {newLab.is_3rd_party && (
                        <div className="space-y-4 pl-6 border-l-2 border-muted">

                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="fee_per_sample">Fee per Sample *</Label>
                              <Input
                                id="fee_per_sample"
                                type="number"
                                step="0.01"
                                min="0"
                                value={newLab.fee_per_sample || ''}
                                onChange={(e) => setNewLab({ ...newLab, fee_per_sample: e.target.value ? Number(e.target.value) : undefined })}
                                placeholder="25.00"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="fee_currency">Currency</Label>
                              <Select
                                value={newLab.fee_currency}
                                onValueChange={(value) => setNewLab({ ...newLab, fee_currency: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="USD">USD</SelectItem>
                                  <SelectItem value="EUR">EUR</SelectItem>
                                  <SelectItem value="BRL">BRL</SelectItem>
                                  <SelectItem value="GBP">GBP</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="billing_basis">Pay For *</Label>
                              <Select
                                value={newLab.billing_basis}
                                onValueChange={(value: 'approved_only' | 'approved_and_rejected') =>
                                  setNewLab({ ...newLab, billing_basis: value })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="approved_only">Approved Only</SelectItem>
                                  <SelectItem value="approved_and_rejected">Approved + Rejected</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Lab Admin Section */}
                    <div className="pt-4 border-t">
                      <h4 className="text-sm font-semibold mb-3">Lab Administrator (Optional)</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="admin_name">Administrator Name</Label>
                          <Input
                            id="admin_name"
                            value={newLab.admin_name}
                            onChange={(e) => setNewLab({ ...newLab, admin_name: e.target.value })}
                            placeholder="John Doe"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="admin_email">Administrator Email</Label>
                          <Input
                            id="admin_email"
                            type="email"
                            value={newLab.admin_email}
                            onChange={(e) => setNewLab({ ...newLab, admin_email: e.target.value })}
                            placeholder="admin@wolthers.com"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        If provided, this person will be set as the lab director with full management access
                      </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" onClick={() => setAddLabDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleNextStep}>
                        Next: Configure Shelves
                      </Button>
                    </div>
                  </div>
                )}

                {labCreationStep === 2 && (
                  /* Step 2: Configure Shelves */
                  <div className="space-y-4 py-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">Storage Shelves</h3>
                        <p className="text-sm text-muted-foreground">
                          Define your storage shelves. You&apos;ll place them on the floor plan in the next step.
                        </p>
                      </div>
                      <Button onClick={handleAddShelf} size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Shelf
                      </Button>
                    </div>

                    {shelves.length === 0 ? (
                      <Card>
                        <CardContent className="py-12 text-center">
                          <Grid3x3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                          <p className="text-muted-foreground mb-4">
                            No storage shelves configured yet
                          </p>
                          <Button onClick={handleAddShelf} variant="outline">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Your First Shelf
                          </Button>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-3 max-h-[500px] overflow-y-auto">
                        {shelves.map((shelf, index) => (
                          <Card key={shelf.id}>
                            <CardContent className="p-4">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Input
                                      value={shelf.shelf_letter}
                                      onChange={(e) => handleUpdateShelf(shelf.id, { shelf_letter: e.target.value.toUpperCase() })}
                                      placeholder="A"
                                      maxLength={1}
                                      className="w-16 font-bold text-center"
                                    />
                                    <span className="text-sm text-muted-foreground">Shelf Letter</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">
                                      {shelf.capacity.toLocaleString()} samples
                                    </Badge>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRemoveShelf(shelf.id)}
                                      className="text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                  <div className="space-y-2">
                                    <Label className="text-xs">Rows</Label>
                                    <Input
                                      type="number"
                                      min="1"
                                      value={shelf.rows}
                                      onChange={(e) => handleUpdateShelf(shelf.id, { rows: parseInt(e.target.value) || 1 })}
                                      className="text-sm"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-xs">Columns</Label>
                                    <Input
                                      type="number"
                                      min="1"
                                      value={shelf.columns}
                                      onChange={(e) => handleUpdateShelf(shelf.id, { columns: parseInt(e.target.value) || 1 })}
                                      className="text-sm"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-xs">Samples/Position</Label>
                                    <Input
                                      type="number"
                                      min="1"
                                      value={shelf.samples_per_position}
                                      onChange={(e) => handleUpdateShelf(shelf.id, { samples_per_position: parseInt(e.target.value) || 1 })}
                                      className="text-sm"
                                    />
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label className="text-xs">Assign to Client (Optional)</Label>
                                  <Select
                                    value={shelf.client_id || 'unassigned'}
                                    onValueChange={(value) => handleUpdateShelf(shelf.id, { client_id: value === 'unassigned' ? '' : value })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Unassigned (General Use)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="unassigned">Unassigned (General Use)</SelectItem>
                                      {clients.map((client) => (
                                        <SelectItem key={client.id} value={client.id}>
                                          {client.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {shelf.client_id && (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      id={`allow-view-${shelf.id}`}
                                      checked={shelf.allow_client_view}
                                      onChange={(e) => handleUpdateShelf(shelf.id, { allow_client_view: e.target.checked })}
                                      className="h-4 w-4"
                                    />
                                    <Label htmlFor={`allow-view-${shelf.id}`} className="text-xs cursor-pointer">
                                      Allow client to view this shelf in their portal
                                    </Label>
                                  </div>
                                )}

                                <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                                  {shelf.rows} rows × {shelf.columns} columns × {shelf.samples_per_position} samples/position = {shelf.capacity.toLocaleString()} total capacity
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}

                    {shelves.length > 0 && (
                      <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold">Total Sample Storage Capacity</p>
                              <p className="text-sm text-muted-foreground">
                                Calculated from {shelves.length} shelf{shelves.length !== 1 ? 'ves' : ''}
                              </p>
                            </div>
                            <div className="text-2xl font-bold text-primary">
                              {calculateTotalCapacity().toLocaleString()} samples
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" onClick={handlePreviousStep}>
                        Previous
                      </Button>
                      <Button onClick={handleNextStep}>
                        Next: Place Shelves
                      </Button>
                    </div>
                  </div>
                )}

                {labCreationStep === 3 && (
                  /* Step 3: 2D Placement */
                  <div className="flex flex-col h-full space-y-4 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-lg font-semibold">Position Shelves & Mark Obstacles</h3>
                        <p className="text-sm text-muted-foreground">
                          Drag shelves to position them and click to mark obstacles. Each grid square = 1m²
                        </p>
                      </div>

                      {/* Mode Toggle */}
                      <div className="flex gap-2">
                        <Button
                          variant={placementMode === 'shelves' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPlacementMode('shelves')}
                        >
                          <MoveIcon className="h-4 w-4 mr-2" />
                          Place Shelves
                        </Button>
                        <Button
                          variant={placementMode === 'obstacles' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPlacementMode('obstacles')}
                        >
                          <AlertTriangle className="h-4 w-4 mr-2" />
                          Mark Obstacles
                        </Button>
                      </div>
                    </div>

                    {/* Obstacle Type Selector */}
                    {placementMode === 'obstacles' && (
                      <Card className="bg-amber-50 border-amber-200">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium">Obstacle Type:</span>
                            <div className="flex gap-2">
                              {['aircon', 'door', 'column', 'wall', 'other'].map((type) => {
                                const Icon = getObstacleIcon(type)
                                return (
                                  <Button
                                    key={type}
                                    variant={selectedObstacleType === type ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setSelectedObstacleType(type as any)}
                                    className="capitalize"
                                  >
                                    <Icon className="h-3 w-3 mr-1" />
                                    {type}
                                  </Button>
                                )
                              })}
                            </div>
                            <span className="text-xs text-muted-foreground ml-auto">
                              Click grid to add/remove
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* 2D Floor Plan - Expanded */}
                    <div className="relative flex-1 bg-gray-50 rounded-lg p-8 border-2 border-dashed border-gray-200 overflow-auto" style={{ minHeight: '70vh' }}>
                      {/* Grid background - Larger grid with scrollable area */}
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          width: '2000px',
                          height: '1400px',
                          backgroundImage: `
                            linear-gradient(to right, #d1d5db 1px, transparent 1px),
                            linear-gradient(to bottom, #d1d5db 1px, transparent 1px)
                          `,
                          backgroundSize: '50px 50px'
                        }}
                      />

                      {/* Shelves & Obstacles Container */}
                      <div
                        className="relative"
                        style={{ width: '2000px', height: '1400px' }}
                        onClick={handleGridClick}
                      >
                        {/* Obstacles */}
                        {obstacles.map((obstacle) => {
                          const Icon = getObstacleIcon(obstacle.type)
                          return (
                            <div
                              key={obstacle.id}
                              className="absolute border-2 border-red-500 bg-red-100/70 rounded flex items-center justify-center cursor-pointer hover:bg-red-200/70 transition-colors"
                              style={{
                                left: `${obstacle.x * 50}px`,
                                top: `${obstacle.y * 50}px`,
                                width: `${obstacle.width * 50}px`,
                                height: `${obstacle.height * 50}px`,
                                zIndex: 5,
                                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(220, 38, 38, 0.1) 10px, rgba(220, 38, 38, 0.1) 20px)'
                              }}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRemoveObstacle(obstacle.id)
                              }}
                            >
                              <div className="flex flex-col items-center gap-1">
                                <Icon className="h-5 w-5 text-red-700" />
                                <span className="text-[10px] font-medium text-red-900">{obstacle.label}</span>
                              </div>
                            </div>
                          )
                        })}

                        {/* Shelves */}
                        {shelves.map((shelf) => (
                          <div
                            key={shelf.id}
                            draggable
                            onDragEnd={(e) => {
                              const rect = e.currentTarget.parentElement!.getBoundingClientRect()
                              const x = Math.round((e.clientX - rect.left - 20) / 50)
                              const y = Math.round((e.clientY - rect.top - 20) / 50)
                              handleUpdateShelf(shelf.id, {
                                x_position: Math.max(0, x),
                                y_position: Math.max(0, y)
                              })
                            }}
                            className="absolute border-2 border-primary rounded-lg p-3 cursor-move hover:shadow-xl hover:scale-105 transition-all bg-white group"
                            style={{
                              left: `${shelf.x_position * 50 + 20}px`,
                              top: `${shelf.y_position * 50 + 20}px`,
                              width: `${shelf.columns * 15 + 80}px`,
                              minWidth: '140px',
                              zIndex: 10
                            }}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-base">Shelf {shelf.shelf_letter}</span>
                                <MoveIcon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {shelf.rows}×{shelf.columns} ({shelf.capacity.toLocaleString()} samples)
                              </div>
                              {shelf.client_id && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                                  {clients.find(c => c.id === shelf.client_id)?.name}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Guide Panel */}
                      <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm p-3 rounded-lg border-2 border-gray-200 shadow-lg space-y-2" style={{ zIndex: 20 }}>
                        <div className="text-sm font-semibold flex items-center gap-2">
                          Floor Plan Guide
                          {placementMode === 'obstacles' && (
                            <Badge variant="destructive" className="text-[10px]">
                              Obstacle Mode
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-gray-300 bg-gray-50"></div>
                            <span>1 square = 1m²</span>
                          </div>
                          {placementMode === 'shelves' ? (
                            <div className="flex items-center gap-2">
                              <MoveIcon className="w-4 h-4 text-primary" />
                              <span>Drag shelves to position</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-red-600" />
                              <span>Click to add/remove obstacles</span>
                            </div>
                          )}
                          <div className="text-[10px] text-muted-foreground mt-2 pt-2 border-t">
                            Working area: 40m × 28m
                          </div>
                          {obstacles.length > 0 && (
                            <div className="text-[10px] text-red-600 font-medium">
                              {obstacles.length} obstacle{obstacles.length !== 1 ? 's' : ''} marked
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center gap-2 pt-4 border-t">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Grid3x3 className="h-4 w-4" />
                          <span>{shelves.length} shelf{shelves.length !== 1 ? 'ves' : ''} configured</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Warehouse className="h-4 w-4" />
                          <span>{calculateTotalCapacity().toLocaleString()} total capacity</span>
                        </div>
                        {obstacles.length > 0 && (
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                            <span className="text-red-600">{obstacles.length} obstacle{obstacles.length !== 1 ? 's' : ''}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={handlePreviousStep}>
                          Previous
                        </Button>
                        <Button onClick={handleFinishCreation}>
                          Create Laboratory
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search laboratories by name, location, or country..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Laboratories Table */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading laboratories...
          </div>
        ) : laboratories.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No laboratories found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? 'Try adjusting your search criteria' : 'Get started by adding your first laboratory'}
              </p>
              {canManageAllLabs && (
                <Button onClick={() => setAddLabDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Laboratory
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Laboratory</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Storage Capacity</TableHead>
                    <TableHead>Personnel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {laboratories.map((lab) => (
                    <TableRow key={lab.id} className={!lab.is_active ? 'relative' : ''}>
                      {!lab.is_active && (
                        <td colSpan={7} className="absolute inset-0 pointer-events-none">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t-2 border-red-500" />
                          </div>
                        </td>
                      )}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-semibold">{lab.name}</p>
                            {(lab.contact_email || lab.contact_phone) && (
                              <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                                {lab.contact_email && (
                                  <span className="flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    {lab.contact_email}
                                  </span>
                                )}
                                {lab.contact_phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {lab.contact_phone}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm">{lab.location}</p>
                            {lab.country && (
                              <p className="text-sm text-muted-foreground">{lab.country}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {lab.type === 'hq' ? 'HQ' : lab.type === '3rd_party_lab' ? '3rd Party Lab' : 'Lab'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Warehouse className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{lab.storage_capacity.toLocaleString()} samples</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewPersonnel(lab)}
                        >
                          <Users className="h-4 w-4 mr-2" />
                          {lab.personnel_count || 0}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={lab.is_active}
                          onCheckedChange={() => handleToggleActive(lab)}
                          disabled={togglingStatus === lab.id}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setViewingStorage(lab)}
                          >
                            <Warehouse className="h-4 w-4 mr-2" />
                            Manage Storage
                          </Button>
                          {(canManageAllLabs || (canManageOwnLab && profile?.laboratory_id === lab.id)) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingLab(lab)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          {canManageAllLabs && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteLab(lab)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Storage Management Dialog */}
        {viewingStorage && (
          <Dialog open={!!viewingStorage} onOpenChange={() => setViewingStorage(null)}>
            <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Storage Management - {viewingStorage.name}</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <LabStorageManagement
                  laboratoryId={viewingStorage.id}
                  canManage={canManageAllLabs || (canManageOwnLab && profile?.laboratory_id === viewingStorage.id)}
                />
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Edit Laboratory Dialog */}
        {editingLab && (
          <Dialog open={!!editingLab} onOpenChange={() => setEditingLab(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Laboratory</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Laboratory Name</Label>
                  <Input
                    id="edit-name"
                    value={editingLab.name}
                    onChange={(e) => setEditingLab({ ...editingLab, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-address">Street Address</Label>
                  <Input
                    id="edit-address"
                    value={editingLab.address || ''}
                    onChange={(e) => setEditingLab({ ...editingLab, address: e.target.value })}
                    placeholder="Rua do Porto 123"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-neighborhood">Neighborhood</Label>
                    <Input
                      id="edit-neighborhood"
                      value={editingLab.neighborhood || ''}
                      onChange={(e) => setEditingLab({ ...editingLab, neighborhood: e.target.value })}
                      placeholder="Centro"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-city">City</Label>
                    <Input
                      id="edit-city"
                      value={editingLab.city || ''}
                      onChange={(e) => setEditingLab({ ...editingLab, city: e.target.value })}
                      placeholder="Santos"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-state">State</Label>
                    <Input
                      id="edit-state"
                      value={editingLab.state || ''}
                      onChange={(e) => setEditingLab({ ...editingLab, state: e.target.value })}
                      placeholder="SP"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-location">Full Location (Read-only)</Label>
                  <Input
                    id="edit-location"
                    value={editingLab.location}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-generated from address fields above
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-country">Country</Label>
                    <Select
                      value={editingLab.country || ''}
                      onValueChange={(value) => setEditingLab({ ...editingLab, country: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select country..." />
                      </SelectTrigger>
                      <SelectContent>
                        {ORIGIN_OPTIONS.map((origin) => (
                          <SelectItem key={origin} value={origin}>
                            {origin}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-type">Type</Label>
                    <Select
                      value={editingLab.type}
                      onValueChange={(value: any) => setEditingLab({ ...editingLab, type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lab">Laboratory</SelectItem>
                        <SelectItem value="hq">Headquarters</SelectItem>
                        <SelectItem value="3rd_party_lab">3rd Party Lab</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-email">Contact Email</Label>
                    <Input
                      id="edit-email"
                      type="email"
                      value={editingLab.contact_email || ''}
                      onChange={(e) => setEditingLab({ ...editingLab, contact_email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-phone">Contact Phone</Label>
                    <Input
                      id="edit-phone"
                      value={editingLab.contact_phone || ''}
                      onChange={(e) => setEditingLab({ ...editingLab, contact_phone: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-active"
                    checked={editingLab.is_active}
                    onChange={(e) => setEditingLab({ ...editingLab, is_active: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="edit-active" className="cursor-pointer">Active</Label>
                </div>

                {/* Supported Origins - All Labs */}
                <div className="pt-4 border-t space-y-2">
                  <Label>Supported Origins</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {ORIGIN_OPTIONS.map((origin) => (
                      <div key={origin} className="flex items-center gap-2">
                        <Checkbox
                          id={`edit_origin_${origin}`}
                          checked={((editingLab as any).supported_origins || []).includes(origin)}
                          onCheckedChange={(checked) => {
                            const currentOrigins = (editingLab as any).supported_origins || []
                            if (checked) {
                              setEditingLab({
                                ...editingLab,
                                supported_origins: [...currentOrigins, origin]
                              } as any)
                            } else {
                              setEditingLab({
                                ...editingLab,
                                supported_origins: currentOrigins.filter((o: string) => o !== origin)
                              } as any)
                            }
                          }}
                        />
                        <Label htmlFor={`edit_origin_${origin}`} className="cursor-pointer font-normal">
                          {origin}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Select which coffee origins this laboratory can handle
                  </p>
                </div>

                {/* 3rd Party Lab Configuration - Only show when type is 3rd_party_lab */}
                {editingLab.type === '3rd_party_lab' && (
                  <div className="pt-4 border-t space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold mb-2">3rd Party Lab Configuration</h4>
                      <p className="text-xs text-muted-foreground mb-3">
                        Configure pricing for this 3rd party laboratory
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-fee-per-sample">Fee per Sample *</Label>
                        <Input
                          id="edit-fee-per-sample"
                          type="number"
                          step="0.01"
                          min="0"
                          value={(editingLab as any).fee_per_sample || ''}
                          onChange={(e) => setEditingLab({
                            ...editingLab,
                            fee_per_sample: e.target.value ? Number(e.target.value) : undefined
                          } as any)}
                          placeholder="25.00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-fee-currency">Currency</Label>
                        <Select
                          value={(editingLab as any).fee_currency || 'USD'}
                          onValueChange={(value) => setEditingLab({ ...editingLab, fee_currency: value } as any)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="BRL">BRL</SelectItem>
                            <SelectItem value="GBP">GBP</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-billing-basis">Pay For *</Label>
                        <Select
                          value={(editingLab as any).billing_basis || 'approved_only'}
                          onValueChange={(value: 'approved_only' | 'approved_and_rejected') =>
                            setEditingLab({ ...editingLab, billing_basis: value } as any)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="approved_only">Approved Only</SelectItem>
                            <SelectItem value="approved_and_rejected">Approved + Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setEditingLab(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleUpdateLab}>
                    Save Changes
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* View Personnel Dialog */}
        {viewingPersonnel && (
          <Dialog open={!!viewingPersonnel} onOpenChange={() => setViewingPersonnel(null)}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Personnel - {viewingPersonnel.name}
                </DialogTitle>
              </DialogHeader>
              <div className="py-4">
                {loadingPersonnel ? (
                  <div className="text-center py-12 text-muted-foreground">
                    Loading personnel...
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-sm text-muted-foreground">
                        {personnel.length} {personnel.length === 1 ? 'person' : 'people'} assigned to this laboratory
                      </p>
                      {canManageAllLabs && (
                        <Dialog open={addPersonnelDialogOpen} onOpenChange={setAddPersonnelDialogOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm">
                              <Plus className="h-4 w-4 mr-2" />
                              Add Personnel
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add Personnel</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label htmlFor="personnel-email">Email *</Label>
                                <Input
                                  id="personnel-email"
                                  type="email"
                                  value={newPersonnel.email}
                                  onChange={(e) => setNewPersonnel({ ...newPersonnel, email: e.target.value })}
                                  placeholder="john.doe@wolthers.com"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="personnel-name">Full Name *</Label>
                                <Input
                                  id="personnel-name"
                                  value={newPersonnel.full_name}
                                  onChange={(e) => setNewPersonnel({ ...newPersonnel, full_name: e.target.value })}
                                  placeholder="John Doe"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="personnel-role">Role</Label>
                                <Select
                                  value={newPersonnel.qc_role}
                                  onValueChange={(value) => setNewPersonnel({ ...newPersonnel, qc_role: value })}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="lab_personnel">Lab Personnel</SelectItem>
                                    <SelectItem value="lab_q_grader">Lab Q Grader</SelectItem>
                                    <SelectItem value="lab_director">Lab Director</SelectItem>
                                    <SelectItem value="lab_finance_manager">Finance Manager</SelectItem>
                                    <SelectItem value="lab_quality_manager">Quality Manager</SelectItem>
                                    {profile?.is_global_admin && (
                                      <>
                                        <SelectItem value="global_quality_admin">Global Quality Admin</SelectItem>
                                        <SelectItem value="global_finance_admin">Global Finance Admin</SelectItem>
                                        <SelectItem value="santos_hq_finance">Santos HQ Finance</SelectItem>
                                      </>
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex justify-end gap-2 pt-4">
                                <Button variant="outline" onClick={() => setAddPersonnelDialogOpen(false)}>
                                  Cancel
                                </Button>
                                <Button onClick={handleAddPersonnel}>
                                  Add Personnel
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                    {personnel.length === 0 ? (
                      <Card>
                        <CardContent className="py-12 text-center">
                          <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                          <p className="text-muted-foreground mb-4">
                            No personnel assigned to this laboratory yet
                          </p>
                          {canManageAllLabs && (
                            <Button onClick={() => setAddPersonnelDialogOpen(true)} variant="outline">
                              <Plus className="h-4 w-4 mr-2" />
                              Add First Person
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-2">
                        {personnel.map((person) => (
                          <Card key={person.id}>
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                      <p className="font-medium">{person.full_name}</p>
                                      <p className="text-sm text-muted-foreground">{person.email}</p>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {(person.is_global_admin || ['global_admin', 'global_quality_admin', 'global_finance_admin', 'santos_hq_finance'].includes(person.qc_role)) && (
                                    <Badge variant="default" className="bg-primary">Wolthers Staff</Badge>
                                  )}
                                  <Badge variant="outline">{getRoleBadge(person.qc_role)}</Badge>
                                  {canManageAllLabs && !person.is_global_admin && !['global_admin', 'global_quality_admin', 'global_finance_admin', 'santos_hq_finance'].includes(person.qc_role) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRemovePersonnel(person.id)}
                                      className="text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </MainLayout>
  )
}
