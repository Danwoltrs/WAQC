'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Edit, Save, X, Lock, Coffee, Beaker, Loader2
} from 'lucide-react'

interface CuppingScores {
  fragrance_aroma?: number
  flavor?: number
  aftertaste?: number
  acidity?: number
  body?: number
  balance?: number
  sweetness?: number
  overall?: number
  total?: number
}

interface GradingData {
  green_bean_data?: {
    moisture?: number
    density?: number
    aspect?: string
    screen_analysis?: Record<string, number>
    defects?: Array<{ name: string; count: number }>
  }
  roast_data?: {
    quakers?: number
    roast_color?: string
    notes?: string
  }
}

interface EditHistory {
  edited_at: string
  edited_by: string
  reason: string
  changes: Record<string, { old: any; new: any }>
}

interface EditPermission {
  canEdit: boolean
  reason: 'not_locked' | 'within_7_days' | 'locked_after_scan' | 'locked_after_7_days'
  lockExpiresAt: string | null
  message: string
}

interface UserProfile {
  email?: string
  full_name?: string
  is_master_cupper?: boolean | null
  is_global_admin?: boolean | null
  qc_role?: string | null
}

interface SampleData {
  id: string
  certificate_id?: string | null
}

export interface CuppingGradingSectionProps {
  sample: SampleData
  profile: UserProfile | null
  editPermission: EditPermission | null
  onDataChanged?: () => void
}

export function CuppingGradingSection({
  sample,
  profile,
  editPermission,
  onDataChanged,
}: CuppingGradingSectionProps) {
  const [cuppingScores, setCuppingScores] = useState<CuppingScores | null>(null)
  const [gradingData, setGradingData] = useState<GradingData | null>(null)
  const [editHistory, setEditHistory] = useState<EditHistory[]>([])
  const [isEditingCuppingGrading, setIsEditingCuppingGrading] = useState(false)
  const [cuppingGradingFormData, setCuppingGradingFormData] = useState<{ cupping?: CuppingScores; grading?: GradingData }>({})
  const [editReason, setEditReason] = useState('')
  const [savingCuppingGrading, setSavingCuppingGrading] = useState(false)

  const [cleanCup, setCleanCup] = useState<boolean | null>(null)
  const [uniformCup, setUniformCup] = useState<boolean | null>(null)
  const [cuppingComments, setCuppingComments] = useState<string | null>(null)
  const [gradingComments, setGradingComments] = useState<string | null>(null)

  useEffect(() => {
    if (sample?.id) {
      loadCuppingGradingData(sample.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample?.id])

  const loadCuppingGradingData = async (sampleUuid: string) => {
    try {
      const cuppingRes = await fetch(`/api/cupping/scores/aggregate?sample_id=${sampleUuid}`)
      if (cuppingRes.ok) {
        const cuppingData = await cuppingRes.json()
        if (cuppingData.aggregated?.attributes) {
          const scores: CuppingScores = {}
          Object.entries(cuppingData.aggregated.attributes).forEach(([key, value]: [string, any]) => {
            scores[key as keyof CuppingScores] = value.finalScore
          })
          setCuppingScores(scores)
        }
      }

      const gradingRes = await fetch(`/api/samples/${sampleUuid}/quality-assessment`)
      if (gradingRes.ok) {
        const gradingDataRes = await gradingRes.json()
        if (gradingDataRes.assessment) {
          setGradingData({
            green_bean_data: gradingDataRes.assessment.green_bean_data,
            roast_data: gradingDataRes.assessment.roast_data
          })
          if (gradingDataRes.assessment.edit_history) {
            setEditHistory(gradingDataRes.assessment.edit_history)
          }
          setCleanCup(gradingDataRes.assessment.clean_cup ?? null)
          setUniformCup(gradingDataRes.assessment.uniform_cup ?? null)
          setCuppingComments(gradingDataRes.assessment.cupping_comments ?? null)
          setGradingComments(gradingDataRes.assessment.grading_comments ?? null)
        }
      }
    } catch (error) {
      console.error('Error loading cupping/grading data:', error)
    }
  }

  const isMasterCupperOrAdmin = profile?.is_master_cupper || profile?.is_global_admin
  const canEditCuppingGrading = isMasterCupperOrAdmin &&
    editPermission?.canEdit &&
    (editPermission.reason === 'not_locked' || editPermission.reason === 'within_7_days')

  const handleEnterCuppingGradingEdit = () => {
    if (!canEditCuppingGrading) return
    setCuppingGradingFormData({
      cupping: cuppingScores || {},
      grading: gradingData || {}
    })
    setEditReason('')
    setIsEditingCuppingGrading(true)
  }

  const handleCancelCuppingGradingEdit = () => {
    setIsEditingCuppingGrading(false)
    setCuppingGradingFormData({})
    setEditReason('')
  }

  const handleSaveCuppingGrading = async () => {
    if (!sample || !editReason.trim()) {
      alert('Please provide a reason for the edit')
      return
    }

    try {
      setSavingCuppingGrading(true)

      const changes: Record<string, { old: any; new: any }> = {}

      if (cuppingGradingFormData.cupping && cuppingScores) {
        Object.keys(cuppingGradingFormData.cupping).forEach(key => {
          const oldVal = cuppingScores[key as keyof CuppingScores]
          const newVal = cuppingGradingFormData.cupping![key as keyof CuppingScores]
          if (oldVal !== newVal) {
            changes[`cupping_${key}`] = { old: oldVal, new: newVal }
          }
        })
      }

      if (cuppingGradingFormData.grading && gradingData) {
        if (JSON.stringify(cuppingGradingFormData.grading.green_bean_data) !== JSON.stringify(gradingData.green_bean_data)) {
          changes.green_bean_data = { old: gradingData.green_bean_data, new: cuppingGradingFormData.grading.green_bean_data }
        }
        if (JSON.stringify(cuppingGradingFormData.grading.roast_data) !== JSON.stringify(gradingData.roast_data)) {
          changes.roast_data = { old: gradingData.roast_data, new: cuppingGradingFormData.grading.roast_data }
        }
      }

      const editEntry: EditHistory = {
        edited_at: new Date().toISOString(),
        edited_by: profile?.email || profile?.full_name || 'Unknown',
        reason: editReason.trim(),
        changes
      }

      const response = await fetch(`/api/samples/${sample.id}/quality-assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          green_bean_data: cuppingGradingFormData.grading?.green_bean_data,
          roast_data: cuppingGradingFormData.grading?.roast_data,
          edit_history: [...editHistory, editEntry],
          clean_cup: cleanCup,
          uniform_cup: uniformCup,
          cupping_comments: cuppingComments,
          grading_comments: gradingComments,
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save changes')
      }

      await loadCuppingGradingData(sample.id)
      setIsEditingCuppingGrading(false)
      setCuppingGradingFormData({})
      setEditReason('')
      onDataChanged?.()
    } catch (error) {
      console.error('Error saving cupping/grading:', error)
      alert(error instanceof Error ? error.message : 'Failed to save changes')
    } finally {
      setSavingCuppingGrading(false)
    }
  }

  return (
    <Card className={!canEditCuppingGrading && sample.certificate_id ? 'border-muted' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Coffee className="h-4 w-4" />
            Cupping & Grading
            {!canEditCuppingGrading && sample.certificate_id && (
              <Lock className="h-4 w-4 text-muted-foreground" />
            )}
            {editPermission?.reason === 'within_7_days' && (
              <Badge variant="outline" className="text-xs">7-day edit window</Badge>
            )}
          </CardTitle>
          {canEditCuppingGrading && !isEditingCuppingGrading && (
            <Button variant="outline" size="sm" onClick={handleEnterCuppingGradingEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
        {!canEditCuppingGrading && sample.certificate_id && (
          <CardDescription className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Lock className="h-3 w-3" />
            {editPermission?.message || 'Locked after 7 days from certification'}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Edit Mode Audit Fields */}
        {isEditingCuppingGrading && (
          <div className="bg-muted/50 border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Edit className="h-4 w-4" />
              Audit Trail Required
            </div>
            <div>
              <label className="text-sm font-medium">Reason for Edit *</label>
              <Textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Please provide a reason for this edit (required)"
                className="mt-1"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground mt-1">{editReason.length}/500 characters</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Edited by:</label>
              <span className="text-sm ml-2">{profile?.email || profile?.full_name || 'Unknown'}</span>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={handleCancelCuppingGradingEdit} disabled={savingCuppingGrading}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveCuppingGrading}
                disabled={savingCuppingGrading || !editReason.trim()}
              >
                {savingCuppingGrading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          </div>
        )}

        {/* Cupping Scores Grid */}
        {cuppingScores ? (
          <div>
            <h4 className="text-sm font-medium mb-3">Cupping Scores</h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                ['fragrance_aroma', 'Fragrance'],
                ['flavor', 'Flavor'],
                ['aftertaste', 'Aftertaste'],
                ['acidity', 'Acidity'],
                ['body', 'Body'],
                ['balance', 'Balance'],
                ['sweetness', 'Sweetness'],
                ['overall', 'Overall']
              ].map(([key, label]) => (
                <div key={key} className="text-center p-2 bg-muted/30 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">{label}</div>
                  {isEditingCuppingGrading ? (
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      max="10"
                      value={cuppingGradingFormData.cupping?.[key as keyof CuppingScores] || ''}
                      onChange={(e) => setCuppingGradingFormData(prev => ({
                        ...prev,
                        cupping: { ...prev.cupping, [key]: parseFloat(e.target.value) || 0 }
                      }))}
                      className="h-7 text-sm text-center"
                    />
                  ) : (
                    <div className={`text-lg font-semibold ${!canEditCuppingGrading && sample.certificate_id ? 'text-muted-foreground' : ''}`}>
                      {cuppingScores[key as keyof CuppingScores]?.toFixed(1) || '-'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No cupping scores available</p>
        )}

        {/* Clean Cup / Uniform Cup Status */}
        {(cleanCup !== null || uniformCup !== null) && (
          <div className="mt-3">
            <h4 className="text-sm font-medium mb-2">Cup Status</h4>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Clean Cup:</span>
                {isEditingCuppingGrading ? (
                  <Checkbox
                    checked={cleanCup === true}
                    onCheckedChange={(checked) => setCleanCup(checked === true)}
                  />
                ) : (
                  <span className={`text-sm font-medium ${cleanCup ? 'text-green-600' : 'text-red-600'}`}>
                    {cleanCup === true ? 'Yes' : cleanCup === false ? 'No' : '-'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Uniform Cup:</span>
                {isEditingCuppingGrading ? (
                  <Checkbox
                    checked={uniformCup === true}
                    onCheckedChange={(checked) => setUniformCup(checked === true)}
                  />
                ) : (
                  <span className={`text-sm font-medium ${uniformCup ? 'text-green-600' : 'text-red-600'}`}>
                    {uniformCup === true ? 'Yes' : uniformCup === false ? 'No' : '-'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Cupping Comments */}
        {(cuppingComments || isEditingCuppingGrading) && (
          <div className="mt-3">
            <h4 className="text-sm font-medium mb-1">Cupping Comments</h4>
            {isEditingCuppingGrading ? (
              <Textarea
                value={cuppingComments || ''}
                onChange={(e) => setCuppingComments(e.target.value || null)}
                placeholder="Cupping notes..."
                className="text-sm min-h-[60px]"
              />
            ) : (
              <p className="text-sm text-muted-foreground">{cuppingComments}</p>
            )}
          </div>
        )}

        {/* Grading Comments */}
        {(gradingComments || isEditingCuppingGrading) && (
          <div className="mt-3">
            <h4 className="text-sm font-medium mb-1">Grading Comments</h4>
            {isEditingCuppingGrading ? (
              <Textarea
                value={gradingComments || ''}
                onChange={(e) => setGradingComments(e.target.value || null)}
                placeholder="Grading notes..."
                className="text-sm min-h-[60px]"
              />
            ) : (
              <p className="text-sm text-muted-foreground">{gradingComments}</p>
            )}
          </div>
        )}

        {/* Grading Data */}
        {gradingData?.green_bean_data && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Beaker className="h-4 w-4" />
                Grading Data
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Moisture</div>
                  {isEditingCuppingGrading ? (
                    <Input
                      type="number"
                      step="0.1"
                      value={cuppingGradingFormData.grading?.green_bean_data?.moisture || ''}
                      onChange={(e) => setCuppingGradingFormData(prev => ({
                        ...prev,
                        grading: {
                          ...prev.grading,
                          green_bean_data: {
                            ...prev.grading?.green_bean_data,
                            moisture: parseFloat(e.target.value) || 0
                          }
                        }
                      }))}
                      className="h-7 text-sm mt-1"
                    />
                  ) : (
                    <div className={`text-sm font-medium ${!canEditCuppingGrading && sample.certificate_id ? 'text-muted-foreground' : ''}`}>
                      {gradingData.green_bean_data.moisture ? `${gradingData.green_bean_data.moisture}%` : '-'}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Density</div>
                  {isEditingCuppingGrading ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={cuppingGradingFormData.grading?.green_bean_data?.density || ''}
                      onChange={(e) => setCuppingGradingFormData(prev => ({
                        ...prev,
                        grading: {
                          ...prev.grading,
                          green_bean_data: {
                            ...prev.grading?.green_bean_data,
                            density: parseFloat(e.target.value) || 0
                          }
                        }
                      }))}
                      className="h-7 text-sm mt-1"
                    />
                  ) : (
                    <div className={`text-sm font-medium ${!canEditCuppingGrading && sample.certificate_id ? 'text-muted-foreground' : ''}`}>
                      {gradingData.green_bean_data.density || '-'}
                    </div>
                  )}
                </div>
                {gradingData.green_bean_data.aspect && (
                  <div>
                    <div className="text-xs text-muted-foreground">Aspect</div>
                    <div className="text-sm font-medium">{gradingData.green_bean_data.aspect}</div>
                  </div>
                )}
              </div>
              {gradingData.green_bean_data.defects && gradingData.green_bean_data.defects.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs text-muted-foreground mb-2">Defects</div>
                  <div className="flex flex-wrap gap-2">
                    {gradingData.green_bean_data.defects.map((defect, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {defect.name}: {defect.count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Edit History */}
        {editHistory.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-3">Edit History</h4>
              <div className="space-y-2">
                {editHistory.map((entry, i) => (
                  <div key={i} className="text-xs border-l-2 border-border pl-3 py-1">
                    <div className="flex justify-between">
                      <span className="font-medium">{entry.edited_by}</span>
                      <span className="text-muted-foreground">{new Date(entry.edited_at).toLocaleString()}</span>
                    </div>
                    <p className="text-muted-foreground">{entry.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
