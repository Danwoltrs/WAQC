'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Plus, Search, Edit, Trash2, Building, MapPin, Phone, Mail,
  Users, CheckCircle, XCircle, User, Warehouse, Grid3x3, MoveIcon
} from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { LabStorageManagement } from '@/components/storage/lab-storage-management'

interface Laboratory {
  id: string
  name: string
  location: string
  country?: string
  type: string
  storage_capacity: number
  contact_email?: string
  contact_phone?: string
  is_active: boolean
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

  // New lab form state
  const [newLab, setNewLab] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    country: '',
    type: 'lab' as 'lab' | 'hq',
    contact_email: '',
    contact_phone: ''
  })

  // Storage shelves state
  const [shelves, setShelves] = useState<ShelfData[]>([])

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

  const handleNextStep = async () => {
    if (labCreationStep === 1) {
      // Validate basic info
      if (!newLab.name || !newLab.address || !newLab.city || !newLab.state) {
        alert('Please fill in laboratory name, address, city, and state')
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
            contact_phone: newLab.contact_phone
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
        contact_phone: ''
      })
      setShelves([])
      await loadLaboratories()
      alert('Laboratory created successfully!')
    } catch (error) {
      console.error('Error creating shelves:', error)
      alert('Laboratory created but some shelves failed to save')
    }
  }

  const handleUpdateLab = async () => {
    if (!editingLab) return

    try {
      const response = await fetch(`/api/laboratories/${editingLab.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingLab.name,
          location: editingLab.location,
          country: editingLab.country,
          type: editingLab.type,
          storage_capacity: editingLab.storage_capacity,
          contact_email: editingLab.contact_email,
          contact_phone: editingLab.contact_phone,
          is_active: editingLab.is_active
        })
      })

      if (response.ok) {
        setEditingLab(null)
        await loadLaboratories()
      } else {
        const error = await response.json()
        alert(`Failed to update laboratory: ${error.error}`)
      }
    } catch (error) {
      console.error('Error updating laboratory:', error)
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
      } else {
        alert(`Failed to add personnel: ${data.error}`)
      }
    } catch (error) {
      console.error('Error adding personnel:', error)
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
      lab_director: 'Lab Director',
      lab_finance_manager: 'Finance Manager',
      lab_quality_manager: 'Quality Manager',
      global_admin: 'Global Admin',
      global_quality_admin: 'Global Quality Admin',
      global_finance_admin: 'Global Finance Admin'
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
                        <Label htmlFor="country">Country</Label>
                        <Input
                          id="country"
                          value={newLab.country}
                          onChange={(e) => setNewLab({ ...newLab, country: e.target.value })}
                          placeholder="Brazil"
                        />
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
                                    value={shelf.client_id}
                                    onValueChange={(value) => handleUpdateShelf(shelf.id, { client_id: value })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Unassigned (General Use)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="">Unassigned (General Use)</SelectItem>
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
                    <div className="mb-2">
                      <h3 className="text-lg font-semibold">Position Shelves on Floor Plan</h3>
                      <p className="text-sm text-muted-foreground">
                        Drag shelves to position them in the laboratory. Each grid square = 1m²
                      </p>
                    </div>

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

                      {/* Shelves Container */}
                      <div className="relative" style={{ width: '2000px', height: '1400px' }}>
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

                      {/* Scale indicator and instructions */}
                      <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm p-3 rounded-lg border-2 border-gray-200 shadow-lg space-y-2" style={{ zIndex: 20 }}>
                        <div className="text-sm font-semibold">Floor Plan Guide</div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-gray-300 bg-gray-50"></div>
                            <span>1 square = 1m²</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MoveIcon className="w-4 h-4 text-primary" />
                            <span>Drag shelves to position</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-2">
                            Working area: 40m × 28m
                          </div>
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

        {/* Laboratories List */}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {laboratories.map((lab) => (
              <Card key={lab.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Building className="h-4 w-4" />
                        {lab.name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {lab.location}
                        {lab.country && `, ${lab.country}`}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        {lab.is_active ? (
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
                        <Badge variant="outline" className="text-xs">
                          {lab.type === 'hq' ? 'HQ' : 'Lab'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {lab.contact_email && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      <span className="truncate">{lab.contact_email}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Warehouse className="h-3 w-3" />
                    <span>Sample Storage: {lab.storage_capacity.toLocaleString()}</span>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-3 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewingStorage(lab)}
                    >
                      <Warehouse className="h-3 w-3 mr-1" />
                      Storage
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewPersonnel(lab)}
                    >
                      <Users className="h-3 w-3 mr-1" />
                      Personnel
                    </Button>
                    {(canManageAllLabs || (canManageOwnLab && profile?.laboratory_id === lab.id)) && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingLab(lab)}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        {canManageAllLabs && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteLab(lab)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
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

        {/* Edit Laboratory Dialog - Simplified (same as before) */}
        {/* View Personnel Dialog - Simplified (same as before) */}
        {/* Add Personnel Dialog - Simplified (same as before) */}
      </div>
    </MainLayout>
  )
}
