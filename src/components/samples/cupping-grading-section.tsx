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

// Dynamic key-value map for cupping scores (keys come from cupping templates)
type CuppingScores = Record<string, number>

interface DefectEntry {
  name: string
  count: number
}

interface DefectsData {
  total_primary?: number
  primary?: number
  total_secondary?: number
  secondary?: number
  total?: number
  defect_list?: DefectEntry[]
  [key: string]: any
}

interface GradingData {
  green_bean_data?: {
    moisture?: number
    moisture_percentage?: number
    humidity?: number
    density?: number
    aspect?: string
    green_aspect?: string
    quakers?: number
    screen_analysis?: Record<string, number>
    screen_sizes?: Record<string, number>
    defects?: DefectsData | DefectEntry[]
  }
  roast_data?: {
    quakers?: number
    roast_aspect?: string
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
      // Load cupping scores from aggregate endpoint
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
      } else {
        // Aggregate may return 404 if no cupping_scores records but
        // quality_assessment may still have cupping data via certificate flow
        // We handle this below
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

          // If aggregate endpoint failed but assessment has cupping scores in green_bean_data
          // try to extract cupping totals from the assessment
          if (!cuppingRes.ok && gradingDataRes.assessment.green_bean_data?.cupping_scores) {
            const cs = gradingDataRes.assessment.green_bean_data.cupping_scores
            if (typeof cs === 'object' && !Array.isArray(cs)) {
              setCuppingScores(cs as CuppingScores)
            }
          }
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
    <Card className={`relative ${!canEditCuppingGrading && sample.certificate_id ? 'border-muted' : ''}`}>
      {canEditCuppingGrading && !isEditingCuppingGrading && (
        <Button variant="ghost" size="icon" className="absolute top-0.5 right-0.5 h-7 w-7" onClick={handleEnterCuppingGradingEdit} title="Edit">
          <Edit className="h-3.5 w-3.5" />
        </Button>
      )}
      <CardContent className="pt-4 space-y-6">
        {/* Lock indicator */}
        {!canEditCuppingGrading && sample.certificate_id && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <Lock className="h-3 w-3" />
              {editPermission?.message || 'Locked after 7 days from certification'}
            </span>
            {editPermission?.reason === 'within_7_days' && (
              <Badge variant="outline" className="text-xs">7-day edit window</Badge>
            )}
          </div>
        )}
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
        {cuppingScores && Object.keys(cuppingScores).length > 0 ? (
          <div>
            <h4 className="text-sm font-medium mb-3">Cupping Scores</h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {Object.entries(cuppingScores).map(([key, value]) => (
                <div key={key} className="text-center p-2 bg-muted/30 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">{key}</div>
                  {isEditingCuppingGrading ? (
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      max="10"
                      value={cuppingGradingFormData.cupping?.[key] || ''}
                      onChange={(e) => setCuppingGradingFormData(prev => ({
                        ...prev,
                        cupping: { ...prev.cupping, [key]: parseFloat(e.target.value) || 0 }
                      }))}
                      className="h-7 text-sm text-center"
                    />
                  ) : (
                    <div className={`text-lg font-semibold ${!canEditCuppingGrading && sample.certificate_id ? 'text-muted-foreground' : ''}`}>
                      {typeof value === 'number' ? value.toFixed(1) : '-'}
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
        {gradingData?.green_bean_data && (() => {
          const gb = gradingData.green_bean_data
          const moistureVal = gb.moisture_percentage ?? gb.moisture ?? gb.humidity ?? null
          const greenAspect = gb.green_aspect ?? gb.aspect ?? null
          const roastAspect = gradingData.roast_data?.roast_aspect ?? gradingData.roast_data?.roast_color ?? null
          const quakers = gb.quakers ?? gradingData.roast_data?.quakers ?? null
          const screenSizes = gb.screen_sizes ?? gb.screen_analysis ?? null
          const lockedStyle = !canEditCuppingGrading && sample.certificate_id ? 'text-muted-foreground' : ''

          const updateGreenBean = (field: string, value: any) => {
            setCuppingGradingFormData(prev => ({
              ...prev,
              grading: {
                ...prev.grading,
                green_bean_data: { ...prev.grading?.green_bean_data, [field]: value }
              }
            }))
          }

          const updateRoast = (field: string, value: any) => {
            setCuppingGradingFormData(prev => ({
              ...prev,
              grading: {
                ...prev.grading,
                roast_data: { ...prev.grading?.roast_data, [field]: value }
              }
            }))
          }

          const updateScreenSize = (sizeKey: string, grams: number) => {
            setCuppingGradingFormData(prev => {
              const current = prev.grading?.green_bean_data?.screen_sizes || screenSizes || {}
              return {
                ...prev,
                grading: {
                  ...prev.grading,
                  green_bean_data: {
                    ...prev.grading?.green_bean_data,
                    screen_sizes: { ...current, [sizeKey]: grams }
                  }
                }
              }
            })
          }

          const updateDefectField = (field: string, value: number) => {
            setCuppingGradingFormData(prev => {
              const currentDefects = prev.grading?.green_bean_data?.defects as DefectsData || {}
              return {
                ...prev,
                grading: {
                  ...prev.grading,
                  green_bean_data: {
                    ...prev.grading?.green_bean_data,
                    defects: { ...currentDefects, [field]: value }
                  }
                }
              }
            })
          }

          // Parse defect data
          const defects = gb.defects
          let defectPrimary: number | null = null
          let defectSecondary: number | null = null
          let defectTotal: number | null = null
          let defectCounts: Record<string, number> | null = null
          let defectList: DefectEntry[] | null = null

          if (defects) {
            if (Array.isArray(defects)) {
              defectList = defects
            } else if (typeof defects === 'object') {
              const d = defects as DefectsData
              defectPrimary = d.total_primary ?? d.primary ?? null
              defectSecondary = d.total_secondary ?? d.secondary ?? null
              defectTotal = d.total ?? (defectPrimary != null && defectSecondary != null ? defectPrimary + defectSecondary : null)
              defectCounts = d.counts ?? null
              defectList = d.defect_list ?? null
            }
          }

          // Build sorted screen size entries
          const screenEntries = screenSizes
            ? Object.entries(screenSizes)
                .filter(([, v]) => v > 0)
                .sort(([a], [b]) => {
                  const na = parseInt(a.replace(/\D/g, ''))
                  const nb = parseInt(b.replace(/\D/g, ''))
                  if (isNaN(na) && isNaN(nb)) return a.localeCompare(b)
                  if (isNaN(na)) return 1
                  if (isNaN(nb)) return -1
                  return nb - na
                })
            : []
          const screenTotal = screenEntries.reduce((sum, [, v]) => sum + v, 0)

          return (
            <>
              <Separator />
              <div>
                {/* Moisture, Density, Quakers, Green Aspect, Roast Aspect */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Moisture</div>
                    {isEditingCuppingGrading ? (
                      <Input
                        type="number" step="0.1"
                        value={cuppingGradingFormData.grading?.green_bean_data?.moisture_percentage ?? moistureVal ?? ''}
                        onChange={(e) => updateGreenBean('moisture_percentage', parseFloat(e.target.value) || 0)}
                        className="h-7 text-sm mt-1"
                      />
                    ) : (
                      <div className={`text-sm font-medium ${lockedStyle}`}>
                        {moistureVal != null ? `${moistureVal}%` : '-'}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Density</div>
                    {isEditingCuppingGrading ? (
                      <Input
                        type="number" step="0.01"
                        value={cuppingGradingFormData.grading?.green_bean_data?.density ?? gb.density ?? ''}
                        onChange={(e) => updateGreenBean('density', parseFloat(e.target.value) || 0)}
                        className="h-7 text-sm mt-1"
                      />
                    ) : (
                      <div className={`text-sm font-medium ${lockedStyle}`}>{gb.density || '-'}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Quakers</div>
                    {isEditingCuppingGrading ? (
                      <Input
                        type="number" step="1" min="0"
                        value={cuppingGradingFormData.grading?.green_bean_data?.quakers ?? quakers ?? ''}
                        onChange={(e) => updateGreenBean('quakers', parseInt(e.target.value) || 0)}
                        className="h-7 text-sm mt-1"
                      />
                    ) : (
                      <div className={`text-sm font-medium ${lockedStyle}`}>{quakers ?? '-'}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Green Aspect</div>
                    {isEditingCuppingGrading ? (
                      <Input
                        value={cuppingGradingFormData.grading?.green_bean_data?.green_aspect ?? greenAspect ?? ''}
                        onChange={(e) => updateGreenBean('green_aspect', e.target.value || null)}
                        className="h-7 text-sm mt-1"
                        placeholder="e.g., Good, Fair"
                      />
                    ) : (
                      <div className={`text-sm font-medium ${lockedStyle}`}>{greenAspect || '-'}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Roast Aspect</div>
                    {isEditingCuppingGrading ? (
                      <Input
                        value={cuppingGradingFormData.grading?.roast_data?.roast_aspect ?? roastAspect ?? ''}
                        onChange={(e) => updateRoast('roast_aspect', e.target.value || null)}
                        className="h-7 text-sm mt-1"
                        placeholder="e.g., Good, Fair"
                      />
                    ) : (
                      <div className={`text-sm font-medium ${lockedStyle}`}>{roastAspect || '-'}</div>
                    )}
                  </div>
                </div>

                {/* Screen Sizes */}
                {(screenEntries.length > 0 || isEditingCuppingGrading) && (
                  <div className="mt-4">
                    <div className="text-xs text-muted-foreground mb-2">Screen Size (grams)</div>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                      {isEditingCuppingGrading ? (
                        // In edit mode show all standard screen sizes
                        <>
                          {['20', '19', '18', '17', '16', '15', '14', '13', '12', '11', '10', 'Pan'].map(size => {
                            const editScreens = cuppingGradingFormData.grading?.green_bean_data?.screen_sizes || screenSizes || {}
                            return (
                              <div key={size} className="text-center">
                                <div className="text-xs text-muted-foreground mb-1">{size}</div>
                                <Input
                                  type="number" step="0.1" min="0"
                                  value={editScreens[size] ?? ''}
                                  onChange={(e) => updateScreenSize(size, parseFloat(e.target.value) || 0)}
                                  className="h-7 text-sm text-center"
                                />
                              </div>
                            )
                          })}
                        </>
                      ) : (
                        screenEntries.map(([size, grams]) => (
                          <div key={size} className="text-center p-1.5 bg-muted/30 rounded">
                            <div className="text-xs text-muted-foreground">{size}</div>
                            <div className={`text-sm font-medium ${lockedStyle}`}>{grams}g</div>
                            {screenTotal > 0 && (
                              <div className="text-[10px] text-muted-foreground">
                                {Math.round((grams / screenTotal) * 100)}%
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Defects */}
                {(defectTotal != null || defectPrimary != null || (defectCounts && Object.keys(defectCounts).length > 0) || (defectList && defectList.length > 0) || isEditingCuppingGrading) && (
                  <div className="mt-4">
                    <div className="text-xs text-muted-foreground mb-2">Defects</div>
                    {isEditingCuppingGrading ? (
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Primary</div>
                          <Input
                            type="number" step="1" min="0"
                            value={(() => {
                              const ed = cuppingGradingFormData.grading?.green_bean_data?.defects as DefectsData | undefined
                              return ed?.primary ?? ed?.total_primary ?? defectPrimary ?? ''
                            })()}
                            onChange={(e) => updateDefectField('primary', parseInt(e.target.value) || 0)}
                            className="h-7 text-sm"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Secondary</div>
                          <Input
                            type="number" step="1" min="0"
                            value={(() => {
                              const ed = cuppingGradingFormData.grading?.green_bean_data?.defects as DefectsData | undefined
                              return ed?.secondary ?? ed?.total_secondary ?? defectSecondary ?? ''
                            })()}
                            onChange={(e) => updateDefectField('secondary', parseInt(e.target.value) || 0)}
                            className="h-7 text-sm"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Total</div>
                          <Input
                            type="number" step="1" min="0"
                            value={(() => {
                              const ed = cuppingGradingFormData.grading?.green_bean_data?.defects as DefectsData | undefined
                              return ed?.total ?? defectTotal ?? ''
                            })()}
                            onChange={(e) => updateDefectField('total', parseInt(e.target.value) || 0)}
                            className="h-7 text-sm"
                          />
                        </div>
                      </div>
                    ) : (() => {
                      // Classify individual defects into primary / secondary
                      const PRIMARY_NAMES = ['full black', 'full sour', 'pod/cherry', 'pod', 'cherry',
                        'large husk', 'large stone', 'stone/stick', 'stone', 'stick', 'foreign material', 'foreign matter', 'foreign']
                      const isPrimary = (name: string) => PRIMARY_NAMES.some(p => name.toLowerCase().includes(p))

                      const allIndividual: Array<{ name: string; count: number }> = []
                      if (defectCounts) {
                        Object.entries(defectCounts).forEach(([name, count]) => allIndividual.push({ name, count }))
                      }
                      if (defectList) {
                        defectList.forEach((d) => allIndividual.push({ name: d.name, count: d.count }))
                      }

                      const primaryDefects = allIndividual.filter(d => isPrimary(d.name))
                      const secondaryDefects = allIndividual.filter(d => !isPrimary(d.name))

                      // Split secondary into two columns
                      const secMid = Math.ceil(secondaryDefects.length / 2)
                      const secCol1 = secondaryDefects.slice(0, secMid)
                      const secCol2 = secondaryDefects.slice(secMid)
                      const maxRows = Math.max(primaryDefects.length, secCol1.length, secCol2.length)

                      return (
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/50 border-b">
                                <th className="py-1.5 px-2 text-left font-medium" colSpan={3}>
                                  Total: {defectTotal ?? '-'}
                                  <span className="ml-3 font-normal text-muted-foreground">Primary: {defectPrimary ?? '-'}</span>
                                  <span className="ml-3 font-normal text-muted-foreground">Secondary: {defectSecondary ?? '-'}</span>
                                </th>
                              </tr>
                              {(primaryDefects.length > 0 || secondaryDefects.length > 0) && (
                                <tr className="border-b">
                                  <th className="py-1 px-2 text-left font-medium text-muted-foreground">Primary</th>
                                  <th className="py-1 px-2 text-left font-medium text-muted-foreground" colSpan={2}>Secondary</th>
                                </tr>
                              )}
                            </thead>
                            {maxRows > 0 && (
                              <tbody>
                                {Array.from({ length: maxRows }, (_, i) => (
                                  <tr key={i} className={i > 0 ? 'border-t' : ''}>
                                    <td className="py-1 px-2 text-muted-foreground align-top">
                                      {primaryDefects[i] ? (
                                        <><span className="font-medium text-foreground">{primaryDefects[i].count}</span> {primaryDefects[i].name}</>
                                      ) : null}
                                    </td>
                                    <td className="py-1 px-2 text-muted-foreground align-top">
                                      {secCol1[i] ? (
                                        <><span className="font-medium text-foreground">{secCol1[i].count}</span> {secCol1[i].name}</>
                                      ) : null}
                                    </td>
                                    <td className="py-1 px-2 text-muted-foreground align-top">
                                      {secCol2[i] ? (
                                        <><span className="font-medium text-foreground">{secCol2[i].count}</span> {secCol2[i].name}</>
                                      ) : null}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            )}
                          </table>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            </>
          )
        })()}

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
