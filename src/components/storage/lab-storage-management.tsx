'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Grid3x3, LayoutGrid } from 'lucide-react'
import { StorageLayoutView } from './storage-layout-view'
import { ShelfCard } from './shelf-card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ShelfDetailDialog } from './shelf-detail-dialog'
import { useEffect } from 'react'

interface LabStorageManagementProps {
  laboratoryId: string
  canManage?: boolean
}

export function LabStorageManagement({ laboratoryId, canManage }: LabStorageManagementProps) {
  const [shelves, setShelves] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [addShelfDialogOpen, setAddShelfDialogOpen] = useState(false)
  const [editShelfDialogOpen, setEditShelfDialogOpen] = useState(false)
  const [selectedShelf, setSelectedShelf] = useState<any>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [clients, setClients] = useState<any[]>([])

  // New shelf form
  const [newShelf, setNewShelf] = useState({
    shelf_letter: '',
    rows: 12,
    columns: 12,
    samples_per_position: 42,
    client_id: '',
    allow_client_view: false,
    x_position: 0,
    y_position: 0
  })

  // Edit shelf form
  const [editShelf, setEditShelf] = useState<any>(null)

  useEffect(() => {
    loadShelves()
    loadClients()
  }, [laboratoryId])

  const loadShelves = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/laboratories/${laboratoryId}/shelves`)
      const data = await response.json()

      if (response.ok) {
        setShelves(data.shelves)
      }
    } catch (error) {
      console.error('Error loading shelves:', error)
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

  const handleAddShelf = async () => {
    try {
      const response = await fetch(`/api/laboratories/${laboratoryId}/shelves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newShelf,
          client_id: newShelf.client_id || null
        })
      })

      if (response.ok) {
        setAddShelfDialogOpen(false)
        setNewShelf({
          shelf_letter: '',
          rows: 12,
          columns: 12,
          samples_per_position: 42,
          client_id: '',
          allow_client_view: false,
          x_position: 0,
          y_position: 0
        })
        await loadShelves()
      } else {
        const error = await response.json()
        alert(`Failed to create shelf: ${error.error}`)
      }
    } catch (error) {
      console.error('Error creating shelf:', error)
      alert('Failed to create shelf')
    }
  }

  const handleViewDetails = (shelf: any) => {
    setSelectedShelf(shelf)
    setDetailDialogOpen(true)
  }

  const handleEditShelf = (shelf: any) => {
    setEditShelf({
      ...shelf,
      client_id: shelf.client_id || ''
    })
    setEditShelfDialogOpen(true)
  }

  const handleUpdateShelf = async () => {
    if (!editShelf) return

    try {
      const response = await fetch(`/api/laboratories/${laboratoryId}/shelves/${editShelf.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shelf_letter: editShelf.shelf_letter,
          rows: editShelf.rows,
          columns: editShelf.columns,
          samples_per_position: editShelf.samples_per_position,
          client_id: editShelf.client_id || null,
          allow_client_view: editShelf.allow_client_view,
          x_position: editShelf.x_position,
          y_position: editShelf.y_position
        })
      })

      if (response.ok) {
        setEditShelfDialogOpen(false)
        setEditShelf(null)
        await loadShelves()
      } else {
        const error = await response.json()
        alert(`Failed to update shelf: ${error.error}`)
      }
    } catch (error) {
      console.error('Error updating shelf:', error)
      alert('Failed to update shelf')
    }
  }

  const handleDeleteShelf = async (shelfId: string) => {
    if (!confirm('Are you sure you want to delete this shelf? This action cannot be undone.')) {
      return
    }

    try {
      const response = await fetch(`/api/laboratories/${laboratoryId}/shelves/${shelfId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setEditShelfDialogOpen(false)
        setEditShelf(null)
        await loadShelves()
      } else {
        const error = await response.json()
        alert(`Failed to delete shelf: ${error.error}`)
      }
    } catch (error) {
      console.error('Error deleting shelf:', error)
      alert('Failed to delete shelf')
    }
  }

  return (
    <>
      <Tabs defaultValue="layout" className="space-y-6">
        <TabsList>
          <TabsTrigger value="layout">
            <LayoutGrid className="h-4 w-4 mr-2" />
            Floor Plan
          </TabsTrigger>
          <TabsTrigger value="shelves">
            <Grid3x3 className="h-4 w-4 mr-2" />
            Shelf List
          </TabsTrigger>
        </TabsList>

        <TabsContent value="layout">
          <StorageLayoutView
            laboratoryId={laboratoryId}
            onAddShelf={canManage ? () => setAddShelfDialogOpen(true) : undefined}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="shelves">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading shelves...
            </div>
          ) : shelves.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Grid3x3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-4">No shelves configured yet</p>
                {canManage && (
                  <Button onClick={() => setAddShelfDialogOpen(true)}>
                    Add Your First Shelf
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {shelves.map((shelf) => (
                <ShelfCard
                  key={shelf.id}
                  shelf={shelf}
                  onViewDetails={() => handleViewDetails(shelf)}
                  onEdit={canManage ? () => handleEditShelf(shelf) : undefined}
                  canEdit={canManage}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Shelf Dialog */}
      <Dialog open={addShelfDialogOpen} onOpenChange={setAddShelfDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Shelf</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="shelf_letter">Shelf Letter *</Label>
              <Input
                id="shelf_letter"
                value={newShelf.shelf_letter}
                onChange={(e) => setNewShelf({ ...newShelf, shelf_letter: e.target.value.toUpperCase() })}
                placeholder="A, B, C, D..."
                maxLength={1}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rows">Rows</Label>
                <Input
                  id="rows"
                  type="number"
                  min="1"
                  value={newShelf.rows}
                  onChange={(e) => setNewShelf({ ...newShelf, rows: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="columns">Columns</Label>
                <Input
                  id="columns"
                  type="number"
                  min="1"
                  value={newShelf.columns}
                  onChange={(e) => setNewShelf({ ...newShelf, columns: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="samples_per_position">Samples per Position</Label>
              <Input
                id="samples_per_position"
                type="number"
                min="1"
                value={newShelf.samples_per_position}
                onChange={(e) => setNewShelf({ ...newShelf, samples_per_position: parseInt(e.target.value) || 1 })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client_id">Assign to Client (Optional)</Label>
              <Select
                value={newShelf.client_id || 'unassigned'}
                onValueChange={(value) => setNewShelf({ ...newShelf, client_id: value === 'unassigned' ? '' : value })}
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

            {newShelf.client_id && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="allow_client_view"
                  checked={newShelf.allow_client_view}
                  onChange={(e) => setNewShelf({ ...newShelf, allow_client_view: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="allow_client_view" className="cursor-pointer">
                  Allow client to view this shelf in their portal
                </Label>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setAddShelfDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddShelf}>
                Create Shelf
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Shelf Dialog */}
      {editShelf && (
        <Dialog open={editShelfDialogOpen} onOpenChange={setEditShelfDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Shelf {editShelf.shelf_letter}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit_shelf_letter">Shelf Letter *</Label>
                <Input
                  id="edit_shelf_letter"
                  value={editShelf.shelf_letter}
                  onChange={(e) => setEditShelf({ ...editShelf, shelf_letter: e.target.value.toUpperCase() })}
                  placeholder="A, B, C, D..."
                  maxLength={1}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_rows">Rows</Label>
                  <Input
                    id="edit_rows"
                    type="number"
                    min="1"
                    value={editShelf.rows}
                    onChange={(e) => setEditShelf({ ...editShelf, rows: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_columns">Columns</Label>
                  <Input
                    id="edit_columns"
                    type="number"
                    min="1"
                    value={editShelf.columns}
                    onChange={(e) => setEditShelf({ ...editShelf, columns: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_samples_per_position">Samples per Position</Label>
                <Input
                  id="edit_samples_per_position"
                  type="number"
                  min="1"
                  value={editShelf.samples_per_position}
                  onChange={(e) => setEditShelf({ ...editShelf, samples_per_position: parseInt(e.target.value) || 1 })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_client_id">Assign to Client (Optional)</Label>
                <Select
                  value={editShelf.client_id || 'unassigned'}
                  onValueChange={(value) => setEditShelf({ ...editShelf, client_id: value === 'unassigned' ? '' : value })}
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

              {editShelf.client_id && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit_allow_client_view"
                    checked={editShelf.allow_client_view}
                    onChange={(e) => setEditShelf({ ...editShelf, allow_client_view: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="edit_allow_client_view" className="cursor-pointer">
                    Allow client to view this shelf in their portal
                  </Label>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_x_position">X Position (meters)</Label>
                  <Input
                    id="edit_x_position"
                    type="number"
                    min="0"
                    value={editShelf.x_position}
                    onChange={(e) => setEditShelf({ ...editShelf, x_position: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_y_position">Y Position (meters)</Label>
                  <Input
                    id="edit_y_position"
                    type="number"
                    min="0"
                    value={editShelf.y_position}
                    onChange={(e) => setEditShelf({ ...editShelf, y_position: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="flex justify-between gap-2 pt-4 border-t">
                <Button
                  variant="destructive"
                  onClick={() => handleDeleteShelf(editShelf.id)}
                >
                  Delete Shelf
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditShelfDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleUpdateShelf}>
                    Update Shelf
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Shelf Detail Dialog */}
      {selectedShelf && (
        <ShelfDetailDialog
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          shelfId={selectedShelf.id}
          laboratoryId={laboratoryId}
          shelfLetter={selectedShelf.shelf_letter}
        />
      )}
    </>
  )
}
