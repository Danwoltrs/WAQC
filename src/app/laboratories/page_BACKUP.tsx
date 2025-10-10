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
  Users, CheckCircle, XCircle, User
} from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'

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

interface Shelf {
  id: string
  name: string
  location_description: string
  rows: number
  columns: number
  samples_per_position: number
  capacity: number
}

export default function LaboratoriesPage() {
  const { profile, permissions } = useAuth()
  const [laboratories, setLaboratories] = useState<Laboratory[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [addLabDialogOpen, setAddLabDialogOpen] = useState(false)
  const [labCreationStep, setLabCreationStep] = useState(1) // 1 = Basic Info, 2 = Storage Config
  const [editingLab, setEditingLab] = useState<Laboratory | null>(null)
  const [viewingPersonnel, setViewingPersonnel] = useState<Laboratory | null>(null)
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [loadingPersonnel, setLoadingPersonnel] = useState(false)
  const [addPersonnelDialogOpen, setAddPersonnelDialogOpen] = useState(false)

  // New lab form state
  const [newLab, setNewLab] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    country: '',
    type: 'lab' as 'lab' | 'hq',
    storage_capacity: 0,
    contact_email: '',
    contact_phone: ''
  })

  // Storage shelves state
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [editingShelf, setEditingShelf] = useState<Shelf | null>(null)

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
      } else {
        console.error('Failed to load laboratories:', data.error)
      }
    } catch (error) {
      console.error('Error loading laboratories:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadPersonnel = async (labId: string) => {
    try {
      setLoadingPersonnel(true)
      const response = await fetch(`/api/laboratories/${labId}/personnel`)
      const data = await response.json()

      if (response.ok) {
        setPersonnel(data.personnel)
      } else {
        console.error('Failed to load personnel:', data.error)
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
    const newShelf: Shelf = {
      id: `shelf-${Date.now()}`,
      name: `Shelf ${shelves.length + 1}`,
      location_description: '',
      rows: 12,
      columns: 12,
      samples_per_position: 1,
      capacity: 144
    }
    setShelves([...shelves, newShelf])
  }

  const handleUpdateShelf = (shelfId: string, updates: Partial<Shelf>) => {
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

  const handleNextStep = () => {
    if (labCreationStep === 1) {
      if (!newLab.name || !newLab.address || !newLab.city || !newLab.state) {
        alert('Please fill in laboratory name, address, city, and state')
        return
      }
      setLabCreationStep(2)
    }
  }

  const handlePreviousStep = () => {
    setLabCreationStep(1)
  }

  const handleAddLab = async () => {
    const totalCapacity = calculateTotalCapacity()

    if (totalCapacity === 0) {
      alert('Please add at least one storage shelf')
      return
    }

    // Combine address fields into location
    const locationParts = [
      newLab.address,
      newLab.city,
      newLab.state,
      newLab.zip_code
    ].filter(Boolean)
    const location = locationParts.join(', ')

    try {
      const response = await fetch('/api/laboratories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newLab.name,
          location: location,
          country: newLab.country,
          type: newLab.type,
          storage_capacity: totalCapacity,
          contact_email: newLab.contact_email,
          contact_phone: newLab.contact_phone
        })
      })

      if (response.ok) {
        setAddLabDialogOpen(false)
        setLabCreationStep(1)
        setNewLab({
          name: '',
          address: '',
          city: '',
          state: '',
          zip_code: '',
          country: '',
          type: 'lab',
          storage_capacity: 0,
          contact_email: '',
          contact_phone: ''
        })
        setShelves([])
        await loadLaboratories()
      } else {
        const error = await response.json()
        alert(`Failed to create laboratory: ${error.error}`)
      }
    } catch (error) {
      console.error('Error creating laboratory:', error)
      alert('Failed to create laboratory')
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
      alert('Failed to update laboratory')
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
      alert('Failed to delete laboratory')
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
        alert(`Failed to add personnel: ${data.error}`)
      }
    } catch (error) {
      console.error('Error adding personnel:', error)
      alert('Failed to add personnel')
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
      alert('Failed to remove personnel')
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
              Manage laboratory locations and personnel
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
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Laboratory - Step {labCreationStep} of 2</DialogTitle>
                </DialogHeader>

                {/* Progress indicator */}
                <div className="flex gap-2 mb-4">
                  <div className={`flex-1 h-2 rounded-full transition-colors ${labCreationStep >= 1 ? 'bg-primary' : 'bg-muted'}`} />
                  <div className={`flex-1 h-2 rounded-full transition-colors ${labCreationStep >= 2 ? 'bg-primary' : 'bg-muted'}`} />
                </div>

                {labCreationStep === 1 ? (
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
                        Next: Storage Configuration
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Step 2: Storage Configuration */
                  <div className="space-y-4 py-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">Storage Shelves</h3>
                        <p className="text-sm text-muted-foreground">
                          Configure the storage shelves for sample management
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
                          <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
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
                      <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {shelves.map((shelf) => (
                          <Card key={shelf.id}>
                            <CardContent className="p-4">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <Input
                                    value={shelf.name}
                                    onChange={(e) => handleUpdateShelf(shelf.id, { name: e.target.value })}
                                    placeholder="Shelf name"
                                    className="max-w-[200px] font-medium"
                                  />
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">
                                      Capacity: {shelf.capacity} positions
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

                                <div className="space-y-2">
                                  <Label className="text-xs">Location Description</Label>
                                  <Input
                                    value={shelf.location_description}
                                    onChange={(e) => handleUpdateShelf(shelf.id, { location_description: e.target.value })}
                                    placeholder="e.g., North wall, left side"
                                    className="text-sm"
                                  />
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

                                <div className="text-xs text-muted-foreground">
                                  {shelf.rows} rows × {shelf.columns} columns × {shelf.samples_per_position} sample(s) per position = {shelf.capacity} total positions
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
                              <p className="font-semibold">Total Storage Capacity</p>
                              <p className="text-sm text-muted-foreground">
                                Calculated from {shelves.length} shelf{shelves.length !== 1 ? 'ves' : ''}
                              </p>
                            </div>
                            <div className="text-2xl font-bold text-primary">
                              {calculateTotalCapacity()} positions
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" onClick={handlePreviousStep}>
                        Previous
                      </Button>
                      <Button onClick={handleAddLab}>
                        Create Laboratory
                      </Button>
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
                        {lab.personnel_count !== undefined && (
                          <Badge variant="outline" className="text-xs">
                            <Users className="h-3 w-3 mr-1" />
                            {lab.personnel_count} personnel
                          </Badge>
                        )}
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
                  {lab.contact_phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <span>{lab.contact_phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>Storage: {lab.storage_capacity} positions</span>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-3 border-t">
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

        {/* Edit Laboratory Dialog */}
        {editingLab && (
          <Dialog open={!!editingLab} onOpenChange={() => setEditingLab(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Laboratory</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Laboratory Name *</Label>
                    <Input
                      id="edit-name"
                      value={editingLab.name}
                      onChange={(e) => setEditingLab({ ...editingLab, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-location">Location *</Label>
                    <Input
                      id="edit-location"
                      value={editingLab.location}
                      onChange={(e) => setEditingLab({ ...editingLab, location: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-country">Country</Label>
                    <Input
                      id="edit-country"
                      value={editingLab.country || ''}
                      onChange={(e) => setEditingLab({ ...editingLab, country: e.target.value })}
                    />
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
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-storage">Storage Capacity</Label>
                    <Input
                      id="edit-storage"
                      type="number"
                      value={editingLab.storage_capacity}
                      onChange={(e) => setEditingLab({ ...editingLab, storage_capacity: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-email">Contact Email</Label>
                    <Input
                      id="edit-email"
                      type="email"
                      value={editingLab.contact_email || ''}
                      onChange={(e) => setEditingLab({ ...editingLab, contact_email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Contact Phone</Label>
                  <Input
                    id="edit-phone"
                    value={editingLab.contact_phone || ''}
                    onChange={(e) => setEditingLab({ ...editingLab, contact_phone: e.target.value })}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-active"
                    checked={editingLab.is_active}
                    onChange={(e) => setEditingLab({ ...editingLab, is_active: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="edit-active">Active</Label>
                </div>

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
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Personnel - {viewingPersonnel.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {(canManageAllLabs || (canManageOwnLab && profile?.laboratory_id === viewingPersonnel.id)) && (
                  <div className="flex justify-end">
                    <Button onClick={() => setAddPersonnelDialogOpen(true)} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Personnel
                    </Button>
                  </div>
                )}

                {loadingPersonnel ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading personnel...
                  </div>
                ) : personnel.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No personnel assigned to this laboratory</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {personnel.map((person) => (
                      <Card key={person.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              <User className="h-10 w-10 p-2 bg-accent rounded-full" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium">{person.full_name}</p>
                                <p className="text-sm text-muted-foreground truncate">{person.email}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-xs">
                                    {getRoleBadge(person.qc_role)}
                                  </Badge>
                                  {person.is_active ? (
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
                                </div>
                              </div>
                            </div>
                            {(canManageAllLabs || (canManageOwnLab && profile?.laboratory_id === viewingPersonnel.id)) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRemovePersonnel(person.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Add Personnel Dialog */}
        {addPersonnelDialogOpen && viewingPersonnel && (
          <Dialog open={addPersonnelDialogOpen} onOpenChange={setAddPersonnelDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Personnel to {viewingPersonnel.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="personnel-email">Email Address *</Label>
                  <Input
                    id="personnel-email"
                    type="email"
                    value={newPersonnel.email}
                    onChange={(e) => setNewPersonnel({ ...newPersonnel, email: e.target.value })}
                    placeholder="person@wolthers.com"
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
                  <Label htmlFor="personnel-role">Role *</Label>
                  <Select
                    value={newPersonnel.qc_role}
                    onValueChange={(value) => setNewPersonnel({ ...newPersonnel, qc_role: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lab_personnel">Lab Personnel</SelectItem>
                      <SelectItem value="lab_director">Lab Director</SelectItem>
                      <SelectItem value="lab_finance_manager">Lab Finance Manager</SelectItem>
                      <SelectItem value="lab_quality_manager">Lab Quality Manager</SelectItem>
                      {canManageAllLabs && (
                        <>
                          <SelectItem value="global_quality_admin">Global Quality Admin</SelectItem>
                          <SelectItem value="global_finance_admin">Global Finance Admin</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg text-sm">
                  <p className="text-muted-foreground">
                    If this email is already registered, the user will be assigned to this laboratory.
                    Otherwise, an invitation will be created and the user must sign up with this email.
                  </p>
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
    </MainLayout>
  )
}
