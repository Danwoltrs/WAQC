'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StorageLayoutView } from '@/components/storage/storage-layout-view'
import { Warehouse, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase-browser'

type ProfileData = {
  qc_role: string
  laboratory_id: string | null
  is_global_admin: boolean
}

interface Laboratory {
  id: string
  name: string
  location: string
}

export default function SamplesStoragePage() {
  const [laboratories, setLaboratories] = useState<Laboratory[]>([])
  const [selectedLabId, setSelectedLabId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [userLabId, setUserLabId] = useState<string | null>(null)
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false)

  useEffect(() => {
    loadUserProfile()
  }, [])

  useEffect(() => {
    if (userLabId || isGlobalAdmin) {
      loadLaboratories()
    }
  }, [userLabId, isGlobalAdmin])

  const loadUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setLoading(false)
        return
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('qc_role, laboratory_id, is_global_admin')
        .eq('id', user.id)
        .single()

      const profile = profileData as ProfileData | null

      if (profile) {
        setUserLabId(profile.laboratory_id)
        setIsGlobalAdmin(profile.is_global_admin)

        // Auto-select user's lab if they have one
        if (profile.laboratory_id) {
          setSelectedLabId(profile.laboratory_id)
        }
      }
    } catch (error) {
      console.error('Error loading user profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadLaboratories = async () => {
    try {
      const response = await fetch('/api/laboratories')
      const data = await response.json()

      if (response.ok) {
        let labs = data.laboratories || []

        // If user is not global admin, filter to only their lab
        if (!isGlobalAdmin && userLabId) {
          labs = labs.filter((lab: Laboratory) => lab.id === userLabId)
        }

        setLaboratories(labs)

        // Auto-select first lab if none selected
        if (!selectedLabId && labs.length > 0) {
          setSelectedLabId(labs[0].id)
        }
      }
    } catch (error) {
      console.error('Error loading laboratories:', error)
    }
  }

  const selectedLab = laboratories.find(lab => lab.id === selectedLabId)

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Storage Management</h1>
            <p className="text-muted-foreground">
              View and manage sample storage positions across all laboratories
            </p>
          </div>
        </div>

        {/* Laboratory Selector */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading...
          </div>
        ) : laboratories.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No laboratory access</h3>
              <p className="text-muted-foreground">
                You don&apos;t have access to any laboratory storage systems.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <Warehouse className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <label className="text-sm font-medium mb-2 block">
                      Select Laboratory
                    </label>
                    <Select value={selectedLabId} onValueChange={setSelectedLabId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a laboratory..." />
                      </SelectTrigger>
                      <SelectContent>
                        {laboratories.map((lab) => (
                          <SelectItem key={lab.id} value={lab.id}>
                            {lab.name} - {lab.location}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Storage Layout View */}
            {selectedLabId && (
              <StorageLayoutView
                laboratoryId={selectedLabId}
              />
            )}
          </>
        )}
      </div>
    </MainLayout>
  )
}
